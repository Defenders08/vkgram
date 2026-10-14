import {createRoot, createSignal} from 'solid-js';
import appNavigationController from '@components/appNavigationController';

/**
 * URL state for the open dialog in «Сообщения»: ?vkgram=messages&peer=<peerId>
 *
 * Desktop: switching dialogs writes the URL in-place — no history entry is
 * pushed (selecting a row is not a navigation event).
 * Mobile: VKPageMessages.tsx pushes its own nav item so browser Back returns
 * to the dialog list; this module only tracks the peer value and writes URLs.
 *
 * NB: must not import sections.ts (which imports this file).
 */
const URL_PARAM = 'peer';
const URL_TOPIC_PARAM = 'topic';

function getPeerIdFromUrl(): PeerId | undefined {
  const params = new URLSearchParams(location.search);
  if(params.get('vkgram') !== 'messages') return;
  const n = Number(params.get(URL_PARAM));
  return Number.isFinite(n) && n !== 0 ? n as PeerId : undefined;
}

function getTopicIdFromUrl(): number | undefined {
  const params = new URLSearchParams(location.search);
  if(params.get('vkgram') !== 'messages') return;
  const n = Number(params.get(URL_TOPIC_PARAM));
  return Number.isFinite(n) && n !== 0 ? n : undefined;
}

const [messagePeerId, setMessagePeerId] = createRoot(() =>
  createSignal<PeerId | undefined>(getPeerIdFromUrl())
);

export {messagePeerId as vkMessagePeerId};

// the open topic of a forum (?vkgram=messages&peer=…&topic=…); undefined — the topics
// list itself. Lives together with the peer: the same URL, the same write rules.
const [messageThreadId, setMessageThreadId] = createRoot(() =>
  createSignal<number | undefined>(getTopicIdFromUrl())
);

export {messageThreadId as vkMessageTopicId};

/**
 * What the chat should do with one of its messages as soon as it is on screen — set by a flow that
 * starts elsewhere (a post's «Ответить» / «Редактировать», «Показать в чате» of a file or a comment).
 * It is VKgram's own replacement for sending the user to the Web K chat, where these used to end.
 * A new object each time, so asking for the same message twice is two requests.
 */
export type VKMessageAction = {peerId: PeerId, mid: number, kind: 'jump' | 'reply' | 'edit'};

const [messageAction, setMessageAction] = createRoot(() => createSignal<VKMessageAction | undefined>());

export {messageAction as vkMessageAction, setMessageAction as setVKMessageAction};

/** Value for sections.ts to include when it writes the messages section URL */
export function getVKMessagePeerUrlValue(): string | undefined {
  const peerId = messagePeerId();
  return peerId ? String(peerId) : undefined;
}

/** Update the stored peer and reflect it in the URL without a history push */
export function setVKMessagePeer(peerId: PeerId | undefined) {
  setMessagePeerId(peerId);
  appNavigationController.updateUrl((url) => {
    if(peerId && url.searchParams.get('vkgram') === 'messages') {
      url.searchParams.set(URL_PARAM, String(peerId));
    } else {
      url.searchParams.delete(URL_PARAM);
    }
  });
}

/**
 * Update the open topic of the peer. A peer change drops the topic by itself
 * (a new dialog opens on its topics list), so only this setter writes it.
 */
export function setVKMessageTopic(topicId: number | undefined) {
  setMessageThreadId(topicId);
  appNavigationController.updateUrl((url) => {
    if(topicId && url.searchParams.get('vkgram') === 'messages' && url.searchParams.get(URL_PARAM)) {
      url.searchParams.set(URL_TOPIC_PARAM, String(topicId));
    } else {
      url.searchParams.delete(URL_TOPIC_PARAM);
    }
  });
}
