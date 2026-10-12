import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import type {JSX} from 'solid-js';
import VKHeaderSearch from '@/vkgram/components/VKHeaderSearch';

const mocks = vi.hoisted(() => ({
  // what the connection-status hook answers: `undefined` — all is well
  statusText: undefined as string | undefined,
  openVKSearch: vi.fn(),
  setVKSearchQuery: vi.fn(),
  isSearchOpen: false
}));

vi.mock('@/vkgram/hooks/useConnectionStatus', () => ({
  default: () => () => mocks.statusText
}));

vi.mock('@/vkgram/search/vkSearchOpen', () => ({
  openVKSearch: mocks.openVKSearch,
  closeVKSearch: vi.fn(),
  isVKSearchOpen: () => mocks.isSearchOpen,
  vkSearchQuery: () => '',
  setVKSearchQuery: mocks.setVKSearchQuery
}));

// окно поиска в этом тесте не нужно: проверяется только поле шапки
vi.mock('@/vkgram/components/VKSearchOverlay', () => ({
  default: (): JSX.Element => <div class="search-popup-mock" />,
  VKSearchPopup: (props: {withField?: boolean}): JSX.Element => (
    <div class="search-popup-mock" data-with-field={String(props.withField)} />
  )
}));

const dispose: (() => void)[] = [];
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  vi.clearAllMocks();
  mocks.statusText = undefined;
  mocks.isSearchOpen = false;
});

const mount = () => {
  dispose.push(render(() => <VKHeaderSearch />, document.body));
  return document.body;
};

const input = (root: HTMLElement) => root.querySelector<HTMLInputElement>('.vk-header-search-input')!;

describe('VKHeaderSearch: поле поиска в шапке', () => {
  it('здоровое соединение: иконка, тёмное поле, подпись «Поиск», поиск закрыт', () => {
    const root = mount();
    expect(root.querySelector('.vk-header-search-icon')).not.toBeNull();
    expect(root.querySelector('.vk-header-search-spinner')).toBeNull();
    expect(input(root).placeholder).toBe('Поиск');
    expect(input(root).classList.contains('is-active')).toBe(false);
    expect(input(root).getAttribute('aria-expanded')).toBe('false');
    expect(input(root).getAttribute('aria-controls')).toBe('vk-search-popup');
  });

  it('фокус в поле открывает поиск, текст пишется в общий запрос', () => {
    const root = mount();
    input(root).dispatchEvent(new FocusEvent('focus'));
    expect(mocks.openVKSearch).toHaveBeenCalledOnce();

    input(root).value = 'иван';
    input(root).dispatchEvent(new Event('input', {bubbles: true}));
    expect(mocks.setVKSearchQuery).toHaveBeenCalledWith('иван');
  });

  it('открытый поиск: поле белое (is-active), окно без своего поля', () => {
    mocks.isSearchOpen = true;
    const root = mount();
    expect(input(root).classList.contains('is-active')).toBe(true);
    expect(input(root).getAttribute('aria-expanded')).toBe('true');
    const popup = root.querySelector<HTMLElement>('.search-popup-mock')!;
    expect(popup.dataset.withField).toBe('false');
  });

  it('потеря соединения: кольцо вместо иконки, статус вместо подписи', () => {
    mocks.statusText = 'Waiting for network…';
    const root = mount();
    const spinner = root.querySelector<HTMLElement>('.vk-header-search-spinner')!;
    expect(spinner).not.toBeNull();
    expect(spinner.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.vk-header-search-icon')).toBeNull();
    expect(input(root).placeholder).toBe('Waiting for network…');
  });
});
