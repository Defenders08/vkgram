import {createEffect, createSignal, on, onCleanup} from 'solid-js';
import type {Accessor} from 'solid-js';
import type {Message} from '@layer';
import rootScope from '@lib/rootScope';
import createListenerSetter from '@helpers/solid/createListenerSetter';
import getPinnedMessagesKey from '@appManagers/utils/messages/getPinnedMessagesKey';

/**
 * Закреплённые сообщения одного диалога «Сообщений»: список (новые сверху, до 50 —
 * столько же держит плита Web K), какой из них показан, счётчик и признак «скрыто
 * пользователем» (канал, где закреп открепить нельзя — его прячут).
 *
 * Источник данных — Web K: `getHistory` с фильтром `inputMessagesFilterPinned`, тот же
 * запрос, что у плиты закрепа чата Web K. Живые обновления — события
 * `peer_pinned_messages` (закрепили / открепили, в том числе в другом окне) и
 * `peer_pinned_hidden` (пользователь скрыл плиту). Скрытие переживает перезагрузку
 * страницы: оно лежит в состоянии приложения `hiddenPinnedMessages`, как у Web K.
 *
 * При каждом обновлении списка показанный закреп остаётся на месте, если может:
 * открепили показанный — плита встаёт на следующий (более старый), как в Telegram.
 */
export default function createVKPinnedMessages(peerId: Accessor<PeerId>, enabled: Accessor<boolean>) {
  const [list, setList] = createSignal<Message.message[]>([]);
  const [count, setCount] = createSignal(0);
  // какой закреп показан: 0 — самый новый
  const [index, setIndex] = createSignal(0);
  const [hidden, setHidden] = createSignal(false);
  const [ready, setReady] = createSignal(false);

  // ответ запроса, начатого до смены диалога (или до более нового запроса), не применяется
  let generation = 0;

  const readHidden = async(peer: PeerId) => {
    try {
      const state = await rootScope.managers.appStateManager.getState();
      return !!state.hiddenPinnedMessages[getPinnedMessagesKey(peer)];
    } catch(err) {
      console.error('VKgram: failed to read the hidden pinned state', err);
      return false;
    }
  };

  const load = async() => {
    const peer = peerId();
    if(!enabled() || !peer) return;

    const current = ++generation;
    // закреп, показанный сейчас, — точка опоры для индекса после обновления
    const anchorMid = list()[index()]?.mid;

    try {
      const result = await rootScope.managers.appMessagesManager.getHistory({
        peerId: peer,
        inputFilter: {_: 'inputMessagesFilterPinned'},
        offsetId: 0,
        limit: 50
      });
      if(current !== generation) return;

      const mids = result.history ?? [];
      const messages = (await Promise.all(
        mids.map((mid) => rootScope.managers.appMessagesManager.getMessageByPeer(peer, mid))
      )).filter((message): message is Message.message => message?._ === 'message');
      if(current !== generation) return;

      setCount(result.count ?? mids.length);
      setList(messages);

      const next = anchorMid === undefined
        ? 0
        : messages.findIndex((message) => message.mid <= anchorMid);
      setIndex(next === -1 ? 0 : next);

      setHidden(await readHidden(peer));
      setReady(true);
    } catch(err) {
      console.error('VKgram: failed to load pinned messages', err);
      if(current === generation) setReady(true);
    }
  };

  // другой диалог — состояние заново
  createEffect(on(peerId, () => {
    ++generation;
    setList([]);
    setCount(0);
    setIndex(0);
    setHidden(false);
    setReady(false);
    void load();
  }));

  const listenerSetter = createListenerSetter();
  onCleanup(() => ++generation);

  listenerSetter.add(rootScope)('peer_pinned_messages', (update) => {
    if(update.peerId !== peerId() || !enabled()) return;
    // закрепление сбрасывает скрытие (Web K стирает его из состояния) — показать плиту снова
    setHidden(false);
    void load();
  });

  listenerSetter.add(rootScope)('peer_pinned_hidden', (update) => {
    if(update.peerId !== peerId() || !enabled()) return;
    setHidden(true);
  });

  /**
   * Показанный закреп (undefined — закрепов нет или ещё не загрузились).
   */
  const shown = () => list()[index()];

  /**
   * Слежение за скроллом: плита показывает самый новый закреп не ниже сообщения
   * `mid` (у конца истории это самый новый закреп — как у Telegram).
   */
  const syncToMid = (mid: number) => {
    const messages = list();
    if(!messages.length) return;
    const next = messages.findIndex((message) => message.mid <= mid);
    // выше всех закрепов — оставляем как есть
    if(next === -1 || next === index()) return;
    setIndex(next);
  };

  return {list, count, index, setIndex, hidden, ready, shown, syncToMid};
}
