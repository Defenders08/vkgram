import {createEffect, createMemo, createSignal, on, onCleanup, onMount, Show} from 'solid-js';
import type {Chat, User} from '@layer';
import {AvatarNewTsx} from '@components/avatarNew';
import {readAvatarSnapshot, writeAvatarSnapshotFromImage} from '@/vkgram/utils/avatarSnapshots';

type AnyPeer = User.user | Chat.chat | Chat.channel | undefined;

function peerLabel(peer: AnyPeer) {
  if(!peer) return '';
  if(peer._ === 'user') {
    if(peer.pFlags?.deleted) return 'Удалённый аккаунт';
    return [peer.first_name, peer.last_name].filter(Boolean).join(' ') || 'Пользователь';
  }
  return peer.title || 'Чат';
}

export function peerInitials(peer: AnyPeer) {
  const title = peerLabel(peer).trim();
  const words = title.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 2).map((word) => word[0]) : [title[0] || '?'])
    .join('')
    .toUpperCase();
}

/**
 * Web K's avatar in VKgram's wrapper. AvatarNewTsx can leave a broken <img> icon when a photo
 * is not (yet) usable: the wrapper notices the error and shows the initials on the project's blue
 * instead, and takes them away when the picture finally loads. Used by the dialog list, the chat
 * header and the messages — one avatar, one behaviour.
 */
export default function VKPeerAvatar(props: {peerId: PeerId, peer?: AnyPeer, size: number}) {
  let root!: HTMLSpanElement;
  const [showFallback, setShowFallback] = createSignal(false);
  // сорвавшуюся загрузку аватара (глюк сети, FILE_ID_INVALID у устаревшего кэша пира)
  // повторяем пару раз — повтор идёт через загрузчик Web K, ответ на повтор приходит
  // из его постоянного файлового кэша, как у оригинального клиента
  const [retryVersion, setRetryVersion] = createSignal(0);
  let retryTimer: number | undefined;
  // картинки, из которых снимок уже сохранён (событие load и наблюдатель дублируют друг друга)
  const snapshotSaved = new WeakSet<HTMLImageElement>();

  // Снимок аватара: красится синхронно прямо при рендере строки, пока настоящий
  // аватар (из постоянного кэша Web K) доезжает асинхронно, — после перезагрузки
  // страницы аватарки не мигают заглушкой
  const [snapshot, setSnapshot] = createSignal(readAvatarSnapshot(props.peerId));

  // Каждый пересчёт списка диалогов приносит новые объекты dialog.peerId, а
  // AvatarNewTsx перерисовывает аватар по смене ссылки peerId — выходит
  // мигание при каждом обновлении. Пропускаем внутрь PeerId, стабильный
  // по строке: новый объект того же пира ничего не перезапускает.
  const stablePeerId = createMemo((prev: PeerId | undefined) => {
    const id = props.peerId;
    return prev !== undefined && String(prev) === String(id) ? prev : id;
  });

  // другой диалог — счётчик повторов и снимок заново
  createEffect(on(stablePeerId, (id) => {
    window.clearTimeout(retryTimer);
    setRetryVersion(0);
    setShowFallback(false);
    setSnapshot(readAvatarSnapshot(id));
  }, {defer: true}));

  const scheduleRetry = () => {
    const attempt = retryVersion();
    if(attempt >= 2) return;
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => {
      setRetryVersion(attempt + 1);
      setShowFallback(false);
    }, attempt === 0 ? 5000 : 20000);
  };
  onCleanup(() => window.clearTimeout(retryTimer));

  // миниатюра-превью (stripped thumb) не считается: её битость не ломает аватар —
  // основная картинка поверх всё равно грузится
  const isMainImage = (image: EventTarget) =>
    image instanceof HTMLImageElement && !image.classList.contains('avatar-photo-thumbnail');

  const handleImageError = (event: Event) => {
    if(isMainImage(event.target)) {
      setShowFallback(true);
      scheduleRetry();
    }
  };

  const handleImageLoad = (event: Event) => {
    // фолбэк снимает только реальная загрузка картинки — наблюдатель внизу включает,
    // но не выключает его, иначе он циклит с загрузкой и аватар «мигает»
    if(isMainImage(event.target)) {
      const image = event.target as HTMLImageElement;
      setShowFallback(false);
      // настоящий аватар доехал: снимок больше не нужен и обновляется на свежий
      setSnapshot(undefined);
      if(!snapshotSaved.has(image)) {
        snapshotSaved.add(image);
        writeAvatarSnapshotFromImage(stablePeerId(), image);
      }
    }
  };

  onMount(() => {
    root.addEventListener('error', handleImageError, true);
    root.addEventListener('load', handleImageLoad, true);

    // Аватар Web K грузится лениво и может заменить картинку в любой момент:
    // разовая проверка при монтировании пропускает битые <img> (ошибка до того,
    // как картинка попала в DOM, смена src, реюз узла). Наблюдатель при любом
    // изменении DOM включает фолбэк, если основная картинка битая; пока картинка
    // ещё грузится, решения не принимаем — за это отвечают события error / load.
    const checkImages = () => {
      const images = Array.from(root.querySelectorAll('img')).filter(isMainImage);
      if(!images.length || images.some((image) => !image.complete)) return;
      if(images.every((image) => image.naturalWidth === 0)) {
        setShowFallback(true);
        scheduleRetry();
      } else if(images.every((image) => image.naturalWidth > 0)) {
        // страховка: если событие load пропустили (картинка вставилась и загрузилась
        // до подписки), снимок всё равно обновляем — по факту увиденной картинки
        for(const image of images) {
          if(snapshotSaved.has(image)) continue;
          snapshotSaved.add(image);
          writeAvatarSnapshotFromImage(stablePeerId(), image);
        }
      }
    };
    const observer = new MutationObserver(checkImages);
    observer.observe(root, {childList: true, subtree: true, attributeFilter: ['src']});
    checkImages();

    onCleanup(() => observer.disconnect());
  });

  onCleanup(() => {
    root.removeEventListener('error', handleImageError, true);
    root.removeEventListener('load', handleImageLoad, true);
  });

  return (
    <span
      ref={root}
      class="vk-peer-avatar"
      classList={{'has-fallback': showFallback()}}
      style={{width: `${props.size}px`, height: `${props.size}px`}}
    >
      <Show when={snapshot()}>
        <img class="vk-peer-avatar-snapshot" src={snapshot()} alt="" aria-hidden="true" />
      </Show>
      {/* retryVersion пересоздаёт AvatarNewTsx — это и есть повтор загрузки;
          when = version + 1, чтобы 0 не попал в «ложь»; у функции ребёнка обязан
          быть параметр, иначе Show считает её статичным элементом и не меняет */}
      <Show when={retryVersion() + 1} keyed>
        {(version: number) => <AvatarNewTsx peerId={stablePeerId()} size={props.size} data-version={version} />}
      </Show>
      <Show when={showFallback()}>
        <span class="vk-peer-avatar-fallback" aria-hidden="true">{peerInitials(props.peer)}</span>
      </Show>
    </span>
  );
}
