import {createEffect, onCleanup, Show} from 'solid-js';
import type {Reaction} from '@layer';
import wrapRichText from '@richTextProcessor/wrapRichText';
import {getMiddleware} from '@helpers/middleware';
import {makeMediaSize} from '@helpers/mediaSize';

// stands in for a custom emoji until Web K has loaded its sticker (and where it cannot be shown)
const CUSTOM_PLACEHOLDER = '✦';

/**
 * A custom emoji — Telegram's animated / static sticker-emoji, identified by
 * the id of its document. It is drawn by Web K itself: the id goes through
 * `wrapRichText` as a `messageEntityCustomEmoji`, the very path the text of a
 * post takes, so loading, caching, animation (only while on screen) and the
 * text color of a «tinted» emoji are Web K's. Nothing is fetched or drawn here.
 */
function CustomEmoji(props: {docId: string, size: number}) {
  let element!: HTMLSpanElement;

  createEffect(() => {
    const docId = props.docId;
    const size = props.size;
    const middlewareHelper = getMiddleware();
    onCleanup(() => middlewareHelper.destroy());

    element.replaceChildren(
      wrapRichText(CUSTOM_PLACEHOLDER, {
        entities: [{
          _: 'messageEntityCustomEmoji',
          offset: 0,
          length: CUSTOM_PLACEHOLDER.length,
          document_id: docId
        }],
        middleware: middlewareHelper.get(),
        customEmojiSize: makeMediaSize(size, size)
      } as any)
    );
  });

  return (
    <span
      ref={element}
      class="vk-custom-emoji"
      style={{width: `${props.size}px`, height: `${props.size}px`, 'font-size': `${props.size}px`}}
    />
  );
}

// символы вроде ❤ (U+2764) без VS16 браузер рисует монохромным шрифтовым глифом:
// эмодзи из таких диапазонов принудительно переключаем на цветную презентацию
const TEXT_PRESENTATION = /[\u00A9\u00AE\u203C\u2049\u2122\u2139\u2194-\u21AA\u231A-\u23FA\u24C2\u25AA-\u25FE\u2600-\u27BF\u2934\u2935\u2B05-\u2B55\u3030\u303D\u3297\u3299]$/;

// the text form of a reaction that has one: an emoji, or the paid star
function plainGlyph(reaction: Reaction) {
  if(reaction._ === 'reactionEmoji') {
    const emoticon = reaction.emoticon;
    return !emoticon.includes('\uFE0F') && TEXT_PRESENTATION.test(emoticon) ? emoticon + '\uFE0F' : emoticon;
  }
  if(reaction._ === 'reactionPaid') return '⭐';
  return CUSTOM_PLACEHOLDER;
}

/** A reaction the viewer can put from here: a regular emoji or a custom one (stars cost money) */
export function isPickableReaction(reaction: Reaction): reaction is Reaction.reactionEmoji | Reaction.reactionCustomEmoji {
  return reaction._ === 'reactionEmoji' || reaction._ === 'reactionCustomEmoji';
}

/**
 * The picture of one reaction: the emoji as text, a custom emoji as Web K's
 * own animated element, the paid reaction as a star.
 */
export default function VKReactionGlyph(props: {reaction: Reaction, size?: number}) {
  return (
    <Show when={props.reaction._ === 'reactionCustomEmoji'} fallback={<>{plainGlyph(props.reaction)}</>}>
      <CustomEmoji
        docId={String((props.reaction as Reaction.reactionCustomEmoji).document_id)}
        size={props.size ?? 18}
      />
    </Show>
  );
}
