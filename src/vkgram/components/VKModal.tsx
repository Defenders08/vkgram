import {createUniqueId, JSX, onCleanup, onMount} from 'solid-js';
import {Portal} from 'solid-js/web';
import VKIcon from '@/vkgram/components/VKIcons';
import containTabFocus from '@/vkgram/utils/containTabFocus';

// the first thing worth typing into
const FIELD = 'input:not(:disabled):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea:not(:disabled), select:not(:disabled), [contenteditable]:not([contenteditable="false"])';

// the open dialogs, the last one is on top: only it reacts to Escape and Tab
const openDialogs: symbol[] = [];

let scrollLocks = 0;

// the page behind a dialog does not scroll (wheel, touch, keys); the scrollbar it had is kept as
// a gap, so the page does not jump sideways when the bar goes away
const lockPageScroll = () => {
  if(scrollLocks++) return;
  const root = document.documentElement;
  root.style.setProperty('--vk-scrollbar-gap', Math.max(0, window.innerWidth - root.clientWidth) + 'px');
  root.classList.add('vk-modal-open');
};

const unlockPageScroll = () => {
  if(--scrollLocks > 0) return;
  scrollLocks = 0;
  const root = document.documentElement;
  root.classList.remove('vk-modal-open');
  root.style.removeProperty('--vk-scrollbar-gap');
};

/**
 * A modal dialog in the look of the «Настройки ленты» panel: the same white
 * card, border, title, dividers and buttons, over a dimmed layer.
 *
 * It is a layer of the VKgram root (`.vkgram`) — a portal into it, so the
 * VKgram styles and tokens (day / night) apply and the page underneath is
 * neither moved nor re-laid-out. What goes inside is up to the caller: the
 * head (title and «×») is drawn here, the rest is `children` — usually a
 * `.vk-modal-body` (it scrolls when the content is long) and a `.vk-modal-foot`
 * (the buttons).
 *
 * Mount it with `<Show when={open}>`: it lives as long as it is rendered.
 *  - closes on «×» and on Escape (`onClose`); a click on the dimmed layer
 *    closes it only with `closeOnBackdrop` — a form should not lose what was
 *    typed to a stray click, so it is off by default;
 *  - `closeDisabled` holds all of those while something is being saved;
 *  - focus goes into the dialog, Tab stays inside it, and on close the focus
 *    returns to what opened it;
 *  - the layer is fixed to the screen (the page is long and scrolls under it), follows the visible
 *    part of the screen when a phone's keyboard is up, scrolls on a tiny screen, and the page behind
 *    it can't be reached by the wheel or by touch;
 *  - dialogs stack: Escape and Tab belong to the topmost one, and to a Web K window opened above it.
 */
export default function VKModal(props: {
  title: string,
  onClose: () => void,
  closeDisabled?: boolean,
  closeOnBackdrop?: boolean,
  // the width on a wide screen, px (440 by default); a narrow screen takes its whole width anyway
  width?: number,
  children: JSX.Element
}) {
  const titleId = 'vk-modal-title-' + createUniqueId();
  let dialog: HTMLDivElement;
  let layer: HTMLDivElement;
  const id = Symbol('vk-modal');

  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;

  const close = () => {
    if(!props.closeDisabled) props.onClose();
  };

  // a Web K window (a menu, a popup) opened from the dialog has the focus: the keys are its own
  const isForeignFocus = () => {
    const active = document.activeElement;
    return !!active && !dialog.contains(active) && !!active.closest('.popup, .btn-menu');
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if(e.isComposing || !dialog) return;
    if(openDialogs[openDialogs.length - 1] !== id || isForeignFocus()) return;

    if(e.key === 'Escape') {
      // this dialog is the topmost thing: nothing under it should react to Escape
      e.stopImmediatePropagation();
      e.preventDefault();
      close();
      return;
    }

    if(e.key !== 'Tab') return;

    containTabFocus(dialog, e);
  };

  // the visible part of the screen: on a phone the keyboard covers the bottom of a fixed layer
  const fitToViewport = () => {
    const viewport = window.visualViewport;
    if(!viewport || !layer) return;
    // pinch-zoomed: the layer stays as it is, the user is looking at a part of it
    if(Math.abs(viewport.scale - 1) > .01) return;
    layer.style.setProperty('--vk-modal-top', viewport.offsetTop + 'px');
    layer.style.setProperty('--vk-modal-height', viewport.height + 'px');
  };

  onMount(() => {
    openDialogs.push(id);
    lockPageScroll();
    document.addEventListener('keydown', onKeyDown, true);
    window.visualViewport?.addEventListener('resize', fitToViewport);
    window.visualViewport?.addEventListener('scroll', fitToViewport);
    fitToViewport();

    // after the portal is in the document; something inside may have taken the focus by itself
    queueMicrotask(() => {
      if(!dialog || dialog.contains(document.activeElement)) return;
      // on a touch screen a field in focus would raise the keyboard over the dialog at once
      const isTouch = matchMedia('(pointer: coarse)').matches;
      const target = isTouch ? dialog : dialog.querySelector<HTMLElement>(FIELD) ?? dialog;
      target.focus();
    });
  });

  onCleanup(() => {
    const index = openDialogs.indexOf(id);
    if(index !== -1) {
      openDialogs.splice(index, 1);
      unlockPageScroll();
    }
    document.removeEventListener('keydown', onKeyDown, true);
    window.visualViewport?.removeEventListener('resize', fitToViewport);
    window.visualViewport?.removeEventListener('scroll', fitToViewport);
    if(opener?.isConnected) opener.focus({preventScroll: true});
  });

  // a drag that began inside the dialog and ended on the layer is not a click on the layer
  let isPressOnLayer = false;

  return (
    <Portal mount={document.querySelector('.vkgram') ?? document.body}>
      <div
        ref={layer}
        class="vk-modal-layer"
        onPointerDown={(e) => isPressOnLayer = e.target === e.currentTarget}
        onClick={(e) => {
          if(props.closeOnBackdrop && isPressOnLayer && e.target === e.currentTarget) close();
          isPressOnLayer = false;
        }}
      >
        <div
          ref={dialog}
          class="vk-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          style={props.width ? {'--vk-modal-width': props.width + 'px'} : undefined}
          tabIndex={-1}
        >
          <div class="vk-modal-head">
            <h2 id={titleId} class="vk-modal-title">{props.title}</h2>
            <button
              type="button"
              class="vk-link-button vk-modal-close"
              aria-label="Закрыть"
              title="Закрыть"
              disabled={props.closeDisabled}
              onClick={close}
            >
              <VKIcon name="close" size={14} />
            </button>
          </div>
          {props.children}
        </div>
      </div>
    </Portal>
  );
}
