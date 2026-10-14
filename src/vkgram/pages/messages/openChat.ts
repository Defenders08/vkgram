import {openVKSection} from '@/vkgram/sections';
import {setVKMessagePeer, setVKMessageTopic, setVKMessageAction, type VKMessageAction} from '@/vkgram/pages/messages/route';

/**
 * A chat with a user, a group or a bot — in VKgram's own «Сообщения», not in the Web K messenger
 * behind «Телеграм». The peer is stored first, so the page that mounts reads it as its open dialog
 * (the same value a `?vkgram=messages&peer=…` link carries); a «Сообщения» that is open already
 * follows the change by itself. `action` is a job for one message of that chat (see `VKMessageAction`).
 *
 * A forum group opens on its topics list — the previous topic, if any, is dropped.
 *
 * NB: lives apart from `messages/route.ts`, which must not import sections.ts.
 */
export function openVKChat(peerId: PeerId, action?: Pick<VKMessageAction, 'mid' | 'kind'>) {
  setVKMessagePeer(peerId);
  setVKMessageTopic(undefined);
  // an optional job for one message: scroll to it, reply to it, edit it (done by the chat once it shows)
  setVKMessageAction(action ? {peerId, ...action} : undefined);
  openVKSection('messages');
}

/**
 * A topic of a forum group: the same dialog URL with the `topic` param. The
 * page opens the topics list first and the topic chat over it (on a phone the
 * browser Back returns to the topics list).
 */
export function openVKTopic(peerId: PeerId, topicId: number, action?: Pick<VKMessageAction, 'mid' | 'kind'>) {
  setVKMessagePeer(peerId);
  setVKMessageTopic(topicId);
  setVKMessageAction(action ? {peerId, ...action} : undefined);
  openVKSection('messages');
}
