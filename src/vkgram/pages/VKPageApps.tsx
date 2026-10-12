import {createEffect, createMemo, createSignal, For, onCleanup, Show} from 'solid-js';
import type {User} from '@layer';
import {usePeers} from '@stores/peers';
import {AvatarNewTsx} from '@components/avatarNew';
import formatNumber from '@helpers/number/formatNumber';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import matchesQuery from '@/vkgram/utils/matchesQuery';
import createAppsCatalog, {openVKMiniApp} from '@/vkgram/hooks/createAppsCatalog';
import VKSearchField from '@/vkgram/components/VKSearchField';
import VKEmptyState from '@/vkgram/components/VKEmptyState';

function AppCard(props: {peerId: PeerId, compact?: boolean}) {
  const peers = usePeers();
  const user = () => peers[props.peerId] as User.user;
  const subtitle = () => {
    const count = user()?.bot_active_users;
    if(count) return `${formatNumber(count, 1)} польз. в месяц`;
    const username = user() && getPeerActiveUsernames(user())[0];
    return username ? '@' + username : 'мини-приложение';
  };

  return (
    <button
      type="button"
      class="vk-app-card"
      classList={{'is-compact': props.compact}}
      title={user()?.first_name}
      onClick={() => openVKMiniApp(props.peerId)}
    >
      <AvatarNewTsx peerId={props.peerId} size={props.compact ? 56 : 48} />
      <span class="vk-app-card-info">
        <span class="vk-app-card-title">{user()?.first_name || 'Приложение'}</span>
        <Show when={!props.compact}>
          <span class="vk-app-card-subtitle">{subtitle()}</span>
        </Show>
      </span>
    </button>
  );
}

/**
 * «Приложения» — Telegram Mini Apps: «Недавние» (the apps the user opened,
 * Telegram's top peers `bots_app`) and «Популярные» (Telegram's catalog,
 * `bots.getPopularAppBots`, paged as the end of the list comes near). Both
 * lists and the bots' data are Web K's (`appUsersManager.getTopPeers`,
 * `appAttachMenuBotsManager.getPopularAppBots`); the search filters what is
 * loaded. An app opens inside the client (`openVKMiniApp`).
 */
export default function VKPageApps() {
  const peers = usePeers();
  const [query, setQuery] = createSignal('');

  // the catalog is shared with the search block's tab: the page only adds the
  // infinite scroll of the popular list
  const catalog = createAppsCatalog();
  onCleanup(() => catalog.onDispose());
  const {recent, popular, isLoading, isFailed, loadMore} = catalog;

  const matches = (peerId: PeerId) => {
    const user = peers[peerId] as User.user;
    return !query().trim() || (user && matchesQuery(query(), user.first_name, getPeerActiveUsernames(user)));
  };
  const filteredRecent = createMemo(() => (recent() ?? []).filter(matches));
  const filteredPopular = createMemo(() => popular().filter(matches));

  const [sentinel, setSentinel] = createSignal<HTMLElement>();
  createEffect(() => {
    const element = sentinel();
    // re-armed after every page: a sentinel still in view has nothing new to report
    void popular().length;
    if(!element || isLoading() || isFailed()) return;

    const observer = new IntersectionObserver((entries) => {
      if(entries.some((entry) => entry.isIntersecting)) void loadMore();
    }, {rootMargin: '300px'});
    observer.observe(element);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div class="vk-page vk-apps">
      {/* the search as its own block, like in «Сообщениях» */}
      <div class="vk-block vk-messages-search-block">
        <div class="vk-messages-search">
          <VKSearchField value={query()} placeholder="Поиск приложений" onInput={setQuery} />
        </div>
      </div>

      <section class="vk-block vk-page-block" aria-labelledby="vk-apps-title">
        <h1 id="vk-apps-title" class="vk-page-title vk-visually-hidden">Мини-приложения</h1>

        <Show when={filteredRecent().length}>
          <h2 class="vk-apps-subtitle">Недавние</h2>
          <div class="vk-apps-recent">
            <For each={filteredRecent()}>
              {(peerId) => <AppCard peerId={peerId} compact />}
            </For>
          </div>
        </Show>

        <h2 class="vk-apps-subtitle">Популярные</h2>
        <Show
          when={filteredPopular().length}
          fallback={
            <Show
              when={!isLoading()}
              fallback={<p class="vk-page-text vk-page-text-secondary vk-list-empty">Загрузка приложений…</p>}
            >
              <Show
                when={!isFailed()}
                fallback={
                  <p class="vk-page-text vk-page-text-secondary vk-list-empty">
                    Не удалось загрузить приложения.{' '}
                    <button type="button" class="vk-link-button" onClick={() => loadMore()}>Повторить</button>
                  </p>
                }
              >
                <VKEmptyState
                  icon="apps"
                  title={query().trim() ? 'Ничего не найдено' : 'Приложений пока нет'}
                  description={query().trim() ? 'Попробуйте другой запрос.' : undefined}
                />
              </Show>
            </Show>
          }
        >
          <div class="vk-apps-grid">
            <For each={filteredPopular()}>
              {(peerId) => <AppCard peerId={peerId} />}
            </For>
          </div>
          <Show when={isFailed()}>
            <p class="vk-page-text vk-page-text-secondary">
              Не удалось загрузить ещё.{' '}
              <button type="button" class="vk-link-button" onClick={() => loadMore()}>Повторить</button>
            </p>
          </Show>
        </Show>
        <div ref={setSentinel} class="vk-list-sentinel" />
      </section>
    </div>
  );
}
