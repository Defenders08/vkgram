import {createEffect, createSignal, For, Show} from 'solid-js';
import type {Chat, ChatFull} from '@layer';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import {useFullPeer} from '@stores/fullPeers';
import {AvatarNewTsx} from '@components/avatarNew';
import {toast} from '@components/toast';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import VKModal from '@/vkgram/components/VKModal';
import VKIcon from '@/vkgram/components/VKIcons';
import {apiErrorType, openVKModal} from '@/vkgram/modals';
import {openWebKChannelTab} from '@/vkgram/webk';

const TITLE_MAX = 128;
const ABOUT_MAX = 255;

/**
 * «Изменить канал» in a `VKModal`: the name and the description of the channel, saved with Web K's
 * own manager methods (`appChatsManager.editTitle` / `editAbout` — they cover a channel and a group
 * alike and put the change into the caches) — only what changed is sent. Under the
 * form, the settings that are whole screens of their own in Web K (channel type, invite links,
 * reactions, direct messages) stand as rows of a list with their current value; a click on a row
 * opens Web K's tab for it.
 */
export function VKChannelEditModal(props: {peerId: PeerId, onClose: () => void}) {
  const peers = usePeers();
  const channel = () => peers[props.peerId] as Chat.channel | undefined;
  const fullPeer = useFullPeer(props.peerId) as () => ChatFull.channelFull | undefined;

  const [title, setTitle] = createSignal<string>();
  const [about, setAbout] = createSignal<string>();
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string>();

  // the form takes the saved values once, when they are known; typing is never overwritten
  createEffect(() => {
    if(title() === undefined && channel()) setTitle(channel()!.title);
  });
  createEffect(() => {
    if(about() === undefined && fullPeer()) setAbout(fullPeer()!.about ?? '');
  });

  const changedTitle = () => title() !== undefined && title()!.trim() !== channel()?.title;
  const changedAbout = () => about() !== undefined && fullPeer() !== undefined && about()!.trim() !== (fullPeer()!.about ?? '');
  const canSave = () => !saving() && !!title()?.trim() && (changedTitle() || changedAbout());

  const save = async(e: Event) => {
    e.preventDefault();
    if(!canSave()) return;
    setSaving(true);
    setError(undefined);
    try {
      const chatId = props.peerId.toChatId();
      if(changedTitle()) {
        await rootScope.managers.appChatsManager.editTitle(chatId, title()!.trim());
      }
      if(changedAbout()) {
        await rootScope.managers.appChatsManager.editAbout(chatId, about()!.trim());
      }
      toast('Изменения сохранены');
      props.onClose();
    } catch(err) {
      console.error('VKgram: saving the channel failed', err);
      const type = apiErrorType(err);
      setError(type.includes('CHAT_NOT_MODIFIED') ? 'Ничего не изменилось.' :
        type.includes('CHAT_ADMIN_REQUIRED') ? 'У вас нет прав менять этот канал.' :
          'Не удалось сохранить изменения.');
      setSaving(false);
    }
  };

  const openTab = async() => {
    props.onClose();
    try {
      await openWebKChannelTab('edit', props.peerId);
    } catch{
      toast('Не удалось открыть настройки');
    }
  };

  const reactionsText = () => {
    const reactions = fullPeer()?.available_reactions;
    if(!reactions) return undefined;
    if(reactions._ === 'chatReactionsNone') return 'Выключены';
    if(reactions._ === 'chatReactionsAll') return 'Все';
    return String((reactions as any).reactions?.length ?? 0);
  };

  const username = () => channel() ? getPeerActiveUsernames(channel() as any)[0] : undefined;
  // the same form serves a group: the wording follows the peer
  const isGroup = () => {
    const c = channel() as Chat.channel | Chat.chat | undefined;
    return !c || c._ === 'chat' || !!c.pFlags?.megagroup;
  };
  const rows = () => [
    {title: 'Тип канала', value: username() ? 'Публичный · @' + username() : 'Частный'},
    {title: 'Пригласительные ссылки', value: fullPeer()?.exported_invite ? 'Есть' : undefined},
    {title: 'Реакции', value: reactionsText()},
    {title: 'Личные сообщения', value: undefined as string | undefined}
  ];

  return (
    <VKModal title={isGroup() ? 'Изменить группу' : 'Изменить канал'} width={440} closeDisabled={saving()} onClose={props.onClose}>
      <form class="vk-modal-form" onSubmit={save}>
        <div class="vk-modal-body vk-modal-fields">
          <div class="vk-channel-edit-head">
            <AvatarNewTsx peerId={props.peerId} size={64} />
            <div class="vk-page-text-secondary">
              Фотографию можно сменить в настройках Telegram.
            </div>
          </div>

          <div class="vk-field-row">
            <label for="vk-channel-title">Название</label>
            <input
              id="vk-channel-title"
              class="vk-input"
              type="text"
              maxLength={TITLE_MAX}
              value={title() ?? ''}
              disabled={title() === undefined}
              onInput={(e) => setTitle(e.currentTarget.value)}
            />
          </div>
          <div class="vk-field-row">
            <label for="vk-channel-about">Описание</label>
            <div class="vk-field-stack">
              <textarea
                id="vk-channel-about"
                class="vk-textarea"
                rows={5}
                maxLength={ABOUT_MAX}
                value={about() ?? ''}
                disabled={about() === undefined}
                onInput={(e) => setAbout(e.currentTarget.value)}
              />
              <p class="vk-settings-caption vk-page-text-secondary">{(about() ?? '').length} / {ABOUT_MAX}. Необязательно.</p>
            </div>
          </div>

          <h3 class="vk-settings-legend vk-channel-edit-legend">Настройки</h3>
          <ul class="vk-info-list">
            <For each={rows()}>
              {(row) => (
                <li>
                  <button type="button" class="vk-info-row" onClick={openTab}>
                    <span class="vk-info-row-title">{row.title}</span>
                    <span class="vk-info-row-value">{row.value}</span>
                    <VKIcon name="chevron" size={14} />
                  </button>
                </li>
              )}
            </For>
          </ul>

          <Show when={error()}>
            <p class="vk-modal-error" role="alert">{error()}</p>
          </Show>
        </div>
        <div class="vk-modal-foot">
          <button type="button" class="vk-button vk-button-secondary" disabled={saving()} onClick={props.onClose}>Отмена</button>
          <button type="submit" class="vk-button" disabled={!canSave()}>{saving() ? 'Сохранение…' : 'Сохранить'}</button>
        </div>
      </form>
    </VKModal>
  );
}

/**
 * «Новый канал»: the name and the description, and `appChatsManager.createChannel` — the call Web K's
 * own «New Channel» tab makes. A channel is created as a broadcast one; when it exists, `onCreated`
 * gets its id (the personal-channel block then points the profile at it).
 */
export function VKChannelCreateModal(props: {onCreated?: (chatId: ChatId) => void, onClose: () => void}) {
  const [title, setTitle] = createSignal('');
  const [about, setAbout] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string>();

  const create = async(e: Event) => {
    e.preventDefault();
    if(saving() || !title().trim()) return;
    setSaving(true);
    setError(undefined);
    try {
      const chatId = await (rootScope.managers.appChatsManager as any).createChannel({
        title: title().trim(),
        about: about().trim(),
        broadcast: true
      }) as ChatId;
      toast('Канал создан');
      props.onCreated?.(chatId);
      props.onClose();
    } catch(err) {
      console.error('VKgram: creating the channel failed', err);
      setError(apiErrorType(err).includes('CHANNELS_TOO_MUCH') ?
        'У вас уже максимальное число каналов.' :
        'Не удалось создать канал.');
      setSaving(false);
    }
  };

  const initial = () => Array.from(title().trim())[0]?.toUpperCase();

  return (
    <VKModal title="Новый канал" width={440} closeDisabled={saving()} onClose={props.onClose}>
      <form class="vk-modal-form" onSubmit={create}>
        <div class="vk-modal-body vk-modal-fields">
          <div class="vk-channel-edit-head">
            <div class="vk-channel-create-avatar" aria-hidden="true">
              <Show when={initial()} fallback={<VKIcon name="channels" size={26} />}>
                {initial()}
              </Show>
            </div>
            <div class="vk-field-stack">
              <label class="vk-channel-create-label" for="vk-new-channel-title">Название</label>
              <input
                id="vk-new-channel-title"
                class="vk-input"
                type="text"
                maxLength={TITLE_MAX}
                autocomplete="off"
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
              />
            </div>
          </div>

          <div class="vk-field-stack">
            <label class="vk-channel-create-label" for="vk-new-channel-about">Описание</label>
            <textarea
              id="vk-new-channel-about"
              class="vk-textarea"
              rows={4}
              maxLength={ABOUT_MAX}
              placeholder="О чём этот канал (необязательно)"
              value={about()}
              onInput={(e) => setAbout(e.currentTarget.value)}
            />
            <p class="vk-settings-caption vk-page-text-secondary">{about().length} / {ABOUT_MAX}</p>
          </div>

          <p class="vk-settings-caption vk-page-text-secondary">
            Фотографию, тип канала и ссылку можно задать после создания.
          </p>

          <Show when={error()}>
            <p class="vk-modal-error" role="alert">{error()}</p>
          </Show>
        </div>
        <div class="vk-modal-foot">
          <button type="button" class="vk-button vk-button-secondary" disabled={saving()} onClick={props.onClose}>Отмена</button>
          <button type="submit" class="vk-button" disabled={saving() || !title().trim()}>{saving() ? 'Создание…' : 'Создать канал'}</button>
        </div>
      </form>
    </VKModal>
  );
}

export const openVKChannelEdit = (peerId: PeerId) =>
  openVKModal((p) => <VKChannelEditModal peerId={peerId} onClose={p.onClose} />);

export const openVKChannelCreate = (onCreated?: (chatId: ChatId) => void) =>
  openVKModal((p) => <VKChannelCreateModal onCreated={onCreated} onClose={p.onClose} />);
