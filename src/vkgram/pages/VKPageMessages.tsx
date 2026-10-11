import {createEffect, createMemo, createResource, createSignal, For, on, onCleanup, onMount, Show} from 'solid-js';
import type {Chat, ChatFull, Message, User} from '@layer';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {createStore} from 'solid-js/store';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import createListenerSetter from '@helpers/solid/createListenerSetter';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import getDialogIndex from '@appManagers/utils/dialogs/getDialogIndex';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE, NULL_PEER_ID} from '@appManagers/constants';
import type {Dialog} from '@appManagers/appMessagesManager';
import removeAccents from '@helpers/string/removeAccents';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import VKSearchField from '@/vkgram/components/VKSearchField';
import VKTabs, {VKTabItem} from '@/vkgram/components/VKTabs';
import VKIcon from '@/vkgram/components/VKIcons';
import VKLocalFolders from '@/vkgram/components/VKLocalFolders';
import VKFolderCreateModal from '@/vkgram/components/VKFolderCreateModal';
import VKFolderAddModal from '@/vkgram/components/VKFolderAddModal';
import useChannelFolders from '@/vkgram/hooks/useChannelFolders';
import {vkLocalFolders} from '@/vkgram/pages/localFolders/settings';
import createMutedPeers from '@/vkgram/hooks/createMutedPeers';
import createPeerTypings from '@/vkgram/hooks/createPeerTypings';
import createOutboxRead from '@/vkgram/hooks/createOutboxRead';
import {fetchFolder, isBroadcastChannel, isMessagesPeer, isSubscribedChannel} from '@/vkgram/hooks/useSubscribedChannels';
import createChannelHistory from '@/vkgram/pages/channel/createChannelHistory';
import getDialogLastMessage from '@/vkgram/utils/getDialogLastMessage';
import type {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import createContextMenu from '@helpers/dom/createContextMenu';
import {openVKPeerPage} from '@/vkgram/pages/profile/openProfile';
import {openVKChannelPage} from '@/vkgram/pages/channel/openChannel';
import {vkMessagePeerId, setVKMessagePeer, vkMessageAction, setVKMessageAction} from '@/vkgram/pages/messages/route';
import {vkMessagesSettings} from '@/vkgram/pages/messages/settings';
import useMessagesCustomize from '@/vkgram/pages/messages/customize';
import VKMessagesSettings from '@/vkgram/pages/messages/VKMessagesSettings';
import VKMessagesCustomizeModal from '@/vkgram/pages/messages/VKMessagesCustomizeModal';
import MessageRenderer, {mediaLabel} from '@/vkgram/components/MessageRenderer';
import VKComposer, {type ComposerReply} from '@/vkgram/components/VKComposer';
import VKServiceMessage from '@/vkgram/components/VKServiceMessage';
import VKPeerAvatar from '@/vkgram/components/VKPeerAvatar';
import {clearSelection} from '@/vkgram/pages/channel/postSelection';
import createMessageMenu from '@/vkgram/pages/messages/createMessageMenu';
import createVKPinnedMessages from '@/vkgram/hooks/createVKPinnedMessages';
import VKPinnedMessagesModal from '@/vkgram/pages/messages/VKPinnedMessagesModal';

const AVATAR_SIZE = 46;
const ALL_TAB = 'all';
const PERSONAL_TAB = 'personal';
const ARCHIVE_TAB = 'archive';

const MONTHS_RU = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

function formatDateSeparatorLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if(+msgDay === +today) return 'Сегодня';
  if(+msgDay === +yesterday) return 'Вчера';
  const day = date.getDate();
  const month = MONTHS_RU[date.getMonth()];
  return date.getFullYear() === now.getFullYear()
    ? `${day} ${month}`
    : `${day} ${month} ${date.getFullYear()}`;
}

type MessageTab = string;

type ChatItem =
  | {kind: 'separator', key: string, label: string}
  | {kind: 'message', key: string, message: Message.message, album?: Message.message[], isGrouped: boolean};

const normalize = (text: string) => removeAccents(text).toLowerCase();

function peerTitle(peer: User.user | Chat.chat | Chat.channel | undefined) {
  if(!peer) return '';
  if(peer._ === 'user') {
    if(peer.pFlags?.deleted) return 'Удалённый аккаунт';
    return [peer.first_name, peer.last_name].filter(Boolean).join(' ') || 'Пользователь';
  }
  return peer.title || 'Чат';
}

function peerSubtitle(peer: User.user | Chat.chat | Chat.channel | undefined, members?: number) {
  if(!peer) return '';
  if(peer._ === 'user') {
    const username = getPeerActiveUsernames(peer)[0];
    return username ? `@${username}` : '';
  }
  // a group / a channel: the number of members (while it is not known — the word as before)
  const count = members ?? (peer as Chat.chat | Chat.channel).participants_count;
  if(peer._ === 'channel' && !peer.pFlags?.megagroup) {
    return count ? `${count.toLocaleString('ru-RU')} ${pluralRu(count, 'подписчик', 'подписчика', 'подписчиков')}` : 'Канал';
  }
  if(count) return `${count.toLocaleString('ru-RU')} ${pluralRu(count, 'участник', 'участника', 'участников')}`;
  return peer._ === 'channel' ? 'Группа' : 'Групповой чат';
}

/**
 * Полностью самостоятельная страница «Сообщения» VKgram.
 *
 * Здесь нет .page-chats, sidebar-left, chat-container и другой разметки Web K.
 * Web K используется только как источник данных через managers/storage.
 *
 * Левая колонка: поиск → папки → список диалогов.
 * Правая колонка: собственная шапка диалога → собственная история → собственный composer.
 *
 * URL: ?vkgram=messages&peer=<peerId> — прямая ссылка на диалог.
 * Мобильный режим: левая / правая колонка переключаются; браузерная кнопка
 * «Назад» возвращает в список диалогов.
 *
 * Каналы (broadcast) относятся к разделу «Каналы»; здесь только те, в которые можно писать
 * (создатель / админ с правом публикации). Их можно скрыть в «Настройках диалогов».
 */
export default function VKPageMessages() {
  const peers = usePeers();
  const folders = useChannelFolders();
  const listenerSetter = createListenerSetter();

  const [dialogs, setDialogs] = createSignal<Dialog[]>([]);
  const [archiveDialogs, setArchiveDialogs] = createSignal<Dialog[]>([]);
  const [query, setQuery] = createSignal('');
  const [tab, setTab] = createSignal<MessageTab>(ALL_TAB);
  // the picked local folder («Локальные папки» under the tabs): its chats filter the list
  const [localFolderId, setLocalFolderId] = createSignal<string>();
  // the native folder creation window of Telegram's own folders (the «+» of the desktop rail);
  // the mobile «+» offers both kinds of folders in one window
  const [isFolderModalOpen, setFolderModalOpen] = createSignal(false);
  const [isFolderAddOpen, setFolderAddOpen] = createSignal(false);
  // Initialise from the URL so a direct link / page refresh restores the chat.
  const [selectedPeerId, setSelectedPeerId] = createSignal<PeerId>(
    vkMessagePeerId() ?? NULL_PEER_ID
  );
  // the post whose comments are open in the «миничат» (instead of the dialog); a different dialog closes it
  const [commentsPost, setCommentsPost] = createSignal<Message.message[]>();
  const [isReady, setReady] = createSignal(false);
  const [isDesktop, setIsDesktop] = createSignal(true);
  // «Настроить»: the settings of the dialogs and of the folders in one window; the signal is
  // module-level — the icon of the mobile top bar opens the same window (desktop keeps
  // its own dropdown of the side rail, bound to the very same signal)
  const [isSettingsOpen, setSettingsOpen] = useMessagesCustomize();
  // bumped for a peer when its notification settings change (mute state)
  const [notifyVersions, setNotifyVersions] = createStore<{[peerId: PeerId]: number}>({});
  // On mobile: has the user explicitly opened a chat (vs auto-selection)?
  const [mobileShowChat, setMobileShowChat] = createSignal(
    // A direct link (?peer=xxx) counts as an intentional open.
    vkMessagePeerId() !== undefined
  );

  let alive = true;
  let reloadTimer: number | undefined;
  let loadToken = 0;
  // Mobile navigation stack item: browser Back → return to dialog list.
  let mobileNavItem: NavigationItem | undefined;

  // Keep the URL in sync whenever the selected peer changes.
  createEffect(() => {
    const peerId = selectedPeerId();
    setVKMessagePeer(peerId !== NULL_PEER_ID ? peerId : undefined);
  });

  createEffect(on(selectedPeerId, () => setCommentsPost(undefined), {defer: true}));

  // a chat opened from another page while «Сообщения» is already open (`openVKChat`)
  createEffect(on(vkMessagePeerId, (peerId) => {
    if(!peerId || peerId === selectedPeerId()) return;
    setSelectedPeerId(peerId);
    setMobileShowChat(true);
  }, {defer: true}));

  // When no peer is selected any more, also reset the mobile view flag.
  createEffect(() => {
    if(selectedPeerId() === NULL_PEER_ID) setMobileShowChat(false);
  });

  const loadDialogs = async() => {
    const token = ++loadToken;
    try {
      const [all, archive] = await Promise.all([
        fetchFolder(FOLDER_ID_ALL, () => alive),
        fetchFolder(FOLDER_ID_ARCHIVE, () => alive)
      ]);
      if(!alive || token !== loadToken) return;
      setDialogs(all);
      setArchiveDialogs(archive);
      setReady(true);

      // a peer opened from outside («Написать сообщение» of a friend with no dialog yet, a group
      // that is not in the list) has no dialog to be found in the list: its chat is shown anyway
    } catch(err) {
      console.error('VKgram: failed to load messages dialogs', err);
      if(alive && token === loadToken) setReady(true);
    }
  };

  const scheduleReload = () => {
    window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(() => {
      void loadDialogs();
    }, 0);
  };

  onMount(() => {
    const media = window.matchMedia('(min-width: 601px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener?.('change', update);
    loadDialogs();

    listenerSetter.add(rootScope)('dialogs_multiupdate', scheduleReload);
    listenerSetter.add(rootScope)('dialog_flush', scheduleReload);
    listenerSetter.add(rootScope)('dialog_unread', scheduleReload);
    listenerSetter.add(rootScope)('dialog_drop', scheduleReload);
    listenerSetter.add(rootScope)('dialog_notify_settings', (dialog) => {
      setNotifyVersions(dialog.peerId, (version) => (version || 0) + 1);
    });

    onCleanup(() => media.removeEventListener?.('change', update));
  });

  onCleanup(() => {
    alive = false;
    loadToken++;
    window.clearTimeout(reloadTimer);
    listenerSetter.removeAll();
    // Drop the mobile nav reference so the orphaned onPop does nothing.
    mobileNavItem = undefined;
  });

  // ── Dialog selection ────────────────────────────────────────────────────────

  /**
   * Select a dialog.  On mobile, also switches to the chat panel and pushes a
   * browser history entry so the Back button returns to the list.
   */
  const selectDialog = (peerId: PeerId) => {
    // Drop the previous nav item (if switching between chats directly).
    if(mobileNavItem) {
      // Clear the reference first so its onPop guard fails and does not reset
      // selectedPeerId while we are about to set it to the new value.
      const old = mobileNavItem;
      mobileNavItem = undefined;
      appNavigationController.backByItem(old);
    }

    setSelectedPeerId(peerId);
    setMobileShowChat(true);

    if(peerId !== NULL_PEER_ID) {
      const item: NavigationItem = {
        type: 'vkgram-section',
        onPop: () => {
          if(mobileNavItem !== item) return;
          mobileNavItem = undefined;
          if(alive) {
            setSelectedPeerId(NULL_PEER_ID);
            setMobileShowChat(false);
          }
        },
        onEscape: () => false
      };
      mobileNavItem = item;
      appNavigationController.pushItem(item);
    }
  };

  /**
   * Return to the dialog list on mobile (the «←» button or the browser Back).
   */
  const closeMobileChat = () => {
    if(mobileNavItem) {
      appNavigationController.backByItem(mobileNavItem);
    } else {
      setSelectedPeerId(NULL_PEER_ID);
      setMobileShowChat(false);
    }
  };

  // ── Folders / tabs ──────────────────────────────────────────────────────────

  // the sorting tabs; Telegram's own folders live in a block of their own (like in
  // «Новостях»), the local ones — in the third block (the desktop rail).
  // On a phone all three are ONE scrolling strip (mobileFolderTabs)
  const sortingTabs = createMemo<VKTabItem<string>[]>(() => [
    {id: ALL_TAB, title: 'Все'},
    {id: PERSONAL_TAB, title: 'Личное'},
    {id: ARCHIVE_TAB, title: 'Архив'}
  ]);
  const tgFolderTabs = createMemo<VKTabItem<string>[]>(() =>
    folders.folders().map((folder) => ({id: String(folder.id), title: folder.title}))
  );

  // a Telegram folder can disappear while this page is open: return to «Все»
  createEffect(() => {
    if(!folders.isReady()) return;
    if(tab() === ALL_TAB || tab() === PERSONAL_TAB || tab() === ARCHIVE_TAB) return;
    if(!tgFolderTabs().some((item) => item.id === tab())) setTab(ALL_TAB);
  });

  // Every dialog that can be in the list: the archive too (the filters decide). Broadcast channels
  // belong to «Каналы» — except those the user can write to (owner / admin who may post): they
  // are in «Сообщения», and «Скрыть каналы» takes them out.
  const isListDialog = (dialog: Dialog) => isMessagesPeer(peers[dialog.peerId]);
  const isChannelDialog = (dialog: Dialog) => isSubscribedChannel(peers[dialog.peerId]);
  const allDialogs = createMemo(() => [...dialogs(), ...archiveDialogs()].filter(isListDialog));

  const dialogsByPeer = createMemo(() => new Map(allDialogs().map((dialog) => [dialog.peerId, dialog])));

  // ── Local folders («Локальные папки» under the tabs) ────────────────────────
  // A folder shows here when it holds at least one dialog of the list; the counter says how many.
  const localFolderPeerIds = createMemo(() => new Set(allDialogs().map((dialog) => dialog.peerId)));
  const localFolders = createMemo(() => {
    const peerIds = localFolderPeerIds();
    return vkLocalFolders().filter((folder) => folder.peerIds.some((id) => peerIds.has(id)));
  });
  // the folder was deleted (its last dialog left, it was removed): put it down
  createEffect(() => {
    const id = localFolderId();
    if(id && !vkLocalFolders().some((folder) => folder.id === id)) setLocalFolderId(undefined);
  });
  const activeLocalFolder = createMemo(() => {
    const id = localFolderId();
    return id ? vkLocalFolders().find((folder) => folder.id === id) : undefined;
  });
  // picking a local folder switches the view to it (over everything, like «Все»):
  // the server tabs put it down, it puts the server tabs down — one set of tabs
  const toggleLocalFolder = (id: string) => {
    setLocalFolderId((current) => current === id ? undefined : id);
    setTab(ALL_TAB);
    if(chatOpen()) closeMobileChat();
  };

  // the mobile strip: like in «Новостях» — one line of tabs, the sorting first, then the
  // Telegram folders and the local ones, «+» pinned at the right end (the desktop keeps
  // its three blocks of the side rail)
  const mobileFolderTabs = createMemo<VKTabItem<string>[]>(() => [
    ...sortingTabs(),
    ...tgFolderTabs(),
    ...localFolders().map((folder) => ({id: folder.id, title: folder.title}))
  ]);
  const onMobileFolderTab = (id: string) => {
    if(localFolders().some((folder) => folder.id === id)) toggleLocalFolder(id);
    else selectTab(id as MessageTab);
  };

  // Which of them are muted: Web K's own answer, asked again when a peer's notify settings change.
  const muted = createMutedPeers({
    peerIds: () => allDialogs().map((dialog) => dialog.peerId),
    version: (peerId) => notifyVersions[peerId] || 0,
    getDialog: (peerId) => dialogsByPeer().get(peerId)
  });
  // Until the mute state of the dialogs is known once, a list that leaves muted dialogs out is not
  // shown (it would flash them). Dialogs that come later are not waited for.
  const [isMutedKnown, setMutedKnown] = createSignal(false);
  createEffect(() => {
    if(isReady() && muted.isResolved()) setMutedKnown(true);
  });

  // the dialogs of the open tab before the filters; the picked local folder narrows the
  // «Все» scope down to its dialogs — the two blocks of tabs are one set, a folder view
  // draws from everything (like «Все»), the settings decide the rest
  const scopeDialogs = createMemo(() => {
    const current = tab();
    if(current === ARCHIVE_TAB) return archiveDialogs().filter(isListDialog);

    let list = allDialogs();
    if(current === PERSONAL_TAB) {
      list = list.filter((dialog) => {
        const peer = peers[dialog.peerId] as User.user | undefined;
        return peer?._ === 'user' && !peer.pFlags?.bot && !peer.pFlags?.deleted;
      });
    } else if(current !== ALL_TAB) {
      const folder = folders.folders().find((item) => String(item.id) === current);
      if(folder) list = list.filter((dialog) => folder.peerIds.has(dialog.peerId));
    }

    const local = activeLocalFolder();
    if(local) {
      const ids = new Set(local.peerIds);
      list = list.filter((dialog) => ids.has(dialog.peerId));
    }
    return list;
  });

  // «Все» is always filtered; the other tabs only when the settings say so; «Архив» never.
  // A local folder counts as a folder tab: the filters take it in only when the settings say so.
  const filtersApply = () => {
    if(tab() === ARCHIVE_TAB) return false;
    return vkMessagesSettings().scope === 'all' || (tab() === ALL_TAB && !localFolderId());
  };

  // what the settings leave of the open tab's dialogs
  const ruledDialogs = createMemo(() => {
    let list = scopeDialogs();
    if(!filtersApply()) return list;

    const settings = vkMessagesSettings();
    if(settings.hideArchived) list = list.filter((dialog) => dialog.folder_id !== FOLDER_ID_ARCHIVE);
    // a dialog whose mute state is not known yet stays
    if(settings.hideMuted) list = list.filter((dialog) => muted.isMuted(dialog.peerId) !== true);
    if(settings.hideChannels) list = list.filter((dialog) => !isChannelDialog(dialog));
    return list;
  });

  // what each filter would take out of the open tab's dialogs (`muted` is undefined until Web K answered)
  const scopeStats = createMemo(() => {
    if(!isReady() || tab() === ARCHIVE_TAB) return undefined;
    const scope = scopeDialogs();
    return {
      archived: scope.filter((dialog) => dialog.folder_id === FOLDER_ID_ARCHIVE).length,
      channels: scope.filter(isChannelDialog).length,
      muted: muted.isResolved() ? scope.filter((dialog) => muted.isMuted(dialog.peerId) === true).length : undefined
    };
  });

  const isListReady = () => isReady() && (!filtersApply() || !vkMessagesSettings().hideMuted || isMutedKnown());

  const filteredDialogs = createMemo(() => {
    let list = ruledDialogs();

    const text = normalize(query().trim().replace(/^@/, ''));
    if(text) {
      const words = text.split(/\s+/).filter(Boolean);
      list = list.filter((dialog) => {
        const peer = peers[dialog.peerId] as User.user | Chat.chat | Chat.channel | undefined;
        if(!peer) return false;
        const haystack = normalize([
          peerTitle(peer),
          peerSubtitle(peer),
          ...(peer._ === 'user' ? getPeerActiveUsernames(peer) : [])
        ].filter(Boolean).join(' '));
        return words.every((word) => haystack.includes(word));
      });
    }

    return list.slice().sort((a, b) => {
      const pinA = !!a.pFlags?.pinned;
      const pinB = !!b.pFlags?.pinned;
      if(pinA !== pinB) return pinA ? -1 : 1;
      const dateA = a.topMessage?.date ?? 0;
      const dateB = b.topMessage?.date ?? 0;
      if(dateA !== dateB) return dateB - dateA;
      return (getDialogIndex(b) ?? 0) - (getDialogIndex(a) ?? 0);
    });
  });

  // the same ids in the same order are the same list: `For` then leaves the rows alone
  const filteredPeerIds = createMemo<PeerId[]>((previous) => {
    const next = filteredDialogs().map((dialog) => dialog.peerId);
    return previous && previous.length === next.length && previous.every((id, i) => id === next[i]) ? previous : next;
  }, []);

  // the settings panel, in the desktop rail or in the mobile tabs
  const renderSettings = (id: string) => (
    <VKMessagesSettings
      id={id}
      isOpen={isSettingsOpen()}
      onOpenChange={setSettingsOpen}
      applies={filtersApply()}
      dialogCount={isListReady() && scopeStats() ? ruledDialogs().length : undefined}
      scopeCount={isListReady() && scopeStats() ? scopeDialogs().length : undefined}
      stats={scopeStats()}
    />
  );

  // The folders rail stays visible next to an open chat; picking a folder
  // brings the dialog list back so the result is actually shown.
  // The server tabs and the local folders are one set: picking a server tab
  // puts the local folder down.
  const selectTab = (id: MessageTab) => {
    setTab(id);
    setLocalFolderId(undefined);
    if(chatOpen()) closeMobileChat();
  };

  const selectedDialog = createMemo(() => {
    const peerId = selectedPeerId();
    return [...dialogs(), ...archiveDialogs()].find((dialog) => dialog.peerId === peerId);
  });

  // The list and the chat take turns: an open chat replaces the search and the list.
  const chatOpen = () => mobileShowChat() && selectedPeerId() !== NULL_PEER_ID;

  return (
    <div class="vk-page vk-messages-page">
      <Show when={isFolderModalOpen()}>
        <VKFolderCreateModal onClose={() => setFolderModalOpen(false)} />
      </Show>
      <Show when={isFolderAddOpen()}>
        <VKFolderAddModal
          onClose={() => setFolderAddOpen(false)}
          // the new folder is picked, so its result is seen in the list at once
          onCreatedLocal={(id) => toggleLocalFolder(id)}
        />
      </Show>
      <div class="vk-messages-shell">
      <div class="vk-messages-layout" classList={{'is-chat-open': chatOpen()}}>
        <section class="vk-messages-left" aria-label="Список сообщений">
          <div class="vk-messages-controls-block">
            <div class="vk-block vk-messages-search-block">
              <div class="vk-messages-search">
                <VKSearchField
                  value={query()}
                  placeholder="Поиск по диалогам"
                  onInput={setQuery}
                />
              </div>
            </div>

            <Show when={!isDesktop()}>
              {/* the mobile strip, like in «Новостях»: one line — sorting, Telegram folders,
                  local ones — that scrolls sideways, «+» pinned at its right end (both kinds
                  of folders in one window; the settings are in the top bar's «Настроить») */}
              <div class="vk-block vk-folders-block vk-messages-folders-tabs">
                <VKTabs
                  tabs={mobileFolderTabs()}
                  active={(localFolderId() ?? tab()) as MessageTab}
                  onChange={onMobileFolderTab}
                  idPrefix="vk-messages-folders-mobile"
                  label="Папки"
                  addLabel="Создать папку"
                  addPinned
                  onAdd={() => setFolderAddOpen(true)}
                />
              </div>

              <Show when={isSettingsOpen()}>
                <VKMessagesCustomizeModal
                  onClose={() => setSettingsOpen(false)}
                  applies={filtersApply()}
                  dialogCount={isListReady() && scopeStats() ? ruledDialogs().length : undefined}
                  scopeCount={isListReady() && scopeStats() ? scopeDialogs().length : undefined}
                  stats={scopeStats()}
                  onSelectFolder={(id) => toggleLocalFolder(id)}
                />
              </Show>
            </Show>
          </div>

          <div class="vk-block vk-messages-list-block">
            <div class="vk-messages-list" role="list">
              <Show when={isListReady()} fallback={<div class="vk-messages-empty">Загрузка сообщений…</div>}>
                <Show
                  when={filteredDialogs().length}
                  fallback={
                    <div class="vk-messages-empty">
                      {query() ? 'Среди диалогов ничего не найдено.' : activeLocalFolder() ? 'В этой папке нет диалогов.' : 'Диалогов не найдено.'}
                      {/* the settings left every dialog of the tab out */}
                      <Show when={!query() && ruledDialogs().length === 0 && scopeDialogs().length > 0}>
                        <div>
                          Архивные, заглушённые диалоги и каналы не показываются, если так выбрано в настройках.{' '}
                          <button type="button" class="vk-link-button" onClick={() => setSettingsOpen(true)}>
                            Настройки диалогов
                          </button>
                        </div>
                      </Show>
                    </div>
                  }
                >
                  {/* Rows are keyed by the peer, not by the dialog object: every reload brings new
                      objects, and a row made anew would redraw its avatar (a flicker) */}
                  <For each={filteredPeerIds()}>
                    {(peerId) => (
                      <MessageDialogRow
                        dialog={dialogsByPeer().get(peerId)!}
                        active={selectedPeerId() === peerId}
                        muted={muted.isMuted(peerId)}
                        onSelect={() => selectDialog(peerId)}
                      />
                    )}
                  </For>
                </Show>
              </Show>
            </div>
          </div>
        </section>

        <section class="vk-block vk-messages-right" aria-label="Диалог">
          <Show
            when={selectedPeerId() !== NULL_PEER_ID}
            fallback={<div class="vk-messages-no-chat">Выберите диалог</div>}
          >
            <Show
              when={commentsPost()}
              keyed
              fallback={
                <VKMessagesChat
                  peerId={selectedPeerId()}
                  dialog={selectedDialog()}
                  onBack={closeMobileChat}
                  onOpenComments={setCommentsPost}
                />
              }
            >
              {(post) => <VKCommentsChat post={post} onBack={() => setCommentsPost(undefined)} />}
            </Show>
          </Show>
        </section>
      </div>

      <Show when={isDesktop()}>
        <aside class="vk-messages-side" aria-label="Папки сообщений">
          <section class="vk-block vk-messages-side-block">
            <VKTabs
              tabs={sortingTabs()}
              active={(localFolderId() ? '' : tab()) as MessageTab}
              onChange={selectTab}
              idPrefix="vk-messages-desktop"
              label="Сортировка"
            />
          </section>

          <section class="vk-block vk-folders-block">
            <section class="vk-side-folders" aria-label="Папки Телеграма">
              <VKTabs
                tabs={tgFolderTabs()}
                active={(localFolderId() ? '' : tab()) as MessageTab}
                onChange={selectTab}
                idPrefix="vk-messages-tg-desktop"
                label="Папки Телеграма"
                addLabel="Создать папку"
                addInFooter
                onAdd={() => setFolderModalOpen(true)}
                actions={renderSettings('vk-messages-settings-desktop')}
              />
            </section>
          </section>

          <section class="vk-block vk-folders-block">
            <VKLocalFolders
              folders={localFolders()}
              activeId={localFolderId()}
              onToggle={toggleLocalFolder}
              onSelect={setLocalFolderId}
              label="Локальные папки сообщений"
              idPrefix="vk-messages-local-desktop"
              section="messages"
              addInFooter
            />
          </section>
        </aside>
      </Show>
      </div>
    </div>
  );
}

// ── Dialog context menu ───────────────────────────────────────────────────────

function createDialogContextMenu(options: {
  element: HTMLElement,
  // a getter: the row lives on while its dialog object is replaced by newer ones
  dialog: () => Dialog
}) {
  const managers = rootScope.managers;
  const peerId = options.dialog().peerId;
  const dialog = new Proxy({} as Dialog, {get: (_, key) => (options.dialog() as any)[key]});

  const buttons: ButtonMenuItemOptionsVerifiable[] = [{
    icon: 'unread',
    regularText: 'Пометить непрочитанным',
    onClick: () => managers.appMessagesManager.markDialogUnread({peerId}),
    verify: () => !dialog.unread_count
  }, {
    icon: 'readchats',
    regularText: 'Пометить прочитанным',
    onClick: () => managers.appMessagesManager.readHistory({peerId}),
    verify: () => !!dialog.unread_count
  }, {
    icon: 'pin',
    regularText: 'Закрепить',
    onClick: () => managers.appMessagesManager.toggleDialogPin({peerId, filterId: FOLDER_ID_ALL}),
    verify: () => !dialog.pFlags?.pinned
  }, {
    icon: 'unpin',
    regularText: 'Открепить',
    onClick: () => managers.appMessagesManager.toggleDialogPin({peerId, filterId: FOLDER_ID_ALL}),
    verify: () => !!dialog.pFlags?.pinned
  }, {
    icon: 'unarchive',
    regularText: 'Вернуть из архива',
    onClick: () => managers.appMessagesManager.editPeerFolders([peerId], FOLDER_ID_ALL),
    verify: () => !!dialog.folder_id
  }, {
    icon: 'archive',
    regularText: 'В архив',
    onClick: () => managers.appMessagesManager.editPeerFolders([peerId], FOLDER_ID_ARCHIVE),
    verify: () => !dialog.folder_id
  }];

  return createContextMenu({
    buttons,
    listenTo: options.element,
    findElement: () => options.element
  });
}

// ── Pinned plate menu ─────────────────────────────────────────────────────────

/**
 * Меню плиты закреплённого сообщения: весь список, открепить (у кого есть право)
 * или спрятать плиту (в канале, где закреп открепить нельзя). Окна открепления —
 * веб-ковские, те же, что у плиты чата Web K.
 */
function createPinnedPlateContextMenu(options: {
  element: HTMLElement,
  peerId: PeerId,
  canPin: () => boolean,
  mid: () => number,
  onOpenList: () => void
}) {
  const showUnpinPopup = (mid: number) => {
    import('@components/popups/unpinMessage').then(({default: showPinMessagePopup}) => {
      showPinMessagePopup(options.peerId, mid, true);
    });
  };

  return createContextMenu({
    buttons: [{
      icon: 'pinlist',
      regularText: 'Все закреплённые',
      onClick: () => options.onOpenList()
    }, {
      icon: 'unpin',
      regularText: 'Открепить',
      onClick: () => showUnpinPopup(options.mid()),
      verify: () => options.canPin()
    }, {
      icon: 'eyecross',
      regularText: 'Скрыть',
      onClick: () => showUnpinPopup(0),
      verify: () => !options.canPin()
    }],
    listenTo: options.element,
    findElement: () => options.element
  });
}

// ── MessageDialogRow ──────────────────────────────────────────────────────────

function MessageDialogRow(props: {
  dialog: Dialog,
  active: boolean,
  // undefined: Web K has not answered yet
  muted: boolean | undefined,
  onSelect: () => void
}) {
  const peers = usePeers();
  const peer = () => peers[props.dialog.peerId] as User.user | Chat.chat | Chat.channel | undefined;
  const unread = () => props.dialog.unread_count || 0;
  // a dialog marked as unread by hand has no number, only a dot
  const markedUnread = () => !unread() && !!props.dialog.pFlags?.unread_mark;
  const typing = createPeerTypings(() => props.dialog.peerId);
  const pinned = () => !!props.dialog.pFlags?.pinned;
  const lastMessage = createMemo(() => getDialogLastMessage(props.dialog));
  const previewText = createMemo(() => {
    const message = lastMessage();
    if(!message || message._ === 'messageService') return '';
    return (message.message || '').replace(/\s+/g, ' ').trim();
  });
  const previewTime = createMemo(() => {
    const message = lastMessage();
    return message?.date ? formatDateAccordingToTodayNew(new Date(message.date * 1000)) : '';
  });
  // my last message that the other side has not read yet: its preview is highlighted, as in VK
  const isPeerUser = () => peer()?._ === 'user';
  const outboxRead = createOutboxRead(() => props.dialog.peerId, isPeerUser);
  const isLastUnreadOut = () => {
    const message = lastMessage();
    return isPeerUser() && !!message && !!message.pFlags?.out && !unread() &&
      message.mid > outboxRead() && props.dialog.peerId !== rootScope.myId;
  };
  let row!: HTMLButtonElement;
  let menu: ReturnType<typeof createDialogContextMenu> | undefined;

  onMount(() => {
    menu = createDialogContextMenu({element: row, dialog: () => props.dialog});
  });
  onCleanup(() => menu?.destroy());

  return (
    <button
      ref={row}
      type="button"
      class="vk-message-dialog"
      classList={{'is-active': props.active}}
      role="listitem"
      onClick={props.onSelect}
    >
      <span class="vk-message-dialog-avatar">
        <VKPeerAvatar peerId={props.dialog.peerId} peer={peer()} size={AVATAR_SIZE} />
      </span>

      <span class="vk-message-dialog-main">
        <strong class="vk-message-dialog-title">{peerTitle(peer())}</strong>
        <span
          class="vk-message-dialog-preview"
          classList={{'is-typing': !!typing(), 'is-unread-out': !typing() && isLastUnreadOut()}}
        >
          <Show
            when={typing()}
            fallback={
              <Show when={previewText()} fallback="Нет сообщений">{previewText()}</Show>
            }
          >
            {typing()}<span class="vk-typing-dots" aria-hidden="true"><i /><i /><i /></span>
          </Show>
        </span>
      </span>

      {/* the right column: the time on the title's line, the badges on the preview's line */}
      <span class="vk-message-dialog-meta">
        <time class="vk-message-dialog-time">{previewTime()}</time>
        <span class="vk-message-dialog-badges">
          <Show when={unread() > 0 || markedUnread()}>
            <span
              class="vk-message-dialog-unread"
              classList={{
                'is-muted': props.muted === true,
                'is-pending': props.muted === undefined,
                'is-dot': markedUnread()
              }}
            >{unread() || ''}</span>
          </Show>
          <Show when={pinned()}>
            <span class="vk-message-dialog-pin" aria-label="Закреплено"><VKIcon name="pin" size={14} /></span>
          </Show>
        </span>
      </span>
    </button>
  );
}

// ── VKDateSeparator ───────────────────────────────────────────────────────────

function VKDateSeparator(props: {label: string}) {
  return (
    <div class="vk-date-separator" role="separator" aria-label={props.label}>
      <span class="vk-date-separator-label">{props.label}</span>
    </div>
  );
}

// ── VKMessagesChat ────────────────────────────────────────────────────────────

type CommentsThread = {
  // the thread id: the mid of the discussion message in the discussion group
  id: number,
  // the channel post the comments belong to (an album: all its messages)
  post: Message.message[],
  channelPeerId: PeerId,
  repliesCount?: number
};

const pluralRu = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if(mod10 === 1 && mod100 !== 11) return one;
  if(mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/** Web K's own media viewer, the same search context for a chat and for the post at the top of a thread. */
async function openMediaViewer(message: Message.message, target?: HTMLElement) {
  const {default: AppMediaViewer} = await import('@components/mediaViewer');
  new AppMediaViewer()
  .setSearchContext({
    peerId: message.peerId,
    inputFilter: {_: 'inputMessagesFilterPhotoVideo'},
    useSearch: true
  })
  .openMedia({message, target});
}

/**
 * The composer of a comments thread. Writing is allowed by the rights in the discussion group:
 * a member writes, someone who has left gets «Вступить», otherwise the form is replaced by a note.
 */
function VKThreadComposer(props: {
  peerId: PeerId,
  threadId: number,
  reply?: ComposerReply,
  editing?: Message.message,
  onCancelReply: () => void,
  onCancelEdit: () => void,
  onSent: () => void
}) {
  const peers = usePeers();
  const group = () => peers[props.peerId] as Chat.channel | undefined;
  const [canWrite, {refetch}] = createResource(async() => {
    try {
      return await rootScope.managers.appMessagesManager.canSendToPeer(props.peerId, props.threadId);
    } catch(err) {
      return false;
    }
  });
  const [isJoining, setJoining] = createSignal(false);
  const join = async() => {
    setJoining(true);
    try {
      await rootScope.managers.appChatsManager.joinChannel(props.peerId.toChatId());
      await refetch();
    } catch(err) {
      console.error('VKgram: joinChannel failed', err);
    } finally {
      setJoining(false);
    }
  };

  return (
    <Show when={!canWrite.loading}>
      <Show
        when={canWrite()}
        fallback={
          <div class="vk-comments-chat-note">
            <Show
              when={group()?.pFlags?.left}
              fallback={<span>Писать комментарии здесь нельзя.</span>}
            >
              <button type="button" class="vk-button vk-button-secondary" disabled={isJoining()} onClick={join}>
                {isJoining() ? 'Вступаем…' : 'Вступить в обсуждение, чтобы комментировать'}
              </button>
            </Show>
          </div>
        }
      >
        <VKComposer
          peerId={props.peerId}
          threadId={props.threadId}
          reply={props.reply}
          editing={props.editing}
          onCancelReply={props.onCancelReply}
          onCancelEdit={props.onCancelEdit}
          onSent={props.onSent}
        />
      </Show>
    </Show>
  );
}

/**
 * The «миничат» of a channel post — what Telegram opens on «Комментарии»: the thread of the
 * post's discussion message, in the discussion group. The discussion message comes from
 * `getDiscussionMessage` (its mid is the thread id); the chat itself is the usual one in thread mode.
 */
function VKCommentsChat(props: {post: Message.message[], onBack: () => void}) {
  const main = props.post.find((message) => message.replies?.pFlags?.comments) ?? props.post[0];
  const [root] = createResource(async() => {
    try {
      return await rootScope.managers.appMessagesManager.getDiscussionMessage(main.peerId, main.mid) as Message.message | undefined;
    } catch(err) {
      console.error('VKgram: getDiscussionMessage failed', err);
    }
  });

  return (
    <Show
      when={root()}
      fallback={
        <div class="vk-custom-chat">
          <header class="vk-custom-chat-header">
            <button type="button" class="vk-custom-chat-back" aria-label="Назад к посту" onClick={props.onBack}>
              <VKIcon name="back" size={16} />
              <span>Назад</span>
            </button>
            <div class="vk-custom-chat-header-info">
              <div class="vk-custom-chat-title">Комментарии</div>
            </div>
          </header>
      <div class="vk-custom-chat-history">
            <div class="vk-custom-chat-loading">
              {root.loading ? 'Загрузка комментариев…' : 'Комментарии недоступны.'}
            </div>
          </div>
        </div>
      }
    >
      {(discussion) => (
        <VKMessagesChat
          peerId={discussion().peerId}
          onBack={props.onBack}
          thread={{
            id: discussion().mid,
            post: props.post,
            channelPeerId: main.peerId,
            repliesCount: main.replies?.pFlags?.comments ? main.replies.replies : undefined
          }}
        />
      )}
    </Show>
  );
}

function VKMessagesChat(props: {
  peerId: PeerId,
  dialog?: Dialog,
  onBack: () => void,
  // the dialog's chat opens a comments thread (a channel post's «Комментарии»)
  onOpenComments?: (post: Message.message[]) => void,
  // set: the chat is the comments thread of a post (`peerId` is the discussion group)
  thread?: CommentsThread
}) {
  const peers = usePeers();
  const peer = () => peers[props.peerId] as User.user | Chat.chat | Chat.channel | undefined;
  // a click on the header or the avatar: a channel's dialog opens the channel's page, the rest — the profile
  const openPeerPage = () => openVKPeerPage(props.peerId, peer());
  // the full chat knows the exact number of members (the basic one may not have it)
  const fullPeer = useFullPeer(props.peerId) as () => (ChatFull.channelFull | ChatFull.chatFull | undefined);
  const membersCount = () => {
    const full = fullPeer() as any;
    return full?.participants_count ?? full?.participants?.participants?.length;
  };
  // a selection belongs to the chat it was made in: leaving the chat (or switching it) lets it go
  onCleanup(clearSelection);
  createEffect(on(() => props.peerId, clearSelection, {defer: true}));

  const history = createChannelHistory({peerId: () => props.peerId, threadId: props.thread?.id, pageSize: 40});
  const channel = () => props.thread ? peers[props.thread.channelPeerId] as Chat.channel | undefined : undefined;
  // the discussion message itself is the post (shown on top), not a comment
  const comments = createMemo(() => history.messages().filter((message) => message.mid !== props.thread?.id));
  const commentsTotal = () => history.isEnd() ? comments().length : (props.thread?.repliesCount ?? comments().length);
  const commentsTitle = () => {
    const total = commentsTotal();
    return total ? `${total} ${pluralRu(total, 'комментарий', 'комментария', 'комментариев')}` : 'Комментарии';
  };

  // «печатает…» instead of the @username under the name
  const typing = createPeerTypings(() => props.peerId);
  // chats where my messages get the ✓ / ✓✓ ticks: everywhere but a channel (no read
  // receipts there) and Saved Messages — private chats and (mega)groups, as in Telegram
  const isTicksChat = () => !props.thread && props.peerId !== rootScope.myId &&
    (() => {
      const p = peer();
      return !!p && (p._ === 'user' || !isBroadcastChannel(p));
    })();
  const outboxRead = createOutboxRead(() => props.peerId, isTicksChat);

  let scrollEl!: HTMLDivElement;
  // Закреплённые сообщения диалога (в ветке комментариев их нет): плита под шапкой,
  // прыжки к закрепу и список «Все закреплённые».
  const pinned = createVKPinnedMessages(() => props.peerId, () => !props.thread);
  // после перехода по плите она стоит на выбранном закрепе, пока пользователь не вернётся
  // к концу истории (тогда снова работает слежение за скроллом)
  const [pinnedLocked, setPinnedLocked] = createSignal(false);
  const [isPinnedListOpen, setPinnedListOpen] = createSignal(false);
  // право закреплять: в личке всегда есть, в чатах — право «pin_messages»
  const [canPinPinned] = createResource(
    () => (props.thread ? undefined : props.peerId),
    async(peerId) => {
      if(!peerId) return false;
      try {
        return await rootScope.managers.appPeersManager.canPinMessage(peerId);
      } catch(err) {
        return false;
      }
    }
  );

  const pinnedMessage = () => pinned.shown();
  // превью плиты: «Автор: текст» или «Автор: Фотография» (у постов канала автора нет)
  const pinnedPreview = () => {
    const message = pinnedMessage();
    if(!message) return '';
    const senderId = (message.fromId ?? message.peerId) as PeerId;
    const author = !!message.pFlags?.out && !isBroadcastChannel(peers[props.peerId])
      ? 'Вы'
      : senderId === props.peerId
        ? ''
        : peerTitle(peers[senderId] as User.user | Chat.chat | Chat.channel | undefined);
    const text = message.message || mediaLabel(message);
    return author ? `${author}: ${text}` : text;
  };
  const showUnpinPopup = (mid: number) => {
    import('@components/popups/unpinMessage').then(({default: showPinMessagePopup}) => {
      showPinMessagePopup(props.peerId, mid, true);
    });
  };

  // «×» плиты: открепить показанный закреп; у кого права нет — спрятать плиту (как в Telegram)
  const onPinnedUnpinClick = () => {
    showUnpinPopup(canPinPinned() ? (pinnedMessage()?.mid ?? 0) : 0);
  };

  // клик по плите: прыжок к показанному закрепу, после него плита встаёт на следующий
  // (более старый) закреп — по кругу, как в Telegram
  const onPinnedClick = () => {
    const message = pinnedMessage();
    if(!message) return;
    setPinnedLocked(true);
    setPendingJump({
      mid: message.mid,
      done: () => {
        if(pinned.count() > 1) pinned.setIndex((pinned.index() + 1) % pinned.count());
      }
    });
  };

  // из списка «Все закреплённые»: окно закрывается, плита встаёт на выбранный закреп
  // и ждёт возвращения к концу истории
  const jumpToPinned = (mid: number) => {
    setPinnedListOpen(false);
    const index = pinned.list().findIndex((message) => message.mid === mid);
    if(index !== -1) pinned.setIndex(index);
    setPinnedLocked(true);
    setPendingJump({mid});
  };

  const [newMessagesCount, setNewMessagesCount] = createSignal(0);
  const [showNewMessagesBtn, setShowNewMessagesBtn] = createSignal(false);
  const [replyTo, setReplyTo] = createSignal<ComposerReply>();
  const [editing, setEditing] = createSignal<Message.message>();

  // reply / edit belong to the dialog they were started in; a jump and the pinned
  // plate belong to it too
  createEffect(on(() => props.peerId, () => {
    setReplyTo(undefined);
    setEditing(undefined);
    setPendingJump(undefined);
    setPinnedLocked(false);
    setPinnedListOpen(false);
  }, {defer: true}));

  const startReply = (message: Message.message) => {
    const isChannel = isBroadcastChannel(peers[message.peerId]);
    const outgoing = !!message.pFlags?.out && !isChannel;
    const sender = peers[(isChannel ? message.peerId : (message.fromId ?? message.peerId)) as PeerId] as User.user | Chat.chat | Chat.channel | undefined;
    setEditing(undefined);
    setReplyTo({
      mid: message.mid,
      author: outgoing ? 'Вы' : peerTitle(sender),
      text: message.message || (message.media ? 'Вложение' : '')
    });
  };

  const startEdit = (message: Message.message) => {
    setReplyTo(undefined);
    setEditing(message);
  };

  const onSent = () => {
    // force scroll to the bottom after sending
    requestAnimationFrame(() => {
      if(scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    });
  };

  // Smart scroll state (mutable, not reactive — used only in effects/handlers).
  let loadMoreScrollHeight = 0;
  let isLoadMorePending = false;

  // A job for one message of this dialog from another page (`openVKChat(peerId, {mid, kind})`): reply,
  // edit, or jump to it.
  let jumpAttempts = 0;
  createEffect(() => {
    const action = vkMessageAction();
    if(props.thread || !action || action.peerId !== props.peerId || history.status() === 'loading') return;

    if(action.kind !== 'jump') {
      setVKMessageAction(undefined);
      void rootScope.managers.appMessagesManager.getMessageByPeer(action.peerId, action.mid).then((message) => {
        if(message?._ !== 'message') return;
        if(action.kind === 'reply') startReply(message);
        else startEdit(message);
      });
      return;
    }

    setVKMessageAction(undefined);
    setPendingJump({mid: action.mid});
  });

  // Scroll to a message row and flash it (the same for a jump of `openVKChat` and for the pinned plate / list).
  const scrollToMessageMid = (el: HTMLElement) => {
    // two frames: the scroll-to-bottom of the first render runs in one, the one of a loaded page in the other
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.scrollIntoView({block: 'center', behavior: 'auto'});
      el.classList.add('vk-message-highlight');
      window.setTimeout(() => el.classList.remove('vk-message-highlight'), 1800);
    }));
  };

  // One «scroll to a message, loading older pages until it is found» routine for every jumper:
  // the jump action of `openVKChat`, the pinned plate and the pinned list. `done` runs only
  // when the message has actually been reached.
  const [pendingJump, setPendingJump] = createSignal<{mid: number, done?: () => void}>();
  createEffect(() => {
    const jump = pendingJump();
    history.messages(); // runs again when a page arrives
    if(props.thread || !jump || history.status() === 'loading') return;

    const el = scrollEl?.querySelector<HTMLElement>(`[data-mids~="${jump.mid}"]`);
    if(el) {
      setPendingJump(undefined);
      jumpAttempts = 0;
      jump.done?.();
      scrollToMessageMid(el);
      return;
    }

    if(history.isEnd() || jumpAttempts >= 30) {
      setPendingJump(undefined);
      jumpAttempts = 0;
      return;
    }
    if(history.isLoadingMore() || !scrollEl) return;
    ++jumpAttempts;
    loadMoreScrollHeight = scrollEl.scrollHeight;
    isLoadMorePending = true;
    history.loadMore();
  });
  let prevMessageCount = 0;

  const isNearBottom = () => {
    if(!scrollEl) return true;
    return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 200;
  };

  // Compute a flat list of date separators + messages with grouping info.
  const chatItems = createMemo<ChatItem[]>(() => {
    const msgs = comments().slice().reverse(); // oldest first
    const items: ChatItem[] = [];
    let prevDateKey = '';
    let prevSenderId: PeerId | null = null;
    let prevTime = 0;

    for(let i = 0; i < msgs.length; ++i) {
      const raw = msgs[i];
      // service messages don't have grouping or album logic
      if(raw._ === 'messageService') {
        const msg = raw as Message.messageService;
        const date = new Date(msg.date * 1000);
        const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        if(dateKey !== prevDateKey) {
          items.push({kind: 'separator', key: `sep-${dateKey}`, label: formatDateSeparatorLabel(date)});
          prevDateKey = dateKey;
        }
        items.push({kind: 'message', key: String(msg.mid || msg.id), message: msg as any, album: undefined, isGrouped: false});
        prevSenderId = null;
        prevTime = 0;
        continue;
      }
      const message = raw as Message.message;

      // an album is several messages with one grouped_id: one row, one grid
      let album: Message.message[] | undefined;
      const groupedId = message.grouped_id;
      if(groupedId) {
        const group = [message];
        while(i + 1 < msgs.length && (msgs[i + 1] as Message.message).grouped_id === groupedId) group.push(msgs[++i] as Message.message);
        if(group.length > 1) album = group;
      }

      const date = new Date(message.date * 1000);
      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

      if(dateKey !== prevDateKey) {
        items.push({kind: 'separator', key: `sep-${dateKey}`, label: formatDateSeparatorLabel(date)});
        prevDateKey = dateKey;
        prevSenderId = null;
        prevTime = 0;
      }

      const senderId = (message.fromId ?? message.peerId) as PeerId;
      // Group with previous when same sender and within 5 minutes.
      const isGrouped = senderId === prevSenderId && (message.date - prevTime) < 300;

      items.push({kind: 'message', key: String(message.mid), message, album, isGrouped});

      prevSenderId = senderId;
      prevTime = message.date;
    }

    return items;
  });

  // Smart scroll: restore position after load-more; scroll to bottom otherwise.
  createEffect(() => {
    const count = history.messages().length;
    const loadingMore = history.isLoadingMore();
    const status = history.status();

    // Reset tracking when the peer changes (history resets to empty).
    if(count === 0) {
      isLoadMorePending = false;
      loadMoreScrollHeight = 0;
      prevMessageCount = 0;
      return;
    }

    requestAnimationFrame(() => {
      if(!scrollEl) return;

      if(isLoadMorePending && !loadingMore) {
        // Load-more completed — restore the scroll position by compensating for
        // the newly prepended messages.
        const diff = scrollEl.scrollHeight - loadMoreScrollHeight;
        scrollEl.scrollTop = diff > 0 ? diff : 0;
        isLoadMorePending = false;
        loadMoreScrollHeight = 0;
      } else if(!isLoadMorePending) {
        if(prevMessageCount === 0 || status === 'loading') {
          const dialog = props.dialog;
          const topMessageId = dialog?.top_message ?? 0;
          const unreadCount = dialog?.unread_count ?? 0;
          if(unreadCount > 0 && scrollEl) {
            const unreadMsg = comments().find((m) => {
              const msg = m as Message.message;
              return msg.pFlags?.unread || (msg.mid && msg.mid > topMessageId);
            });
            if(unreadMsg) {
              const el = scrollEl.querySelector(`[data-mids~="${(unreadMsg as Message.message).mid}"]`) as HTMLElement | null;
              if(el) {
                el.scrollIntoView({block: 'start', behavior: 'auto'});
              } else {
                scrollEl.scrollTop = scrollEl.scrollHeight - 400;
              }
            } else {
              scrollEl.scrollTop = scrollEl.scrollHeight - 400;
            }
          } else {
            scrollEl.scrollTop = scrollEl.scrollHeight;
          }
          setShowNewMessagesBtn(false);
          setNewMessagesCount(0);
        } else if(isNearBottom()) {
          // New message arrived and user is already near the bottom.
          scrollEl.scrollTop = scrollEl.scrollHeight;
          setShowNewMessagesBtn(false);
          setNewMessagesCount(0);
        } else {
          // User is scrolled up — show a new-messages button instead of jumping.
          const diff = count - prevMessageCount;
          if(diff > 0) {
            setNewMessagesCount((prev) => prev + diff);
            setShowNewMessagesBtn(true);
          }
        }
      }

      prevMessageCount = count;
    });
  });

  // ── Marking as read ─────────────────────────────────────────────────────────
  // The dialog is read when it is open, the window is in front and the history is scrolled to
  // its end: what is unread then is on the screen. Not for comments threads (their read state is
  // the discussion group's own).
  const [isFocused, setFocused] = createSignal(document.visibilityState === 'visible' && document.hasFocus());
  {
    const update = () => setFocused(document.visibilityState === 'visible' && document.hasFocus());
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    onCleanup(() => {
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
    });
  }

  // what has already been sent for read, so the same state is not requested twice
  let lastReadKey = '';
  let readTimer: number | undefined;
  onCleanup(() => window.clearTimeout(readTimer));

  const markRead = () => {
    if(props.thread || !isFocused() || history.status() !== 'loaded' || !scrollEl) return;
    if(!isNearBottom()) return;

    const dialog = props.dialog;
    const unreadCount = dialog?.unread_count || 0;
    const markedUnread = !!dialog?.pFlags?.unread_mark;
    if(!dialog || (!unreadCount && !markedUnread)) return;

    const key = `${props.peerId}:${unreadCount}:${markedUnread}:${dialog.top_message}`;
    if(key === lastReadKey) return;
    lastReadKey = key;

    const managers = rootScope.managers;
    const request = markedUnread && !unreadCount ?
      managers.appMessagesManager.markDialogUnread({peerId: props.peerId, read: true}) :
      managers.appMessagesManager.readHistory({peerId: props.peerId});
    Promise.resolve(request).catch((err) => {
      // let the next change try again
      lastReadKey = '';
      console.error('VKgram: failed to mark the dialog as read', err);
    });
  };

  const scheduleMarkRead = () => {
    window.clearTimeout(readTimer);
    // after the history has been drawn and scrolled down
    readTimer = window.setTimeout(markRead, 120);
  };

  // a new message, a loaded history, a focused window, a changed unread number of the dialog
  createEffect(() => {
    void history.messages().length;
    void history.status();
    void isFocused();
    void props.peerId;
    void props.dialog?.unread_count;
    void props.dialog?.pFlags?.unread_mark;
    scheduleMarkRead();
  });

  // a different dialog is a different state
  createEffect(on(() => props.peerId, () => {
    lastReadKey = '';
  }, {defer: true}));

  // ── Pinned plate scroll tracking ────────────────────────────────────────────
  // Как в Telegram: плита показывает самый новый закреп не ниже нижнего видимого
  // сообщения. После перехода по плите слежение замирает на выбранном закрепе,
  // пока пользователь не вернётся к концу истории.

  // mid последнего (нижнего) видимого сообщения истории
  const bottomVisibleMid = () => {
    if(!scrollEl) return undefined;
    const limit = scrollEl.getBoundingClientRect().bottom;
    const rows = scrollEl.querySelectorAll<HTMLElement>('[data-mids]');
    for(let i = rows.length - 1; i >= 0; --i) {
      if(rows[i].getBoundingClientRect().bottom <= limit) {
        const mids = (rows[i].dataset.mids || '').split(' ').filter(Boolean);
        return mids.length ? +mids[mids.length - 1] : undefined;
      }
    }
    return undefined;
  };

  let lastPinnedSync = 0;
  const syncPinnedPlate = () => {
    if(props.thread || !pinned.count() || !scrollEl) return;
    const now = Date.now();
    if(now - lastPinnedSync < 150) return;
    lastPinnedSync = now;

    // конец истории — точка, где слежение снова получает слово (как в Web K)
    if(scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 4) setPinnedLocked(false);
    if(pinnedLocked()) return;

    const mid = bottomVisibleMid();
    if(mid !== undefined) pinned.syncToMid(mid);
  };

  const onScroll = () => {
    if(!scrollEl) return;
    scheduleMarkRead();
    if(scrollEl.scrollTop < 80 && !isLoadMorePending && history.status() === 'loaded' && !history.isEnd()) {
      loadMoreScrollHeight = scrollEl.scrollHeight;
      isLoadMorePending = true;
      history.loadMore();
    }
    syncPinnedPlate();
  };

  return (
    <div class="vk-custom-chat">
      <Show
        when={props.thread}
        fallback={
          <header class="vk-custom-chat-header is-dialog">
            <button type="button" class="vk-custom-chat-back" aria-label="Вернуться в чаты" onClick={props.onBack}>
              <VKIcon name="back" size={16} />
              <span>Чаты</span>
            </button>
            <button
              type="button"
              class="vk-custom-chat-header-info"
              onClick={openPeerPage}
            >
              <div class="vk-custom-chat-title">{peerTitle(peer())}</div>
              <Show
                when={typing()}
                fallback={
                  <Show when={peerSubtitle(peer(), membersCount())}>
                    <div class="vk-custom-chat-subtitle">{peerSubtitle(peer(), membersCount())}</div>
                  </Show>
                }
              >
                <div class="vk-custom-chat-subtitle is-typing">
                  {typing()}<span class="vk-typing-dots" aria-hidden="true"><i /><i /><i /></span>
                </div>
              </Show>
              {/* Real peer status (online / last seen) from Web K data when available */}
              <Show when={!typing() && peer()?._ === 'user' && (peer() as any)?.status?.online_status === 1}>
                <div class="vk-custom-chat-subtitle">в сети</div>
              </Show>
            </button>
            <div class="vk-custom-chat-header-actions">
              <button
                type="button"
                class="vk-custom-chat-avatar-button vk-custom-chat-menu-button"
                aria-label={`Меню диалога с ${peerTitle(peer())}`}
                ref={(el: HTMLButtonElement) => {
                  const menu = createDialogContextMenu({element: el, dialog: () => props.dialog || ({peerId: props.peerId} as Dialog)});
                  onCleanup(() => menu.destroy());
                }}
                onClick={(e) => {
                  // Web K's context menu opens on `contextmenu`: pass it the click point
                  const rect = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.dispatchEvent(new MouseEvent('contextmenu', {
                    bubbles: true, cancelable: true, clientX: rect.left, clientY: rect.bottom
                  }));
                }}
              >
                <VKIcon name="more-vertical" size={22} />
              </button>
              <button
                type="button"
                class="vk-custom-chat-avatar-button"
                aria-label={`Открыть страницу ${peerTitle(peer())}`}
                onClick={openPeerPage}
              >
                <VKPeerAvatar peerId={props.peerId} peer={peer()} size={36} />
              </button>
            </div>
          </header>
        }
      >
        {/* миничат комментариев: назад к каналу, «N комментариев», под ним — название канала */}
        <header class="vk-custom-chat-header">
          <button
            type="button"
            class="vk-custom-chat-back"
            aria-label="Назад к посту"
            onClick={props.onBack}
          >
            <VKIcon name="back" size={16} />
            <span>Назад</span>
          </button>

          <div class="vk-custom-chat-header-info">
            <div class="vk-custom-chat-title">{commentsTitle()}</div>
            <Show when={channel()}>
              <button
                type="button"
                class="vk-custom-chat-subtitle"
                onClick={() => openVKChannelPage(props.thread!.channelPeerId)}
              >
                {peerTitle(channel())}
              </button>
            </Show>
          </div>
        </header>
      </Show>

      {/* плита закреплённого сообщения, как в Telegram: меню слева, «Закреплённое
          сообщение N из M» + превью, «×» справа; клик переходит к закрепу */}
      <Show when={!props.thread && pinned.ready() && pinned.count() > 0 && !pinned.hidden()}>
        <div class="vk-custom-chat-pinned">
          <button
            type="button"
            class="vk-custom-chat-pinned-menu"
            aria-label="Действия с закреплёнными сообщениями"
            ref={(el: HTMLButtonElement) => {
              const menu = createPinnedPlateContextMenu({
                element: el,
                peerId: props.peerId,
                canPin: () => !!canPinPinned(),
                mid: () => pinnedMessage()?.mid ?? 0,
                onOpenList: () => setPinnedListOpen(true)
              });
              onCleanup(() => menu.destroy());
            }}
            onClick={(e) => {
              // Web K's context menu opens on `contextmenu`: pass it the click point
              const rect = e.currentTarget.getBoundingClientRect();
              e.currentTarget.dispatchEvent(new MouseEvent('contextmenu', {
                bubbles: true, cancelable: true, clientX: rect.left, clientY: rect.bottom
              }));
            }}
          >
            <VKIcon name="pin" size={16} />
          </button>
          <button type="button" class="vk-custom-chat-pinned-main" onClick={onPinnedClick}>
            <span class="vk-custom-chat-pinned-head">
              <span class="vk-custom-chat-pinned-label">Закреплённое сообщение</span>
              <Show when={pinned.count() > 1}>
                <span class="vk-custom-chat-pinned-counter">{pinned.index() + 1} из {pinned.count()}</span>
              </Show>
            </span>
            <span class="vk-custom-chat-pinned-preview">{pinnedPreview()}</span>
          </button>
          <button
            type="button"
            class="vk-custom-chat-pinned-unpin"
            aria-label={canPinPinned() ? 'Открепить сообщение' : 'Скрыть закреплённые сообщения'}
            onClick={onPinnedUnpinClick}
          >
            <VKIcon name="close" size={16} />
          </button>
        </div>
      </Show>

      <div class="vk-custom-chat-history" ref={scrollEl!} onScroll={onScroll}>
        <Show when={history.isLoadingMore()}>
          <div class="vk-custom-chat-loading">Загрузка…</div>
        </Show>

        <Show when={history.status() === 'loading' && !history.messages().length}>
          <div class="vk-custom-chat-loading">Загрузка сообщений…</div>
        </Show>

        <Show when={history.status() === 'error'}>
          <div class="vk-custom-chat-loading">
            Не удалось загрузить сообщения.{' '}
            <button type="button" class="vk-link-button" onClick={() => history.reload()}>Повторить</button>
          </div>
        </Show>

        <div class="vk-custom-chat-messages">
          {/* the post itself opens the thread, as in Telegram: it is the oldest message of it */}
          <Show when={props.thread && history.isEnd()}>
            <div class="vk-comments-chat-post">
              <MessageRenderer
                message={props.thread!.post}
                variant="chat-incoming"
                showAvatar
                showAuthor
                mediaBoxSize={320}
                onMediaClick={openMediaViewer}
              />
            </div>
          </Show>
          <Show when={props.thread && history.status() === 'loaded' && !comments().length}>
            <div class="vk-custom-chat-loading">Комментариев пока нет. Напишите первым.</div>
          </Show>
          <For each={chatItems()}>
            {(item) => item.kind === 'separator'
              ? <VKDateSeparator label={item.label} />
              : <VKMessageRow message={item.message} album={item.album} peerId={props.peerId} isGrouped={item.isGrouped} onReply={startReply} onEdit={startEdit} onOpenComments={props.onOpenComments} readMaxId={isTicksChat() ? outboxRead() : undefined} />
            }
          </For>
        </div>

        <Show when={showNewMessagesBtn()}>
          <button
            type="button"
            class="vk-custom-chat-new-messages-btn"
            onClick={() => {
              scrollEl.scrollTop = scrollEl.scrollHeight;
              setShowNewMessagesBtn(false);
              setNewMessagesCount(0);
            }}
          >
            ↓ {newMessagesCount()} новых сообщений
          </button>
        </Show>
      </div>

      <div class="vk-custom-chat-composer">
        <Show
          when={props.thread}
          fallback={
            <VKComposer
              peerId={props.peerId}
              reply={replyTo()}
              editing={editing()}
              onCancelReply={() => setReplyTo(undefined)}
              onCancelEdit={() => setEditing(undefined)}
              onSent={onSent}
            />
          }
        >
          <VKThreadComposer
            peerId={props.peerId}
            threadId={props.thread!.id}
            reply={replyTo()}
            editing={editing()}
            onCancelReply={() => setReplyTo(undefined)}
            onCancelEdit={() => setEditing(undefined)}
            onSent={onSent}
          />
        </Show>
      </div>

      <Show when={isPinnedListOpen()}>
        <VKPinnedMessagesModal
          peerId={props.peerId}
          list={pinned.list}
          canPin={!!canPinPinned()}
          onClose={() => setPinnedListOpen(false)}
          onJump={jumpToPinned}
        />
      </Show>
    </div>
  );
}

// ── VKMessageRow ──────────────────────────────────────────────────────────────

function VKMessageRow(props: {
  message: Message.message | Message.messageService,
  album?: Message.message[],
  peerId: PeerId,
  isGrouped: boolean,
  onReply?: (message: Message.message) => void,
  onEdit?: (message: Message.message) => void,
  // private chat: the other side has read my messages up to this mid (undefined: no ticks)
  readMaxId?: number,
  // «Комментарии» under a channel post: open its thread
  onOpenComments?: (post: Message.message[]) => void
}) {
  // Service messages rendered separately using Web K logic, adapted to VKgram design.
  if((props.message as any)._ === 'messageService') {
    return (
      <div class="vk-custom-chat-service" data-mid={(props.message as Message.messageService).mid ?? (props.message as Message.messageService).id}>
        <VKServiceMessage message={props.message as Message.messageService} />
      </div>
    );
  }

  const peers = usePeers();
  // Posts of a channel are written by the channel, not by me: on the left like anyone else's,
  // as in Telegram — even if I am the one who posted them.
  const isChannel = () => isBroadcastChannel(peers[props.peerId]);
  const outgoing = () => !!props.message.pFlags?.out && !isChannel();
  // ✓ sent, ✓✓ read; a message still on its way has neither
  const status = () => {
    if(!outgoing() || props.readMaxId === undefined) return undefined;
    const last = props.album ? props.album[props.album.length - 1] : props.message;
    if(last.pFlags?.is_outgoing) return 'pending' as const;
    // Real-time read state from server (readOutboxMaxId / message flags)
    return (last.mid ?? 0) <= props.readMaxId ? 'read' as const : 'sent' as const;
  };

  /**
   * Opens Web K's own media viewer for chat messages.
   */
  const handleMediaClick = async(message: Message.message, target?: HTMLElement) => {
    const {default: AppMediaViewer} = await import('@components/mediaViewer');
    new AppMediaViewer()
    .setSearchContext({
      peerId: message.peerId,
      inputFilter: {_: 'inputMessagesFilterPhotoVideo'},
      useSearch: true
    })
    .openMedia({message, target});
  };

  // Only regular messages reach MessageRenderer (service messages handled earlier).
  if((props.message as any)._ === 'messageService') {
    return <div />;
  }

  return (
    <MessageRenderer
      message={props.album ?? props.message as Message.message}
      variant={outgoing() ? 'chat-outgoing' : 'chat-incoming'}
      status={status()}
      showReactions
      showComments={isChannel() && !!props.onOpenComments}
      onCommentsToggle={() => props.onOpenComments?.((props.album ?? [props.message as Message.message]) as Message.message[])}
      showAvatar={!props.isGrouped}
      showAuthor={!props.isGrouped}
      grouped={props.isGrouped}
      mediaBoxSize={320}
      onMediaClick={handleMediaClick}
      contextMenu={{
        onCreate: (element) => createMessageMenu({
          element,
          getMessages: () => (props.album ?? [props.message as Message.message]) as Message.message[],
          getMain: () => props.album ? (props.album.find((m) => (m as Message.message).message) ?? props.album[0] as Message.message) : props.message as Message.message,
          onReply: props.onReply,
          onEdit: props.onEdit
        })
      }}
    />
  );
}
