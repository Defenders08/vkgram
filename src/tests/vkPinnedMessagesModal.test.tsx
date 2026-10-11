import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import type {Message} from '@layer';
import '@helpers/peerIdPolyfill';
import VKPinnedMessagesModal from '@/vkgram/pages/messages/VKPinnedMessagesModal';

vi.hoisted(() => {
  (globalThis as any).Worker = class WorkerStub {};
  (globalThis as any).SharedWorker = class SharedWorkerStub {};
});

// синглтон прокси при импорте стартует крипто-воркер (fetch(undefined) в jsdom) — глушим
vi.mock('@lib/apiManagerProxy', () => ({default: {}}));

const unpinPopup = vi.hoisted(() => vi.fn());

vi.mock('@lib/rootScope', () => ({
  default: {
    managers: {},
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
}));

// вместо стора — свой объект: в тесте создаём только чатов
vi.mock('@stores/peers', () => ({
  usePeers: () => peersMock.current
}));

// хук тянет @appManagers/utils/dialogs → тяжёлый граф менеджеров; нужна только «это канал-лента»
vi.mock('@/vkgram/hooks/useSubscribedChannels', () => ({
  isBroadcastChannel: (peer: any) => peer?._ === 'channel' && !!peer?.broadcast
}));

// режим выделения постов тянет граф пересылки — здесь он не нужен
vi.mock('@/vkgram/pages/channel/postSelection', () => ({
  isSelecting: () => false,
  isPostSelected: () => false,
  togglePostSelection: vi.fn()
}));

vi.mock('@appManagers/utils/peers/getPeerActiveUsernames', () => ({
  default: (): any[] => []
}));

vi.mock('@appManagers/utils/peers/getPeerId', () => ({
  default: (peer: any) => ('user_id' in peer ? peer.user_id : `-${peer.channel_id ?? peer.chat_id}`)
}));

// реальному форматтеру нужен язык i18n, который тесты не поднимают
vi.mock('@helpers/date', () => ({
  formatDateAccordingToTodayNew: (date: Date) => `${date.getDate()}.10`
}));

// wrapRichText импортирует рендерер кастомных эмодзи — здесь он не тестируется
vi.mock('@lib/customEmoji/element', () => ({
  default: class CustomEmojiElementStub {},
  CustomEmojiElements: Set
}));

vi.mock('@/vkgram/components/VKPeerAvatar', () => ({default: () => <span class="avatar-mock" />}));

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: () => <span class="avatar-mock" />
}));

// ветки рендера сообщения тянут web-K-обёртки медиа ( album → chat.ts, у которого
// боковой сайдбар строится на импорте) — здесь нужен только mediaLabel
vi.mock('@/vkgram/components/MessageMedia', () => ({
  default: (): null => null
}));

vi.mock('@/vkgram/components/MessageMeta', () => ({
  default: () => <span class="meta-mock" />
}));

vi.mock('@/vkgram/pages/channel/VKChannelPostReactions', () => ({
  default: (): null => null
}));

vi.mock('@/vkgram/pages/channel/VKChannelPostComments', () => ({
  default: (): null => null
}));

vi.mock('@components/popups/unpinMessage', () => ({default: unpinPopup}));

const peersMock: {current: any} = {current: {}};

const dispose: (() => void)[] = [];
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
  unpinPopup.mockClear();
  peersMock.current = {};
  vi.unstubAllGlobals();
});

// у окна VKModal на монтировании есть matchMedia (jsdom его не знает)
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({matches: false, addEventListener() {}, removeEventListener() {}}));
});

const PEER = (500 as ChatId).toPeerId(true);
const ALICE = (100 as UserId).toPeerId(false);

// автор и собеседник — чтобы автор был отличен от самого диалога
peersMock.current = {
  [String(PEER)]: {_: 'chat', id: 500, title: 'Беседа'},
  [String(ALICE)]: {_: 'user', id: 100, first_name: 'Алиса'}
};

const message = (overrides: Partial<Message.message>) => ({
  _: 'message',
  mid: 300,
  peerId: PEER,
  fromId: ALICE,
  date: 1759660000,
  message: 'привет',
  ...overrides
} as unknown as Message.message);

const mount = (props: Partial<Parameters<typeof VKPinnedMessagesModal>[0]> = {}, list = [message({})]) => {
  const root = document.body;
  const onJump = vi.fn();
  dispose.push(render(() => (
    <VKPinnedMessagesModal
      peerId={PEER}
      list={() => list}
      canPin={true}
      onClose={() => {}}
      onJump={onJump}
      {...props as any}
    />
  ), root));
  return {root, onJump};
};

describe('окно «Все закреплённые»', () => {
  it('рисует строки: автор, дата, текст; клик переходит к сообщению', () => {
    const {root, onJump} = mount({}, [message({mid: 300}), message({mid: 200, message: 'второе'})]);

    const rows = root.querySelectorAll('.vk-pinned-row');
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('.vk-pinned-row-author')!.textContent).toBe('Алиса');
    expect(rows[0].querySelector('.vk-pinned-row-text')!.textContent).toBe('привет');
    expect(rows[0].querySelector('.vk-pinned-row-date')!.textContent).toBeTruthy();

    (rows[1].querySelector('.vk-pinned-row-main') as HTMLButtonElement).click();
    expect(onJump).toHaveBeenCalledWith(200);
  });

  it('своё сообщение подписано «Вы», медиа без текста — именем вложения', () => {
    const list = [
      message({mid: 301, pFlags: {out: true}}),
      message({mid: 302, message: '', media: {_: 'messageMediaPhoto', pFlags: {}} as any})
    ];
    const {root} = mount({}, list);

    const texts = Array.from(root.querySelectorAll('.vk-pinned-row-text'));
    expect(texts[0].textContent).toBe('привет');
    expect(texts[1].textContent).toBe('Фотография');
    expect(root.querySelector('.vk-pinned-row-author')!.textContent).toBe('Вы');
  });

  it('«×» открепляет строку через окно Web K, «Открепить все» — весь список', async() => {
    const list = [message({mid: 300}), message({mid: 200})];
    const {root} = mount({}, list);

    const unpinButtons = root.querySelectorAll<HTMLButtonElement>('.vk-pinned-row-unpin');
    expect(unpinButtons.length).toBe(2);
    unpinButtons[1].click();
    await vi.waitFor(() => expect(unpinPopup).toHaveBeenCalledWith(PEER, 200, true));

    const unpinAll = Array.from(root.querySelectorAll('button'))
    .find((button) => button.textContent === 'Открепить все');
    expect(unpinAll).toBeTruthy();
    unpinAll!.click();
    await vi.waitFor(() => expect(unpinPopup).toHaveBeenCalledWith(PEER, 0, true));
  });

  it('без права закреплять нет ни «×», ни «Открепить все»', () => {
    const list = [message({mid: 300}), message({mid: 200})];
    const {root} = mount({canPin: false}, list);

    expect(root.querySelectorAll('.vk-pinned-row-unpin').length).toBe(0);
    expect(Array.from(root.querySelectorAll('button')).some((button) => button.textContent === 'Открепить все')).toBe(false);
  });

  it('пустой список: заглушка и ничего лишнего', () => {
    const {root} = mount({}, []);

    expect(root.querySelector('.vk-pinned-empty')!.textContent).toContain('Нет закреплённых сообщений');
    expect(root.querySelectorAll('.vk-pinned-row').length).toBe(0);
  });
});
