import {Accessor, createEffect, createSignal, on, onCleanup} from 'solid-js';
import type {ChannelParticipantsFilter} from '@layer';
import rootScope from '@lib/rootScope';
import getParticipantPeerId from '@appManagers/utils/chats/getParticipantPeerId';

export type GroupParticipant = {peerId: PeerId, rank?: string};

/**
 * The members of a group (`appProfileManager.getParticipants`: a basic group's
 * list comes with its chatFull, a megagroup's — from `channels.getParticipants`,
 * cached for a minute; both save the peers, so the avatars are known). The
 * first `limit` of them, as the server answers; `total` is the count it reports
 * (the full list length for a basic group). `filter` narrows the list server-
 * side (`channelParticipantsAdmins` for the moderators block). If the members
 * are hidden or there is no right to see them, the list stays empty and the
 * block is not drawn.
 */
export default function createGroupParticipants(options: {
  peerId: Accessor<PeerId | undefined>,
  limit: number,
  filter?: ChannelParticipantsFilter
}) {
  const [participants, setParticipants] = createSignal<GroupParticipant[]>();
  const [total, setTotal] = createSignal<number>();

  let generation = 0;
  onCleanup(() => {
    generation++;
  });

  createEffect(on(options.peerId, async(peerId) => {
    const current = ++generation;
    setParticipants(undefined);
    setTotal(undefined);
    if(!peerId) return;

    try {
      const result = await rootScope.managers.appProfileManager.getParticipants({
        id: peerId.toChatId(),
        filter: options.filter ?? {_: 'channelParticipantsRecent'},
        limit: options.limit
      });
      if(current !== generation) return;

      const list = result.participants;
      setTotal((result as {count?: number}).count ?? list.length);
      setParticipants(list.map((participant) => ({
        peerId: getParticipantPeerId(participant),
        // the custom title of an admin / creator («prefix»), when set
        rank: (participant as {rank?: string}).rank || undefined
      })));
    } catch(err) {
      if(current !== generation) return;
      console.error('VKgram: failed to load the group members', err);
      setParticipants([]);
    }
  }));

  return {participants, total};
}
