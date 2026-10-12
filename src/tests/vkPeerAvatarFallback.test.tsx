import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import {createEffect, createSignal} from 'solid-js';
import '@helpers/peerIdPolyfill';
import VKPeerAvatar from '@/vkgram/components/VKPeerAvatar';

vi.hoisted(() => {
  (globalThis as any).Worker = class WorkerStub {};
  (globalThis as any).SharedWorker = class SharedWorkerStub {};
});

type ImgState = {broken: boolean, thumbnail?: boolean, loading?: boolean};

// сам аватар Web K не тестируем — его <img> и изображаем; запоминаем, какой
// peerId до него дошёл (VKPeerAvatar должен пропускать стабильный по строке)
const imgState = vi.hoisted(() => ({broken: false, thumbnail: false, loading: false}));
const seenPeerIds = vi.hoisted(() => [] as any[]);

// снимки аватара — с контролируемым состоянием
const snapshots = vi.hoisted(() => ({url: undefined as string | undefined, saved: 0}));

vi.mock('@/vkgram/utils/avatarSnapshots', () => ({
  readAvatarSnapshot: vi.fn(() => snapshots.url),
  writeAvatarSnapshotFromImage: vi.fn(() => {
    snapshots.saved++;
  })
}));

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: (props: any) => {
    // как настоящий AvatarNewTsx: peerId читается реактивно (его effect
    // перерисовывает аватар по смене ссылки)
    createEffect(() => {
      seenPeerIds.push(props.peerId);
    });
    const img = document.createElement('img');
    if(imgState.thumbnail) img.className = 'avatar-photo avatar-photo-thumbnail';
    img.src = imgState.loading ? 'blob:pending' : imgState.broken ? 'blob:broken' : 'blob:ok';
    // jsdom не грузит картинки: состояние задаём руками, как делает браузер
    Object.defineProperty(img, 'complete', {value: !imgState.loading});
    Object.defineProperty(img, 'naturalWidth', {value: imgState.broken || imgState.loading ? 0 : 24});
    return img;
  }
}));

// объектный PeerId (как в приложении): одинаковая строка — разный объект
const pid = (id: number) => ({toString: () => String(-id)}) as unknown as PeerId;

const dispose: (() => void)[] = [];
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
  imgState.broken = false;
  imgState.thumbnail = false;
  imgState.loading = false;
  seenPeerIds.length = 0;
  snapshots.url = undefined;
  snapshots.saved = 0;
});

const PEER = (500 as ChatId).toPeerId(true);
const peer = {_id: 'p', _: 'chat', id: 500, title: 'Тестовый чат'} as any;

const mount = () => {
  const root = document.body;
  dispose.push(render(() => <VKPeerAvatar peerId={PEER} peer={peer} size={46} />, root));
  return root.querySelector('.vk-peer-avatar') as HTMLElement;
};

describe('фолбэк инициалов у аватара', () => {
  it('битая основная картинка — инициалы', async() => {
    imgState.broken = true;
    const avatar = mount();
    // MutationObserver срабатывает асинхронно
    await vi.waitFor(() => {
      expect(avatar.classList.contains('has-fallback')).toBe(true);
    });
    expect(avatar.querySelector('.vk-peer-avatar-fallback')!.textContent).toBe('ТЧ');
  });

  it('битая миниатюра при целой основной — аватар не трогаем', async() => {
    imgState.broken = true;
    imgState.thumbnail = true;
    const avatar = mount();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(avatar.classList.contains('has-fallback')).toBe(false);
  });

  it('ещё грузящаяся картинка решения не принимает', async() => {
    imgState.loading = true;
    const avatar = mount();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(avatar.classList.contains('has-fallback')).toBe(false);
  });

  it('нормальная картинка — фолбэка нет, и он не включается повторными мутациями', async() => {
    const avatar = mount();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(avatar.classList.contains('has-fallback')).toBe(false);
    expect(avatar.querySelector('.vk-peer-avatar-fallback')).toBeFalsy();
  });

  it('снимок рисуется сразу и снимается, когда настоящий аватар загрузился', async() => {
    imgState.loading = true; // настоящий аватар ещё едет
    snapshots.url = 'data:image/jpeg;base64,SNAPSHOT';
    const avatar = mount();
    await new Promise((resolve) => setTimeout(resolve, 20));

    // снимок виден сразу, пока настоящий грузится
    const snap = avatar.querySelector('.vk-peer-avatar-snapshot') as HTMLImageElement;
    expect(snap).toBeTruthy();
    expect(snap.getAttribute('src')).toBe('data:image/jpeg;base64,SNAPSHOT');

    // настоящий доехал: снимок снят и обновлён из загруженной картинки
    const real = avatar.querySelector('img:not(.vk-peer-avatar-snapshot)') as HTMLImageElement;
    real.dispatchEvent(new Event('load', {bubbles: true}));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(avatar.querySelector('.vk-peer-avatar-snapshot')).toBeFalsy();
    expect(snapshots.saved).toBe(1);
  });

  it('новый объект PeerId того же пира не долетает до AvatarNewTsx', async() => {
    seenPeerIds.length = 0;
    const root = document.body;
    const [peerId, setPeerId] = createSignal<PeerId>(pid(600));
    dispose.push(render(() => <VKPeerAvatar peerId={peerId()} peer={peer} size={46} />, root));
    await new Promise((resolve) => setTimeout(resolve, 10));

    const first = seenPeerIds[0];
    expect(first).toBeTruthy();

    // «обновление диалогов»: новый объект, та же строка — до AvatarNewTsx не доходит
    setPeerId(pid(600));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seenPeerIds.length).toBe(1);
    expect(seenPeerIds[0]).toBe(first);

    // настоящий другой peer долетает
    setPeerId(pid(700));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seenPeerIds.length).toBe(2);
    expect(seenPeerIds[1]).not.toBe(first);
  });

  it('битый аватар перезагружается сам: два повтора, дальше — нет', async() => {
    vi.useFakeTimers();
    try {
      imgState.broken = true;
      seenPeerIds.length = 0;
      const root = document.body;
      dispose.push(render(() => <VKPeerAvatar peerId={pid(800)} peer={peer} size={46} />, root));

      // битая картинка → фолбэк
      await vi.advanceTimersByTimeAsync(100);
      const avatar = root.querySelector('.vk-peer-avatar') as HTMLElement;
      expect(avatar.classList.contains('has-fallback')).toBe(true);
      const mountsAfterFirstFail = seenPeerIds.length;

      // первый повтор через 5 с: AvatarNewTsx пересоздан, фолбэк снят (и вернётся от наблюдателя)
      await vi.advanceTimersByTimeAsync(5000);
      expect(seenPeerIds.length).toBeGreaterThan(mountsAfterFirstFail);

      // второй повтор через 20 с, третьего не будет
      const mountsAfterSecondRetry = seenPeerIds.length;
      await vi.advanceTimersByTimeAsync(20000);
      const mountsAfterSecond = seenPeerIds.length;
      expect(mountsAfterSecond).toBeGreaterThan(mountsAfterSecondRetry);

      await vi.advanceTimersByTimeAsync(60000);
      expect(seenPeerIds.length).toBe(mountsAfterSecond);
    } finally {
      vi.useRealTimers();
    }
  });
});
