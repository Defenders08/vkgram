import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';
import {reconcilePeers} from '@stores/peers';
import VKSearchOverlay from '@/vkgram/components/VKSearchOverlay';
// мокается ниже — сюда попадает именно он (сброс общего запроса между тестами)
import {setVKSearchQuery} from '@/vkgram/search/vkSearchOpen';

// управляемое состояние фикстур: тесты меняют — моки читают
const state = vi.hoisted(() => ({
  peers: {} as Record<string, any>,
  dialogs: [] as any[],
  channels: [] as any[],
  contacts: [] as any[],
  topPeers: [] as any[]
}));

const openVKChat = vi.hoisted(() => vi.fn());
const openVKChannelPage = vi.hoisted(() => vi.fn());
const openVKProfile = vi.hoisted(() => vi.fn());
const closeVKSearch = vi.hoisted(() => vi.fn());

vi.mock('@lib/rootScope', () => ({
  default: {
    myId: 0,
    managers: {
      appUsersManager: {
        getTopPeers: vi.fn((type: string): Promise<any[]> =>
          Promise.resolve(type === 'correspondents' ? state.topPeers : []))
      },
      appMessagesManager: {
        getHistory: vi.fn((): Promise<any> => Promise.resolve({messages: [], history: [], count: 0}))
      }
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
}));

vi.mock('@/vkgram/hooks/useSubscribedChannels', () => ({
  default: (): {channels: () => any[], isReady: () => boolean, notifyVersion: () => number} => ({
    channels: (): any[] => state.channels,
    isReady: (): boolean => true,
    notifyVersion: (): number => 0
  }),
  // «Чаты» читают диалоги двух встроенных папок (0 — все, 1 — архив)
  fetchFolder: vi.fn(async(folderId: number): Promise<any[]> => folderId === 0 ? state.dialogs : []),
  // broadcast-каналы в «Чатах» не числятся
  isMessagesPeer: (peer: any): boolean => !(peer?._ === 'channel' && !peer.pFlags?.megagroup)
}));

vi.mock('@/vkgram/hooks/useContactPeerIds', () => ({
  default: (): (() => any[]) => (): any[] => state.contacts
}));

vi.mock('@/vkgram/hooks/createAppsCatalog', () => ({
  default: (): {
    recent: () => any[],
    popular: () => any[],
    isLoading: () => boolean,
    isFailed: () => boolean,
    loadMore: () => void,
    onDispose: () => void
  } => ({
    recent: (): any[] => [],
    popular: (): any[] => [],
    isLoading: (): boolean => false,
    isFailed: (): boolean => false,
    loadMore: (): void => {},
    onDispose: (): void => {}
  }),
  openVKMiniApp: vi.fn()
}));

vi.mock('@/vkgram/components/MessageRenderer', () => ({
  default: (): null => null,
  mediaLabel: (): string => 'Медиа'
}));

vi.mock('@/vkgram/components/VKMediaBrowser', () => ({
  VKMediaList: (props: any) => <div class="mock-media-list" data-kind={props.kind} />
}));

vi.mock('@/vkgram/utils/getDialogLastMessage', () => ({
  default: (dialog: any) => dialog.topMessage
}));

vi.mock('@/vkgram/utils/avatarSnapshots', () => ({
  readAvatarSnapshot: (): undefined => undefined,
  writeAvatarSnapshotFromImage: (): void => {}
}));

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: (props: any) => {
    const img = document.createElement('img');
    img.src = 'blob:ok';
    Object.defineProperty(img, 'complete', {value: true});
    Object.defineProperty(img, 'naturalWidth', {value: 24});
    img.dataset.peerId = String(props.peerId);
    return img;
  }
}));

vi.mock('@/vkgram/search/vkSearchOpen', async() => {
  // запрос — живой сигнал: окно и поле шапки пишут в один общий
  const {createSignal} = await import('solid-js');
  const [query, setQuery] = createSignal('');
  return {
    openVKSearch: vi.fn(),
    closeVKSearch,
    isVKSearchOpen: () => true,
    vkSearchQuery: query,
    setVKSearchQuery: setQuery
  };
});

vi.mock('@/vkgram/pages/messages/openChat', () => ({openVKChat}));
vi.mock('@/vkgram/pages/channel/openChannel', () => ({openVKChannelPage}));
vi.mock('@/vkgram/pages/profile/openProfile', () => ({openVKProfile}));

// объектный PeerId, как в приложении: строка — одна, объект каждый раз новый
const pid = (id: number) => ({toString: () => String(-id)}) as unknown as PeerId;

const user = (over: Partial<any> = {}) => ({_: 'user', first_name: '', pFlags: {}, ...over});
const chat = (over: Partial<any> = {}) => ({_: 'channel', title: '', pFlags: {}, ...over});

const dialogOf = (peerId: PeerId, topMessage: any) => ({
  peerId,
  folder_id: 0,
  top_message: topMessage.mid,
  topMessage
});

beforeEach(() => {
  state.peers = {
    [pid(1)]: user({first_name: 'Иван', last_name: 'Иванов', username: 'ivan'}),
    [pid(2)]: user({first_name: 'Пётр', username: 'petr'}),
    [pid(3)]: chat({title: 'Котята', pFlags: {megagroup: true}}),
    [pid(4)]: chat({title: 'Новости'})
  };
  state.dialogs = [
    dialogOf(pid(1), {_: 'message', mid: 10, message: 'привет', date: 100}),
    dialogOf(pid(3), {_: 'message', mid: 11, message: 'мяу', date: 101})
  ];
  state.channels = [dialogOf(pid(4), {_: 'message', mid: 12, message: 'пост', date: 102})];
  state.contacts = [pid(2)];
  state.topPeers = [{id: pid(1)}, {id: pid(2)}];
  reconcilePeers(state.peers as any);
  setVKSearchQuery('');
  vi.clearAllMocks();
});

const dispose: (() => void)[] = [];
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
});

// панель монтируется внутри якоря (в приложении — `.vk-header-search` или шапка):
// клики по якорю и его триггеру окно не закрывают
const mount = () => {
  const anchor = document.createElement('div');
  anchor.className = 'search-anchor';
  document.body.appendChild(anchor);
  dispose.push(render(() => <VKSearchOverlay />, anchor));
  return anchor;
};

// элемент «страницы» за окном и его якорем
const outsideEl = () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
};

const tabButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.vk-search-tabs-block .vk-tab'));
const rowTitles = () => Array.from(document.querySelectorAll('.vk-search-row-title')).map((el) => el.textContent);
const setInput = async(value: string) => {
  const input = document.querySelector('.vk-search-input') as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input', {bubbles: true}));
};

describe('окно поиска (VKSearchOverlay)', () => {
  it('на пустом запросе показывает вкладки и полосу частых чатов', async() => {
    mount();

    expect(document.activeElement).toBe(document.querySelector('.vk-search-input'));
    expect(tabButtons().map((tab) => tab.textContent)).toEqual(['Чаты', 'Каналы', 'Приложения', 'Посты', 'Медиа']);

    await vi.waitFor(() => {
      if(!document.querySelector('.vk-search-strip-item')) throw new Error('полоса ещё не показана');
    });
    const names = Array.from(document.querySelectorAll('.vk-search-strip-name')).map((el) => el.textContent);
    expect(names).toContain('Иван Иванов');
    expect(names).toContain('Пётр');
  });

  it('клик мимо окна закрывает его, клик по вкладке — нет', () => {
    mount();

    // клик по вкладке — работа окна, закрывать нельзя
    tabButtons()[1].dispatchEvent(new MouseEvent('pointerdown', {bubbles: true}));
    expect(closeVKSearch).not.toHaveBeenCalled();

    // клик по «странице» за окном и его якорем — закрывает
    outsideEl().dispatchEvent(new MouseEvent('pointerdown', {bubbles: true}));
    expect(closeVKSearch).toHaveBeenCalledOnce();
  });

  it('«Чаты» ищут по диалогам, а канал-диалог не попадает', async() => {
    mount();
    await setInput('котя');

    await vi.waitFor(() => expect(rowTitles()).toEqual(['Котята']));

    await setInput('ново');
    expect(rowTitles()).toEqual([]);
    // группа не потерялась: ничего не найдено — пустое состояние, а не ошибка
    expect(document.querySelector('.vk-search-empty')).toBeTruthy();
  });

  it('строка диалога показывает превью последнего сообщения и открывает чат', async() => {
    mount();
    await setInput('иван');

    await vi.waitFor(() => expect(rowTitles()).toEqual(['Иван Иванов']));
    const row = document.querySelector('.vk-search-row') as HTMLButtonElement;
    expect(row.textContent).toContain('привет');
    row.click();

    expect(openVKChat).toHaveBeenCalledOnce();
    expect(String(openVKChat.mock.calls[0][0])).toBe('-1');
    expect(closeVKSearch).toHaveBeenCalledOnce();
  });

  it('контакт без диалога ищется и открывает страницу', async() => {
    mount();
    await setInput('пётр');

    expect(rowTitles()).toEqual(['Пётр']);
    (document.querySelector('.vk-search-row') as HTMLButtonElement).click();

    expect(openVKProfile).toHaveBeenCalledOnce();
    expect(String(openVKProfile.mock.calls[0][0])).toBe('-2');
  });

  it('«Каналы» ищут по подпискам и открывают канал', async() => {
    mount();
    tabButtons().find((tab) => tab.textContent === 'Каналы')!.click();
    await setInput('ново');

    expect(rowTitles()).toEqual(['Новости']);
    (document.querySelector('.vk-search-row') as HTMLButtonElement).click();

    expect(openVKChannelPage).toHaveBeenCalledOnce();
    expect(String(openVKChannelPage.mock.calls[0][0])).toBe('-4');
  });
});
