import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createRoot, createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';
import {MiniPeerBlock} from '@/vkgram/pages/profile/VKProfileSideBlocks';

vi.hoisted(() => {
  (globalThis as any).Worker = class WorkerStub {};
  (globalThis as any).SharedWorker = class SharedWorkerStub {};
});

const peersMock = vi.hoisted(() => ({} as Record<string, any>));

vi.mock('@lib/rootScope', () => ({
  default: {
    myId: 1,
    managers: {},
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
}));

vi.mock('@stores/peers', () => ({
  usePeers: () => peersMock
}));

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: () => <span class="avatar-mock" />
}));

/** the block's title line must show a member's NAME — the bug was `title` read off a user */
describe('MiniPeerBlock names', () => {
  beforeEach(() => {
    for(const key of Object.keys(peersMock)) delete peersMock[key];
  });

  it('shows a user participant by first and last name, not by a missing `title`', () => {
    const peerId = (100 as UserId).toPeerId(false);
    peersMock[peerId] = {_: 'user', id: 100, first_name: 'Аш', last_name: 'Тестов', pFlags: {}};

    const div = document.createElement('div');
    createRoot((dispose) => {
      render(() => (
        <MiniPeerBlock
          title="Участники"
          total={58}
          peers={[{peerId}]}
          onOpen={() => {}}
        />
      ), div);

      const name = div.querySelector('.vk-mini-name');
      expect(name?.textContent).toBe('Аш Тестов');
      dispose();
    });
  });

  it('falls back to the username when a deleted user has no name, and keeps chat titles', () => {
    const deletedId = (101 as UserId).toPeerId(false);
    peersMock[deletedId] = {_: 'user', id: 101, username: 'ghost', pFlags: {deleted: true}};
    const chatId = (200 as ChatId).toPeerId(true);
    peersMock[chatId] = {_: 'chat', id: 200, title: 'Тестовая группа', pFlags: {}};

    const div = document.createElement('div');
    createRoot((dispose) => {
      render(() => (
        <MiniPeerBlock
          title="Участники"
          total={2}
          peers={[{peerId: deletedId}, {peerId: chatId}]}
          onOpen={() => {}}
        />
      ), div);

      const names = [...div.querySelectorAll('.vk-mini-name')].map((el) => el.textContent);
      expect(names).toEqual(['Удалённый аккаунт', 'Тестовая группа']);
      dispose();
    });
  });
});
