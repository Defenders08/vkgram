import {createEffect, createMemo, createSignal, For, JSX, Match, on, onCleanup, onMount, Show, Switch} from 'solid-js';
import type {Chat, Message, User} from '@layer';
import type {Dialog} from '@appManagers/appMessagesManager';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE} from '@appManagers/constants';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import peerTitle from '@/vkgram/utils/peerTitle';
import matchesQuery from '@/vkgram/utils/matchesQuery';
import getDialogLastMessage from '@/vkgram/utils/getDialogLastMessage';
import useSubscribedChannels, {fetchFolder, isMessagesPeer} from '@/vkgram/hooks/useSubscribedChannels';
import useContactPeerIds from '@/vkgram/hooks/useContactPeerIds';
import createAppsCatalog, {openVKMiniApp} from '@/vkgram/hooks/createAppsCatalog';
import createPostsSearch from '@/vkgram/hooks/createPostsSearch';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import {openVKChannelPage} from '@/vkgram/pages/channel/openChannel';
import {openVKProfile} from '@/vkgram/pages/profile/openProfile';
import {closeVKSearch, isVKSearchOpen, setVKSearchQuery, vkSearchQuery} from '@/vkgram/search/vkSearchOpen';
import VKTabs, {type VKTabItem} from '@/vkgram/components/VKTabs';
import VKPeerAvatar from '@/vkgram/components/VKPeerAvatar';
import {VKMediaList} from '@/vkgram/components/VKMediaBrowser';
import VKEmptyState from '@/vkgram/components/VKEmptyState';
import VKIcon from '@/vkgram/components/VKIcons';
import {mediaLabel} from '@/vkgram/components/MessageRenderer';

// how long typing may pause before the server tabs (posts, media) search
const SEARCH_DELAY = 400;
// avatars: a result row and a «частые» strip circle
const ROW_AVATAR_SIZE = 40;
const STRIP_AVATAR_SIZE = 48;
// peers of the strip
const STRIP_LIMIT = 12;
// one line of a dialog preview / a post snippet
const PREVIEW_LIMIT = 80;
const SNIPPET_LIMIT = 140;

type VKSearchTabId = 'chats' | 'channels' | 'apps' | 'posts' | 'media';

const TABS: VKTabItem<VKSearchTabId>[] = [
  {id: 'chats', title: 'Чаты'},
  {id: 'channels', title: 'Каналы'},
  {id: 'apps', title: 'Приложения'},
  {id: 'posts', title: 'Посты'},
  {id: 'media', title: 'Медиа'}
];

/** последняя подпись строки диалога: текст, имя вложения или тип пира */
function dialogPreview(dialog: Dialog) {
  const message = getDialogLastMessage(dialog);
  const text = message && message._ === 'message' ?
    (message.message || mediaLabel(message)).replace(/\s+/g, ' ').trim() :
    '';
  if(text) return text.length > PREVIEW_LIMIT ? text.slice(0, PREVIEW_LIMIT - 1) + '…' : text;
  return undefined;
}

/**
 * Маленькое окно поиска возле поиска в шапке — как в оригинальном VK: панель,
 * выпадающая под полем (на телефоне — под всей шапкой), с вкладками «Чаты /
 * Каналы / Приложения / Посты / Медиа» и полосой частых чатов на пустом
 * запросе. Запрос общий с полем шапки (`vkSearchQuery`): на десктопе текст
 * вводится прямо в шапке и окно рендерится без своего поля (`withField`),
 * на телефоне поле у окна. Закрывается Escape, кликом мимо и выбором
 * результата; кнопка «Назад» браузера ведёт так же (элемент на стеке
 * навигации кладёт `vkSearchOpen`).
 *
 * Монтируется внутри обёртки триггера — `.vk-header-search` (десктоп) или
 * мобильного `.vk-header`, — к ней панель и привязана абсолютом.
 *
 * «Чаты», «Каналы» и «Приложения» фильтруют уже загруженное (диалоги,
 * подписки, каталог приложений — те же данные, что показывают разделы),
 * «Посты» и «Медиа» ищут на сервере (`channels.searchPosts` и глобальный
 * поиск Телеграма), после паузы в вводе.
 */
export default function VKSearchOverlay(props: {isClosing?: boolean, withField?: boolean}) {
  const peers = usePeers();
  const contactIds = useContactPeerIds();
  const {channels: channelDialogs} = useSubscribedChannels({customFolders: true});
  const catalog = createAppsCatalog();
  onCleanup(() => catalog.onDispose());

  let panel!: HTMLDivElement;
  let input: HTMLInputElement | undefined;

  // своё поле только там, где в шапке его нет (телефон); на десктопе текст
  // вводится в поле шапки — оба пишут в один общий запрос
  const withField = () => props.withField ?? true;
  const [tab, setTab] = createSignal<VKSearchTabId>('chats');
  const query = vkSearchQuery;

  // what the server tabs search: the query once typing has paused
  const [searched, setSearched] = createSignal('');
  createEffect(on(query, (value) => {
    const timer = window.setTimeout(() => setSearched(value.trim()), SEARCH_DELAY);
    onCleanup(() => clearTimeout(timer));
  }, {defer: true}));

  // * «Чаты»: every dialog (the two built-in folders, the same store the chat
  // list reads) + the contacts that have no dialog yet
  const [allDialogs, setAllDialogs] = createSignal<Dialog[]>();
  let dialogsAlive = true;
  onCleanup(() => dialogsAlive = false);
  void Promise.all([FOLDER_ID_ALL, FOLDER_ID_ARCHIVE].map((folderId) =>
    fetchFolder(folderId, () => dialogsAlive).catch((err) => {
      console.error('VKgram: failed to load dialogs for the search', err);
      return [] as Dialog[];
    })
  )).then((folders) => {
    if(dialogsAlive) setAllDialogs(folders.flat());
  });

  // the frequent chats of the strip: Telegram's top correspondents
  const [topPeerIds, setTopPeerIds] = createSignal<PeerId[]>();
  onMount(() => {
    rootScope.managers.appUsersManager.getTopPeers('correspondents').then((topPeers) => {
      setTopPeerIds(topPeers.map((topPeer) => topPeer.id).slice(0, STRIP_LIMIT));
    }, (err) => {
      console.error('VKgram: failed to load the frequent chats', err);
      setTopPeerIds([]);
    });
  });

  const isUser = (peer: any): peer is User.user => peer?._ === 'user';
  const peerName = (peerId: PeerId) => peerTitle(peers[peerId]) ?? '';

  const chatResults = createMemo(() => {
    const text = query().trim();
    if(!text) return {dialogs: [] as Dialog[], contacts: [] as PeerId[]};

    const dialogs = (allDialogs() ?? []).filter((dialog) => {
      const peer = peers[dialog.peerId];
      // «Чаты» — всё, что числится в «Сообщениях»: broadcast-каналы живут во «Каналах»
      return peer && isMessagesPeer(peer) &&
        matchesQuery(text, peerTitle(peer), getPeerActiveUsernames(peer));
    });
    const inDialogs = new Set(dialogs.map((dialog) => dialog.peerId));
    const contacts = (contactIds() ?? []).filter((peerId) => {
      if(inDialogs.has(peerId)) return false;
      const user = peers[peerId] as User.user;
      return !!user && matchesQuery(text, user.first_name, user.last_name, getPeerActiveUsernames(user));
    });
    return {dialogs, contacts};
  });

  const channelResults = createMemo(() => {
    const text = query().trim();
    if(!text) return [];
    return channelDialogs().filter((dialog) => {
      const chat = peers[dialog.peerId] as Chat.channel;
      return !!chat && matchesQuery(text, chat.title, getPeerActiveUsernames(chat));
    });
  });

  const appResults = createMemo(() => {
    const text = query().trim();
    const match = (peerId: PeerId) => {
      const user = peers[peerId] as User.user;
      return !!user && matchesQuery(text, user.first_name, getPeerActiveUsernames(user));
    };
    const recent = (catalog.recent() ?? []).filter(match);
    const popular = catalog.popular().filter(match);
    return {recent, popular};
  });

  const posts = createPostsSearch({query: searched});

  // * paging of «Постов», as the end of the list comes near
  const [postsSentinel, setPostsSentinel] = createSignal<HTMLDivElement>();
  createEffect(() => {
    const element = postsSentinel();
    void posts.messages().length;
    if(!element || posts.status() !== 'loaded' || posts.isEnd() || posts.isLoadingMore()) return;

    const observer = new IntersectionObserver((entries) => {
      if(entries.some((entry) => entry.isIntersecting)) posts.loadMore();
    }, {rootMargin: '400px'});
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

  const hasQuery = () => !!query().trim();

  const pick = (run: () => void) => {
    closeVKSearch();
    run();
  };

  // * lifecycle: the focus into the field on open, Escape and a click outside
  // close the window; on close the focus returns to what opened it
  const onKeyDown = (e: KeyboardEvent) => {
    if(e.isComposing) return;
    if(e.key === 'Escape') {
      e.stopImmediatePropagation();
      e.preventDefault();
      closeVKSearch();
    }
  };

  // клик мимо окна и триггера закрывает его (панель смонтирована внутри
  // обёртки триггера — `.vk-header-search` или мобильного `.vk-header`)
  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as Node;
    if(!panel.contains(target) && !panel.parentElement?.contains(target)) closeVKSearch();
  };

  onMount(() => {
    // на телефоне своё поле — фокус в него; на десктопе фокус уже в поле шапки
    if(withField()) input?.focus();
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
  });
  onCleanup(() => {
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
  });

  const openChat = (peerId: PeerId) => pick(() => openVKChat(peerId));

  const renderHint = (text: string) => (
    <div class="vk-block vk-search-results-block">
      <p class="vk-search-hint">{text}</p>
    </div>
  );

  const renderPeerRow = (options: {peerId: PeerId, title: string, sub?: string, onSelect: () => void}): JSX.Element => (
    <li class="vk-search-row-item">
      <button type="button" class="vk-search-row" onClick={options.onSelect}>
        <VKPeerAvatar peerId={options.peerId} size={ROW_AVATAR_SIZE} />
        <span class="vk-search-row-info">
          <span class="vk-search-row-title">{options.title}</span>
          <Show when={options.sub}>
            <span class="vk-search-row-sub">{options.sub}</span>
          </Show>
        </span>
      </button>
    </li>
  );

  // the list card; `after` (paging sentinel, «Загрузка ещё») stands under the rows
  const renderResults = (children: JSX.Element, after?: JSX.Element) => (
    <div class="vk-block vk-search-results-block">
      <ul class="vk-search-rows">{children}</ul>
      {after}
    </div>
  );

  // * Чаты, an empty query: the horizontal strip of the frequent chats
  const frequentChatsStrip = (
    <Show when={topPeerIds()} fallback={renderHint('Загрузка…')}>
      {(ids) => (
        <Show when={ids().length} fallback={renderHint('Здесь появятся чаты, в которых вы чаще всего пишете.')}>
          {/* без .vk-block: полоса живёт внутри окна и не нуждается в своей рамке */}
          <div class="vk-search-strip-block">
            <ul class="vk-search-strip" aria-label="Частые чаты">
              <For each={ids()}>
                {(peerId) => (
                  <li>
                    <button
                      type="button"
                      class="vk-search-strip-item"
                      title={peerName(peerId)}
                      onClick={() => openChat(peerId)}
                    >
                      <VKPeerAvatar peerId={peerId} size={STRIP_AVATAR_SIZE} />
                      <span class="vk-search-strip-name">{peerName(peerId)}</span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      )}
    </Show>
  );

  // * Чаты, a query: the dialogs first, then the contacts with no dialog
  const chatResultsList = (
    <Switch>
      <Match when={chatResults().dialogs.length || chatResults().contacts.length}>
        <For each={chatResults().dialogs}>
          {(dialog) => {
            const peer = peers[dialog.peerId];
            const kind = isUser(peer) ?
              (peer.pFlags?.bot ? 'Бот' : undefined) :
              ((peer as Chat.channel).pFlags?.megagroup ? 'Группа' : undefined);
            return renderPeerRow({
              peerId: dialog.peerId,
              title: peerName(dialog.peerId),
              sub: dialogPreview(dialog) ?? kind,
              onSelect: () => openChat(dialog.peerId)
            });
          }}
        </For>
        <For each={chatResults().contacts}>
          {(peerId) => {
            const user = peers[peerId] as User.user;
            const username = getPeerActiveUsernames(user)[0];
            return renderPeerRow({
              peerId,
              title: peerName(peerId),
              sub: username ? '@' + username : 'Контакт',
              onSelect: () => pick(() => openVKProfile(peerId))
            });
          }}
        </For>
      </Match>
      <Match when={true}>
        <li class="vk-search-empty">
          <VKEmptyState
            icon="search"
            title="Ничего не найдено"
            description="Среди чатов и контактов. Проверьте запрос."
          />
        </li>
      </Match>
    </Switch>
  );

  return (
    <div
      ref={panel}
      id="vk-search-popup"
      class="vk-search-popup"
      classList={{'is-closing': !!props.isClosing}}
      role="dialog"
      aria-label="Поиск"
      tabIndex={-1}
    >
      {/* своё поле — только где в шапке его нет (телефон); на десктопе текст
          вводится в поле шапки, оба пишут в общий запрос */}
      <Show when={withField()}>
        <div class="vk-search-head">
          <div class="vk-search-field">
            <VKIcon name="search" size={15} class="vk-search-field-icon" />
            <input
              ref={input}
              type="search"
              class="vk-search-input"
              placeholder="Поиск"
              aria-label="Поиск"
              value={query()}
              autocomplete="off"
              onInput={(e) => setVKSearchQuery(e.currentTarget.value)}
            />
          </div>
        </div>
      </Show>

      <div class="vk-search-tabs-block">
        <VKTabs tabs={TABS} active={tab()} onChange={setTab} idPrefix="vk-search" label="Разделы поиска" />
      </div>

      <div class="vk-search-scroll">
        {/* * Чаты: the frequent chats on an empty query, matches while typing */}
        <Show when={tab() === 'chats'}>
          <Show when={hasQuery()} fallback={frequentChatsStrip}>
            {renderResults(chatResultsList)}
          </Show>
        </Show>

        {/* * Каналы: the subscriptions, filtered locally */}
        <Show when={tab() === 'channels'}>
          <Show when={hasQuery()} fallback={renderHint('Начните вводить название канала.')}>
            <Switch>
              <Match when={channelResults().length}>
                {renderResults(
                  <For each={channelResults()}>
                    {(dialog) => {
                      const chat = peers[dialog.peerId] as Chat.channel;
                      const username = getPeerActiveUsernames(chat)[0];
                      return renderPeerRow({
                        peerId: dialog.peerId,
                        title: chat.title,
                        sub: username ? '@' + username : 'Канал',
                        onSelect: () => pick(() => openVKChannelPage(dialog.peerId))
                      });
                    }}
                  </For>
                )}
              </Match>
              <Match when={true}>
                {renderResults(
                  <li class="vk-search-empty">
                    <VKEmptyState icon="channels" title="Канал не найден" description="Проверьте запрос." />
                  </li>
                )}
              </Match>
            </Switch>
          </Show>
        </Show>

        {/* * Приложения: the catalog (recent + popular), filtered locally */}
        <Show when={tab() === 'apps'}>
          <Show when={hasQuery()} fallback={renderHint('Начните вводить название приложения.')}>
            <Switch>
              <Match when={appResults().recent.length || appResults().popular.length}>
                {renderResults(
                  <>
                    <For each={appResults().recent}>
                      {(peerId) => renderPeerRow({
                        peerId,
                        title: peerName(peerId),
                        sub: 'Недавнее',
                        onSelect: () => pick(() => openVKMiniApp(peerId))
                      })}
                    </For>
                    <For each={appResults().popular}>
                      {(peerId) => renderPeerRow({
                        peerId,
                        title: peerName(peerId),
                        sub: 'Мини-приложение',
                        onSelect: () => pick(() => openVKMiniApp(peerId))
                      })}
                    </For>
                  </>
                )}
              </Match>
              <Match when={catalog.isLoading()}>
                {renderResults(<li class="vk-search-empty"><p class="vk-search-hint">Загрузка приложений…</p></li>)}
              </Match>
              <Match when={true}>
                {renderResults(
                  <li class="vk-search-empty">
                    <VKEmptyState icon="apps" title="Приложение не найдено" description="Проверьте запрос." />
                  </li>
                )}
              </Match>
            </Switch>
          </Show>
        </Show>

        {/* * Посты: the public posts of the whole Telegram (`channels.searchPosts`) */}
        <Show when={tab() === 'posts'}>
          <Switch>
            <Match when={!searched()}>
              {renderHint('Введите слово или фразу — найдутся публичные посты по всему Телеграму.')}
            </Match>
            <Match when={posts.status() === 'loading'}>
              {renderResults(<li class="vk-search-empty"><p class="vk-search-hint">Загрузка…</p></li>)}
            </Match>
            <Match when={posts.status() === 'limited'}>
              {renderResults(
                <li class="vk-search-empty">
                  <VKEmptyState
                    icon="search"
                    title="Лимит поиска постов"
                    description="Телеграм ограничивает число запросов в день. Попробуйте позже."
                  />
                </li>
              )}
            </Match>
            <Match when={posts.status() === 'error'}>
              {renderResults(
                <li class="vk-search-empty">
                  <p class="vk-search-hint">
                    Не удалось найти посты.{' '}
                    <button type="button" class="vk-link-button" onClick={() => posts.reload()}>Повторить</button>
                  </p>
                </li>
              )}
            </Match>
            <Match when={posts.messages().length}>
              {renderResults(
                <For each={posts.messages()}>
                  {(message) => {
                    const text = (message.message || '').replace(/\s+/g, ' ').trim();
                    const snippet = text.length > SNIPPET_LIMIT ? text.slice(0, SNIPPET_LIMIT - 1) + '…' : text;
                    return (
                      <li class="vk-search-row-item">
                        <button
                          type="button"
                          class="vk-search-row"
                          onClick={() => pick(() => openVKChat(message.peerId, {mid: message.mid, kind: 'jump'}))}
                        >
                          <VKPeerAvatar peerId={message.peerId} size={ROW_AVATAR_SIZE} />
                          <span class="vk-search-row-info">
                            <span class="vk-search-row-title">{peerName(message.peerId) || 'Канал'}</span>
                            <Show when={snippet}>
                              <span class="vk-search-row-sub">{snippet}</span>
                            </Show>
                          </span>
                          <time class="vk-search-row-date">{formatDateAccordingToTodayNew(new Date(message.date * 1000))}</time>
                        </button>
                      </li>
                    );
                  }}
                </For>,
                <>
                  <div ref={setPostsSentinel} class="vk-list-sentinel" />
                  <Show when={posts.isLoadingMore()}>
                    <p class="vk-search-hint vk-search-hint-more">Загрузка…</p>
                  </Show>
                </>
              )}
            </Match>
            <Match when={true}>
              {renderResults(
                <li class="vk-search-empty">
                  <VKEmptyState icon="news" title="Постов не найдено" description="Попробуйте другой запрос." />
                </li>
              )}
            </Match>
          </Switch>
        </Show>

        {/* * Медиа: the photos and videos of every chat (the global search, one combined filter) */}
        <Show when={tab() === 'media'}>
          <Switch>
            <Match when={!searched()}>
              {renderHint('Введите слово — найдутся фото и видео из ваших чатов.')}
            </Match>
            <Match when={true}>
              <div class="vk-block vk-search-results-block">
                <VKMediaList kind="media" source="search" query={query} />
              </div>
            </Match>
          </Switch>
        </Show>
      </div>
    </div>
  );
}

// as long as the leaving of the window (see `vk-settings-out`)
const CLOSE_DELAY = 140;

/**
 * Хозяин окна поиска: держит его в странице ещё 140 мс после закрытия, чтобы
 * оно успело свернуться обратно в поле (анимация `vk-settings-out` — тот же
 * приём, что у панели «Настроек» из шапки). Стоит там же, где и окно: внутри
 * якоря-триггера в шапке (десктоп — `.vk-header-search`, телефон — сам бар).
 */
export function VKSearchPopup(props: {withField?: boolean}) {
  const [isMounted, setMounted] = createSignal(isVKSearchOpen());
  createEffect(() => {
    if(isVKSearchOpen()) {
      setMounted(true);
      return;
    }
    const timeout = window.setTimeout(() => setMounted(false), CLOSE_DELAY);
    onCleanup(() => window.clearTimeout(timeout));
  });

  return (
    <Show when={isMounted()}>
      <VKSearchOverlay isClosing={!isVKSearchOpen()} withField={props.withField} />
    </Show>
  );
}
