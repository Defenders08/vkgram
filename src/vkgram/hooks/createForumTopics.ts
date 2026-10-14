import {Accessor, createEffect, createMemo, createSignal, on, onCleanup} from 'solid-js';
import type {Chat, ForumTopic, User} from '@layer';
type LiveForumTopic = ForumTopic.forumTopic;
import rootScope from '@lib/rootScope';
import createListenerSetter from '@helpers/solid/createListenerSetter';
import {isForumTopic} from '@appManagers/utils/dialogs/isDialog';
import getDialogIndex from '@appManagers/utils/dialogs/getDialogIndex';
import {usePeers} from '@stores/peers';
import peerTitle from '@/vkgram/utils/peerTitle';
import {getOwnMuteState} from '@/vkgram/hooks/createMutedPeers';

const FETCH_LIMIT = 100;

/**
 * A group with topics (Telegram's «форум»), as Web K flags it. A basic group
 * cannot be a forum, so a forum is always a supergroup.
 */
export function isForumPeer(peer: unknown): peer is Chat.channel {
  const chat = peer as Chat.channel;
  return chat?._ === 'channel' && !!chat.pFlags?.forum;
}

const ACTION_TEXT: {[action: string]: string} = {
  sendMessageTypingAction: 'печатает',
  sendMessageRecordAudioAction: 'записывает голосовое сообщение',
  sendMessageRecordVideoAction: 'записывает видео',
  sendMessageRecordRoundAction: 'записывает видеосообщение',
  sendMessageUploadAudioAction: 'отправляет голосовое сообщение',
  sendMessageUploadPhotoAction: 'отправляет фото',
  sendMessageUploadVideoAction: 'отправляет видео',
  sendMessageUploadRoundAction: 'отправляет видеосообщение',
  sendMessageUploadDocumentAction: 'отправляет файл',
  sendMessageGeoLocationAction: 'выбирает местоположение',
  sendMessageChooseContactAction: 'выбирает контакт',
  sendMessageChooseStickerAction: 'выбирает стикер',
  sendMessageGamePlayAction: 'играет'
};

/**
 * «Аня печатает» / «Аня, Борис и ещё 2 печатают» — the same wording the dialog
 * list uses, built from one `peer_typings` event of a topic (its `threadId`
 * tells the topic, the ordinary hook reads only the forum's own typing).
 */
function topicTypingText(event: {typings?: any[]}, peers: ReturnType<typeof usePeers>): string | undefined {
  const list = (event.typings || []).map((item) => ({
    action: item?.action?._ as string | undefined,
    userId: (item?.userId ?? item?.peerId) as PeerId | undefined
  })).filter(({action, userId}) => !!action && userId !== undefined && userId !== rootScope.myId &&
    action !== 'sendMessageCancelAction' && action !== 'speakingInGroupCallAction');
  if(!list.length) return undefined;

  const names = list.map(({userId}) => {
    const user = peers[userId] as User.user | Chat.chat | Chat.channel | undefined;
    return (user?._ === 'user' ? user.first_name : undefined) || peerTitle(user as any) || 'Кто-то';
  });

  const doing = ACTION_TEXT[list[0].action] ?? 'печатает';
  if(names.length === 1) return `${names[0]} ${doing}`;
  if(names.length === 2) return `${names[0]} и ${names[1]} печатают`;
  return `${names[0]}, ${names[1]} и ещё ${names.length - 2} печатают`;
}

/**
 * The topics of one forum, through Web K's dialogs storage — the same store
 * the left forum tab reads (a forum's `filterId` is its peerId, and the
 * storage itself pages the topics off the server). The list is kept live by
 * the events Web K's forum tab lives on; the sort (pinned first, then by
 * activity) and what a row shows are VKgram's own.
 *
 * Alongside the topics the hook resolves the per-topic bits a row needs and
 * that are answered off the same events: the typing hint, the mute state and
 * the right to manage (close/delete) the topic.
 */
export default function createForumTopics(peerId: Accessor<PeerId | undefined>) {
  const listenerSetter = createListenerSetter();
  const peers = usePeers();

  const [topicsById, setTopicsById] = createSignal(new Map<number, LiveForumTopic>(), {equals: false});
  const [ready, setReady] = createSignal(false);
  const [count, setCount] = createSignal<number>();
  // «Аня печатает» of a topic, keyed by its id
  const [typings, setTypings] = createSignal(new Map<number, string>(), {equals: false});
  // muted per topic; `undefined` until Web K answered (the badge then keeps its place, hidden)
  const [mutedByTopic, setMutedByTopic] = createSignal(new Map<number, boolean>(), {equals: false});
  // the right to manage (close, delete) a topic, prefetched the same lazy way
  const [canManageByTopic, setCanManageByTopic] = createSignal(new Map<number, boolean>(), {equals: false});

  // what has already been asked about (mute / manage); a settings change drops the
  // topic out, and the loop below asks again
  const askedTopics = new Set<number>();

  let alive = true;
  onCleanup(() => {
    alive = false;
    listenerSetter.removeAll();
  });

  const putTopic = (topic: LiveForumTopic) => {
    setTopicsById((map) => map.set(topic.id, topic));
  };

  const removeTopic = (topicId: number) => {
    setTopicsById((map) => {
      map.delete(topicId);
      return map;
    });
  };

  const bumpAskVersion = (topicId: number) => {
    askedTopics.delete(topicId);
  };

  const load = async() => {
    const forumPeerId = peerId();
    if(!forumPeerId) return;

    setReady(false);
    setTopicsById(new Map());
    setTypings(new Map());
    setCount(undefined);

    // The same pages the left forum tab reads: `dialogsStorage.getDialogs` with the
    // forum's peerId as the filter, paged by the smallest index of the page, the
    // way the dialog list loads a folder.
    const seen = new Set<number>();
    let offsetIndex: number | undefined;
    while(alive) {
      let result: Awaited<ReturnType<typeof rootScope.managers.dialogsStorage.getDialogs>>;
      try {
        result = await rootScope.managers.dialogsStorage.getDialogs({
          filterId: forumPeerId,
          offsetIndex,
          limit: FETCH_LIMIT,
          skipMigrated: true
        });
      } catch(err) {
        console.error('VKgram: failed to load forum topics', err);
        break;
      }
      if(!alive) return;

      let fresh = 0;
      for(const dialog of result.dialogs) {
        if(!isForumTopic(dialog)) continue;
        if(seen.has(dialog.id)) continue;
        seen.add(dialog.id);
        putTopic(dialog);
        ++fresh;
      }

      setCount(result.count || undefined);

      const nextOffset = result.dialogs.reduce((min: number, dialog: any): number => {
        const index = getDialogIndex(dialog);
        return index !== undefined && index < min ? index : min;
      }, offsetIndex ?? Infinity);

      // The end is: an empty page, a page with nothing new, or a page that moved
      // nowhere (never loop forever). `isEnd` alone is not trusted on a full page.
      if(!result.dialogs.length || !fresh || nextOffset === Infinity || nextOffset === offsetIndex ||
        (result.isEnd && result.dialogs.length < FETCH_LIMIT)) {
        break;
      }

      offsetIndex = nextOffset;
    }

    if(alive) setReady(true);
  };

  createEffect(on(peerId, () => {
    void load();
  }));

  // * live updates — the events Web K's forum tab lives on

  listenerSetter.add(rootScope)('dialogs_multiupdate', (map: Map<PeerId, {topics?: Map<number, ForumTopic>}>) => {
    const topics = map.get(peerId())?.topics;
    if(!topics?.size) return;
    topics.forEach((topic, topicId) => {
      // тема заменяется новой версией, forumTopicDeleted удаляет её из списка
      if((topic as LiveForumTopic)._ === 'forumTopic') putTopic(topic as LiveForumTopic);
      else removeTopic(topicId);
    });
  });

  listenerSetter.add(rootScope)('dialog_unread', ({dialog}: {dialog: any}) => {
    if(isForumTopic(dialog) && dialog.peerId === peerId()) putTopic(dialog);
  });

  listenerSetter.add(rootScope)('dialog_notify_settings', (dialog: any) => {
    if(dialog.peerId !== peerId()) return;
    if(isForumTopic(dialog)) {
      putTopic(dialog);
      bumpAskVersion(dialog.id);
    }
  });

  listenerSetter.add(rootScope)('dialog_drop', (dialog: any) => {
    if(isForumTopic(dialog) && dialog.peerId === peerId()) removeTopic(dialog.id);
  });

  listenerSetter.add(rootScope)('dialog_draft', ({dialog, drop}: {dialog: any, drop?: boolean}) => {
    if(!isForumTopic(dialog) || dialog.peerId !== peerId()) return;
    if(drop) removeTopic(dialog.id);
    else putTopic(dialog);
  });

  listenerSetter.add(rootScope)('peer_typings', (event: {peerId: PeerId, threadId?: number, typings: any[]}) => {
    if(event.peerId !== peerId() || !event.threadId) return;
    const text = topicTypingText(event, peers);
    setTypings((map) => {
      if(text) map.set(event.threadId!, text);
      else map.delete(event.threadId!);
      return map;
    });
  });

  // a fresh topic has no answer about mute/manage yet: ask lazily, the way «Сообщения»
  // asks about the dialogs' mute — the topic's own settings first, Web K for the rest.
  // The re-run is driven by the topics map itself (a put on the same event that drops
  // the asked mark), so the answer signals are not read here.
  createEffect(() => {
    const forumPeerId = peerId();
    if(!forumPeerId) return;
    for(const topic of [...topicsById().values()]) {
      if(askedTopics.has(topic.id)) continue;
      askedTopics.add(topic.id);

      const own = getOwnMuteState(topic as any);
      if(own !== undefined) {
        setMutedByTopic((map) => new Map(map).set(topic.id, own));
      } else {
        rootScope.managers.appNotificationsManager.isPeerLocalMuted({peerId: forumPeerId, threadId: topic.id, respectType: true})
        .then((value) => {
          if(alive) setMutedByTopic((map) => new Map(map).set(topic.id, !!value));
        }, (err) => {
          console.error('VKgram: failed to read the topic mute state', err);
          if(alive) setMutedByTopic((map) => new Map(map).set(topic.id, false));
        });
      }

      rootScope.managers.dialogsStorage.canManageTopic(topic)
      .then((value) => {
        if(alive) setCanManageByTopic((map) => new Map(map).set(topic.id, !!value));
      }, () => {
        if(alive) setCanManageByTopic((map) => new Map(map).set(topic.id, false));
      });
    }
  });

  // закреплённые сверху, дальше — по активности (индекс диалога темы, как их
  // сортирует само хранилище)
  const sortedTopics = createMemo(() => {
    const list = [...topicsById().values()];
    list.sort((a, b) => {
      const pinA = !!a.pFlags?.pinned;
      const pinB = !!b.pFlags?.pinned;
      if(pinA !== pinB) return pinA ? -1 : 1;
      return (getDialogIndex(b) ?? b.top_message) - (getDialogIndex(a) ?? a.top_message);
    });
    return list;
  });

  return {
    topicsById,
    sortedTopics,
    ready,
    count,
    typings: (topicId: number) => typings().get(topicId),
    isTopicMuted: (topicId: number) => mutedByTopic().get(topicId),
    canManageTopic: (topicId: number) => canManageByTopic().get(topicId),
    reload: (): void => void load()
  };
}

export type VKForumTopics = ReturnType<typeof createForumTopics>;
