import {createEffect, createMemo, createResource, createSignal, For, onCleanup, Show} from 'solid-js';
import type {Accessor} from 'solid-js';
import type {Chat, ChatFull, ForumTopic, Message, User} from '@layer';
import rootScope from '@lib/rootScope';
import apiManagerProxy from '@lib/apiManagerProxy';
import {usePeers} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import {GENERAL_TOPIC_ID, TOPIC_COLORS} from '@appManagers/constants';
import type {Dialog} from '@appManagers/appMessagesManager';
import type {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import createContextMenu from '@helpers/dom/createContextMenu';
import VKSearchField from '@/vkgram/components/VKSearchField';
import VKIcon from '@/vkgram/components/VKIcons';
import VKModal from '@/vkgram/components/VKModal';
import VKPeerAvatar from '@/vkgram/components/VKPeerAvatar';
import {mediaLabel} from '@/vkgram/components/MessageRenderer';
import peerTitle from '@/vkgram/utils/peerTitle';
import type {VKForumTopics} from '@/vkgram/hooks/createForumTopics';
import createDialogContextMenu from '@/vkgram/pages/messages/createDialogContextMenu';
import {openVKPeerPage} from '@/vkgram/pages/profile/openProfile';

const pluralRu = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if(mod10 === 1 && mod100 !== 11) return one;
  if(mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

/**
 * Список тем группы-форума — то, что у Telegram открывается вместо чата.
 * Шапка — как у чата (назад «Чаты», аватар и имя группы), под ней поиск,
 * дальше строки тем: цветная иконка темы, название, последнее сообщение
 * («Автор: текст»), время и счётчик непрочитанного. Клик по строке открывает
 * тему как обычный чат, длинное нажатие / правая кнопка — меню темы.
 */
export default function VKTopicsList(props: {
  peerId: PeerId,
  topics: VKForumTopics,
  // the dialog of the forum itself: the header menu works on it
  dialog?: Dialog,
  // the open topic is highlighted in the list
  activeTopicId?: number,
  onOpenTopic: (topicId: number) => void,
  // mobile: back to the dialog list
  onClose?: () => void
}) {
  const peers = usePeers();
  const peer = () => peers[props.peerId] as Chat.channel | undefined;
  const openPeerPage = () => openVKPeerPage(props.peerId, peer());

  // the exact number of members, as the chat header shows it
  const fullPeer = useFullPeer(props.peerId) as () => (ChatFull.channelFull | undefined);
  const membersCount = () => fullPeer()?.participants_count;
  const subtitle = () => {
    const count = membersCount();
    return count ? `${count.toLocaleString('ru-RU')} ${pluralRu(count, 'участник', 'участника', 'участников')}` : 'Группа';
  };

  const [query, setQuery] = createSignal('');

  const filteredTopics = createMemo(() => {
    const text = query().trim().toLowerCase();
    const list = props.topics.sortedTopics();
    if(!text) return list;
    return list.filter((topic) => topic.title.toLowerCase().includes(text));
  });

  // the same ids in the same order are the same list: `For` then leaves the rows alone
  const topicIds = createMemo<number[]>((previous) => {
    const next = filteredTopics().map((topic) => topic.id);
    return previous && previous.length === next.length && previous.every((id, i) => id === next[i]) ? previous : next;
  }, []);

  // «Создать тему» is for those who can write at all; the server says the rest anyway
  const [canCreate] = createResource(async(): Promise<boolean> => {
    try {
      return await rootScope.managers.appMessagesManager.canSendToPeer(props.peerId);
    } catch(err) {
      return false;
    }
  });

  const [isCreateOpen, setCreateOpen] = createSignal(false);

  const attachHeaderMenu = (el: HTMLButtonElement) => {
    const menu = createDialogContextMenu({
      element: el,
      dialog: () => (props.dialog || {peerId: props.peerId}) as Dialog
    });
    onCleanup(() => menu.destroy());
  };

  return (
    <div class="vk-custom-chat vk-topics-screen">
      <header class="vk-custom-chat-header is-dialog">
        <Show when={props.onClose}>
          <button type="button" class="vk-custom-chat-back" aria-label="Вернуться в чаты" onClick={() => props.onClose?.()}>
            <VKIcon name="back" size={16} />
            <span>Чаты</span>
          </button>
        </Show>
        <button type="button" class="vk-custom-chat-header-info" onClick={openPeerPage}>
          <div class="vk-custom-chat-title">{peerTitle(peer())}</div>
          <div class="vk-custom-chat-subtitle">{subtitle()}</div>
        </button>
        <div class="vk-custom-chat-header-actions">
          <Show when={canCreate()}>
            <button
              type="button"
              class="vk-custom-chat-avatar-button"
              aria-label="Создать тему"
              onClick={() => setCreateOpen(true)}
            >
              <VKIcon name="edit" size={20} />
            </button>
          </Show>
          <button
            type="button"
            class="vk-custom-chat-avatar-button vk-custom-chat-menu-button"
            aria-label={`Меню группы ${peerTitle(peer())}`}
            ref={attachHeaderMenu}
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

      <div class="vk-topics-search">
        <VKSearchField
          value={query()}
          placeholder="Поиск по темам"
          onInput={setQuery}
        />
      </div>

      <div class="vk-topics-list" role="list">
        <Show
          when={props.topics.ready()}
          fallback={<div class="vk-topics-empty">Загрузка тем…</div>}
        >
          <Show
            when={topicIds().length}
            fallback={
              <div class="vk-topics-empty">
                {query() ? 'Среди тем ничего не найдено.' : 'Тем пока нет.'}
              </div>
            }
          >
            <For each={topicIds()}>
              {(topicId) => (
                <TopicRow
                  peerId={props.peerId}
                  topic={() => props.topics.topicsById().get(topicId)}
                  typing={() => props.topics.typings(topicId)}
                  muted={() => props.topics.isTopicMuted(topicId)}
                  canManage={() => props.topics.canManageTopic(topicId)}
                  active={props.activeTopicId === topicId}
                  onSelect={() => props.onOpenTopic(topicId)}
                />
              )}
            </For>
          </Show>
        </Show>
      </div>

      <Show when={isCreateOpen()}>
        <VKCreateTopicModal
          peerId={props.peerId}
          onClose={() => setCreateOpen(false)}
          onCreated={(topicId) => {
            setCreateOpen(false);
            props.onOpenTopic(topicId);
          }}
        />
      </Show>
    </div>
  );
}

// ── TopicRow ──────────────────────────────────────────────────────────────────

function TopicRow(props: {
  peerId: PeerId,
  // a getter: the row lives on while the topic object is replaced by newer ones
  topic: Accessor<ForumTopic.forumTopic | undefined>,
  typing: Accessor<string | undefined>,
  muted: Accessor<boolean | undefined>,
  canManage: Accessor<boolean | undefined>,
  active: boolean,
  onSelect: () => void
}) {
  const peers = usePeers();
  const topic = () => props.topic();

  const unread = () => topic()?.unread_count || 0;

  // последнее сообщение темы — то же, что показывает список диалогов Web K:
  // оно лежит в хранилище рядом с темой
  const lastMessage = createMemo(() => {
    const t = topic();
    if(!t?.top_message) return undefined;
    return apiManagerProxy.getMessageByPeer(props.peerId, t.top_message) as Message.message | Message.messageService | undefined;
  });

  const previewText = createMemo(() => {
    const message = lastMessage();
    if(!message || message._ === 'messageService') return '';
    return (message.message || mediaLabel(message as Message.message)).replace(/\s+/g, ' ').trim();
  });

  const draftText = () => (topic()?.draft as any)?.message as string | undefined;

  const preview = () => {
    if(props.typing()) return props.typing();
    if(draftText()) return `Черновик: ${draftText()}`;
    if(!previewText()) return '';
    const message = lastMessage() as Message.message;
    const author = message.pFlags?.out
      ? 'Вы'
      : peerTitle(peers[(message.fromId ?? message.peerId) as PeerId] as User.user | Chat.chat | Chat.channel | undefined);
    return author ? `${author}: ${previewText()}` : previewText();
  };

  const previewTime = createMemo(() => {
    const message = lastMessage();
    return message?.date ? formatDateAccordingToTodayNew(new Date(message.date * 1000)) : '';
  });

  let row!: HTMLButtonElement;
  let menu: ReturnType<typeof createContextMenu> | undefined;
  // меню пересоздаётся на замену объекта темы: его кнопки читают её поля
  createEffect(() => {
    menu?.destroy();
    if(!topic()) return;
    menu = createTopicContextMenu({
      element: row,
      peerId: props.peerId,
      topic: props.topic,
      muted: props.muted,
      canManage: props.canManage
    });
  });
  onCleanup(() => menu?.destroy());

  return (
    <button
      ref={row}
      type="button"
      class="vk-topics-row"
      classList={{'is-active': props.active}}
      role="listitem"
      aria-label={`Тема: ${topic()?.title ?? ''}`}
      onClick={props.onSelect}
    >
      <span
        class="vk-topics-row-icon"
        ref={(el: HTMLElement) => {
          createEffect(() => {
            const t = topic();
            if(!t) return;
            // обёртка иконки тяжёлая (граф сервисных сообщений Web K): едет лениво
            void import('@components/wrappers/messageActionTextNewUnsafe')
            .then(({wrapTopicIcon}) => wrapTopicIcon({topic: t}))
            .then((icon) => {
              el.replaceChildren(icon as Node);
            });
          });
        }}
      />

      <span class="vk-topics-row-main">
        <strong class="vk-topics-row-title">
          <span class="vk-topics-row-name">{topic()?.title}</span>
          <Show when={topic()?.pFlags?.closed}>
            <span class="vk-topics-row-flag" aria-label="Тема закрыта"><VKIcon name="lock" size={12} /></span>
          </Show>
          <Show when={props.muted() === true}>
            <span class="vk-topics-row-flag" aria-label="Без звука"><VKIcon name="mute" size={12} /></span>
          </Show>
        </strong>
        <span
          class="vk-topics-row-preview"
          classList={{'is-typing': !!props.typing()}}
        >
          <Show when={preview()} fallback="Нет сообщений">{preview()}</Show>
        </span>
      </span>

      <span class="vk-topics-row-meta">
        <time class="vk-topics-row-time">{previewTime()}</time>
        <span class="vk-topics-row-badges">
          <Show when={unread() > 0}>
            <span
              class="vk-topics-row-unread"
              classList={{
                'is-muted': props.muted() === true,
                'is-pending': props.muted() === undefined
              }}
            >{unread()}</span>
          </Show>
          <Show when={topic()?.pFlags?.pinned}>
            <span class="vk-topics-row-pin" aria-label="Закреплено"><VKIcon name="pin" size={14} /></span>
          </Show>
        </span>
      </span>
    </button>
  );
}

// ── Topic context menu ────────────────────────────────────────────────────────

/**
 * Меню строки темы: то, что Web K показывает в списке тем — прочитанность,
 * закреп, звук, закрыть/открыть и удалить (кому доступно управление темой).
 * Общая тема не удаляется — она и есть сам форум.
 */
function createTopicContextMenu(options: {
  element: HTMLElement,
  peerId: PeerId,
  topic: Accessor<ForumTopic.forumTopic | undefined>,
  muted: Accessor<boolean | undefined>,
  canManage: Accessor<boolean | undefined>
}) {
  const managers = rootScope.managers;

  const confirmDelete = async() => {
    const topicId = options.topic()?.id;
    if(topicId === undefined) return;
    const {default: confirmationPopup} = await import('@components/confirmationPopup');
    const button = {text: document.createTextNode('Удалить'), isDanger: true};
    try {
      await confirmationPopup({
        title: 'Удалить тему',
        descriptionRaw: 'Тема будет удалена вместе со всеми сообщениями.',
        button,
        buttons: [button, {text: document.createTextNode('Отмена'), isCancel: true}]
      });
    } catch{
      return;
    }
    managers.appMessagesManager.deleteTopics({peerId: options.peerId, topicIds: [topicId]});
  };

  const buttons: ButtonMenuItemOptionsVerifiable[] = [{
    icon: 'readchats',
    regularText: 'Пометить прочитанным',
    onClick: () => managers.appMessagesManager.readTopics({peerId: options.peerId, topicIds: [options.topic()!.id]}),
    verify: () => !!options.topic()?.unread_count
  }, {
    icon: 'pin',
    regularText: 'Закрепить',
    onClick: () => managers.appMessagesManager.toggleDialogPin({
      peerId: options.peerId,
      filterId: options.peerId,
      topicOrSavedId: options.topic()!.id
    }),
    verify: () => !options.topic()?.pFlags?.pinned
  }, {
    icon: 'unpin',
    regularText: 'Открепить',
    onClick: () => managers.appMessagesManager.toggleDialogPin({
      peerId: options.peerId,
      filterId: options.peerId,
      topicOrSavedId: options.topic()!.id
    }),
    verify: () => !!options.topic()?.pFlags?.pinned
  }, {
    icon: 'mute',
    regularText: 'Выключить звук',
    onClick: () => managers.appMessagesManager.togglePeerMute({peerId: options.peerId, mute: true, threadId: options.topic()!.id}),
    verify: () => options.muted() !== true
  }, {
    icon: 'unmute',
    regularText: 'Включить звук',
    onClick: () => managers.appMessagesManager.togglePeerMute({peerId: options.peerId, mute: false, threadId: options.topic()!.id}),
    verify: () => options.muted() === true
  }, {
    icon: 'lock',
    regularText: 'Закрыть тему',
    onClick: () => managers.appMessagesManager.editForumTopic({
      peerId: options.peerId,
      topicId: options.topic()!.id,
      closed: true
    }),
    verify: () => options.canManage() === true && !options.topic()?.pFlags?.closed
  }, {
    icon: 'lockoff',
    regularText: 'Открыть тему',
    onClick: () => managers.appMessagesManager.editForumTopic({
      peerId: options.peerId,
      topicId: options.topic()!.id,
      closed: false
    }),
    verify: () => options.canManage() === true && !!options.topic()?.pFlags?.closed
  }, {
    icon: 'delete',
    regularText: 'Удалить тему',
    onClick: () => void confirmDelete(),
    verify: () => options.canManage() === true && options.topic()!.id !== GENERAL_TOPIC_ID
  }];

  return createContextMenu({
    buttons,
    listenTo: options.element,
    findElement: () => options.element
  });
}

// ── VKCreateTopicModal ────────────────────────────────────────────────────────

/**
 * «Создать тему»: название и цвет иконки (клик по цвету меняет его, как в
 * Telegram). После создания тема сразу открывается (`onCreated`).
 */
export function VKCreateTopicModal(props: {
  peerId: PeerId,
  onClose: () => void,
  onCreated: (topicId: number) => void
}) {
  const [title, setTitle] = createSignal('');
  const [colorIndex, setColorIndex] = createSignal(0);
  const [creating, setCreating] = createSignal(false);
  const [error, setError] = createSignal<string>();

  const create = async() => {
    const name = title().trim();
    if(!name || creating()) return;
    setCreating(true);
    setError(undefined);
    try {
      const topicId = await rootScope.managers.appMessagesManager.createForumTopic({
        peerId: props.peerId,
        title: name,
        iconColor: TOPIC_COLORS[colorIndex()],
        // своя иконка-эмодзи в VKgram не выбирается: undefined оставляет флаг пустым
        iconEmojiId: undefined as unknown as DocId
      });
      props.onCreated(topicId);
    } catch(err) {
      console.error('VKgram: failed to create the topic', err);
      setError('Не удалось создать тему. Попробуйте ещё раз.');
      setCreating(false);
    }
  };

  return (
    <VKModal
      title="Новая тема"
      onClose={props.onClose}
      closeDisabled={creating()}
      width={440}
    >
      <div class="vk-modal-body vk-create-topic">
        <div class="vk-field-row">
          <label for="vk-create-topic-name">Название</label>
          <input
            id="vk-create-topic-name"
            class="vk-input"
            type="text"
            value={title()}
            maxLength={70}
            placeholder="Название темы"
            autocomplete="off"
            onInput={(e) => setTitle(e.currentTarget.value)}
            onKeyDown={(e) => {
              if(e.key === 'Enter') void create();
            }}
            ref={(el: HTMLInputElement) => queueMicrotask(() => el.focus())}
          />
        </div>
        <div class="vk-field-row">
          <span>Цвет темы</span>
          <div class="vk-topic-colors" role="radiogroup" aria-label="Цвет темы">
            <For each={TOPIC_COLORS}>
              {(color, index) => (
                <button
                  type="button"
                  class="vk-topic-color"
                  classList={{'is-active': colorIndex() === index()}}
                  style={{background: `#${color.toString(16)}`}}
                  role="radio"
                  aria-checked={colorIndex() === index()}
                  aria-label={`Цвет ${index() + 1}`}
                  onClick={() => setColorIndex(index())}
                />
              )}
            </For>
          </div>
        </div>
        <Show when={error()}>
          <div class="vk-modal-error">{error()}</div>
        </Show>
      </div>
      <div class="vk-modal-foot">
        <button type="button" class="vk-button vk-button-secondary" disabled={creating()} onClick={props.onClose}>
          Отмена
        </button>
        <button type="button" class="vk-button" disabled={creating() || !title().trim()} onClick={() => void create()}>
          {creating() ? 'Создаём…' : 'Создать тему'}
        </button>
      </div>
    </VKModal>
  );
}
