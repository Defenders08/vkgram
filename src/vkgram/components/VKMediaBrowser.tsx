import {createEffect, createMemo, createSignal, For, JSX, Match, on, onCleanup, onMount, Show, Switch} from 'solid-js';
import type {Accessor} from 'solid-js';
import type {Message} from '@layer';
import type {MyInputMessagesFilter} from '@appManagers/appMessagesManager';
import rootScope from '@lib/rootScope';
import {usePeers} from '@stores/peers';
import {formatDateAccordingToTodayNew} from '@helpers/date';
import {getVKSection, VKSectionId} from '@/vkgram/sections';
import {openVKChat} from '@/vkgram/pages/messages/openChat';
import createMediaSearch from '@/vkgram/hooks/createMediaSearch';
import createChannelHistory from '@/vkgram/pages/channel/createChannelHistory';
import VKChannelPostMedia from '@/vkgram/pages/channel/VKChannelPostMedia';
import VKTabs, {type VKTabItem} from '@/vkgram/components/VKTabs';
import VKSearchField from '@/vkgram/components/VKSearchField';
import VKEmptyState from '@/vkgram/components/VKEmptyState';
import {VKAudioRows} from '@/vkgram/components/VKAudioItem';
import type {VKIconName} from '@/vkgram/components/VKIcons';

// how long typing may pause before the search is sent (ms)
const SEARCH_DELAY = 400;

export type VKMediaKind = 'media' | 'photos' | 'videos' | 'docs' | 'music' | 'voice';
export type VKMediaSource = 'search' | 'saved';

const KINDS: {[kind in VKMediaKind]: {
  filter: MyInputMessagesFilter,
  layout: 'grid' | 'list',
  icon: VKIconName,
  placeholder: string,
  empty: {[source in VKMediaSource]: string}
}} = {
  // photos and videos together («Медиа» of the search block — Telegram's own combined filter)
  media: {
    filter: 'inputMessagesFilterPhotoVideo',
    layout: 'grid',
    icon: 'photos',
    placeholder: 'Поиск медиа',
    empty: {search: 'Медиа не найдено', saved: 'В «Избранном» нет медиа'}
  },
  photos: {
    filter: 'inputMessagesFilterPhotos',
    layout: 'grid',
    icon: 'photos',
    placeholder: 'Поиск фотографий',
    empty: {search: 'Фотографий не найдено', saved: 'В «Избранном» нет фотографий'}
  },
  videos: {
    filter: 'inputMessagesFilterVideo',
    layout: 'grid',
    icon: 'videos',
    placeholder: 'Поиск видеозаписей',
    empty: {search: 'Видеозаписей не найдено', saved: 'В «Избранном» нет видеозаписей'}
  },
  docs: {
    filter: 'inputMessagesFilterDocument',
    layout: 'list',
    icon: 'docs',
    placeholder: 'Поиск файлов',
    empty: {search: 'Файлов не найдено', saved: 'В «Избранном» нет файлов'}
  },
  music: {
    filter: 'inputMessagesFilterMusic',
    layout: 'list',
    icon: 'audio',
    placeholder: 'Поиск музыки',
    empty: {search: 'Музыки не найдено', saved: 'В «Избранном» нет музыки'}
  },
  voice: {
    filter: 'inputMessagesFilterVoice',
    layout: 'list',
    icon: 'messages',
    placeholder: 'Поиск голосовых сообщений',
    empty: {search: 'Голосовых сообщений не найдено', saved: 'В «Избранном» нет голосовых сообщений'}
  }
};

// «из <chat> · <date>» under a file: where it was found, a click opens it there
function MediaSource(props: {message: Message.message}) {
  const peers = usePeers();
  const title = () => {
    if(props.message.peerId === rootScope.myId) return 'Избранное';
    const peer = peers[props.message.peerId] as {title?: string, first_name?: string, last_name?: string};
    return peer?.title ?? [peer?.first_name, peer?.last_name].filter(Boolean).join(' ');
  };

  return (
    <button
      type="button"
      class="vk-media-row-source"
      title="Показать в чате"
      onClick={() => openVKChat(props.message.peerId, {mid: props.message.mid, kind: 'jump'})}
    >
      <span class="vk-media-row-source-title">{title()}</span>
      <span>{'· '}{formatDateAccordingToTodayNew(new Date(props.message.date * 1000))}</span>
    </button>
  );
}

/**
 * One list of media: found by Telegram's global search (`source: 'search'`,
 * `createMediaSearch`, with a search field) or kept in «Избранное» — the
 * user's saved messages (`source: 'saved'`, `createChannelHistory` over them,
 * the same filtered search Web K's shared media runs). Only the given kind:
 * photos, videos, files, music or voice messages.
 *
 * Everything is drawn by Web K's own wrappers (`VKChannelPostMedia`): a photo
 * or a video opens the media viewer, a file downloads, music and voice play in
 * Web K's global player. Older items come as the end of the list comes near.
 */
export function VKMediaList(props: {
  kind: VKMediaKind,
  source: VKMediaSource,
  // the search text owned by the page (its search card above the content); without it
  // the list renders a search field of its own above the rows
  query?: Accessor<string>,
  onQueryInput?: (value: string) => void
}) {
  const config = KINDS[props.kind];
  // music and voice messages are drawn as audio rows (VKAudioRows); Web K's global player is what plays
  const isAudio = props.kind === 'music' || props.kind === 'voice';

  const [ownQuery, setOwnQuery] = createSignal('');
  const query = () => (props.query ? props.query() : ownQuery());
  const setQuery = (value: string) => (props.onQueryInput ? props.onQueryInput(value) : setOwnQuery(value));
  // what is searched: the query once typing pauses
  const [searched, setSearched] = createSignal('');
  createEffect(on(query, (value) => {
    const timer = window.setTimeout(() => setSearched(value.trim()), SEARCH_DELAY);
    onCleanup(() => clearTimeout(timer));
  }, {defer: true}));

  const list = props.source === 'search' ?
    createMediaSearch({query: searched, inputFilter: config.filter}) :
    createChannelHistory({peerId: () => rootScope.myId, inputFilter: config.filter, pageSize: 30});

  const [sentinel, setSentinel] = createSignal<HTMLElement>();
  createEffect(() => {
    const element = sentinel();
    // a new page re-arms the observer: a sentinel still in view has nothing to report by itself
    void list.messages().length;
    if(!element || list.status() !== 'loaded' || list.isEnd() || list.isLoadingMore()) return;

    const observer = new IntersectionObserver((entries) => {
      if(entries.some((entry) => entry.isIntersecting)) list.loadMore();
    }, {rootMargin: '400px'});
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

  return (
    // data-kind: lets a section (e.g. «Аудиозаписи») style its music and voice rows apart
    <div class="vk-media-list" data-kind={props.kind}>
      <Show when={props.source === 'search' && !props.query}>
        {/* the search as its own block, like in «Сообщениях» */}
        <div class="vk-block vk-messages-search-block">
          <div class="vk-messages-search">
            <VKSearchField value={query()} placeholder={config.placeholder} onInput={setQuery} />
          </div>
        </div>
      </Show>

      <Switch>
        <Match when={list.status() === 'loading'}>
          <p class="vk-page-text vk-page-text-secondary vk-list-empty">Загрузка…</p>
        </Match>

        <Match when={list.status() === 'error'}>
          <p class="vk-page-text vk-page-text-secondary vk-list-empty">
            Не удалось загрузить.{' '}
            <button type="button" class="vk-link-button" onClick={() => list.reload()}>Повторить</button>
          </p>
        </Match>

        <Match when={!list.messages().length}>
          <VKEmptyState
            icon={config.icon}
            title={config.empty[props.source]}
            description={props.source === 'search' ?
              (searched() ? 'Попробуйте другой запрос.' : 'Здесь появятся медиа из ваших чатов.') :
              'Сохраняйте публикации и сообщения в «Избранное» — они появятся здесь.'}
          />
        </Match>

        <Match when={config.layout === 'grid'}>
          <div class="vk-media-grid">
            <For each={(list.messages() as Message.message[]).filter(m => m._ === 'message')}>
              {(message) => (
                <div class="vk-media-tile">
                  <VKChannelPostMedia message={message} boxSize={240} />
                </div>
              )}
            </For>
          </div>
        </Match>

        <Match when={config.layout === 'list'}>
          <Show
            when={isAudio}
            fallback={
              <ul class="vk-media-rows">
                <For each={(list.messages() as Message.message[]).filter(m => m._ === 'message')}>
                  {(message) => (
                    <li class="vk-media-row">
                      <VKChannelPostMedia message={message} asFile={props.kind === 'docs'} />
                      <MediaSource message={message} />
                    </li>
                  )}
                </For>
              </ul>
            }
          >
            <VKAudioRows messages={(list.messages() as any[]).filter((m: any) => m._ === 'message') as Message.message[]} />
          </Show>
        </Match>
      </Switch>

      <div ref={setSentinel} class="vk-list-sentinel" />
      <Show when={list.isLoadingMore()}>
        <p class="vk-page-text vk-page-text-secondary">Загрузка…</p>
      </Show>
    </div>
  );
}

export type VKMediaTab<T extends string> = {
  id: T,
  title: string,
  // the tab's list searches: the page renders the search card above the content
  // (the look of the search block of «Сообщений») and hands the query to `render`
  searchPlaceholder?: string,
  render: (search: {query: Accessor<string>, onInput: (value: string) => void}) => JSX.Element
};

/**
 * A block of tabs of its own next to the section's main one («Папки» of «Аудиозаписи»): a title,
 * its tabs and a «+» that adds one. Only one tab is open in the whole page — the main block and the
 * extra ones are one set of tabs, drawn in separate blocks.
 */
export type VKMediaTabGroup<T extends string> = {
  // the name of the block for screen readers (it is not drawn)
  title: string,
  tabs: VKMediaTab<T>[],
  onAdd?: () => void,
  addLabel?: string,
  // a control at the right end of the strip (the settings of the group's folders…);
  // with `onAdd` and `addInFooter` it shares the row under the tabs with the «+»
  actions?: JSX.Element,
  // a block with no tabs is a card: an icon, a title, a hint and a button that calls `onAdd`
  empty?: {title: string, description: string, button: string}
};

// the last open tab of each section: coming back to a section opens it again
const lastTabs = new Map<VKSectionId, string>();

// the block of tabs of a group; with no tabs — a card that invites to add the first one
function VKTabGroup<T extends string>(props: {
  group: VKMediaTabGroup<T>,
  active: T | undefined,
  idPrefix: string,
  onChange: (id: T) => void,
  // the side-block look: «+» at the right end of the row under the tabs
  addInFooter?: boolean,
  // the mobile look: «+» pinned at the right end of the strip itself
  addPinned?: boolean
}) {
  const items = () => props.group.tabs.map(({id, title}) => ({id, title}));

  return (
    <Show
      when={props.group.tabs.length || !props.group.empty}
      fallback={
        <div class="vk-media-group-empty">
          <p class="vk-media-group-empty-title">{props.group.empty.title}</p>
          <p class="vk-media-group-empty-text">{props.group.empty.description}</p>
          <button type="button" class="vk-link-button vk-media-group-empty-button" onClick={() => props.group.onAdd?.()}>
            {props.group.empty.button}
          </button>
        </div>
      }
    >
      <VKTabs
        tabs={items()}
        active={props.active as T}
        onChange={props.onChange}
        idPrefix={props.idPrefix}
        label={props.group.title}
        onAdd={props.group.onAdd}
        addLabel={props.group.addLabel}
        addInFooter={props.addInFooter}
        addPinned={props.addPinned}
        actions={props.group.actions}
      />
    </Show>
  );
}

/**
 * A media section of the left menu («Фотографии», «Видеозаписи», «Документы»,
 * «Аудиозаписи»): the title and Telegram-like tabs over the content — one list
 * per tab, mounted anew when the tab is opened. `top`: a block over the title that is
 * not part of a tab. `groups`: more blocks of tabs after the main one; `openTab` opens a tab
 * from the outside (a new object each time, so the same tab can be asked for again).
 */
export default function VKMediaPage<T extends string>(props: {
  section: VKSectionId,
  tabs: VKMediaTab<T>[],
  // a block of its own over the title block, outside the tabs: it stays as the tab changes
  top?: JSX.Element,
  groups?: VKMediaTabGroup<T>[],
  openTab?: {id: T}
}) {
  const section = () => getVKSection(props.section);
  const idPrefix = `vk-${props.section}`;
  const [tab, setTab] = createSignal<T>((lastTabs.get(props.section) as T) ?? props.tabs[0].id);
  createEffect(() => lastTabs.set(props.section, tab()));

  const allTabs = () => [...props.tabs, ...(props.groups ?? []).flatMap((group) => group.tabs)];
  // a tab that is gone (a deleted folder) leaves the first one open
  const current = () => allTabs().find((item) => item.id === tab()) ?? props.tabs[0];

  createEffect(on(() => props.openTab, (request) => {
    if(request && allTabs().some((item) => item.id === request.id)) setTab(() => request.id);
  }, {defer: true}));

  // Like the News page, desktop and mobile use separate tab layouts. Only one
  // is mounted at a time so the same tab state is never represented by two
  // interactive tablists.
  const [isDesktop, setIsDesktop] = createSignal(
    typeof window !== 'undefined' && window.matchMedia('(min-width: 601px)').matches
  );
  onMount(() => {
    const media = window.matchMedia('(min-width: 601px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener?.('change', update);
    onCleanup(() => media.removeEventListener?.('change', update));
  });

  const toItems = (list: VKMediaTab<T>[]) => list.map(({id, title}) => ({id, title}));
  const tabs = () => toItems(props.tabs);
  // a block that does not hold the open tab has none active
  const activeIn = (list: VKMediaTab<T>[]) => list.some((item) => item.id === current().id) ? current().id : undefined;

  // the search of the open tab («Поиск» и им подобным): the card above the content,
  // the query handed down to the tab's list
  const [searchQuery, setSearchQuery] = createSignal('');
  createEffect(on(() => current().id, () => setSearchQuery(''), {defer: true}));
  const search = () => ({query: searchQuery, onInput: setSearchQuery});

  // the mobile strip: the section tabs and the folder groups are one line that scrolls
  // sideways (the look of «Сообщений»); the «+» of the first group that can add is pinned
  const mobileTabs = createMemo<VKTabItem<T>[]>(() => [
    ...tabs(),
    ...(props.groups ?? []).flatMap((group) => group.tabs.map(({id, title}) => ({id, title})))
  ]);
  const mobileAddGroup = () => (props.groups ?? []).find((group) => group.onAdd);

  return (
    <div class={`vk-page vk-media-page vk-${props.section}`}>
      <div class="vk-media-layout">
        <main class="vk-media-main">
          {props.top}
          {/* the tabs (and the folder groups) in the look of «Сообщений»: one continuous
              block; on a phone the search of the open tab is its top block (under it the
              content card), on a desktop the search is a card of its own */}
          <Show when={!isDesktop()}>
            <div class="vk-messages-controls-block">
              <Show when={current().searchPlaceholder}>
                <div class="vk-block vk-messages-search-block">
                  <div class="vk-messages-search">
                    <VKSearchField value={searchQuery()} placeholder={current().searchPlaceholder} onInput={setSearchQuery} />
                  </div>
                </div>
              </Show>
              <div class="vk-media-mobile-tabs">
                <VKTabs
                  tabs={mobileTabs()}
                  active={current().id}
                  onChange={(id) => setTab(() => id)}
                  idPrefix={`${idPrefix}-mobile`}
                  label={section().title}
                  addLabel={mobileAddGroup()?.addLabel}
                  addPinned
                  onAdd={() => mobileAddGroup()?.onAdd?.()}
                />
              </div>
            </div>
          </Show>
          <Show when={isDesktop() && current().searchPlaceholder}>
            <div class="vk-block vk-messages-search-block">
              <div class="vk-messages-search">
                <VKSearchField value={searchQuery()} placeholder={current().searchPlaceholder} onInput={setSearchQuery} />
              </div>
            </div>
          </Show>
          <section class="vk-block vk-page-block" aria-labelledby={`${idPrefix}-title`}>
            <h1 id={`${idPrefix}-title`} class="vk-page-title vk-visually-hidden">{section().title}</h1>
            <Show when={current()} keyed>
              {(item) => (
                <div id={`${idPrefix}-panel-${item.id}`} role="tabpanel" aria-labelledby={`${idPrefix}-mobile-tab-${item.id} ${idPrefix}-desktop-tab-${item.id}`}>
                  {item.render(search())}
                </div>
              )}
            </Show>
          </section>
        </main>

        <Show when={isDesktop()}>
          <aside class="vk-media-side" aria-label={`Навигация: ${section().title}`}>
            <section class="vk-block vk-media-side-block">
              <VKTabs
                tabs={tabs()}
                active={current().id}
                onChange={(id) => setTab(() => id)}
                idPrefix={`${idPrefix}-desktop`}
                label={section().title}
              />
            </section>
            <For each={props.groups}>
              {(group) => (
                // vk-media-side-group: the block of a group (unlike the main one) holds the
                // actions row under its tabs — the divider and the flush row come with it
                <section class="vk-block vk-media-side-block vk-media-side-group">
                  <VKTabGroup
                    group={group}
                    active={activeIn(group.tabs)}
                    idPrefix={`${idPrefix}-desktop`}
                    onChange={(id) => setTab(() => id)}
                    addInFooter
                  />
                </section>
              )}
            </For>
          </aside>
        </Show>
      </div>
    </div>
  );
}
