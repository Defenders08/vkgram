// Мгновенные аватарки «Сообщений»: маленький снимок последнего показанного
// аватара в localStorage, который красится синхронно при рендере строки, —
// постоянный кэш Web K отвечает асинхронно, и после перезагрузки страницы
// аватарки успевают мигнуть заглушкой. Настоящий аватар (из кэша Web K)
// подменяет снимок, когда доедет; снимок в это же время обновляется.

const STORAGE_KEY = 'vkgram_avatar_snapshots';
const MAX_ENTRIES = 400; // ~1 МБ при 46px jpeg

type SnapshotStorage = {order: string[], data: {[peerId: string]: string}};

let cache: SnapshotStorage | undefined;

const read = (): SnapshotStorage => {
  if(cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) {
      const parsed = JSON.parse(raw) as SnapshotStorage;
      if(parsed && typeof parsed === 'object' && parsed.data && Array.isArray(parsed.order)) {
        return cache = parsed;
      }
    }
  } catch(err) {
    console.error('VKgram: failed to read avatar snapshots', err);
  }
  return cache = {order: [], data: {}};
};

const flush = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    // одноразовая подсказка в консоль: снимки реально сохраняются
    if(!loggedFlush) {
      loggedFlush = true;
      const size = Math.round(JSON.stringify(cache).length / 1024);
      console.debug(`VKgram: аватарки кэшируются для мгновенной отрисовки (снимков: ${cache.order.length}, ${size} КБ)`);
    }
  } catch(err) {
    // квота — режем самые старые и пробуем ещё раз
    const storage = read();
    while(storage.order.length && storage.order.length > 10) {
      const oldest = storage.order.shift()!;
      delete storage.data[oldest];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
        return;
      } catch(e) {
        console.error('VKgram: failed to trim avatar snapshots', e);
      }
    }
  }
};

let loggedFlush = false;

/** Снимок аватара пира (dataURL), если он ещё актуален в хранилище. */
export function readAvatarSnapshot(peerId: PeerId): string | undefined {
  const key = String(peerId);
  const storage = read();
  const url = storage.data[key];
  if(!url) return undefined;

  // LRU: перезапись порядка — чтение означает, что аватар на экране
  const index = storage.order.indexOf(key);
  if(index !== -1) storage.order.splice(index, 1);
  storage.order.push(key);
  return url;
}

/** Сохранить dataURL снимка (строкой — для тестов и обновления из готового кадра). */
export function writeAvatarSnapshot(peerId: PeerId, dataUrl: string) {
  if(!dataUrl || !dataUrl.startsWith('data:image')) return;
  // слишком крупные кадры хранилище распухают — лучше отсутствие снимка одного пира
  if(dataUrl.length > 48 * 1024) return;
  const key = String(peerId);
  const storage = read();
  if(storage.data[key] === dataUrl) return;

  const index = storage.order.indexOf(key);
  if(index !== -1) storage.order.splice(index, 1);
  storage.order.push(key);
  storage.data[key] = dataUrl;

  while(storage.order.length > MAX_ENTRIES) {
    const oldest = storage.order.shift()!;
    delete storage.data[oldest];
  }
  flush();
}

/**
 * Снять и сохранить снимок с уже загруженной картинки аватара
 * (уменьшаем до 96px, jpeg — чтобы хранилище не распухало).
 */
export function writeAvatarSnapshotFromImage(peerId: PeerId, image: HTMLImageElement) {
  try {
    const srcSide = Math.min(image.naturalWidth, image.naturalHeight);
    if(!srcSide) return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const context = canvas.getContext('2d');
    if(!context) throw new Error('no 2d context');
    // центр-кроп квадрата и уменьшение до 96px
    context.drawImage(
      image,
      (image.naturalWidth - srcSide) / 2,
      (image.naturalHeight - srcSide) / 2,
      srcSide,
      srcSide,
      0,
      0,
      96,
      96
    );
    writeAvatarSnapshot(peerId, canvas.toDataURL('image/jpeg', 0.75));
    return;
  } catch(err) {
    // canvas недоступен (испорченная картинка, запрет рисования) — ниже запасной путь
  }

  // запасной путь: весь файл целиком как dataURL (крупнее, но лучше, чем ничего)
  const src = image.src;
  if(!src || (!src.startsWith('blob:') && !src.startsWith('data:'))) return;
  fetch(src).then((response) => response.blob()).then((blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  })).then((dataUrl) => writeAvatarSnapshot(peerId, dataUrl)).catch((err) => {
    console.error('VKgram: failed to save avatar snapshot', err);
  });
}
