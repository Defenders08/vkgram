import {createEffect, createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch} from 'solid-js';
import type {Message, MessageEntity, MessageMedia, WebPage} from '@layer';
import type {MyInputMessagesFilter} from '@appManagers/appMessagesManager';
import formatNumber from '@helpers/number/formatNumber';
import createChannelHistory from '@/vkgram/pages/channel/createChannelHistory';
import VKChannelMediaModal from '@/vkgram/components/VKChannelMediaModal';
import VKChannelPostMedia from '@/vkgram/pages/channel/VKChannelPostMedia';
import {VKAudioRows} from '@/vkgram/components/VKAudioItem';
import openTgLink, {openExternalLink} from '@/vkgram/utils/openTgLink';

export type VKChannelMaterialsKind = 'media' | 'files' | 'links' | 'music';

export const KINDS: {[kind in VKChannelMaterialsKind]: {
  title: string,
  filter: MyInputMessagesFilter,
  limit: number,
  layout: 'grid' | 'list' | 'links'
}} = {
  media: {title: 'Медиа', filter: 'inputMessagesFilterPhotoVideo', limit: 8, layout: 'grid'},
  files: {title: 'Файлы', filter: 'inputMessagesFilterDocument', limit: 3, layout: 'list'},
  links: {title: 'Ссылки', filter: 'inputMessagesFilterUrl', limit: 5, layout: 'links'},
  music: {title: 'Музыка', filter: 'inputMessagesFilterMusic', limit: 3, layout: 'list'}
};

// a link of a message: the preview's page when there is one, else the first url in the text
function getLink(message: Message.message) {
  const webPage = (message.media as MessageMedia.messageMediaWebPage)?.webpage as WebPage.webPage;
  if(webPage?._ === 'webPage') {
    return {url: webPage.url, title: webPage.title || webPage.site_name || webPage.display_url || webPage.url};
  }

  const entities = (message.totalEntities ?? message.entities ?? []) as MessageEntity[];
  const entity = entities.find((entity) => entity._ === 'messageEntityUrl' || entity._ === 'messageEntityTextUrl');
  if(!entity) return;

  if(entity._ === 'messageEntityTextUrl') return {url: entity.url, title: entity.url};
  const text = message.message.slice(entity.offset, entity.offset + entity.length);
  return {url: /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : 'https://' + text, title: text};
}

/**
 * The items of a materials block in one of the block's layouts — shared by the
 * channel block and the «Показать все» window.
 */
export function VKChannelMediaItems(props: {kind: VKChannelMaterialsKind, messages: Message.message[]}) {
  const config = KINDS[props.kind];
  return (
    <Switch>
      <Match when={config.layout === 'grid'}>
        {/* the tile pattern of «Фотографий» (VKMediaBrowser): Web K's own box sizing
            expands a bare 120px box to 200–368px outside a chat bubble
            (`setAttachmentSize`), a square tile overrides it */}
        <div class="vk-media-grid">
          <For each={props.messages}>
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
          when={props.kind === 'music'}
          fallback={
            <div class="vk-channel-files-list">
              <For each={props.messages}>
                {(message) => <VKChannelPostMedia message={message} />}
              </For>
            </div>
          }
        >
          <VKAudioRows messages={props.messages} />
        </Show>
      </Match>

      <Match when={config.layout === 'links'}>
        <ul class="vk-channel-links-list">
          <For each={props.messages.map(getLink).filter(Boolean)}>
            {(link) => (
              <li>
                <button
                  type="button"
                  class="vk-link-button vk-channel-link"
                  onClick={async() => {
                    if(!(await openTgLink(link.url))) openExternalLink(link.url);
                  }}
                >
                  {link.title}
                </button>
              </li>
            )}
          </For>
        </ul>
      </Match>
    </Switch>
  );
}

/**
 * One material block of a channel («Файлы», «Ссылки», «Музыка»), or — with
 * `embedded` — just the content of «Медиа» inside the «Лента» tabs (no block
 * frame, no title: the feed draws those): the latest
 * few items of the same server-side filter Web K's «Shared media» uses, and
 * the total from the same answer. A block with nothing to show is not drawn;
 * the rest of the material is Web K's own shared-media tab in a modal over the page («Показать все»).
 * `strip` (the group page's «Медиа» tab): the photos and videos in one row
 * that scrolls sideways, «Показать все» its last cell instead of the link below.
 */
export default function VKChannelMedia(props: {peerId: PeerId, kind: VKChannelMaterialsKind, embedded?: boolean, strip?: boolean, onCount?: (count: number) => void}) {
  const config = KINDS[props.kind];
  const history = createChannelHistory({
    peerId: () => props.peerId,
    inputFilter: config.filter,
    pageSize: config.limit
  });

  const items = createMemo(() => (history.messages().filter((m: any) => m._ === 'message') as Message.message[]).slice(0, config.limit));
  const total = () => history.count() ?? items().length;

  // the block's owner may sort its content by type (the group page's «Медиа» tabs)
  createEffect(() => {
    if(history.status() === 'loaded') props.onCount?.(total());
  });

  const [isModalOpen, setModalOpen] = createSignal(false);

  const content = () => (
    <>
      <Show
        when={props.strip}
        fallback={<VKChannelMediaItems kind={props.kind} messages={items()} />}
      >
        {/* one row of square tiles that scrolls sideways; «Показать все» is its
            last cell, brought in by the scroll (a tile-sized button, so the row
            stays even) */}
        <div class="vk-media-strip">
          <For each={items()}>
            {(message) => (
              <div class="vk-media-tile">
                <VKChannelPostMedia message={message} boxSize={240} />
              </div>
            )}
          </For>

          <Show when={total() > items().length}>
            <button type="button" class="vk-media-strip-more" onClick={() => setModalOpen(true)}>
              Показать все
            </button>
          </Show>
        </div>
      </Show>

      <Show when={!props.strip && total() > items().length}>
        <button type="button" class="vk-link-button vk-channel-more" onClick={() => setModalOpen(true)}>
          Показать все
        </button>
      </Show>

      <Show when={isModalOpen()}>
        <VKChannelMediaModal
          peerId={props.peerId}
          kind={props.kind}
          total={total()}
          onClose={() => setModalOpen(false)}
        />
      </Show>
    </>
  );

  return (
    <Show
      when={props.embedded}
      fallback={
        <Show when={history.status() === 'loaded' && items().length}>
          <section class={`vk-block vk-channel-materials vk-channel-${props.kind}`}>
            <h2 class="vk-block-title">
              {config.title}
              <span class="vk-page-text-secondary vk-list-count"> {formatNumber(total(), 1)}</span>
            </h2>
            {content()}
          </section>
        </Show>
      }
    >
      <Show when={history.status() !== 'loading'} fallback={<p class="vk-page-text vk-page-text-secondary">Загрузка…</p>}>
        <Show when={items().length} fallback={<p class="vk-page-text vk-page-text-secondary">Нет медиа.</p>}>
          {content()}
        </Show>
      </Show>
    </Show>
  );
}
