import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createRoot, createSignal} from 'solid-js';
import '@helpers/peerIdPolyfill';
import createVKPinnedMessages from '@/vkgram/hooks/createVKPinnedMessages';
import getPinnedMessagesKey from '@appManagers/utils/messages/getPinnedMessagesKey';

vi.hoisted(() => {
  (globalThis as any).Worker = class WorkerStub {};
  (globalThis as any).SharedWorker = class SharedWorkerStub {};
});

const mocks = vi.hoisted(() => ({
  getHistory: vi.fn(),
  getMessageByPeer: vi.fn(),
  getState: vi.fn(),
  listeners: new Map<string, Set<(payload: any) => void>>()
}));

vi.mock('@lib/rootScope', () => ({
  default: {
    managers: {
      appMessagesManager: {getHistory: mocks.getHistory, getMessageByPeer: mocks.getMessageByPeer},
      appStateManager: {getState: mocks.getState}
    },
    addEventListener: vi.fn((name: string, callback: (payload: any) => void) => {
      let set = mocks.listeners.get(name);
      if(!set) mocks.listeners.set(name, set = new Set());
      set.add(callback);
    }),
    removeEventListener: vi.fn((name: string, callback: (payload: any) => void) => {
      mocks.listeners.get(name)?.delete(callback);
    })
  }
}));

const fire = (name: string, payload: any) => {
  mocks.listeners.get(name)?.forEach((callback) => callback(payload));
};

const PEER = (500 as ChatId).toPeerId(true);
const OTHER = (700 as ChatId).toPeerId(true);

// закрепы, новые сверху: 300 → 200 → 100
const pinnedMids = [300, 200, 100];

const message = (mid: number) => ({_: 'message', mid, date: 1, message: `текст ${mid}`});

const stubPins = (mids: number[], peer: PeerId = PEER) => {
  mocks.getHistory.mockImplementation(async({peerId}: {peerId: PeerId}) => {
    if(peerId !== peer) return {count: 0, history: []};
    return {count: mids.length, history: mids};
  });
  mocks.getMessageByPeer.mockImplementation(async(_peer: PeerId, mid: number) => message(mid));
  mocks.getState.mockResolvedValue({hiddenPinnedMessages: {}});
};

describe('createVKPinnedMessages (закреплённые сообщения диалога)', () => {
  beforeEach(() => {
    mocks.getHistory.mockReset();
    mocks.getMessageByPeer.mockReset();
    mocks.getState.mockReset();
    mocks.listeners.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('загружает список (новые сверху), счётчик и показывает самый новый', async() => {
    stubPins(pinnedMids);

    await createRoot(async(dispose) => {
      const [peerId] = createSignal<PeerId>(PEER);
      const pinned = createVKPinnedMessages(peerId, () => true);

      await vi.waitFor(() => expect(pinned.ready()).toBe(true));
      expect(pinned.count()).toBe(3);
      expect(pinned.list().map((m) => m.mid)).toEqual([300, 200, 100]);
      expect(pinned.index()).toBe(0);
      expect(pinned.shown()?.mid).toBe(300);

      dispose();
    });
  });

  it('слежение за скроллом: плита встаёт на самый новый закреп не ниже сообщения', async() => {
    stubPins(pinnedMids);

    await createRoot(async(dispose) => {
      const [peerId] = createSignal<PeerId>(PEER);
      const pinned = createVKPinnedMessages(peerId, () => true);
      await vi.waitFor(() => expect(pinned.ready()).toBe(true));

      // ниже закрепа 300 — показан 200
      pinned.syncToMid(250);
      expect(pinned.shown()?.mid).toBe(200);
      // ниже 200 — показан 100
      pinned.syncToMid(199);
      expect(pinned.shown()?.mid).toBe(100);
      // выше всех закрепов — остаётся как было
      pinned.syncToMid(50);
      expect(pinned.shown()?.mid).toBe(100);
      // конец истории — снова самый новый
      pinned.syncToMid(1000);
      expect(pinned.shown()?.mid).toBe(300);

      dispose();
    });
  });

  it('открепили показанный — плита встаёт на следующий (более старый) закреп', async() => {
    stubPins(pinnedMids);

    await createRoot(async(dispose) => {
      const [peerId] = createSignal<PeerId>(PEER);
      const pinned = createVKPinnedMessages(peerId, () => true);
      await vi.waitFor(() => expect(pinned.ready()).toBe(true));

      pinned.setIndex(1); // показан 200
      stubPins([300, 100]); // 200 открепили
      fire('peer_pinned_messages', {peerId: PEER, mids: [200], pinned: false});

      await vi.waitFor(() => expect(pinned.list().map((m) => m.mid)).toEqual([300, 100]));
      expect(pinned.shown()?.mid).toBe(100);

      dispose();
    });
  });

  it('закрепление в другом окне обновляет список и снимает скрытие плиты', async() => {
    mocks.getHistory.mockImplementation(async() => ({count: 0, history: []}));
    mocks.getMessageByPeer.mockResolvedValue(undefined);
    mocks.getState.mockResolvedValue({hiddenPinnedMessages: {[getPinnedMessagesKey(PEER)]: 42}});

    await createRoot(async(dispose) => {
      const [peerId] = createSignal<PeerId>(PEER);
      const pinned = createVKPinnedMessages(peerId, () => true);

      // закрепов нет, а скрытие из состояния приложения прочитано
      await vi.waitFor(() => expect(pinned.ready()).toBe(true));
      expect(pinned.count()).toBe(0);
      expect(pinned.hidden()).toBe(true);

      // в другом окне закрепили сообщение: список приехал, плита показалась
      stubPins([300]);
      fire('peer_pinned_messages', {peerId: PEER, mids: [300], pinned: true});

      await vi.waitFor(() => expect(pinned.shown()?.mid).toBe(300));
      expect(pinned.hidden()).toBe(false);

      dispose();
    });
  });

  it('пользователь скрыл плиту (канал без права откреплять) — hidden от события', async() => {
    stubPins(pinnedMids);

    await createRoot(async(dispose) => {
      const [peerId] = createSignal<PeerId>(PEER);
      const pinned = createVKPinnedMessages(peerId, () => true);
      await vi.waitFor(() => expect(pinned.ready()).toBe(true));
      expect(pinned.hidden()).toBe(false);

      fire('peer_pinned_hidden', {peerId: PEER, maxId: 300});
      expect(pinned.hidden()).toBe(true);

      dispose();
    });
  });

  it('смена диалога сбрасывает состояние и грузит закрепы нового', async() => {
    mocks.getHistory.mockImplementation(async({peerId}: {peerId: PeerId}) => {
      const mids = peerId === PEER ? [300] : peerId === OTHER ? [50, 40] : [];
      return {count: mids.length, history: mids};
    });
    mocks.getMessageByPeer.mockImplementation(async(_peer: PeerId, mid: number) => message(mid));
    mocks.getState.mockResolvedValue({hiddenPinnedMessages: {}});

    await createRoot(async(dispose) => {
      const [peerId, setPeer] = createSignal<PeerId>(PEER);
      const pinned = createVKPinnedMessages(peerId, () => true);
      await vi.waitFor(() => expect(pinned.shown()?.mid).toBe(300));

      pinned.setIndex(0);
      setPeer(OTHER);

      await vi.waitFor(() => expect(pinned.list().map((m) => m.mid)).toEqual([50, 40]));
      expect(pinned.index()).toBe(0);
      expect(pinned.count()).toBe(2);

      dispose();
    });
  });

  it('в ветке комментариев (enabled: false) ничего не загружается', async() => {
    stubPins(pinnedMids);

    await createRoot(async(dispose) => {
      const [peerId] = createSignal<PeerId>(PEER);
      createVKPinnedMessages(peerId, () => false);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mocks.getHistory).not.toHaveBeenCalled();

      dispose();
    });
  });

  it('чужой диалог из события не трогает список', async() => {
    stubPins([300]);

    await createRoot(async(dispose) => {
      const [peerId] = createSignal<PeerId>(PEER);
      const pinned = createVKPinnedMessages(peerId, () => true);
      await vi.waitFor(() => expect(pinned.ready()).toBe(true));

      const calls = mocks.getHistory.mock.calls.length;
      fire('peer_pinned_messages', {peerId: OTHER, mids: [1], pinned: true});
      fire('peer_pinned_hidden', {peerId: OTHER, maxId: 1});
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(pinned.hidden()).toBe(false);
      expect(mocks.getHistory.mock.calls.length).toBe(calls);

      dispose();
    });
  });
});
