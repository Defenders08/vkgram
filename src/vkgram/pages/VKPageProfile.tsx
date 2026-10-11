import {createMemo, createSignal, For, Match, Show, Switch} from 'solid-js';
import type {User, UserFull} from '@layer';
import type {MyDocument} from '@appManagers/appDocsManager';
import rootScope from '@lib/rootScope';
import {useUser, usePeer} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {AvatarNewTsx} from '@components/avatarNew';
import {pickAvatarAndUpload} from '@components/avatarEdit';
import {useMediaSizes} from '@helpers/mediaSizes';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import {formatPhoneNumber} from '@helpers/formatPhoneNumber';
import VKModal from '@/vkgram/components/VKModal';
import VKProfileEditForm from '@/vkgram/pages/profile/VKProfileEditForm';
import VKProfileBirthday from '@/vkgram/pages/profile/VKProfileBirthday';
import VKProfilePersonalChannel from '@/vkgram/pages/profile/VKProfilePersonalChannel';
import {getVKHomeBlock, getVKHomeSystem, vkHomeBlockIds, vkHomeHidePhone, vkHomeHideUsername, type VKHomeSystemId} from '@/vkgram/pages/profile/homeSettings';
import VKProfilePinned from '@/vkgram/pages/profile/VKProfilePinned';
import VKProfileChannelPost from '@/vkgram/pages/profile/VKProfileChannelPost';
import VKProfileMusic from '@/vkgram/pages/profile/VKProfileMusic';
import {VKProfileMyStories} from '@/vkgram/pages/profile/VKProfileStories';
import VKProfileGifts from '@/vkgram/pages/profile/VKProfileGifts';
import VKProfileInfoRow from '@/vkgram/pages/profile/VKProfileInfoRow';
import VKProfileMusicList from '@/vkgram/pages/profile/VKProfileMusicList';
import {VKProfileGroups, VKProfileSubscriptions} from '@/vkgram/pages/profile/VKProfileSideBlocks';
import VKPageUserProfile from '@/vkgram/pages/profile/VKPageUserProfile';
import VKGroupPage from '@/vkgram/pages/group/VKGroupPage';
import {vkProfilePeerId} from '@/vkgram/pages/profile/route';
import {avatarViewAttrs, openPeerAvatar} from '@/vkgram/utils/openPeerAvatar';

/**
 * «Моя страница». On desktop the same section shows the page of another user
 * when one was opened (friends, search); on mobile it is always my page.
 */
export default function VKPageProfile() {
  const sizes = useMediaSizes();

  return (
    <Show when={!sizes.isMobile && vkProfilePeerId()} fallback={<VKPageOwnProfile />}>
      {(peerId) => <VKPagePeerPage peerId={peerId()} />}
    </Show>
  );
}

/**
 * The page of another peer inside «Моя страница»: a user — the user page, a
 * chat (basic group / supergroup) — the group page. The peer is read from Web
 * K's reactive peer store; until it arrives the group page's own loading state
 * shows.
 */
function VKPagePeerPage(props: {peerId: PeerId}) {
  const peer = usePeer(() => props.peerId);

  return (
    <Show when={peer()?._ !== 'user'} fallback={<VKPageUserProfile peerId={props.peerId} />}>
      <VKGroupPage peerId={props.peerId} />
    </Show>
  );
}

/**
 * The signed-in user's profile in VKgram markup.
 *
 * No data of its own: the user comes from Web K's reactive peer store
 * (`useUser`), bio / birthday from its full-peer store (`useFullPeer`), the
 * avatar is Web K's avatar component. Edits go through Web K's managers, and
 * the stores push the result back here — no reload, no manual refresh.
 */
function VKPageOwnProfile() {
  const myPeerId = rootScope.myId;
  const sizes = useMediaSizes();
  const user = useUser(() => myPeerId.toUserId()) as () => User.user;
  const fullPeer = useFullPeer(myPeerId);
  const userFull = () => fullPeer() as UserFull.userFull;

  // «Изменить профиль» opens the edit form in a modal; the button itself never goes away
  const [isEditing, setIsEditing] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [isAvatarUploading, setIsAvatarUploading] = createSignal(false);

  const fullName = () => [user()?.first_name, user()?.last_name].filter(Boolean).join(' ');
  const usernames = createMemo(() => getPeerActiveUsernames(user()));
  const phone = createMemo(() => {
    const raw = user()?.phone;
    if(!raw) return;
    const {formatted, code} = formatPhoneNumber(raw);
    return (code ? '+' : '') + formatted;
  });
  // the page scrolls itself; the gifts grid lazy-loads against it
  const [pageEl, setPageEl] = createSignal<HTMLDivElement>();

  // Web K's own flow: file picker → media editor → upload → uploadProfilePhoto.
  // The new photo arrives through `avatar_update`, which AvatarNew listens to.
  const changeAvatar = () => {
    pickAvatarAndUpload({
      managers: rootScope.managers,
      mode: 'self',
      onUploadStart: (progress) => {
        setIsAvatarUploading(true);
        progress.catch(() => setIsAvatarUploading(false));
      },
      onUploaded: () => setIsAvatarUploading(false)
    });
  };

  // the blocks of the page; the mobile page stacks them in this order, the desktop one splits them into two columns
  const changePhotoButton = () => (
    <button
      type="button"
      class="vk-link-button"
      disabled={isAvatarUploading()}
      onClick={changeAvatar}
    >
      {isAvatarUploading() ? 'Загрузка фотографии…' : 'Изменить фотографию'}
    </button>
  );

  // everything the profile says in words: name, about, data rows, actions
  // (the desktop page has «Изменить профиль» under the avatar, the mobile one in the block)
  const infoContent = (withEditButton = true) => (
    <>
      <h1 id="vk-profile-name" class="vk-profile-name">{fullName()}</h1>
      {/* «Скрыть никнейм» / «Скрыть номер телефона» («Настройки»): only how this block looks */}
      <Show when={usernames().length && !vkHomeHideUsername()}>
        <div class="vk-profile-username">
          {usernames().map((username) => '@' + username).join(', ')}
        </div>
      </Show>
      <Show when={userFull()?.about}>
        <p class="vk-profile-about">{userFull().about}</p>
      </Show>

      {/* ProfileInfo */}
      <dl class="vk-profile-info">
        <VKProfileInfoRow label="Имя">{user()?.first_name}</VKProfileInfoRow>
        <VKProfileInfoRow label="Фамилия">{user()?.last_name}</VKProfileInfoRow>
        <VKProfileInfoRow label="Имя пользователя">
          {usernames().length && !vkHomeHideUsername() ? usernames().map((username) => '@' + username).join(', ') : undefined}
        </VKProfileInfoRow>
        <VKProfileInfoRow label="О себе">{userFull()?.about}</VKProfileInfoRow>
        <VKProfileBirthday birthday={userFull()?.birthday} />
        <VKProfileInfoRow label="Телефон">{vkHomeHidePhone() ? undefined : phone()}</VKProfileInfoRow>
      </dl>

      {/* ProfileActions */}
      <Show when={withEditButton}>
        <div class="vk-profile-actions">
          <button type="button" class="vk-button" aria-haspopup="dialog" onClick={() => setIsEditing(true)}>
            Изменить профиль
          </button>
        </div>
      </Show>
    </>
  );

  // mobile: avatar and text in one block, as before
  const headerBlock = () => (
    <section class="vk-block vk-profile-header" aria-labelledby="vk-profile-name" data-vk-home-block="info">
      <div class="vk-profile-avatar">
        {/* a click on the photo opens the viewer; no photo yet — the upload, like the old VK */}
        <div class="vk-avatar-view" {...avatarViewAttrs(myPeerId, changeAvatar)}>
          <AvatarNewTsx peerId={myPeerId} size={120} isBig />
        </div>
        {changePhotoButton()}
      </div>

      <div class="vk-profile-main">
        {infoContent()}
      </div>
    </section>
  );

  // desktop: the avatar alone in its block — a click opens the viewer (all the profile photos, paged),
  // and the change of the photo is a bar of its own that appears over the bottom of the photo on hover,
  // like the old VK
  const avatarBlock = () => (
    <section class="vk-block vk-profile-avatar-block">
      <button
        type="button"
        class="vk-profile-avatar-edit"
        aria-label="Открыть фотографию"
        onClick={(e) => {
          openPeerAvatar(e.currentTarget, myPeerId).then((opened) => {
            if(!opened) changeAvatar();
          });
        }}
      >
        <AvatarNewTsx peerId={myPeerId} size={120} isBig />
      </button>
      <button
        type="button"
        class="vk-profile-avatar-change"
        classList={{'is-uploading': isAvatarUploading()}}
        disabled={isAvatarUploading()}
        onClick={changeAvatar}
      >
        {isAvatarUploading() ? 'Загрузка…' : 'Изменить фотографию'}
      </button>
    </section>
  );
  const editProfileButton = () => (
    <div class="vk-profile-side-actions">
      <button type="button" class="vk-button" aria-haspopup="dialog" onClick={() => setIsEditing(true)}>
        Изменить профиль
      </button>
    </div>
  );
  const summaryBlock = () => (
    <section class="vk-block vk-profile-summary" aria-labelledby="vk-profile-name" data-vk-home-block="info">
      {infoContent(false)}
    </section>
  );
  // one modal for desktop and mobile: the same form (same fields, same save through Web K's managers),
  // in a VKModal — the layer over the page, which the page itself does not move for
  const editModal = () => (
    <Show when={isEditing()}>
      <VKModal
        title="Редактирование профиля"
        closeDisabled={isSaving()}
        onClose={() => setIsEditing(false)}
      >
        <VKProfileEditForm
          variant="modal"
          user={user()}
          userFull={userFull()}
          onDone={() => setIsEditing(false)}
          onSavingChange={setIsSaving}
        />
      </VKModal>
    </Show>
  );
  // the blocks of the main column: those of the page itself and the ones the user added (pinned chats,
  // posts of channels; kept in the VKgram config, not in Telegram). Which are shown, how many there are
  // and in what order is the user's choice («Настройки» in the top bar)
  const homeBlocks = () => (
    <For each={vkHomeBlockIds()}>
      {(id) => (
        <Switch>
          <Match when={getVKHomeSystem(id)}>
            {(block) => <Show when={!block().hidden}>{systemBlock(block().id)}</Show>}
          </Match>
          <Match when={getVKHomeBlock(id)?.kind === 'pinned'}><VKProfilePinned id={id} /></Match>
          <Match when={getVKHomeBlock(id)?.kind === 'post'}><VKProfileChannelPost id={id} /></Match>
        </Switch>
      )}
    </For>
  );
  const channelBlock = () => (
    <VKProfilePersonalChannel channelId={userFull()?.personal_channel_id?.toChatId()} blockId="channel" />
  );
  const musicBlock = () => (
    <VKProfileMusic profileTrack={userFull()?.saved_music as MyDocument} hideAllTracks={!sizes.isMobile} blockId="music" />
  );
  // the blocks of the page itself: where they stand and whether they are shown is the user's choice
  const systemBlock = (id: VKHomeSystemId) => {
    switch(id) {
      case 'info': return sizes.isMobile ? headerBlock() : summaryBlock();
      case 'music': return musicBlock();
      case 'channel': return channelBlock();
      case 'stories': return <VKProfileMyStories blockId={id} />;
      case 'gifts': return <Show when={pageEl()}><VKProfileGifts scrollParent={pageEl()} blockId={id} /></Show>;
    }
  };
  // desktop: the tracks are a block of their own in the narrow column
  const musicListBlock = () => (
    <VKProfileMusicList peerId={myPeerId} profileTrack={userFull()?.saved_music as MyDocument} />
  );

  return (
    <div class="vk-page vk-profile" ref={setPageEl}>
      <Show
        when={user()}
        fallback={<div class="vk-block vk-page-block vk-page-text-secondary">Загрузка профиля…</div>}
      >
        <Show
          when={sizes.isMobile}
          fallback={
            // desktop: two columns like the old VK — the person on the left, the content on the right
            <div class="vk-cols">
              <div class="vk-col-side">
                {avatarBlock()}
                {editProfileButton()}
                <VKProfileSubscriptions />
                <VKProfileGroups />
                {musicListBlock()}
              </div>
              <div class="vk-col-main">
                {homeBlocks()}
              </div>
            </div>
          }
        >
          {homeBlocks()}
        </Show>
        {editModal()}
      </Show>
    </div>
  );
}
