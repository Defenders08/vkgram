import {createEffect, Show} from 'solid-js';
import useConnectionStatus from '@/vkgram/hooks/useConnectionStatus';
import {isVKSearchOpen, openVKSearch, setVKSearchQuery, vkSearchQuery} from '@/vkgram/search/vkSearchOpen';
import {VKSearchPopup} from '@/vkgram/components/VKSearchOverlay';
import VKIcon from '@/vkgram/components/VKIcons';

const PLACEHOLDER = 'Поиск';

/**
 * Поле поиска в шапке (десктоп): настоящий input — текст вводится прямо в
 * него, окно поиска под полем показывает вкладки и результаты. Размер поля не
 * меняется; белым оно бывает только при открытом поиске (окно под ним), до
 * того и после закрытия — тёмное, как кнопка. Клик мимо окна, Escape, «Назад»
 * и выбор результата закрывают окно и гасят поле.
 *
 * Пока соединения нет, как в Web K's поиске: на месте лупы — крутящееся
 * кольцо, на месте подписи — статус («Waiting for network…»).
 */
export default function VKHeaderSearch() {
  const connectionStatus = useConnectionStatus();
  let input: HTMLInputElement;

  // закрытый поиск — тёмное поле, даже если фокус ещё в нём
  createEffect(() => {
    if(!isVKSearchOpen() && document.activeElement === input) input.blur();
  });

  return (
    <div class="vk-header-search">
      <Show when={connectionStatus()} fallback={<VKIcon name="search" size={15} class="vk-header-search-icon" />}>
        <span class="vk-header-search-spinner" aria-hidden="true" />
      </Show>
      <input
        ref={input}
        type="search"
        class="vk-header-search-input"
        classList={{'is-active': isVKSearchOpen()}}
        value={vkSearchQuery()}
        placeholder={connectionStatus() ?? PLACEHOLDER}
        aria-label={PLACEHOLDER}
        role="combobox"
        aria-expanded={isVKSearchOpen()}
        aria-controls="vk-search-popup"
        aria-autocomplete="list"
        autocomplete="off"
        onInput={(e) => setVKSearchQuery(e.currentTarget.value)}
        onFocus={() => openVKSearch()}
      />
      {/* окно anchored к этому блоку — см. стили `.vk-header-search .vk-search-popup` */}
      <VKSearchPopup withField={false} />
    </div>
  );
}

