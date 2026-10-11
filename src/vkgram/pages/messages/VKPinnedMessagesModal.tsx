import {For, Show} from 'solid-js';
import type {Accessor} from 'solid-js';
import type {Message, User, Chat} from '@layer';
import VKModal from '@/vkgram/components/VKModal';
import VKIcon from '@/vkgram/components/VKIcons';
import {usePeers} from '@stores/peers';
import peerTitle from '@/vkgram/utils/peerTitle';
import {mediaLabel} from '@/vkgram/components/MessageRenderer';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import {isBroadcastChannel} from '@/vkgram/hooks/useSubscribedChannels';

/** Автор закрепа в списке: «Вы» для своих (кроме постов канала), иначе имя отправителя. */
function messageAuthor(message: Message.message, peers: ReturnType<typeof usePeers>, peerId: PeerId) {
  const outgoing = !!message.pFlags?.out && !isBroadcastChannel(peers[peerId]);
  if(outgoing) return 'Вы';
  const senderId = (message.fromId ?? message.peerId) as PeerId;
  if(senderId === peerId) return undefined;
  return peerTitle(peers[senderId] as User.user | Chat.chat | Chat.channel | undefined);
}

function messagePreview(message: Message.message) {
  return message.message || mediaLabel(message);
}

/**
 * «Все закреплённые» — список закреплённых сообщений диалога, как в Telegram.
 * Клик по строке переходит к сообщению, «×» открепляет его (подтверждение —
 * окно Web K, то же, что у плиты), «Открепить все» очищает список целиком.
 * Список живой: пока окно открыто, закрепы могут открепить в другом окне.
 */
export default function VKPinnedMessagesModal(props: {
  peerId: PeerId,
  // живой список закрепов из `createVKPinnedMessages` (новые сверху)
  list: Accessor<Message.message[]>,
  canPin: boolean,
  onClose: () => void,
  onJump: (mid: number) => void
}) {
  const peers = usePeers();

  const showUnpinPopup = (mid: number) => {
    import('@components/popups/unpinMessage').then(({default: showPinMessagePopup}) => {
      showPinMessagePopup(props.peerId, mid, true);
    });
  };

  return (
    <VKModal title="Закреплённые сообщения" onClose={props.onClose} width={480}>
      <div class="vk-pinned-list" role="list">
        <Show
          when={props.list().length}
          fallback={<div class="vk-pinned-empty">Нет закреплённых сообщений.</div>}
        >
          <For each={props.list()}>
            {(message) => {
              const author = messageAuthor(message, peers, props.peerId);
              return (
                <div class="vk-pinned-row" role="listitem">
                  <button
                    type="button"
                    class="vk-pinned-row-main"
                    onClick={() => props.onJump(message.mid)}
                  >
                    <span class="vk-pinned-row-head">
                      <Show when={author}>
                        <span class="vk-pinned-row-author">{author}</span>
                      </Show>
                      <time class="vk-pinned-row-date">
                        {formatDateAccordingToTodayNew(new Date(message.date * 1000))}
                      </time>
                    </span>
                    <span class="vk-pinned-row-text">{messagePreview(message)}</span>
                  </button>
                  <Show when={props.canPin}>
                    <button
                      type="button"
                      class="vk-pinned-row-unpin"
                      aria-label="Открепить сообщение"
                      onClick={() => showUnpinPopup(message.mid)}
                    >
                      <VKIcon name="close" size={14} />
                    </button>
                  </Show>
                </div>
              );
            }}
          </For>
        </Show>
      </div>
      <Show when={props.canPin && props.list().length > 1}>
        <div class="vk-modal-foot">
          <button
            type="button"
            class="vk-button vk-button-secondary"
            onClick={() => showUnpinPopup(0)}
          >
            Открепить все
          </button>
        </div>
      </Show>
    </VKModal>
  );
}
