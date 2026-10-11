import {For} from 'solid-js';
import type {Message} from '@layer';
import {copyTextToClipboard} from '@helpers/clipboard';
import getServerMessageId from '@appManagers/utils/messageId/getServerMessageId';
import rootScope from '@lib/rootScope';
import {toast} from '@components/toast';
import VKReactionGlyph, {isPickableReaction} from '@/vkgram/components/VKReactionGlyph';
import {canForwardPost, openForwardPopup} from '@/vkgram/pages/channel/forwardPost';
import {openVKPostMenu, VKPostMenuItem} from '@/vkgram/pages/channel/VKPostMenu';
import {isPostSelected, isSelecting, startPostSelection, togglePostSelection} from '@/vkgram/pages/channel/postSelection';
import {openVKReport} from '@/vkgram/components/VKReportModal';

// parts of a message that keep the browser's own menu (links, fields)
const NATIVE_MENU_SELECTOR = 'a[href], input, textarea, [contenteditable="true"]';

// a long press of a finger: opens the menu on a phone (iOS has no `contextmenu` event for it)
const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 8;

/**
 * The menu of one message in «Сообщения»: VKgram's own card (`VKPostMenu`, the same one the posts
 * of channels use) — quick reactions on top, then the actions — in the project's look, in the day
 * and the night theme; on a phone it is a sheet from the bottom edge.
 *
 * A right click on the message opens it at the cursor, a long press of a finger on a phone. The
 * actions are the chat's own: the same checks (`verify` — an item that cannot be done is not
 * shown) and the same Web K popups / manager calls as before.
 */
export default function createMessageMenu(options: {
  element: HTMLElement,
  // an album is several messages; the main one carries the text
  getMessages: () => Message.message[],
  getMain: () => Message.message,
  onReply: (message: Message.message) => void,
  onEdit: (message: Message.message) => void
}) {
  const managers = rootScope.managers;
  const peerId = () => options.getMain().peerId;
  const mids = () => options.getMessages().map((message) => message.mid);

  type Action = VKPostMenuItem & {verify?: () => boolean | Promise<boolean>};

  const actions: Action[] = [
    {
      icon: 'reply',
      title: 'Ответить',
      onClick: () => options.onReply(options.getMain())
    }, {
      icon: 'copy',
      title: 'Копировать текст',
      onClick: () => {
        copyTextToClipboard(options.getMain().message || '');
        toast('Текст скопирован');
      },
      verify: () => !!options.getMain().message
    }, {
      icon: 'link',
      title: 'Копировать ссылку',
      onClick: async() => {
        const main = options.getMain();
        const username = await managers.appPeersManager.getPeerUsername(main.peerId);
        const id = getServerMessageId(main.mid);
        copyTextToClipboard(username ? `https://t.me/${username}/${id}` : `https://t.me/c/${main.peerId.toChatId()}/${id}`);
        toast('Ссылка скопирована');
      },
      // only a channel / a supergroup message has a link
      verify: () => managers.appPeersManager.isChannel(peerId())
    }, {
      icon: 'edit',
      title: 'Редактировать',
      onClick: () => options.onEdit(options.getMain()),
      verify: () => managers.appMessagesManager.canEditMessage(options.getMain(), 'text')
    }, {
      icon: 'forward',
      title: 'Переслать',
      onClick: () => openForwardPopup(options.getMessages()),
      verify: () => canForwardPost(options.getMessages())
    }, {
      icon: 'pin',
      title: 'Закрепить',
      // окно Web K: в чатах — с галочкой «уведомлять участников», в личке закрепляет сразу
      onClick: () => {
        import('@components/popups/unpinMessage').then(({default: showPinMessagePopup}) => {
          showPinMessagePopup(peerId(), options.getMain().mid);
        });
      },
      verify: () => managers.appPeersManager.canPinMessage(peerId()) && !options.getMain().pFlags?.pinned
    }, {
      icon: 'unpin',
      title: 'Открепить',
      onClick: () => {
        import('@components/popups/unpinMessage').then(({default: showPinMessagePopup}) => {
          showPinMessagePopup(peerId(), options.getMain().mid, true);
        });
      },
      verify: () => managers.appPeersManager.canPinMessage(peerId()) && !!options.getMain().pFlags?.pinned
    }, {
      icon: 'select',
      // read when the menu opens
      get title() {
        return isPostSelected(options.getMessages()) ? 'Снять выделение' : 'Выделить';
      },
      // the chat's own selection mode (`postSelection`): the messages get checkboxes and a bar
      // with «Переслать» / «Удалить» / «Отмена» appears
      onClick: () => {
        if(isSelecting()) togglePostSelection(options.getMessages());
        else startPostSelection(options.getMessages(), 'chat');
      }
    }, {
      icon: 'flag',
      title: 'Пожаловаться',
      onClick: () => {
        openVKReport(peerId(), mids());
      },
      verify: () => !options.getMain().pFlags?.out
    }, {
      icon: 'trash',
      danger: true,
      separator: true,
      title: 'Удалить',
      onClick: async() => {
        const [{default: showDeleteMessagesPopup}, {ChatType}] = await Promise.all([
          import('@components/popups/deleteMessages'),
          import('@components/chat/chatType')
        ]);
        showDeleteMessagesPopup(peerId(), mids(), ChatType.Chat);
      },
      verify: () => managers.appMessagesManager.canDeleteMessage(options.getMain())
    }
  ];

  // the quick reactions of the message (the ones Web K allows on it)
  const loadReactions = async() => {
    try {
      const res = await managers.appReactionsManager.getAvailableReactionsByMessage(options.getMain());
      return res.reactions.filter(isPickableReaction).slice(0, 6);
    } catch(err) {
      return [];
    }
  };

  let closeMenu: (() => void) | undefined;
  // a menu is being prepared (the checks are async): a second open waits for it
  let isOpening = false;
  // the time a long press opened the menu: the `contextmenu` some browsers fire after it is ignored
  let pressedAt = 0;

  const open = async(anchor: {x: number, y: number, align: 'cursor' | 'right'}) => {
    if(isOpening) return;
    isOpening = true;
    try {
      closeMenu?.();
      const [checks, reactions] = await Promise.all([
        Promise.all(actions.map(async({verify}) => {
          try {
            return verify ? await verify() : true;
          } catch(err) {
            return false;
          }
        })),
        loadReactions()
      ]);

      const items = actions.filter((_, index) => checks[index]).map(({verify, ...item}) => item);
      // a separator belongs to the first item of its group: none is left hanging at the top
      if(items[0]) items[0].separator = false;

      options.element.classList.add('menu-open');
      closeMenu = openVKPostMenu({
        anchor,
        items,
        header: reactions.length ? () => (
          <div class="vk-post-menu-reactions">
            <For each={reactions}>
              {(reaction) => (
                <button
                  type="button"
                  class="vk-reaction-quick-btn"
                  onClick={() => {
                    managers.appReactionsManager.sendReaction({message: options.getMain(), reaction});
                    closeMenu?.();
                  }}
                >
                  <VKReactionGlyph reaction={reaction} size={20} />
                </button>
              )}
            </For>
          </div>
        ) : undefined,
        onClose: () => {
          closeMenu = undefined;
          options.element.classList.remove('menu-open');
        }
      });
    } finally {
      isOpening = false;
    }
  };

  const onContextMenu = (e: MouseEvent) => {
    if((e.target as HTMLElement | null)?.closest?.(NATIVE_MENU_SELECTOR)) return;
    e.preventDefault();
    if(Date.now() - pressedAt < 800) return;
    open({x: e.clientX, y: e.clientY, align: 'cursor'});
  };

  // long press (touch)
  let pressTimer: number | undefined;
  let startX = 0;
  let startY = 0;
  const cancelPress = () => {
    window.clearTimeout(pressTimer);
    pressTimer = undefined;
  };
  const onTouchStart = (e: TouchEvent) => {
    if(e.touches.length !== 1 || (e.target as HTMLElement | null)?.closest?.(NATIVE_MENU_SELECTOR)) return;
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    cancelPress();
    pressTimer = window.setTimeout(() => {
      pressTimer = undefined;
      pressedAt = Date.now();
      open({x: startX, y: startY, align: 'cursor'});
    }, LONG_PRESS_MS);
  };
  const onTouchMove = (e: TouchEvent) => {
    const touch = e.touches[0];
    if(touch && Math.hypot(touch.clientX - startX, touch.clientY - startY) > MOVE_TOLERANCE) cancelPress();
  };

  options.element.addEventListener('contextmenu', onContextMenu);
  options.element.addEventListener('touchstart', onTouchStart, {passive: true});
  options.element.addEventListener('touchmove', onTouchMove, {passive: true});
  options.element.addEventListener('touchend', cancelPress);
  options.element.addEventListener('touchcancel', cancelPress);

  return {
    destroy: () => {
      cancelPress();
      options.element.removeEventListener('contextmenu', onContextMenu);
      options.element.removeEventListener('touchstart', onTouchStart);
      options.element.removeEventListener('touchmove', onTouchMove);
      options.element.removeEventListener('touchend', cancelPress);
      options.element.removeEventListener('touchcancel', cancelPress);
      closeMenu?.();
    }
  };
}
