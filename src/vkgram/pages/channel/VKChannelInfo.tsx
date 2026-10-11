import {createMemo, Show} from 'solid-js';
import type {Chat, ChatFull} from '@layer';
import {usePeers} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {AvatarNewTsx} from '@components/avatarNew';
import wrapRichText from '@richTextProcessor/wrapRichText';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import numberThousandSplitter from '@helpers/number/numberThousandSplitter';
import {avatarViewAttrs} from '@/vkgram/utils/openPeerAvatar';
import VKChannelActions from '@/vkgram/pages/channel/VKChannelActions';
import createChannelActions from '@/vkgram/pages/channel/createChannelActions';

const AVATAR_SIZE = 120;

/**
 * Header and «Информация» of a channel. Everything comes from Web K's stores:
 * the channel from the reactive peer store, the rest from the full channel
 * (`appProfileManager.getProfileByPeerId` through `useFullPeer`). A field the
 * data doesn't have is not drawn.
 */
function useChannelInfo(props: {peerId: PeerId, chat: Chat.channel}) {
  const peers = usePeers();
  const fullPeer = useFullPeer(props.peerId) as () => ChatFull.channelFull | undefined;

  const usernames = createMemo(() => getPeerActiveUsernames(props.chat));
  const username = () => usernames()[0];
  // a username is `[A-Za-z0-9_]+` on the wire, but the anchor is built by hand — encode anyway
  const link = () => username() ? `https://t.me/${encodeURIComponent(username())}` : undefined;
  const isPublic = () => !!username();

  const subscribers = () => fullPeer()?.participants_count ?? props.chat.participants_count;
  const about = () => fullPeer()?.about;
  const isSubscribed = () => !props.chat.pFlags.left;

  const aboutWrapped = createMemo(() => about() ? wrapRichText(about()) : undefined);

  // the discussion group, when the store already knows it
  const discussionTitle = () => {
    const id = fullPeer()?.linked_chat_id;
    return id ? (peers[id.toPeerId(true)] as Chat.channel | Chat.chat)?.title : undefined;
  };

  return {
    username, usernames, isPublic, link, subscribers, isSubscribed, aboutWrapped, discussionTitle
  };
}

// the name, address, description and subscribers of the channel
function ChannelHeaderText(props: {peerId: PeerId, chat: Chat.channel}) {
  const {username, subscribers, aboutWrapped} = useChannelInfo(props);
  const actions = createChannelActions(props.peerId);

  return (
    <div class="vk-channel-header-text">
      <h1 class="vk-page-title vk-channel-title">
        {props.chat.title}
        <Show when={props.chat.pFlags.verified}>
          <span class="vk-peer-flag" title="Подтверждён"> ✔</span>
        </Show>
      </h1>
      <Show when={username()}>
        <div class="vk-page-text-secondary">@{username()}</div>
      </Show>
      <Show when={aboutWrapped()}>
        <div class="vk-channel-description vk-page-text">{aboutWrapped()}</div>
      </Show>
      <Show when={subscribers()}>
        <div class="vk-channel-subscribers vk-page-text-secondary">
          {numberThousandSplitter(subscribers())} подписчиков
          <Show when={actions.canViewStats()}>
            {' · '}
            <button type="button" class="vk-link-button" onClick={() => actions.openStatistics().catch((err) => console.error('VKgram: failed to open the statistics', err))}>
              Статистика
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}

/** Avatar and text in one block (the mobile page) */
export function VKChannelHeader(props: {peerId: PeerId, chat: Chat.channel}) {
  return (
    <section class="vk-block vk-channel-header">
      <div class="vk-channel-avatar vk-avatar-view" {...avatarViewAttrs(props.peerId)}>
        <AvatarNewTsx peerId={props.peerId} size={AVATAR_SIZE} />
      </div>

      <ChannelHeaderText peerId={props.peerId} chat={props.chat} />
    </section>
  );
}

/** Desktop: the avatar alone in its block… */
export function VKChannelAvatar(props: {peerId: PeerId}) {
  return (
    <section class="vk-block vk-channel-avatar-block">
      <div class="vk-channel-avatar vk-avatar-view" {...avatarViewAttrs(props.peerId)}>
        <AvatarNewTsx peerId={props.peerId} size={AVATAR_SIZE} isBig />
      </div>
    </section>
  );
}

/** …and the text about the channel in a block of its own */
export function VKChannelSummary(props: {peerId: PeerId, chat: Chat.channel}) {
  return (
    <section class="vk-block vk-channel-summary">
      <ChannelHeaderText peerId={props.peerId} chat={props.chat} />
    </section>
  );
}

export function VKChannelDetails(props: {peerId: PeerId, chat: Chat.channel}) {
  const {usernames, isPublic, link, isSubscribed, discussionTitle} = useChannelInfo(props);
  const actions = createChannelActions(props.peerId);

  return (
    <section class="vk-block vk-channel-info" aria-labelledby="vk-channel-info-title">
      <h2 id="vk-channel-info-title" class="vk-block-title">Информация</h2>
      <dl class="vk-profile-info-list">
        <dt>Тип</dt>
        <dd>{isPublic() ? 'Публичный канал' : 'Частный канал'}</dd>

        <dt>Подписка</dt>
        <dd>{isSubscribed() ? 'Вы подписаны' : 'Вы не подписаны'}</dd>

        <Show when={link()}>
          <dt>Ссылка</dt>
          <dd><a href={link()} target="_blank" rel="noopener noreferrer">{link()}</a></dd>
        </Show>

        <Show when={usernames().length > 1}>
          <dt>Другие адреса</dt>
          <dd>{usernames().slice(1).map((name) => '@' + name).join(', ')}</dd>
        </Show>

        <Show when={discussionTitle()}>
          <dt>Обсуждение</dt>
          <dd>
            <button type="button" class="vk-link-button" onClick={() => actions.viewDiscussion()}>
              {discussionTitle()}
            </button>
          </dd>
        </Show>

        <Show when={props.chat.pFlags.scam || props.chat.pFlags.fake}>
          <dt>Предупреждение</dt>
          <dd>{props.chat.pFlags.scam ? 'Telegram отметил канал как мошеннический' : 'Telegram отметил канал как поддельный'}</dd>
        </Show>
      </dl>
    </section>
  );
}

/** Header, the buttons and «Информация» one after another (the mobile page); the desktop page puts them in different columns */
export default function VKChannelInfo(props: {peerId: PeerId, chat: Chat.channel}) {
  return (
    <>
      <VKChannelHeader peerId={props.peerId} chat={props.chat} />
      <VKChannelActions peerId={props.peerId} />
      <VKChannelDetails peerId={props.peerId} chat={props.chat} />
    </>
  );
}
