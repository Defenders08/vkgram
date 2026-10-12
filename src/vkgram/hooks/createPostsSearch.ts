import {Accessor, createEffect, createSignal, on, onCleanup} from 'solid-js';
import type {Message} from '@layer';
import rootScope from '@lib/rootScope';
import {NULL_PEER_ID} from '@appManagers/constants';

export type PostsSearchStatus = 'idle' | 'loading' | 'loaded' | 'error' | 'limited';

/**
 * Глобальный поиск постов — «Посты» блока поиска. Телеграмовский
 * `channels.searchPosts` (тот же, кем Web K ищет публичные посты в своём
 * поиске): запрос без пира, `isPublicPosts: true` в `getHistory`, постранично
 * через `nextRate` и последний найденный пост. Локальных постов у клиента
 * нет, поэтому это единственный поиск вкладки, который ходит на сервер.
 *
 * У поиска есть дневной лимит: когда сервер отвечает ошибкой
 * `FLOOD_WAIT_…_OR_STARS_…` (официальный клиент в этом случае предлагает
 * платный поиск за звёзды), статус становится `limited` — вкладка показывает
 * вежливый отказ вместо бесконечной «Загрузки…».
 */
export default function createPostsSearch(options: {
  // the query once typing has paused
  query: Accessor<string>,
  pageSize?: number
}) {
  const pageSize = options.pageSize ?? 30;

  const [messages, setMessages] = createSignal<Message.message[]>([]);
  const [status, setStatus] = createSignal<PostsSearchStatus>('loading');
  const [isLoadingMore, setLoadingMore] = createSignal(false);
  const [isEnd, setEnd] = createSignal(false);

  // any answer of a request started before the query changed is dropped
  let generation = 0;
  let loading = false;
  let nextRate = 0;
  let last: Message.message | undefined;

  const load = async(reset: boolean) => {
    if(loading && !reset) return;

    const current = ++generation;
    loading = true;

    if(reset) {
      nextRate = 0;
      last = undefined;
      setMessages([]);
      setEnd(false);
      setStatus('loading');
    } else {
      setLoadingMore(true);
    }

    try {
      const result = await rootScope.managers.appMessagesManager.getHistory({
        peerId: NULL_PEER_ID,
        query: options.query(),
        inputFilter: {_: 'inputMessagesFilterEmpty'},
        isPublicPosts: true,
        offsetId: last?.mid || 0,
        offsetPeerId: last?.peerId || NULL_PEER_ID,
        nextRate,
        limit: pageSize
      });
      if(current !== generation) return;

      const page = (result.messages ?? []).filter((message) => message?._ === 'message') as Message.message[];
      const key = (message: Message.message) => `${message.peerId}_${message.mid}`;
      const known = new Set(reset ? [] : messages().map(key));
      const fresh = page.filter((message) => !known.has(key(message)));

      setMessages((list) => [...(reset ? [] : list), ...fresh]);
      nextRate = result.nextRate || 0;
      last = page[page.length - 1];
      setEnd(!page.length || (!reset && !fresh.length));
      setStatus('loaded');
    } catch(err) {
      if(current !== generation) return;
      console.error('VKgram: global posts search failed', err);
      // дневной лимит исчерпан: сервер предлагает платный поиск, платить за
      // пользователя нельзя — показываем отказ
      setStatus((err as ApiError)?.type?.match(/^FLOOD_WAIT_\d+_OR_STARS_\d+$/) ? 'limited' : 'error');
    } finally {
      if(current === generation) {
        loading = false;
        setLoadingMore(false);
      }
    }
  };

  createEffect(on(options.query, () => {
    // пустой запрос — не вопрос к серверу (у `channels.searchPosts` нет
    // «ленты всех постов»): вкладка показывает подсказку, пока не ввели текст
    if(!options.query().trim()) {
      generation++;
      loading = false;
      setLoadingMore(false);
      setMessages([]);
      setEnd(false);
      setStatus('idle');
      return;
    }
    void load(true);
  }));
  onCleanup(() => {
    generation++;
  });

  return {
    messages,
    status,
    isLoadingMore,
    isEnd,
    loadMore: () => {
      if(status() === 'loaded' && !isEnd()) void load(false);
    },
    reload: () => load(true)
  };
}
