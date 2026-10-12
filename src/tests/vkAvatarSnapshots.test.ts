import {afterEach, describe, expect, it} from 'vitest';
import {readAvatarSnapshot, writeAvatarSnapshot} from '@/vkgram/utils/avatarSnapshots';

const pid = (id: number) => ({toString: () => String(-id)}) as unknown as PeerId;

afterEach(() => {
  localStorage.clear();
});

describe('хранилище снимков аватаров', () => {
  it('запись и чтение, чтение поднимает свежесть', () => {
    writeAvatarSnapshot(pid(1), 'data:image/jpeg;base64,A');
    expect(readAvatarSnapshot(pid(1))).toBe('data:image/jpeg;base64,A');
  });

  it('не-image строки не сохраняются', () => {
    writeAvatarSnapshot(pid(2), 'javascript:alert(1)');
    expect(readAvatarSnapshot(pid(2))).toBeUndefined();
  });

  it('перезапись того же пира обновляет значение', () => {
    writeAvatarSnapshot(pid(3), 'data:image/jpeg;base64,OLD');
    writeAvatarSnapshot(pid(3), 'data:image/jpeg;base64,NEW');
    expect(readAvatarSnapshot(pid(3))).toBe('data:image/jpeg;base64,NEW');
  });

  it('хранилище переживёт перезагрузку страницы (localStorage)', () => {
    writeAvatarSnapshot(pid(4), 'data:image/jpeg;base64,PERSIST');
    // модуль кэширует в памяти — имитируем новую сессию очисткой кэша модуля нельзя,
    // поэтому проверяем, что данные реально в localStorage
    const raw = localStorage.getItem('vkgram_avatar_snapshots')!;
    expect(raw).toContain('PERSIST');
    expect(readAvatarSnapshot(pid(4))).toBe('data:image/jpeg;base64,PERSIST');
  });

  it('переполнение вытесняет самые старые', () => {
    for(let i = 0; i < 500; ++i) {
      writeAvatarSnapshot(pid(i + 1000), `data:image/jpeg;base64,V${i}`);
    }
    // первые (самые старые) вытеснены, последние — на месте
    expect(readAvatarSnapshot(pid(1000))).toBeUndefined();
    expect(readAvatarSnapshot(pid(1499))).toBe('data:image/jpeg;base64,V499');
  });
});
