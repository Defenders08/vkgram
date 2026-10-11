import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createEffect, createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';
import VKGroupMedia from '@/vkgram/pages/group/VKGroupMedia';

vi.hoisted(() => {
  (globalThis as any).Worker = class WorkerStub {};
  (globalThis as any).SharedWorker = class SharedWorkerStub {};
});

// what each material type «found»: the stub answers the shell's onCount with this
const mocks = vi.hoisted(() => ({
  material: {} as Record<string, number>,
  savedCount: 0
}));

vi.mock('@/vkgram/pages/channel/VKChannelMedia', () => ({
  KINDS: {
    media: {title: 'Медиа'},
    files: {title: 'Файлы'},
    links: {title: 'Ссылки'},
    music: {title: 'Музыка'}
  },
  default: (props: {kind: string, onCount?: (count: number) => void}) => {
    // as the real block: onCount fires once its history is loaded, not before
    createEffect(() => {
      const count = mocks.material[props.kind];
      if(count !== undefined) props.onCount?.(count);
    });
    return <div class="mock-panel" data-kind={props.kind} />;
  }
}));

vi.mock('@/vkgram/pages/channel/createChannelHistory', () => ({
  default: () => ({
    messages: (): never[] => [],
    status: () => 'loaded',
    count: () => mocks.savedCount,
    isLoadingMore: () => false,
    isEnd: () => true,
    loadMore: () => {},
    reload: () => {}
  })
}));

vi.mock('@lib/rootScope', () => ({
  default: {myId: 1, addEventListener: vi.fn(), removeEventListener: vi.fn()}
}));

vi.mock('@stores/peers', () => ({
  usePeers: () => ({})
}));

const setMaterialCounts = (values: Record<string, number>) => {
  mocks.material = values;
};

describe('VKGroupMedia', () => {
  beforeEach(() => {
    setMaterialCounts({});
    mocks.savedCount = 0;
  });

  it('offers every tab of the original profile while the counts are unknown', () => {
    const div = document.createElement('div');
    render(() => <VKGroupMedia peerId={(500 as ChatId).toPeerId(true)} />, div);

    // «Сохранённое» is known empty at once (the stub answers 0), the rest stay unknown
    const tabs = [...div.querySelectorAll('.vk-tab')].map((el) => el.textContent);
    expect(tabs).toEqual(['Медиа', 'Файлы', 'Ссылки', 'Музыка']);
    expect(div.querySelector('.vk-tab.is-active')?.textContent).toBe('Медиа');
  });

  it('hides the block when nothing of any type exists', () => {
    setMaterialCounts({media: 0, files: 0, links: 0, music: 0});
    mocks.savedCount = 0;

    const div = document.createElement('div');
    render(() => <VKGroupMedia peerId={(500 as ChatId).toPeerId(true)} />, div);

    expect(div.querySelector('.vk-group-media')).toBeNull();
  });

  it('drops an empty type\'s tab and steps the active tab to the next one that has material', () => {
    setMaterialCounts({media: 0, files: 12, links: 0, music: 0});
    mocks.savedCount = 0;

    const div = document.createElement('div');
    render(() => <VKGroupMedia peerId={(500 as ChatId).toPeerId(true)} />, div);

    const tabs = [...div.querySelectorAll('.vk-tab')].map((el) => el.textContent);
    expect(tabs).toEqual(['Файлы']);
    expect(div.querySelector('.vk-tab.is-active')?.textContent).toBe('Файлы');

    // the panels stay mounted whatever is active — only hidden
    expect(div.querySelectorAll('.mock-panel').length).toBe(4);
    expect((div.querySelector('#vk-group-media-panel-files') as HTMLElement)?.hidden).toBe(false);
    expect((div.querySelector('#vk-group-media-panel-media') as HTMLElement)?.hidden).toBe(true);
  });

  it('keeps the saved tab when the user has saved messages from the group', () => {
    setMaterialCounts({media: 0, files: 0, links: 0, music: 0});
    mocks.savedCount = 3;

    const div = document.createElement('div');
    render(() => <VKGroupMedia peerId={(500 as ChatId).toPeerId(true)} />, div);

    const tabs = [...div.querySelectorAll('.vk-tab')].map((el) => el.textContent);
    expect(tabs).toEqual(['Сохранённое']);
    expect(div.querySelector('.vk-tab.is-active')?.textContent).toBe('Сохранённое');
  });
});
