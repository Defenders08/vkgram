import {Show} from 'solid-js';
import useScrollToTop from '@/vkgram/hooks/useScrollToTop';
import {closeVKChannel, vkChannelPeerId} from '@/vkgram/pages/channel/route';
import {closeVKProfile, vkProfilePeerId} from '@/vkgram/pages/profile/route';
import type {VKSectionId} from '@/vkgram/sections';
import VKHeaderAccount from '@/vkgram/components/VKHeaderAccount';
import {confirmVKLogout} from '@/vkgram/logout';
import VKHeaderSearch from '@/vkgram/components/VKHeaderSearch';
import {VKSearchPopup} from '@/vkgram/components/VKSearchOverlay';
import {closeVKSearch, isVKSearchOpen, openVKSearch} from '@/vkgram/search/vkSearchOpen';
import VKHeaderSettings, {VKHeaderSettingsMobile} from '@/vkgram/components/VKHeaderSettings';
import VKMiniPlayer from '@/vkgram/components/VKMiniPlayer';
import VKIcon from '@/vkgram/components/VKIcons';
import {setNewsCustomizeOpen} from '@/vkgram/pages/news/customize';
import {setMessagesCustomizeOpen} from '@/vkgram/pages/messages/customize';
import {setFriendsCustomizeOpen} from '@/vkgram/pages/friends/customize';
import {setChannelsCustomizeOpen} from '@/vkgram/pages/channels/customize';
import {setAudioCustomizeOpen} from '@/vkgram/pages/audio/customize';

export type VKHeaderProps = {
  variant: 'desktop' | 'mobile',
  // the current section: an open channel puts its «back» and actions into the bar
  section?: VKSectionId,
  // mobile only — the "☰" button; omitted → the button isn't rendered
  onMenuClick?: () => void,
  isMenuActive?: boolean,
  // id of the panel the menu button opens
  menuControls?: string
};

/**
 * The top blue bar in the old VK shape: burger (mobile) and the logo on the left (desktop: a field with the user's username, still the «home» button), the search in the
 * middle (desktop), and on the right the actions of the current page. An open
 * channel adds «← Каналы» next to the logo — it used to sit inside the page content. «Страница» is in the
 * left menu (on mobile — behind «Ещё» / ☰).
 * «↑ Наверх» (desktop, in the left corner of the bar) scrolls whatever is scrolled down in the content (a page, a dialog) to its top and is shown only then.
 * The mini player (desktop) sits between the spacer and the search; on mobile it is at the top of the side menu.
 * the «Настройки» gear (desktop, «Моя страница» only, `VKHeaderSettings`) is right of the search, outside the column.
 * «Выйти» closes the bar on desktop only (with Telegram's confirmation); on
 * mobile it is the last item of the side menu instead.
 */
export default function VKHeader(props: VKHeaderProps) {
  // an open channel / another user's profile belong to their own sections
  const openChannelId = () => props.section === 'channels' ? vkChannelPeerId() : undefined;
  const openProfileId = () => props.section === 'profile' ? vkProfilePeerId() : undefined;
  // desktop only: shown while something in the content is scrolled down
  const toTop = useScrollToTop(() => props.section);

  return (
    <header class="vk-header" classList={{'is-mobile': props.variant === 'mobile'}}>
      <Show when={props.variant === 'desktop'}>
        <button
          type="button"
          class="vk-header-action vk-header-to-top"
          classList={{'is-visible': toTop.visible()}}
          tabIndex={toTop.visible() ? 0 : -1}
          onClick={() => toTop.scrollToTop()}
        >
          <VKIcon name="up" size={16} />
          <span>Наверх</span>
        </button>
      </Show>

      <div class="vk-header-inner">
        <Show when={props.variant === 'mobile' && props.onMenuClick}>
          <button
            type="button"
            class="vk-header-menu-button"
            classList={{'is-active': !!props.isMenuActive}}
            aria-label="Меню"
            aria-expanded={!!props.isMenuActive}
            aria-controls={props.menuControls}
            onClick={() => props.onMenuClick()}
          >
            ☰
          </button>
        </Show>

        {/* the logo block: the user's field with the account menu on desktop, the wordmark on a phone */}
        <VKHeaderAccount variant={props.variant} />

        <Show when={openChannelId()}>
          <button type="button" class="vk-header-action vk-header-back" onClick={() => closeVKChannel()}>
            <VKIcon name="back" size={16} />
            <span>Каналы</span>
          </button>
        </Show>

        <Show when={openProfileId()}>
          <button type="button" class="vk-header-action vk-header-back" onClick={() => closeVKProfile()}>
            <VKIcon name="back" size={16} />
            <span>Назад</span>
          </button>
        </Show>

        <div class="vk-header-spacer" />

        {/* поиск — тот же блок, что на десктопе: на телефоне он открывается кнопкой в баре */}
        <Show when={props.variant === 'mobile'}>
          <button
            type="button"
            class="vk-header-action vk-header-action-icon"
            title="Поиск"
            aria-label="Поиск"
            aria-haspopup="dialog"
            aria-expanded={isVKSearchOpen()}
            onClick={() => isVKSearchOpen() ? closeVKSearch() : openVKSearch()}
          >
            <VKIcon name="search" size={18} />
          </button>
        </Show>

        <Show when={props.variant === 'desktop'}>
          <VKMiniPlayer variant="header" />
          <VKHeaderSearch />
          {/* «Настройки» of the main page: the page blocks (add, move, remove); stands right of the search, in the free space of the bar */}
          <Show when={props.section === 'profile' && !openProfileId()}>
            <VKHeaderSettings />
          </Show>
        </Show>

        {/* the same «Настройки» on a phone: a gear in the bar, the blocks in a modal */}
        <Show when={props.variant === 'mobile' && props.section === 'profile'}>
          <VKHeaderSettingsMobile />
        </Show>

        {/* «Настроить» of the sections with folder tabs on a phone: the folders management
            (and, in «Новостях»/«Сообщениях», the list settings) in one window, as there is
            no free space for it next to the tabs */}
        <Show when={props.variant === 'mobile' && props.section && ['news', 'messages', 'friends', 'channels', 'audio'].includes(props.section)}>
          <button
            type="button"
            class="vk-header-action vk-header-action-icon"
            title="Настроить"
            aria-label="Настроить"
            aria-haspopup="dialog"
            onClick={() => {
              if(props.section === 'news') setNewsCustomizeOpen(true);
              else if(props.section === 'messages') setMessagesCustomizeOpen(true);
              else if(props.section === 'friends') setFriendsCustomizeOpen(true);
              else if(props.section === 'audio') setAudioCustomizeOpen(true);
              else setChannelsCustomizeOpen(true);
            }}
          >
            <VKIcon name="settings" size={18} />
          </button>
        </Show>

      </div>

      {/* окно поиска на телефоне: anchored к шапке, во всю её ширину (см.
          `.vk-header.is-mobile .vk-search-popup`) */}
      <Show when={props.variant === 'mobile'}>
        <VKSearchPopup />
      </Show>
    </header>
  );
}
