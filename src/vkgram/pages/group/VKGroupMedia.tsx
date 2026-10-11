import {createEffect, createMemo, createSignal, For, Match, Show, Switch} from 'solid-js';
import type {Message} from '@layer';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import VKChannelMedia, {KINDS, VKChannelMaterialsKind} from '@/vkgram/pages/channel/VKChannelMedia';
import createChannelHistory from '@/vkgram/pages/channel/createChannelHistory';
import peerTitle from '@/vkgram/utils/peerTitle';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import {openVKChat} from '@/vkgram/pages/messages/openChat';

type GroupMediaTab = VKChannelMaterialsKind | 'saved';

const TABS: GroupMediaTab[] = ['media', 'saved', 'files', 'links', 'music'];

const TAB_TITLES: {[tab in GroupMediaTab]: string} = {
  media: KINDS.media.title,
  saved: 'Сохранённое',
  files: KINDS.files.title,
  links: KINDS.links.title,
  music: KINDS.music.title
};

/**
 * «Сохранённое»: the messages the user saved from this group — Web K reads
 * them the same way, as the user's own Saved Messages dialog threaded by the
 * group's id (`getHistory({peerId: myId, threadId: peerId})`). A row shows the
 * sender, the text (or the fact of an attachment) and the date; a click opens
 * «Избранное» on that message.
 */
function VKGroupSavedTab(props: {peerId: PeerId, onCount: (count: number) => void}) {
  const peers = usePeers();
  const history = createChannelHistory({
    peerId: () => rootScope.myId as PeerId,
    threadId: props.peerId as unknown as number,
    pageSize: 20
  });

  createEffect(() => {
    if(history.status() === 'loaded') props.onCount(history.count() ?? history.messages().length);
  });

  const saved = createMemo(() => history.messages().filter((m): m is Message.message => m._ === 'message'));

  const snippetOf = (message: Message.message) => {
    if(message.message?.trim()) {
      const text = message.message.trim();
      return text.length > 80 ? text.slice(0, 80) + '…' : text;
    }
    return 'Вложение';
  };

  return (
    <Show
      when={history.status() !== 'loading'}
      fallback={<p class="vk-page-text vk-page-text-secondary">Загрузка…</p>}
    >
      <Show when={saved().length} fallback={<p class="vk-page-text vk-page-text-secondary">Ничего не сохранено.</p>}>
        <ul class="vk-media-rows">
          <For each={saved()}>
            {(message) => {
              const fromId = (message.fromId ?? message.peerId) as PeerId;
              return (
                <li class="vk-media-row">
                  <button
                    type="button"
                    class="vk-group-saved-row"
                    onClick={() => openVKChat(rootScope.myId as PeerId, {mid: message.mid, kind: 'jump'})}
                  >
                    <span class="vk-group-saved-name">{peerTitle(peers[fromId]) ?? '…'}</span>
                    <span class="vk-group-saved-text">{snippetOf(message)}</span>
                    <span class="vk-group-saved-date">{formatDateAccordingToTodayNew(new Date(message.date * 1000))}</span>
                  </button>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </Show>
  );
}

/**
 * «Медиа» of a group page, with the material tabs of the original Telegram's
 * profile: «Медиа», «Сохранённое», «Файлы», «Ссылки», «Музыка» (the members
 * have their own block in the narrow column). The material tabs are the
 * channel's own blocks (the same server-side filters Web K's shared media
 * uses); «Сохранённое» is the user's saved-from-this-group messages. Every
 * panel stays mounted, the inactive one is only hidden; a type the group turns
 * out to have none of loses its tab, and a block with no tabs at all is not
 * drawn.
 */
export default function VKGroupMedia(props: {peerId: PeerId}) {
  const [tab, setTab] = createSignal<VKChannelMaterialsKind | 'saved'>('media');
  const [counts, setCounts] = createSignal<Partial<Record<VKChannelMaterialsKind | 'saved', number>>>({});

  const setCount = (kind: VKChannelMaterialsKind | 'saved', count: number) => {
    setCounts((prev) => prev[kind] === count ? prev : {...prev, [kind]: count});
  };

  // a type is offered while its count is unknown, and after that only when there is something
  const tabVisible = (item: VKChannelMaterialsKind | 'saved') => {
    const count = counts()[item];
    return count === undefined || count > 0;
  };

  const hasAny = () => TABS.some(tabVisible);

  // the active tab can turn out empty — step to the first one that isn't
  createEffect(() => {
    if(tabVisible(tab())) return;
    const next = TABS.find(tabVisible);
    if(next) setTab(next);
  });

  const onKeyDown = (e: KeyboardEvent) => {
    if(e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const visible = TABS.filter(tabVisible);
    const next = visible[(visible.findIndex((item) => item === tab()) + 1) % visible.length];
    setTab(next);
    document.getElementById(`vk-group-media-tab-${next}`)?.focus();
  };

  return (
    <Show when={hasAny()}>
      <section class="vk-block vk-group-media" aria-label="Медиа">
        <div class="vk-tabs" role="tablist" onKeyDown={onKeyDown}>
          <For each={TABS}>
            {(item) => (
              <Show when={tabVisible(item)}>
                <button
                  type="button"
                  id={`vk-group-media-tab-${item}`}
                  class="vk-tab"
                  classList={{'is-active': tab() === item}}
                  role="tab"
                  aria-selected={tab() === item}
                  aria-controls={`vk-group-media-panel-${item}`}
                  tabindex={tab() === item ? 0 : -1}
                  onClick={() => setTab(item)}
                >
                  {TAB_TITLES[item]}
                </button>
              </Show>
            )}
          </For>
        </div>

        <For each={TABS}>
          {(item) => (
            <div
              id={`vk-group-media-panel-${item}`}
              role="tabpanel"
              aria-labelledby={`vk-group-media-tab-${item}`}
              hidden={tab() !== item}
            >
              <Switch>
                <Match when={item === 'saved'}>
                  <VKGroupSavedTab peerId={props.peerId} onCount={(count) => setCount('saved', count)} />
                </Match>

                <Match when={true}>
                  <VKChannelMedia
                    peerId={props.peerId}
                    kind={item as VKChannelMaterialsKind}
                    embedded
                    strip={item === 'media'}
                    onCount={(count) => setCount(item as VKChannelMaterialsKind, count)}
                  />
                </Match>
              </Switch>
            </div>
          )}
        </For>
      </section>
    </Show>
  );
}
