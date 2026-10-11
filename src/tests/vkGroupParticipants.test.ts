import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createRoot, createSignal} from 'solid-js';
import '@helpers/peerIdPolyfill';
import createGroupParticipants from '@/vkgram/hooks/createGroupParticipants';

vi.hoisted(() => {
  (globalThis as any).Worker = class WorkerStub {};
  (globalThis as any).SharedWorker = class SharedWorkerStub {};
});

const getParticipantsMock = vi.hoisted(() => vi.fn());

vi.mock('@lib/rootScope', () => ({
  default: {
    managers: {
      appProfileManager: {getParticipants: getParticipantsMock}
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
}));

describe('createGroupParticipants', () => {
  beforeEach(() => {
    getParticipantsMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps the participants to peer ids and reports the server count', async() => {
    getParticipantsMock.mockResolvedValue({
      _: 'channels.channelParticipants',
      count: 58,
      participants: [
        {_: 'channelParticipant', user_id: 100, date: 1},
        {_: 'channelParticipantSelf', user_id: 101, date: 2}
      ]
    });

    await createRoot(async(dispose) => {
      const [peerId] = createSignal<PeerId>((500 as ChatId).toPeerId(true));
      const {participants, total} = createGroupParticipants({peerId, limit: 5});

      await vi.waitFor(() => {
        expect(participants()).toEqual([{peerId: (100 as UserId).toPeerId(false)}, {peerId: (101 as UserId).toPeerId(false)}]);
      });
      expect(total()).toBe(58);
      expect(getParticipantsMock).toHaveBeenCalledWith({id: 500 as ChatId, filter: {_: 'channelParticipantsRecent'}, limit: 5});

      dispose();
    });
  });

  it('falls back to the list length when there is no server count (a basic group)', async() => {
    getParticipantsMock.mockResolvedValue({
      _: 'chatParticipants',
      chat_id: 500,
      version: 1,
      participants: [{_: 'chatParticipant', user_id: 100, inviter_id: 1, date: 1}]
    });

    await createRoot(async(dispose) => {
      const [peerId] = createSignal<PeerId>((500 as ChatId).toPeerId(true));
      const {participants, total} = createGroupParticipants({peerId, limit: 5});

      await vi.waitFor(() => {
        expect(participants()).toEqual([{peerId: (100 as UserId).toPeerId(false)}]);
      });
      expect(total()).toBe(1);

      dispose();
    });
  });

  it('hides the list when the members are hidden (the request fails)', async() => {
    getParticipantsMock.mockRejectedValue(new Error('CHAT_ADMIN_REQUIRED'));

    await createRoot(async(dispose) => {
      const [peerId] = createSignal<PeerId>((500 as ChatId).toPeerId(true));
      const {participants, total} = createGroupParticipants({peerId, limit: 5});

      await vi.waitFor(() => {
        expect(participants()).toEqual([]);
      });
      expect(total()).toBeUndefined();

      dispose();
    });
  });
});
