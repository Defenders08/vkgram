import {createMemo, createResource, For, onCleanup, onMount, Show} from 'solid-js';
import rootScope from '@lib/rootScope';
import type {Message, Chat, User} from '@layer';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import VKPeerAvatar from '@/vkgram/components/VKPeerAvatar';
import MessageText from '@/vkgram/components/MessageText';
import MessageMedia from '@/vkgram/components/MessageMedia';
import MessageMeta from '@/vkgram/components/MessageMeta';
import VKChannelPostReactions from '@/vkgram/pages/channel/VKChannelPostReactions';
import VKChannelPostComments from '@/vkgram/pages/channel/VKChannelPostComments';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import formatNumber from '@helpers/number/formatNumber';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import VKIcon from '@/vkgram/components/VKIcons';
import {isBroadcastChannel} from '@/vkgram/hooks/useSubscribedChannels';
import {isPostSelected, isSelecting, togglePostSelection} from '@/vkgram/pages/channel/postSelection';
import {openVKChannelPage} from '@/vkgram/pages/channel/openChannel';

/**
 * Универсальный рендерер сообщений/постов.
 *
 * Используется для:
 * - Сообщений в чатах (variant: 'chat-incoming' | 'chat-outgoing')
 * - Постов каналов (variant: 'channel-post')
 *
 * Объединяет общую логику отображения текста, медиа и метаданных,
 * но сохраняет специфичные для каждого варианта особенности.
 */

export type MessageVariant =
  | 'chat-incoming'
  | 'chat-outgoing'
  | 'channel-post';

export type PostMenuHandle = {
  destroy: () => void,
  openFromButton?: (button: HTMLElement) => void
};

export type MessageRendererProps = {
  // Основные данные
  message: Message.message | Message.message[],  // одно сообщение или альбом
  variant: MessageVariant,
  // delivery state of my message in a private chat: shown as ticks next to the time
  status?: 'pending' | 'sent' | 'read',

  // Визуальные опции
  showAvatar?: boolean,
  showAuthor?: boolean,
  grouped?: boolean,  // для чатов: группировка по времени
  isPinned?: boolean,  // для постов: закреплён

  // Media
  mediaBoxSize?: number,
  onMediaClick?: (message: Message.message, target?: HTMLElement) => void,

  // Метаданные (для постов)
  showViews?: boolean,
  showReactions?: boolean,
  showComments?: boolean,
  isCommentsOpen?: boolean,
  onCommentsToggle?: () => void,

  // Контекстное меню; openFromButton — открытие по ⋮ (если меню его умеет)
  contextMenu?: {
    onCreate: (element: HTMLElement) => PostMenuHandle,
  },

  // «Переслать» под постом: не передан — кнопки нет (например, пересылка запрещена в канале)
  onForward?: () => void,
  // no reactions / comments / «Переслать» line at all (a post shown as a plain quote, e.g. on «Моя страница»)
  hideFooter?: boolean,

  // Дополнительные классы
  class?: string
};

function peerTitle(peer: User.user | Chat.chat | Chat.channel | undefined) {
  if(!peer) return '';
  if(peer._ === 'user') {
    if(peer.pFlags?.deleted) return 'Удалённый аккаунт';
    return [peer.first_name, peer.last_name].filter(Boolean).join(' ') || 'Пользователь';
  }
  return peer.title || 'Чат';
}

// photos and videos / GIFs make the post's table (grid); files, music, stickers stay a list
function isGridMedia(message: Message.message) {
  if(message.media?._ === 'messageMediaPhoto') return true;
  if(message.media?._ === 'messageMediaDocument') {
    const type = (message.media as any).document?.type;
    return type === 'video' || type === 'gif' || type === 'round';
  }
  return false;
}

// the table shows at most this many cells; the rest is «+N» on the last one (the viewer pages through all)
const POST_GRID_MAX = 4;

/** Короткое имя вложения («Фотография», «Голосовое сообщение»…) — превью без текста. */
export function mediaLabel(message: Message.message) {
  switch(message.media?._) {
    case 'messageMediaPhoto': return 'Фотография';
    case 'messageMediaDocument': {
      const doc: any = (message.media as any).document;
      switch(doc?.type) {
        case 'video': return 'Видео';
        case 'gif': return 'GIF';
        case 'round': return 'Видеосообщение';
        case 'sticker': return 'Стикер';
        case 'audio': return 'Аудио';
        case 'voice': return 'Голосовое сообщение';
        default: return 'Документ';
      }
    }
    case undefined: return '';
    default: return 'Вложение';
  }
}

/**
 * The message this one replies to. Web K's `fetchMessageReplyTo` returns the
 * message (or story) from its own storage / the server; nothing is cached here.
 */
function ReplyPreview(props: {message: Message.message}) {
  const peers = usePeers();
  const [reply] = createResource(
    () => props.message.reply_to?._ === 'messageReplyHeader' ? props.message : undefined,
    async(message) => {
      try {
        const result: any = await rootScope.managers.appMessagesManager.fetchMessageReplyTo(message);
        return result?._ === 'message' ? result as Message.message : undefined;
      } catch(err) {
        return undefined;
      }
    }
  );

  const author = () => {
    const r = reply();
    if(!r) return '';
    // a post of a channel is the channel's, even when it was written by me
    if(isBroadcastChannel(peers[r.peerId])) return peerTitle(peers[r.peerId] as Chat.channel);
    if(r.pFlags?.out) return 'Вы';
    return peerTitle(peers[(r.fromId ?? r.peerId) as PeerId] as User.user | Chat.chat | Chat.channel | undefined);
  };

  const scrollToReplied = async(event: MouseEvent) => {
    const r = reply();
    if(!r) return;
    const history = (event.currentTarget as HTMLElement).closest('.vk-custom-chat-history');
    const target = history?.querySelector<HTMLElement>(`[data-mids~="${r.mid}"]`);
    if(!target) {
      // The replied-to message may not be loaded yet — try loading around it.
      try {
        const result = await rootScope.managers.appMessagesManager.getHistory({
          peerId: props.message.peerId,
          limit: 10,
          offsetId: r.mid,
          offsetPeerId: props.message.peerId
        });
        if(result.messages?.length || result.history?.length) {
          // After loading, the parent history should include it; retry the DOM query.
          setTimeout(() => {
            const updatedHistory = (event.currentTarget as HTMLElement).closest('.vk-custom-chat-history');
            const updatedTarget = updatedHistory?.querySelector<HTMLElement>(`[data-mids~="${r.mid}"]`);
            updatedTarget?.scrollIntoView({block: 'center', behavior: 'smooth'});
            updatedTarget?.classList.add('vk-message-highlight');
            setTimeout(() => updatedTarget?.classList.remove('vk-message-highlight'), 2000);
          }, 300);
          return;
        }
      } catch(err) {
        console.error('VKgram: failed to load replied message', err);
      }
    }
    target?.scrollIntoView({block: 'center', behavior: 'smooth'});
    if(target) {
      target.classList.add('vk-message-highlight');
      setTimeout(() => target?.classList.remove('vk-message-highlight'), 2000);
    }
  };

  return (
    <Show when={props.message.reply_to?._ === 'messageReplyHeader'}>
      <button type="button" class="vk-custom-message-reply" aria-label="Перейти к сообщению, на которое это ответ" onClick={scrollToReplied}>
        <Show when={reply()} fallback={<span class="vk-custom-message-reply-text is-missing">Сообщение недоступно</span>}>
          <span class="vk-custom-message-reply-author">{author()}</span>
          <span class="vk-custom-message-reply-text" classList={{'is-media': !reply()!.message}}>{reply()!.message || mediaLabel(reply()!)}</span>
        </Show>
      </button>
    </Show>
  );
}

export default function MessageRenderer(props: MessageRendererProps) {
  const peers = usePeers();

  // Поддержка альбомов (несколько сообщений с одним grouped_id)
  const messages = createMemo(() => Array.isArray(props.message) ? props.message : [props.message]);
  const mainMessage = createMemo(() => messages().find((m) => m.message) ?? messages()[0]);
  const gridMessages = createMemo(() => messages().filter(isGridMedia));
  const restMessages = createMemo(() => messages().filter((m) => !isGridMedia(m)));

  // in a broadcast channel the author is always the channel itself (never the admin who posted)
  const authorId = () => (
    isBroadcastChannel(peers[mainMessage().peerId]) ? mainMessage().peerId : (mainMessage().fromId ?? mainMessage().peerId)
  ) as PeerId;
  const author = () => peers[authorId()] as User.user | Chat.chat | Chat.channel | undefined;
  const chat = () => peers[mainMessage().peerId] as Chat.chat | Chat.channel | undefined;

  const time = () => formatDateAccordingToTodayNew(new Date(mainMessage().date * 1000));
  // the message that carries the comments (an album: not always the one with the caption)
  const commentsMessage = () => messages().find((m) => m.replies?.pFlags?.comments) ?? mainMessage();
  const commentsCount = () => commentsMessage().replies?.pFlags?.comments ? commentsMessage().replies.replies : undefined;

  const forwardedFrom = () => {
    const fwd = mainMessage().fwd_from;
    if(!fwd) return undefined;
    if(fwd.from_name) return fwd.from_name;
    if(fwd.from_id) {
      try {
        const title = peerTitle(peers[getPeerId(fwd.from_id)] as User.user | Chat.chat | Chat.channel | undefined);
        if(title) return title;
      } catch{}
    }
    return fwd.post_author || '';
  };

  // the peer the post was forwarded from, when it is a channel: its name opens its page
  const forwardedChannelPeerId = () => {
    const fwd = mainMessage().fwd_from;
    if(!fwd?.from_id) return undefined;
    try {
      const peerId = getPeerId(fwd.from_id) as PeerId;
      return isBroadcastChannel(peers[peerId]) ? peerId : undefined;
    } catch{
      return undefined;
    }
  };

  // a sticker or a round video alone sits without a bubble around it
  const isBare = () => !mainMessage().message && messages().every((m) => {
    const doc = m.media?._ === 'messageMediaDocument' ? (m.media as any).document : undefined;
    return doc?.type === 'sticker' || doc?.type === 'round';
  });

  let containerEl!: HTMLElement;
  let menu: PostMenuHandle | undefined;

  // selection mode of a chat: a click anywhere on the message chooses it (links, pictures and
  // the quote do not open meanwhile)
  const onSelectClick = (e: MouseEvent) => {
    if(!isSelecting()) return;
    e.preventDefault();
    e.stopPropagation();
    togglePostSelection(messages());
  };

  onMount(() => {
    if(props.contextMenu) {
      menu = props.contextMenu.onCreate(containerEl);
    }
    if(props.variant === 'chat-incoming' || props.variant === 'chat-outgoing') {
      containerEl.addEventListener('click', onSelectClick, true);
    }
  });

  onCleanup(() => containerEl?.removeEventListener('click', onSelectClick, true));

  onCleanup(() => menu?.destroy());

  // ── ВАРИАНТ: ЧАТ ──────────────────────────────────────────────────────────
  if(props.variant === 'chat-incoming' || props.variant === 'chat-outgoing') {
    const outgoing = props.variant === 'chat-outgoing';

    return (
      <article
        ref={containerEl}
        class="vk-custom-message"
        classList={{
          'is-outgoing': outgoing,
          'is-grouped': !!props.grouped,
          'is-bare': isBare(),
          'is-selecting': isSelecting(),
          'is-selected': isSelecting() && isPostSelected(messages()),
          [props.class || 'vk-custom-message-row']: true
        }}
        data-mid={messages()[0].mid}
        data-mids={messages().map((m) => m.mid).join(' ')}
      >
        <Show when={isSelecting()}>
          <button
            type="button"
            role="checkbox"
            aria-checked={isPostSelected(messages())}
            aria-label="Выделить сообщение"
            class="vk-post-checkbox vk-custom-message-check"
            classList={{'is-checked': isPostSelected(messages())}}
            tabIndex={-1}
          >
            <VKIcon name="select" size={16} />
          </button>
        </Show>

        {/* One look for everybody, mine included: the avatar on the left (the first message of a
            group), the name, the text and the time under it — no bubbles, no sides */}
        <Show when={props.showAvatar && !props.grouped}>
          <VKPeerAvatar peerId={authorId()} peer={author()} size={32} />
        </Show>
        <Show when={props.grouped}>
          <span class="vk-custom-message-avatar-spacer" aria-hidden="true" />
        </Show>

        <div class="vk-custom-message-body">
          {/* Имя автора: у поста канала оно открывает страницу канала */}
          <Show when={props.showAuthor && !props.grouped}>
            <Show
              when={isBroadcastChannel(author())}
              fallback={<div class="vk-custom-message-author">{peerTitle(author())}</div>}
            >
              <button type="button" class="vk-custom-message-author" onClick={() => openVKChannelPage(authorId())}>
                {peerTitle(author())}
              </button>
            </Show>
          </Show>

          <Show when={forwardedFrom() !== undefined}>
            <div class="vk-custom-message-forward">
              <VKIcon name="forward" size={13} />
              <span class="vk-custom-message-forward-label">Репост</span>
              <Show when={forwardedFrom()}>
                <Show
                  when={forwardedChannelPeerId()}
                  fallback={<span class="vk-custom-message-forward-from">{forwardedFrom()}</span>}
                >
                  <button type="button" class="vk-custom-message-forward-from" onClick={() => openVKChannelPage(forwardedChannelPeerId()!)}>
                    {forwardedFrom()}
                  </button>
                </Show>
              </Show>
            </div>
          </Show>

          <ReplyPreview message={mainMessage()} />

          <div class="vk-custom-message-line">
            <MessageText message={mainMessage()} class="vk-custom-message-text" />
            <MessageMeta message={mainMessage()} variant="chat" status={props.status} />
          </div>

          {/* Media для чатов: альбом — сеткой, одиночное вложение — в рамке по aspect-ratio */}
          <div
            classList={{'vk-message-album': messages().length > 1}}
            data-count={messages().length > 1 ? Math.min(messages().length, 4) : undefined}
          >
            <For each={messages()}>
              {(message) => (
                <MessageMedia
                  message={message}
                  boxSize={props.mediaBoxSize ?? 320}
                  onMediaClick={props.onMediaClick}
                />
              )}
            </For>
          </div>

          <Show when={props.showReactions}>
            <VKChannelPostReactions message={mainMessage()} />
          </Show>

          {/* Комментарии к посту канала: кнопка под постом открывает «миничат» ветки (onCommentsToggle — клик) */}
          <Show when={props.showComments && commentsCount() !== undefined}>
            <button
              type="button"
              class="vk-post-action vk-custom-message-comments"
              title="Открыть комментарии"
              onClick={props.onCommentsToggle}
            >
              <VKIcon name="discussion" size={15} />
              <span>{commentsCount() ? `Комментарии: ${formatNumber(commentsCount()!, 1)}` : 'Комментировать'}</span>
              <VKIcon name="chevron" size={14} class="vk-custom-message-comments-arrow" />
            </button>
          </Show>
        </div>

      </article>
    );
  }

  // ── ВАРИАНТ: ПОСТ КАНАЛА ──────────────────────────────────────────────────
  return (
    <article
      ref={containerEl}
      class={`vk-channel-post ${props.class || ''}`}
      classList={{'is-selected': isPostSelected(messages())}}
      data-mid={mainMessage().mid}
    >
      <header class="vk-channel-post-header">
        <AvatarNewTsx peerId={mainMessage().peerId} size={40} />
        <div class="vk-channel-post-author">
          {/* the channel's own name opens its page (on its own page it is already open) */}
          <button type="button" class="vk-channel-post-name" onClick={() => openVKChannelPage(mainMessage().peerId)}>
            {chat()?.title}
          </button>
          <span class="vk-channel-post-date vk-page-text-secondary">
            {time()}
            <Show when={props.showViews && mainMessage().views}>
              <span class="vk-channel-post-views" title="Просмотры" aria-label={`Просмотры: ${mainMessage().views}`}>
                <VKIcon name="eye" size={13} />
                {formatNumber(mainMessage().views!, 1)}
              </span>
            </Show>
            <Show when={mainMessage().post_author}>{' · '}{mainMessage().post_author}</Show>
            <Show when={mainMessage().edit_date && !mainMessage().pFlags.edit_hide}>{' · изменено'}</Show>
            <Show when={props.isPinned}>{' · закреплено'}</Show>
          </span>
        </div>
        <Show when={isSelecting()}>
          <button
            type="button"
            role="checkbox"
            aria-checked={isPostSelected(messages())}
            aria-label="Выделить публикацию"
            class="vk-post-checkbox"
            classList={{'is-checked': isPostSelected(messages())}}
            onClick={() => togglePostSelection(messages())}
          >
            <VKIcon name="select" size={16} />
          </button>
        </Show>
        <Show when={props.contextMenu}>
          <button
            type="button"
            class="vk-icon-button vk-channel-post-menu"
            title="Меню"
            aria-label="Меню публикации"
            aria-haspopup="menu"
            onClick={(e) => menu?.openFromButton?.(e.currentTarget)}
          >
            <VKIcon name="more-vertical" size={20} />
          </button>
        </Show>
      </header>

      <Show when={forwardedFrom() !== undefined}>
        <div class="vk-channel-post-forward vk-page-text-secondary">
          Репост{forwardedFrom() ? `: ${forwardedFrom()}` : ''}
        </div>
      </Show>

      <MessageText message={mainMessage()} class="vk-channel-post-content vk-page-text" />

      <Show
        when={gridMessages().length > 1}
        fallback={
          <For each={messages()}>
            {(message) => (
              <MessageMedia
                message={message}
                boxSize={props.mediaBoxSize ?? 560}
                onMediaClick={props.onMediaClick}
              />
            )}
          </For>
        }
      >
        {/* photos / videos of a post: one table; files and music below it as a list */}
        <div
          class="vk-message-album vk-post-album"
          data-count={Math.min(gridMessages().length, POST_GRID_MAX)}
          style={gridMessages().length > POST_GRID_MAX ? {'--vk-more': `"+${gridMessages().length - POST_GRID_MAX}"`} : undefined}
          classList={{'has-more': gridMessages().length > POST_GRID_MAX}}
        >
          <For each={gridMessages().slice(0, POST_GRID_MAX)}>
            {(message) => (
              <MessageMedia
                message={message}
                boxSize={props.mediaBoxSize ?? 560}
                onMediaClick={props.onMediaClick}
              />
            )}
          </For>
        </div>
        <For each={restMessages()}>
          {(message) => (
            <MessageMedia
              message={message}
              boxSize={props.mediaBoxSize ?? 560}
              onMediaClick={props.onMediaClick}
            />
          )}
        </For>
      </Show>

      {/* comments closed for the post: the reactions and «Переслать» share one line;
          with comments, «Комментировать» + «Переслать» are a line of their own under the reactions */}
      <Show when={!props.hideFooter}>
        <div
          class="vk-channel-post-footer"
          classList={{'is-inline': !(props.showComments && commentsCount() !== undefined)}}
        >
          <Show when={props.showReactions}>
            <VKChannelPostReactions message={mainMessage()} />
          </Show>

          <MessageMeta
            message={mainMessage()}
            variant="channel-post"
            showCommentsCount={props.showComments ? commentsCount() : undefined}
            onCommentsClick={props.onCommentsToggle}
            onForwardClick={props.onForward}
          />
        </div>
      </Show>

      <Show when={props.showComments && commentsCount() !== undefined && props.isCommentsOpen}>
        <VKChannelPostComments message={commentsMessage()} />
      </Show>
    </article>
  );
}
