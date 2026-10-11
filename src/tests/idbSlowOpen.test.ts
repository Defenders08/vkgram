import {afterEach, beforeAll, expect, test, vi} from 'vitest';
import {IDBKeyRange, indexedDB} from 'fake-indexeddb';

import {getDatabaseState} from '@config/databases/state';
import IDBStorage from '@lib/files/idb';
import DeferredIsUsingPasscode from '@lib/passcode/deferredIsUsingPasscode';
import EncryptionKeyStore from '@lib/passcode/keyStore';
import AppStorage from '@lib/storage';

beforeAll(() => {
  (globalThis as any).indexedDB = indexedDB;
  (globalThis as any).IDBKeyRange = IDBKeyRange;
  // * `Array.from` keeps the result in this realm, the one `instanceof Uint8Array` is checked against
  (globalThis as any).Uint8Array = new TextEncoder().encode('').constructor;
  DeferredIsUsingPasscode.resolveDeferred(false);
  EncryptionKeyStore.save(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  (globalThis as any).indexedDB = indexedDB;
});

// * пишет значение в базу напрямую, не через класс IDB: тот кэширует соединение
// * на всю жизнь процесса, а тесту нужна база «с прошлой сессии», ещё не открытая
const seedRaw = async(name: string, store: string, key: string, value: unknown) => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(store);
    };
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(store, 'readwrite');
      transaction.objectStore(store).put(value, key);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
};

// * читает из базы напрямую, минуя кэш хранилища: так видно, что реально легло на диск
const readRaw = <T>(name: string, store: string, key: string) => {
  return new Promise<T>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(store, 'readonly');
      const read = transaction.objectStore(store).get(key);
      read.onsuccess = () => {
        db.close();
        resolve(read.result as T);
      };
      read.onerror = () => reject(read.error);
    };
    request.onerror = () => reject(request.error);
  });
};

// * открывает базу как есть и отдаёт соединение — им класс IDB «отпускается»
const openRaw = (name: string, createStore?: string) => {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => {
      if(createStore) {
        request.result.createObjectStore(createStore);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// * управляемый `indexedDB.open`: запрос висит, пока тест его не «отпустит», —
// * так открывается база в холодном мобильном браузере после убийства вкладки
let hangingOpens: {request: any}[] = [];

const hangIndexedDB = () => {
  hangingOpens = [];
  (globalThis as any).indexedDB = {
    open: (name: string, version: number) => {
      const request: any = {name, version};
      hangingOpens.push({request});
      return request;
    }
  };
};

const releaseOpens = (db: IDBDatabase) => {
  const opens = hangingOpens;
  hangingOpens = [];
  for(const {request} of opens) {
    request.result = db;
    request.onsuccess({target: request} as any);
  }
};

test('чтение сессии переживает медленное открытие базы', async() => {
  const db = getDatabaseState(1);
  await seedRaw(db.name, 'session', 'authState', {_: 'authStateSignedIn'});

  hangIndexedDB();
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});

  const storage = new AppStorage(db, 'session');
  const promise = storage.get('authState');

  let settled = false;
  promise.then(() => settled = true).catch(() => {});

  // * на третьей секунде открывание сдаётся, но хранилище не «ломается»:
  // * читатель остаётся ждать, ошибка не кэшируется навсегда
  await vi.advanceTimersByTimeAsync(3000);
  expect(settled).toBe(false);
  expect(storage.isAvailable()).toBe(true);

  // * база всё-таки открылась — чтение дожидается её и возвращает значение,
  // * а не «нет сессии»
  releaseOpens(await openRaw(db.name));
  await vi.advanceTimersByTimeAsync(1000);
  await expect(promise).resolves.toEqual({_: 'authStateSignedIn'});
  expect(storage.isAvailable()).toBe(true);
});

test('запись, попавшая в окно медленного открытия, не теряется', async() => {
  const db = getDatabaseState(2);

  hangIndexedDB();
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});

  const storage = new AppStorage(db, 'session');
  // * `set` ждёт конца сохранения, а то висит на открытии базы, — не ждём его сразу
  const setPromise = storage.set({'authState': {_: 'authStateSignIn'} as any});
  await vi.advanceTimersByTimeAsync(3000);
  await setPromise;

  releaseOpens(await openRaw(db.name, 'session'));
  await vi.advanceTimersByTimeAsync(1000);

  expect(await readRaw(db.name, 'session', 'authState')).toEqual({_: 'authStateSignIn'});
});
