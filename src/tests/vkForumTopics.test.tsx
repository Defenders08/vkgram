import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {JSX} from 'solid-js';
import {render} from 'solid-js/web';
import createForumTopics, {isForumPeer} from '@/vkgram/hooks/createForumTopics';
import VKTopicsList from '@/vkgram/pages/messages/VKTopicsList';

vi.hoisted(() => {
  class IntersectionObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  }
  (globalThis as any).IntersectionObserver = IntersectionObserverStub;
  (globalThis as any).Worker = class WorkerStub {};
  (globalThis as any).SharedWorker = class SharedWorkerStub {};
  HTMLCanvasElement.prototype.toDataURL = function() { return 'data:image/webp;base64,UklGRhIAAABX'; };
});

const peersMock = vi.hoisted(() => ({} as Record<string, any>));
const messagesMock = vi.hoisted(() => new Map<number, any>());
const listeners = vi.hoisted(() => new Map<string, Set<(detail: any) => void>>());
const managersMock = vi.hoisted(() => ({
  dialogsStorage: {
    // страницы тем отдает tests ниже (topicsPages)
    getDialogs: undefined as any,
    getForumTopicOrReload: vi.fn(),
    canManageTopic: vi.fn(async() => false)
  },
  appNotificationsManager: {
    isPeerLocalMuted: vi.fn(async() => false)
  },
  appMessagesManager: {
    canSendToPeer: vi.fn(async() => true),
    createForumTopic: vi.fn(async() => 555),
    readTopics: vi.fn(async() => undefined),
    deleteTopics: vi.fn(async() => undefined),
    toggleDialogPin: vi.fn(async() => undefined),
    togglePeerMute: vi.fn(async() => undefined),
    editForumTopic: vi.fn(async() => undefined)
  }
}));
const topicsPages = vi.hoisted(() => [] as any[][]);

vi.mock('@lib/rootScope', () => ({
  default: {
    myId: 1,
    managers: managersMock,
    addEventListener: (name: string, fn: (detail: any) => void) => {
      if(!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(fn);
    },
    removeEventListener: (name: string, fn: (detail: any) => void) => {
      listeners.get(name)?.delete(fn);
    },
    dispatchEvent: (name: string, detail: any) => {
      listeners.get(name)?.forEach((fn) => fn(detail));
    }
  }
}));

vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getMessageByPeer: (peerId: PeerId, mid: number) => messagesMock.get(mid)
  }
}));

vi.mock('@stores/peers', () => ({
  usePeers: () => peersMock
}));

vi.mock('@stores/fullPeers', () => ({
  useFullPeer: () => (): undefined => undefined
}));

vi.mock('@/vkgram/components/VKModal', () => ({
  default: (props: {title: string, children: JSX.Element}): JSX.Element => (
    <div class="vk-modal-mock" data-title={props.title}>{props.children}</div>
  )
}));

vi.mock('@/vkgram/components/VKPeerAvatar', () => ({
  default: (): null => null
}));

// mediaLabel живёт в графе рендерера сообщений — в тесте хватает заглушки
vi.mock('@/vkgram/components/MessageRenderer', () => ({
  default: (): null => null,
  mediaLabel: (): string => 'Вложение'
}));

// иконка темы едет ленивым импортом из тяжёлого графа Web K — в тесте заглушка
vi.mock('@components/wrappers/messageActionTextNewUnsafe', () => ({
  wrapTopicIcon: async(): Promise<HTMLElement> => document.createElement('span')
}));

// меню шапки группы живёт на графе контекст-меню Web K — здесь не тестируется
vi.mock('@/vkgram/pages/messages/createDialogContextMenu', () => ({
  default: (): {destroy: () => void} => ({destroy: vi.fn()})
}));

vi.mock('@/vkgram/pages/profile/openProfile', () => ({
  openVKPeerPage: vi.fn()
}));

const FORUM = -1000 as PeerId;

const makeTopic = (id: number, patch: any = {}) => ({
  _: 'forumTopic',
  id,
  title: `Тема ${id}`,
  icon_color: 0x6fb9f0,
  top_message: id * 10,
  read_inbox_max_id: 0,
  unread_count: 0,
  pFlags: {},
  notify_settings: {},
  peerId: FORUM,
  index_0: id,
  ...patch
});

const makeMessage = (mid: number, patch: any = {}) => ({
  _: 'message',
  mid,
  date: 1760000000,
  message: 'текст',
  pFlags: {},
  fromId: 2 as PeerId,
  peerId: FORUM,
  ...patch
});

const dispose: (() => void)[] = [];
beforeEach(() => {
  topicsPages.length = 0;
  messagesMock.clear();
  listeners.clear();
  managersMock.dialogsStorage.getDialogs = vi.fn(async(options: {offsetIndex?: number}) => {
    if(options.offsetIndex !== undefined) return {dialogs: [], count: topicsPages[0].length, isEnd: true, isTopEnd: true};
    return {dialogs: topicsPages[0] ?? [], count: topicsPages[0]?.length ?? 0, isEnd: true, isTopEnd: true};
  });
  peersMock[FORUM] = {_: 'channel', id: -1000, title: 'Группа с темами', pFlags: {forum: true, megagroup: true}};
  peersMock[2] = {_: 'user', first_name: 'Аня'};
});
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
  delete peersMock[FORUM];
  delete peersMock[2];
  vi.clearAllMocks();
});

const mount = (jsx: () => JSX.Element) => {
  const root = document.createElement('div');
  document.body.append(root);
  dispose.push(render(jsx, root));
  return root;
};

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

const rowTitles = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>('.vk-topics-row-name')).map((el) => el.textContent);

describe('isForumPeer', () => {
  it('узнаёт форум по флагу канала', () => {
    expect(isForumPeer({_: 'channel', pFlags: {forum: true, megagroup: true}})).toBe(true);
    expect(isForumPeer({_: 'channel', pFlags: {megagroup: true}})).toBe(false);
    expect(isForumPeer({_: 'channel', pFlags: {forum: true}})).toBe(true);
    expect(isForumPeer({_: 'user', pFlags: {}})).toBe(false);
    expect(isForumPeer(undefined)).toBe(false);
  });
});

describe('createForumTopics', () => {
  it('загружает страницы тем, сортирует закрепы вверх и живёт на событиях', async() => {
    topicsPages.push([
      makeTopic(11, {index_0: 30}),
      makeTopic(12, {index_0: 40, pFlags: {pinned: true}}),
      makeTopic(13, {index_0: 20})
    ]);

    let captured!: ReturnType<typeof createForumTopics>;
    mount(() => {
      captured ??= createForumTopics(() => FORUM);
      return null;
    });
    await nextTick();
    await nextTick();

    // закреп (12) первый, дальше по убыванию активности
    expect(captured.sortedTopics().map((topic) => topic.id)).toEqual([12, 11, 13]);
    expect(captured.ready()).toBe(true);
    expect(captured.count()).toBe(3);

    // живое обновление: счётчик непрочитанного приходит заменой объекта
    listeners.get('dialogs_multiupdate')?.forEach((fn) => fn(new Map([
      [FORUM, {topics: new Map([[11, makeTopic(11, {index_0: 50, unread_count: 4})]])}]
    ])));
    expect(captured.topicsById().get(11)?.unread_count).toBe(4);
    // закреп держит первое место, активность поднимает 11 выше 13
    expect(captured.sortedTopics().map((topic) => topic.id)).toEqual([12, 11, 13]);

    // удаление темы убирает её из списка
    listeners.get('dialog_drop')?.forEach((fn) => fn(makeTopic(13)));
    expect(captured.topicsById().has(13)).toBe(false);
  });

  it('печатание в теме показывается по её threadId', async() => {
    topicsPages.push([makeTopic(11)]);
    messagesMock.set(110, makeMessage(110));

    let captured!: ReturnType<typeof createForumTopics>;
    mount(() => {
      captured ??= createForumTopics(() => FORUM);
      return null;
    });
    await nextTick();
    await nextTick();

    expect(captured.typings(11)).toBeUndefined();
    listeners.get('peer_typings')?.forEach((fn) => fn({
      peerId: FORUM,
      threadId: 11,
      typings: [{userId: 2, action: {_ : 'sendMessageTypingAction'}}]
    }));
    expect(captured.typings(11)).toBe('Аня печатает');

    // чужая тема типинг не получает
    expect(captured.typings(12)).toBeUndefined();
  });
});

describe('VKTopicsList', () => {
  it('рисует строки тем: превью с автором, время, счётчик, поиск по названию', async() => {
    topicsPages.push([
      makeTopic(11, {unread_count: 3}),
      makeTopic(12)
    ]);
    messagesMock.set(110, makeMessage(110));
    messagesMock.set(120, makeMessage(120, {message: '', media: {_: 'messageMediaDocument'}}));

    let topics!: ReturnType<typeof createForumTopics>;
    const opened: number[] = [];
    const root = mount(() => {
      topics ??= createForumTopics(() => FORUM);
      return <VKTopicsList peerId={FORUM} topics={topics} onOpenTopic={(id) => opened.push(id)} />;
    });
    await nextTick();
    await nextTick();
    await nextTick();

    const rows = root.querySelectorAll<HTMLButtonElement>('.vk-topics-row');
    expect(rows.length).toBe(2);
    // порядок по активности: Тема 12 выше; её последнее сообщение — вложение
    // (метка медиа вместо пустоты), у Темы 11 — текст с автором
    expect(root.querySelectorAll<HTMLElement>('.vk-topics-row-preview')[0].textContent).toContain('Аня: Вложение');
    expect(root.querySelectorAll<HTMLElement>('.vk-topics-row-preview')[1].textContent).toContain('Аня: текст');
    // счётчик непрочитанного Темы 11
    expect(root.querySelector<HTMLElement>('.vk-topics-row-unread')?.textContent).toBe('3');

    // клик по строке открывает тему
    rows[0].click();
    expect(opened).toEqual([12]);

    // поиск фильтрует по названию
    const search = root.querySelector<HTMLInputElement>('.vk-topics-search input')!;
    search.value = 'Тема 12';
    search.dispatchEvent(new Event('input', {bubbles: true}));
    await nextTick();
    expect(rowTitles(root)).toEqual(['Тема 12']);
  });

  it('создаёт тему через окно и сразу её открывает', async() => {
    topicsPages.push([makeTopic(11)]);

    let topics!: ReturnType<typeof createForumTopics>;
    const opened: number[] = [];
    const root = mount(() => {
      topics ??= createForumTopics(() => FORUM);
      return <VKTopicsList peerId={FORUM} topics={topics} onOpenTopic={(id) => opened.push(id)} />;
    });
    await nextTick();
    await nextTick();

    (root.querySelector<HTMLButtonElement>('[aria-label="Создать тему"]')!).click();
    await nextTick();

    const modal = root.querySelector<HTMLElement>('.vk-modal-mock')!;
    expect(modal.dataset.title).toBe('Новая тема');

    const input = modal.querySelector<HTMLInputElement>('.vk-input')!;
    input.value = 'Новая тема из теста';
    input.dispatchEvent(new Event('input', {bubbles: true}));

    (modal.querySelector<HTMLButtonElement>('.vk-modal-foot .vk-button:not(.vk-button-secondary)')!).click();
    await nextTick();
    await nextTick();

    expect(managersMock.appMessagesManager.createForumTopic).toHaveBeenCalledWith(expect.objectContaining({
      peerId: FORUM,
      title: 'Новая тема из теста'
    }));
    expect(opened).toEqual([555]);
    // окно закрылось
    expect(root.querySelector('.vk-modal-mock')).toBeNull();
  });
});
