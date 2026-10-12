import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import type {Reaction} from '@layer';
import VKReactionGlyph from '@/vkgram/components/VKReactionGlyph';

vi.mock('@richTextProcessor/wrapRichText', () => ({
  default: () => document.createElement('span')
}));

vi.mock('@helpers/middleware', () => ({
  getMiddleware: () => {
    const helper: any = {get: () => helper, destroy: () => {}, onClean: () => {}};
    return helper;
  }
}));

const dispose: (() => void)[] = [];
afterEach(() => {
  while(dispose.length) dispose.pop()?.();
  document.body.innerHTML = '';
});

const mount = (reaction: Reaction) => {
  const root = document.body;
  dispose.push(render(() => <VKReactionGlyph reaction={reaction} size={16} />, root));
  return root.querySelector('.vk-reaction-glyph')?.textContent ?? root.textContent ?? '';
};

describe('глиф реакции — цветной эмодзи', () => {
  it('❤ без VS16 дорисовывает VS16 (иначе — монохромный шрифтовой глиф)', () => {
    expect(mount({_: 'reactionEmoji', emoticon: '\u2764'} as any)).toBe('\u2764\uFE0F');
  });

  it('эмодзи с VS16 и обычные не меняются', () => {
    expect(mount({_: 'reactionEmoji', emoticon: '\u2764\uFE0F'} as any)).toBe('\u2764\uFE0F');
    while(dispose.length) dispose.pop()?.();
    document.body.innerHTML = '';
    expect(mount({_: 'reactionEmoji', emoticon: '\u{1F44D}'} as any)).toBe('\u{1F44D}');
  });

  it('платная реакция — звезда', () => {
    expect(mount({_: 'reactionPaid'} as any)).toBe('⭐');
  });
});
