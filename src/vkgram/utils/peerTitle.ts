import type {User, Chat} from '@layer';

export type AnyPeer = User.user | Exclude<Chat, Chat.chatEmpty>;

/** a person's name or a chat's title, whichever the peer is */
export default function peerTitle(peer: AnyPeer | undefined): string | undefined {
  if(!peer) return undefined;
  if(peer._ === 'user') {
    return [peer.first_name, peer.last_name].filter(Boolean).join(' ') || peer.username || undefined;
  }
  return peer.title;
}
