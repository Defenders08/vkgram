import {createMemo, createResource, Show} from 'solid-js';
import type {Chat, ChatFull} from '@layer';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {AvatarNewTsx} from '@components/avatarNew';
import wrapRichText from '@richTextProcessor/wrapRichText';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import numberThousandSplitter from '@helpers/number/numberThousandSplitter';
import {openPeerAvatar} from '@/vkgram/utils/openPeerAvatar';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import {openVKChannelPage} from '@/vkgram/pages/channel/openChannel';
import {openVKProfile} from '@/vkgram/pages/profile/openProfile';
import {MiniPeerBlock} from '@/vkgram/pages/profile/VKProfileSideBlocks';
import createGroupParticipants from '@/vkgram/hooks/createGroupParticipants';
import createChannelActions from '@/vkgram/pages/channel/createChannelActions';
import VKIcon from '@/vkgram/components/VKIcons';
import {copyTextToClipboard} from '@helpers/clipboard';
import {toast} from '@components/toast';
import VKProfileInfoRow from '@/vkgram/pages/profile/VKProfileInfoRow';
import VKGroupMedia from '@/vkgram/pages/group/VKGroupMedia';
import {openVKChannelEdit} from '@/vkgram/pages/channel/VKChannelEditModal';
import VKChannelPost from '@/vkgram/pages/channel/VKChannelPost';

const AVATAR_SIZE = 120;
const MEMBERS_LIMIT = 5;
const MODERATORS_LIMIT = 5;

type GroupChat = Chat.chat | Chat.channel;

/**
 * The page of a group chat (basic or supergroup) inside «Моя страница», where
 * a click on its name or avatar leads: two columns as on a user's page — the
 * avatar and «Написать сообщение» on the left, the name, about, members and
 * «Информация» on the right, by analogy with the channel page. It only reads
 * Web K's stores: the chat from the reactive peer store, about / members / the
 * linked channel from the full-peer store. A field the data doesn't have is
 * not drawn. Going back is in the top bar (VKHeader).
 */
function useGroupInfo(props: {peerId: PeerId, chat: GroupChat}) {
  const peers = usePeers();
  const fullPeer = useFullPeer(props.peerId) as () => ChatFull;

  const usernames = createMemo(() => getPeerActiveUsernames(props.chat));
  const username = () => usernames()[0];
  // a username is `[A-Za-z0-9_]+` on the wire, but the anchor is built by hand — encode anyway
  const publicLink = () => username() ? `https://t.me/${encodeURIComponent(username())}` : undefined;
  // a private group has no address of its own: the invite link the full peer carries
  // (the server decides who may see it — a member without rights gets none)
  const inviteLink = () => {
    const exported = (fullPeer() as ChatFull.chatFull | ChatFull.channelFull)?.exported_invite;
    return exported?._ === 'chatInviteExported' ? exported.link : undefined;
  };
  const link = () => publicLink() ?? inviteLink();
  const isPublic = () => !!username();
  // basic groups carry only their own flags; `kicked` is patched in at runtime,
  // verified / scam / fake exist on channels only — read them the channel way
  const pFlags = () => props.chat.pFlags as Chat.channel['pFlags'] & {kicked?: true};
  const isMember = () => !pFlags().left && !pFlags().kicked;

  const aboutWrapped = createMemo(() => {
    const about = fullPeer()?.about;
    return about ? wrapRichText(about) : undefined;
  });

  // megagroups carry the count, basic groups only the list of participants
  const members = () => {
    const full = fullPeer();
    if(full?._ === 'channelFull') return full.participants_count ?? props.chat.participants_count;
    if(full?._ === 'chatFull' && full.participants._ === 'chatParticipants') {
      return full.participants.participants.length;
    }

    return props.chat.participants_count;
  };

  // the discussion channel of the group, when the store already knows it
  const linkedChannel = () => {
    const full = fullPeer();
    const id = full?._ === 'channelFull' ? full.linked_chat_id : undefined;
    if(!id) return undefined;
    const peer = peers[id.toPeerId(true)] as Chat.channel;
    return peer?._ === 'channel' && !peer.pFlags.megagroup && !peer.pFlags.monoforum ? peer : undefined;
  };

  const openLinkedChannel = () => {
    const id = (fullPeer() as ChatFull.channelFull)?.linked_chat_id;
    if(id) openVKChannelPage(id.toPeerId(true));
  };

  return {
    username, link, isPublic, isMember, pFlags, aboutWrapped, members, linkedChannel, openLinkedChannel
  };
}

/** The name, address, description and members of the group */
function VKGroupSummary(props: {peerId: PeerId, chat: GroupChat}) {
  const {username, pFlags, aboutWrapped, members} = useGroupInfo(props);
  // «Изменить» is for those who may change the group's info, «Пригласить» for those who may add members
  const [canEdit] = createResource(() => rootScope.managers.appChatsManager.hasRights(props.peerId.toChatId(), 'change_info'));
  const [canInvite] = createResource(() => rootScope.managers.appChatsManager.hasRights(props.peerId.toChatId(), 'invite_users'));

  const invite = () => {
    // Web K's own add-members flow in its right column (the picker, the
    // confirmation, the invite-link fallback); both modules are heavy and
    // tangled with the popups — brought in on the click only
    Promise.all([
      import('@components/addChatUsers'),
      import('@components/sidebarRight')
    ]).then(([{default: addChatUsers}, {default: appSidebarRight}]) => {
      addChatUsers({peerId: props.peerId, slider: appSidebarRight});
    }).catch((err) => console.error('VKgram: failed to open the invite flow', err));
  };

  return (
    <section class="vk-block vk-profile-summary" aria-labelledby="vk-group-name">
      <div class="vk-group-title-row">
        <h1 id="vk-group-name" class="vk-profile-name">
          {props.chat.title}
          <Show when={pFlags().verified}>
            <span class="vk-peer-flag" title="Подтверждён"> ✔</span>
          </Show>
        </h1>
        <Show when={!!canEdit()}>
          <button
            type="button"
            class="vk-link-button vk-group-title-edit"
            aria-label="Изменить"
            title="Изменить"
            onClick={() => openVKChannelEdit(props.peerId)}
          >
            <VKIcon name="edit" size={16} />
          </button>
        </Show>
      </div>
      <Show when={username()}>
        <div class="vk-profile-username">@{username()}</div>
      </Show>
      <Show when={aboutWrapped()}>
        <p class="vk-profile-about">{aboutWrapped()}</p>
      </Show>
      <Show when={members()}>
        <div class="vk-profile-members vk-page-text-secondary">
          {numberThousandSplitter(members())} участников
          <Show when={!!canInvite()}>
            {' · '}
            <button type="button" class="vk-link-button" onClick={invite}>
              Пригласить
            </button>
          </Show>
        </div>
      </Show>
    </section>
  );
}

/**
 * «Закреплённое сообщение»: the group's newest pin, drawn by the channel's own
 * post component (the same look the channel page's pinned post has). The pin's
 * id comes with the full peer; a group without a pin is a block not drawn.
 */
function VKGroupPinned(props: {peerId: PeerId}) {
  const fullPeer = useFullPeer(props.peerId);
  const pinnedMessageId = () => (fullPeer() as {pinned_msg_id?: number})?.pinned_msg_id;

  const [pinned] = createResource(
    () => ({peerId: props.peerId, hint: pinnedMessageId()}),
    async({peerId}) => {
      try {
        const {maxId} = await rootScope.managers.appMessagesManager.getPinnedMessage(peerId);
        if(!maxId) return;
        const message = await rootScope.managers.appMessagesManager.getMessageByPeer(peerId, maxId);
        return message?._ === 'message' ? message : undefined;
      } catch(err) {
        console.error('VKgram: failed to load the pinned message', err);
        return undefined;
      }
    }
  );

  return (
    <Show when={pinned.latest}>
      <section class="vk-block vk-group-pinned" aria-label="Закреплённое сообщение">
        <h2 class="vk-block-title">Закреплённое сообщение</h2>
        <VKChannelPost messages={[pinned.latest]} isPinned />
      </section>
    </Show>
  );
}

/** «Информация»: the rows of the channel page, in the words a group needs */
function VKGroupDetails(props: {peerId: PeerId, chat: GroupChat}) {
  const {link, isPublic, isMember, pFlags, linkedChannel, openLinkedChannel} = useGroupInfo(props);

  return (
    <section class="vk-block vk-group-details" aria-labelledby="vk-group-info-title">
      <h2 id="vk-group-info-title" class="vk-block-title">Информация</h2>
      <dl class="vk-profile-info">
        <VKProfileInfoRow label="Тип">{isPublic() ? 'Публичная группа' : 'Частная группа'}</VKProfileInfoRow>
        <VKProfileInfoRow label="Подписка">{isMember() ? 'Вы состоите' : 'Вы не состоите'}</VKProfileInfoRow>

        <VKProfileInfoRow label="Ссылка">
          {link() && <a href={link()} target="_blank" rel="noopener noreferrer">{link()}</a>}
        </VKProfileInfoRow>

        <VKProfileInfoRow label="Канал">
          {linkedChannel() && (
            <button type="button" class="vk-link-button" onClick={openLinkedChannel}>
              {linkedChannel()?.title}
            </button>
          )}
        </VKProfileInfoRow>

        <Show when={pFlags().scam || pFlags().fake}>
          <VKProfileInfoRow label="Предупреждение">
            {pFlags().scam ? 'Telegram отметил группу как мошенническую' : 'Telegram отметил группу как поддельную'}
          </VKProfileInfoRow>
        </Show>
      </dl>
    </section>
  );
}

/** «Участники» in the narrow column: the first few members, as the mini blocks of the profile */
function VKGroupMembers(props: {peerId: PeerId, chat: GroupChat}) {
  const {members} = useGroupInfo(props);
  const {participants, total} = createGroupParticipants({peerId: () => props.peerId, limit: MEMBERS_LIMIT});

  return (
    <MiniPeerBlock
      title="Участники"
      total={members() ?? total() ?? 0}
      peers={participants() ?? []}
      onOpen={(peerId) => openVKProfile(peerId)}
    />
  );
}

/** «Модераторы» in the narrow column: the admins and moderators of the group, as the server lists them */
function VKGroupModerators(props: {peerId: PeerId}) {
  const {participants, total} = createGroupParticipants({
    peerId: () => props.peerId,
    limit: MODERATORS_LIMIT,
    filter: {_: 'channelParticipantsAdmins'}
  });

  return (
    <MiniPeerBlock
      title="Модераторы"
      total={total() ?? 0}
      // an admin's custom title («prefix») under the name, grey
      peers={(participants() ?? []).map((participant) => ({peerId: participant.peerId, subtitle: participant.rank}))}
      onOpen={(peerId) => openVKProfile(peerId)}
    />
  );
}

/** a mini QR glyph of the share button (no QR icon ships with VKIcons) */
function QrIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M2 2h7v7H2V2zm2 2v3h3V4H4zm7-2h7v7h-7V2zm2 2v3h3V4h-3zM2 11h7v7H2v-7zm2 2v3h3v-3H4zm7-2h3v2h-3v-2zm5 0h2v2h-2v-2zm-5 3h2v2h2v2h-4v-4zm5 0h2v2h2v2h-2v-2h-2v-2zm0 3h2v2h-2v-2z" />
    </svg>
  );
}

/**
 * The actions block of the narrow column, in the look of the channel's buttons
 * (`VKChannelActions`): the blue «Перейти в чат», and under it the quiet rows —
 * «Скопировать ссылку» with the QR segment (Web K's own «Invite by QR Code»
 * sheet; only when the group has a public address or the invite link the full
 * peer carries) and «Заглушить» / «Включить звук», whose state follows the
 * dialog's notifications (the same plumbing the channel page's bell uses).
 */
function VKGroupShare(props: {peerId: PeerId, chat: GroupChat}) {
  const {link} = useGroupInfo(props);
  const actions = createChannelActions(props.peerId);

  const showQr = () => {
    import('@components/popups/linkQrCode').then(({default: showLinkQrCodePopup}) => {
      showLinkQrCodePopup({url: link(), aboutLangKey: 'InviteLink.QRCode.InfoGroup'});
    }).catch((err) => console.error('VKgram: failed to open the QR popup', err));
  };

  const run = (action: () => unknown) => {
    Promise.resolve(action()).catch((err) => console.error('VKgram: group action failed', err));
  };

  return (
    <section class="vk-channel-actions vk-group-share" aria-label="Чат и ссылка">
      <div class="vk-channel-actions-row">
        <button type="button" class="vk-button vk-channel-action vk-channel-action-grow" onClick={() => openVKChat(props.peerId)}>
          Перейти в чат
        </button>
      </div>

      <Show when={link()}>
        <div class="vk-channel-actions-row">
          <button
            type="button"
            class="vk-button vk-button-secondary vk-channel-action vk-channel-action-grow"
            onClick={() => run(() => {
              copyTextToClipboard(link());
              toast('Ссылка скопирована');
            })}
          >
            Скопировать ссылку
          </button>
          <button type="button" class="vk-button vk-button-secondary vk-channel-action vk-channel-action-icon" aria-label="Показать QR-код" title="QR-код" onClick={showQr}>
            <QrIcon />
          </button>
        </div>
      </Show>

      <div class="vk-channel-actions-row">
        <button
          type="button"
          class="vk-button vk-button-secondary vk-channel-action vk-channel-action-grow vk-group-share-mute"
          disabled={actions.isMuted() === undefined}
          aria-pressed={actions.isMuted()}
          onClick={() => run(actions.toggleMute)}
        >
          <VKIcon name={actions.isMuted() ? 'bell-off' : 'bell'} size={16} />
          {actions.isMuted() ? 'Включить звук' : 'Заглушить'}
        </button>
      </div>
    </section>
  );
}

export default function VKGroupPage(props: {peerId: PeerId}) {
  const peers = usePeers();
  const chat = () => peers[props.peerId] as GroupChat;

  return (
    <div class="vk-page vk-profile">
      <Show
        when={chat()}
        fallback={<div class="vk-block vk-page-block vk-page-text-secondary">Загрузка группы…</div>}
      >
        <div class="vk-cols">
          <div class="vk-col-side">
            <section class="vk-block vk-profile-avatar-block">
              <button
                type="button"
                class="vk-profile-avatar-edit"
                aria-label="Открыть фотографию"
                onClick={(e) => void openPeerAvatar(e.currentTarget, props.peerId)}
              >
                <AvatarNewTsx peerId={props.peerId} size={AVATAR_SIZE} isBig />
              </button>
            </section>

            <VKGroupShare peerId={props.peerId} chat={chat()} />

            <VKGroupMembers peerId={props.peerId} chat={chat()} />

            <VKGroupModerators peerId={props.peerId} />
          </div>

          <div class="vk-col-main">
            <VKGroupSummary peerId={props.peerId} chat={chat()} />
            <VKGroupPinned peerId={props.peerId} />
            <VKGroupDetails peerId={props.peerId} chat={chat()} />
            <VKGroupMedia peerId={props.peerId} />
          </div>
        </div>
      </Show>
    </div>
  );
}
