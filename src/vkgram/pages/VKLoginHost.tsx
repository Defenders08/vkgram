import {Show, createSignal, onCleanup, onMount} from 'solid-js';
import {render} from 'solid-js/web';

import AuthCardsHost from '@/pages/AuthCardsHost';
import {
  MountAuthFlowState,
  authStateToCardSpec,
  disposeActiveAuthFlow,
  registerActiveDispose
} from '@/pages/mountAuthFlow';
import {navigateAuth} from '@/pages/authFlow';
import {pinLightTheme, unpinLightTheme} from '@/vkgram/lightTheme';
import {startVKgramDocumentTitle} from '@/vkgram/documentTitle';
import {removeVKgramSplash} from '@/vkgram/boot';
import VKLoginInfo from './VKLoginInfo';
import VKLoginLinks from './VKLoginLinks';
// the login skin and the design tokens (`html.is-vkgram`) live there; the IM
// layout imports the same file — Vite dedupes it, whoever comes first loads it
import '@/vkgram/styles/vk-base.scss';

type LoginState = 'phone' | 'qr' | 'code' | 'password' | 'passkey';

// The page's h1. It is not drawn: every card of the flow brings its own heading
// and subtitle, a strip with «Вход» over it only repeated them. It stays in the
// document for screen readers.
const TITLE = 'Вход';

/**
 * Which step of the Web K flow is on screen, read from the rendered card (the
 * flow's own logic is not touched, nothing is subscribed to it): a country
 * select → phone; a password input → password; a lone field with a numeric /
 * one-time-code input → code; no field + a drawn code → QR; no field otherwise
 * → passkey. Used only for the title of the block and the `data-vk-state` hook.
 *
 * Returns `null` while no card is on screen (the flow is still mounting): there
 * is nothing to read yet, and guessing «QR» from a stray spinner would flash a
 * wrong title — the caller keeps the step it already had.
 */
function detectLoginState(root: HTMLElement): LoginState | null {
  const card = root.querySelector('.auth-card');
  if(!card) return null;
  if(card.querySelector('.input-select')) return 'phone';
  if(card.querySelector('input[type="password"], .toggle-visibility')) return 'password';
  const field = card.querySelector<HTMLElement>('.input-field');
  if(field) {
    const input = field.querySelector<HTMLElement>('input, [contenteditable]');
    const hint = ((input?.getAttribute('inputmode') || '') + (input?.getAttribute('autocomplete') || '') + (input?.getAttribute('type') || '')).toLowerCase();
    if(/numeric|one-time-code|tel|number/.test(hint) && !card.querySelector('.input-field-phone')) return 'code';
    return card.querySelector('.input-field-phone') ? 'phone' : 'code';
  }
  if(card.querySelector('canvas, svg, [class*="qr" i]')) return 'qr';
  return /passkey|ключ/i.test(card.textContent || '') ? 'passkey' : 'qr';
}

/**
 * The QR code on screen, if there is one: a big, roughly square `<canvas>`,
 * `<svg>` or `<img>` (the flow paints the code itself; rlottie sticker canvases,
 * icons in buttons and avatars are not it). Read-only.
 */
function findQrCode(root: HTMLElement): HTMLElement | null {
  const candidates = root.querySelectorAll<HTMLElement>('canvas:not(.rlottie), svg, img');
  for(const el of Array.from(candidates)) {
    if(el.closest('button, .btn-primary, .avatar, .media-sticker-wrapper, [data-popup-title], [class*="tgico" i]')) continue;
    const rect = el.getBoundingClientRect();
    // an element the skin has not sized yet still has its own attributes
    const w = rect.width || Number(el.getAttribute('width')) || (el as HTMLCanvasElement).width || 0;
    const h = rect.height || Number(el.getAttribute('height')) || (el as HTMLCanvasElement).height || 0;
    if(w >= 100 && h >= 100 && Math.abs(w - h) <= Math.max(6, w * 0.05)) return el;
  }
  return null;
}

/**
 * The numbered steps of a card («1 Open Telegram…», «2 Go to Settings…»), found
 * by structure rather than by the flow's class names: a parent whose children
 * each start with a lone 1, 2, 3… element followed by the step's text. They get
 * `data-vk-steps` / `data-vk-step` / `data-vk-step-num` so the skin can restyle
 * them as a plain VK list. Attributes only — no node is moved or replaced.
 */
function tagSteps(root: HTMLElement) {
  for(const parent of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    if(parent.hasAttribute('data-vk-steps')) continue;
    const kids = Array.from(parent.children) as HTMLElement[];
    if(kids.length < 2) continue;
    const isSteps = kids.every((kid, i) => {
      const num = kid.firstElementChild;
      return kid.children.length >= 2 && !!num && (num.textContent || '').trim() === String(i + 1);
    });
    if(!isSteps) continue;
    parent.setAttribute('data-vk-steps', '');
    for(const kid of kids) {
      kid.setAttribute('data-vk-step', '');
      kid.firstElementChild!.setAttribute('data-vk-step-num', '');
    }
  }
}

// the card talks about a QR code (its heading / steps); a fieldless card that does
// not (the passkey one, a spinner between cards) never gets the QR status line
const QR_TEXT = /qr|scan|отсканир/i;

// how long a QR card may stay without a code before the page says so
const QR_WAIT_MS = 8000;

/**
 * Puts the two halves of the split button («Далее» + «Вход по QR») next to each
 * other: the flow renders the QR action as a sibling OF `.input-wrapper`, after
 * it, and whatever the flow mounts between the two («Продолжить на русском»,
 * once it has loaded — it is the wrapper's own last child) used to end up under
 * the lifted QR half. The button is moved INTO the wrapper, right after
 * «Далее», so the halves are plain neighbours of one row and everything after
 * them takes its own line below.
 *
 * Idempotent — the MutationObserver that drives it re-runs this on its own
 * mutation once, and a re-rendered flow button is moved again. Solid removes a
 * node from whatever parent it has, so the moved button still unmounts cleanly.
 */
export function placeSplitQrHalves(root: HTMLElement) {
  const cta = root.querySelector<HTMLElement>('[data-vk-cta]');
  const qr = root.querySelector<HTMLElement>('[data-vk-qr-link]');
  if(!cta || !qr) return;
  if(qr.parentElement === cta.parentElement && qr.previousElementSibling === cta) return;
  cta.after(qr);
}

/**
 * Marks the quiet/primary buttons of the phone card by their text, attributes
 * only: the passkey action is hidden by the skin, the «Next» button and the
 * «Log in by QR Code» one are joined into one group (placed as one row by
 * `placeSplitQrHalves`).
 */
function tagActions(root: HTMLElement, state: LoginState) {
  const buttons = root.querySelectorAll<HTMLElement>('.btn-primary');
  for(const btn of Array.from(buttons)) {
    const text = (btn.textContent || '').trim();
    if(state !== 'passkey' && /passkey|ключ/i.test(text)) {
      btn.setAttribute('data-vk-passkey', '');
    } else if(state === 'qr' && /phone|номер|телефон/i.test(text)) {
      btn.setAttribute('data-vk-phone-link', '');
    } else if(state === 'phone' && /qr/i.test(text)) {
      btn.setAttribute('data-vk-qr-link', '');
      if(!btn.hasAttribute('title')) btn.setAttribute('title', text);
    } else if(state === 'phone' && btn.classList.contains('btn-color-primary')) {
      btn.setAttribute('data-vk-cta', '');
    }
  }
}

/**
 * QR-карточка обёрнута в `.auth-card`, но её части находятся по структуре
 * (только атрибуты, ничего в DOM не переносится): заголовок и подзаголовок —
 * это собственный `h1` / строка подзаголовка карточки (поиск по тексту терял
 * их во всех языках, кроме английского), общий родитель кода, заголовка, шагов
 * и действий получает `data-vk-qr-card` (скин раскладывает его колонкой), а
 * прямые дети — `data-vk-qr-top`, чтобы скин мог поставить заголовок над кодом
 * и отцентрировать код в чистой рамке.
 */
function commonAncestor(els: HTMLElement[]): HTMLElement | null {
  let a: HTMLElement | null = els[0];
  while(a && !els.every((e) => a!.contains(e))) a = a.parentElement;
  return a;
}

export function tagQrCard(root: HTMLElement) {
  // заголовок и подзаголовок получают свои теги ещё до отрисовки кода (когда
  // на экране только плита ожидания) — VK-вёрстка не должна мигать центрированной
  // вёрсткой флоу
  const title = root.querySelector<HTMLElement>('.auth-card [data-popup-title], .auth-card h1');
  const sub = root.querySelector<HTMLElement>('.auth-card [class*="subtitle" i]');
  title?.setAttribute('data-vk-qr-title', '');
  sub?.setAttribute('data-vk-qr-sub', '');
  const code = root.querySelector<HTMLElement>('[data-vk-qr-code]');
  if(!code) return;
  const steps = root.querySelector<HTMLElement>('[data-vk-steps]');
  // the content block: the common parent of the code, the heading and the steps
  // (the «phone number» button may sit outside it — it is left out on purpose,
  // so the content can be re-ordered without dragging the button along)
  const parts = [code, title, steps].filter(Boolean) as HTMLElement[];
  const card = commonAncestor(parts);
  if(!card) return;
  card.setAttribute('data-vk-qr-card', '');
  title?.setAttribute('data-vk-qr-title', '');
  sub?.setAttribute('data-vk-qr-sub', '');

  const topOf = (el: HTMLElement) => {
    let t = el;
    while(t.parentElement && t.parentElement !== card) t = t.parentElement;
    return t;
  };
  // everything between a part and the card is only a holder: no margins, plates
  for(const part of [code, title, sub, steps]) {
    if(!part) continue;
    for(let el = part.parentElement; el && el !== card; el = el.parentElement) {
      el.setAttribute('data-vk-qr-holder', '');
    }
  }
  const codeTop = topOf(code);
  if(codeTop !== code) codeTop.setAttribute('data-vk-qr-top', 'code');
  const titleTop = title ? topOf(title) : null;
  const subTop = sub ? topOf(sub) : null;
  if(titleTop && titleTop === subTop) {
    if(titleTop !== codeTop) titleTop.setAttribute('data-vk-qr-top', 'head');
  } else {
    if(titleTop && titleTop !== codeTop) titleTop.setAttribute('data-vk-qr-top', 'title');
    if(subTop && subTop !== codeTop) subTop.setAttribute('data-vk-qr-top', 'sub');
  }
}

function LoginBox() {
  const [state, setState] = createSignal<LoginState>('phone');
  // the QR card is on screen but no code has been drawn (yet)
  const [qrPending, setQrPending] = createSignal(false);
  // …and it has been so for too long
  const [qrStalled, setQrStalled] = createSignal(false);
  let body: HTMLDivElement;
  let stallTimer: number | undefined;

  const clearStall = () => {
    if(stallTimer !== undefined) {
      clearTimeout(stallTimer);
      stallTimer = undefined;
    }
  };

  onMount(() => {
    const update = () => {
      const next = detectLoginState(body);
      if(next) setState(next);
      tagActions(body, next ?? state());
      placeSplitQrHalves(body);

      const isQr = (next ?? state()) === 'qr' && QR_TEXT.test(body.textContent || '');
      const code = isQr ? findQrCode(body) : null;
      if(isQr) {
        // the skin frames and sizes the code through this hook
        code?.setAttribute('data-vk-qr-code', '');
        tagSteps(body);
        tagQrCard(body);
      }
      const pending = isQr && !code;
      setQrPending(pending);
      if(!pending) {
        clearStall();
        setQrStalled(false);
      } else if(stallTimer === undefined) {
        stallTimer = window.setTimeout(() => {
          stallTimer = undefined;
          setQrStalled(true);
        }, QR_WAIT_MS);
      }
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(body, {childList: true, subtree: true});
    onCleanup(() => {
      observer.disconnect();
      clearStall();
    });
  });

  return (
    <div class="vk-login-box" data-vk-state={state()} data-vk-qr={state() === 'qr' ? (qrPending() ? 'pending' : 'ready') : undefined}>
      <h1 class="vk-login-box-head">{TITLE}</h1>
      {/* our own markup, outside the flow: the QR card with no code on screen says so
          instead of showing steps for a code that is not there */}
      <Show when={qrPending()}>
        <div class="vk-login-note" role="status" aria-live="polite">
          <Show
            when={qrStalled()}
            fallback={'QR-код создаётся…'}
          >
            QR-код не появился. Проверьте соединение или войдите по номеру телефона — ссылка ниже.
          </Show>
        </div>
      </Show>
      <div class="vk-login-box-body" ref={(el) => body = el}>
        <AuthCardsHost />
      </div>
    </div>
  );
}

/**
 * The original Web K authorization flow (`<AuthCardsHost>` and the cards under
 * `src/pages/cards/` — all the logic, the transitions and the states are the
 * upstream ones) mounted on a VKgram page instead of the bare auth shell: the
 * blue bar with the wordmark on top, a compact «Вход» block (`.vk-login-box`: a header strip + the flow) on the left and the
 * large «about VKgram» block on the right (`VKLoginInfo`). The skin itself lives in `vk-base.scss` («Login page» section).
 *
 * Mounted from `src/index.ts` instead of `mountAuthFlow` when VKgram is
 * enabled. On a successful sign-in `bootstrapIm` takes over and tears this
 * down through the shared `registerActiveDispose` slot.
 */
export function mountVKLoginFlow(authState: MountAuthFlowState): () => void {
  // the auth flow can only mount once at a time — the same rule mountAuthFlow follows
  disposeActiveAuthFlow();

  navigateAuth(authStateToCardSpec(authState));

  const root = document.createElement('div');
  root.id = 'vkgram-login-root';
  // `.vkgram` carries the base page (background, tahoma, the document scroll
  // on desktop); `.vk-login-page` scopes the login skin on top of it
  root.className = 'vkgram vk-login-page';
  document.body.appendChild(root);

  // the tab says what the page is; the title controller holds it from here and
  // the IM layout takes it over on sign-in
  const previousTitle = document.title;
  startVKgramDocumentTitle('Вход');

  // the design tokens live on `html.is-vkgram`; the IM layout adds the same
  // class on sign-in, the add is idempotent
  document.documentElement.classList.add('is-vkgram');
  // VKgram is a light design, the login page included (the flow's own theme
  // toggle is hidden by the skin — pinned, it would do nothing)
  pinLightTheme();

  const dispose = render(() => (
    <>
      <header class="vk-header">
        <div class="vk-header-inner">
          <div class="vk-header-logo vk-login-logo">VKGRAM</div>
        </div>
      </header>
      <main class="vk-login-layout">
        {/* the real Web K authorization flow, untouched: phone → code → password,
            QR and passkey are all its own cards, skinned in vk-base.scss */}
        <div class="vk-login-aside">
          <LoginBox />
          <VKLoginLinks />
        </div>
        <VKLoginInfo />
      </main>
    </>
  ), root);

  // The login page is on screen: let its first painted frame in, then the boot splash goes. Without this the
  // splash was lifted by whoever mounted the flow, before the skin was painted, and the bare Web K
  // background (the green wallpaper) showed for a few frames in between.
  requestAnimationFrame(() => requestAnimationFrame(removeVKgramSplash));

  const disposeFn = () => {
    dispose();
    root.remove();
    // the IM layout (#vkgram-root) owns the title from its own mount — only
    // without it the tab goes back to what it was before this page
    if(!document.getElementById('vkgram-root')) document.title = previousTitle;
    unpinLightTheme();
    if(!document.getElementById('vkgram-root')) {
      // no IM layout on screen: the flag was ours alone, give it back
      document.documentElement.classList.remove('is-vkgram');
    } else {
      // the IM layout mounted first (bootstrapIm tears the auth flow down a
      // second after the sign-in) and its own pinLightTheme was a no-op while
      // ours was still held — hold the pin again on its behalf
      pinLightTheme();
    }
  };
  registerActiveDispose(disposeFn);
  return disposeFn;
}
