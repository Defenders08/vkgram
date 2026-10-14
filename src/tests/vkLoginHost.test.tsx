import {afterEach, describe, expect, it, vi} from 'vitest';

import {mountVKLoginFlow, placeSplitQrHalves, tagQrCard} from '@/vkgram/pages/VKLoginHost';
import {disposeActiveAuthFlow} from '@/pages/mountAuthFlow';
import {currentCard} from '@/pages/authFlow';

// the heavy host is out of scope: the test is about the VK page around it
vi.mock('@/pages/AuthCardsHost', () => ({
  default: () => {
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'auth-cards-host');
    return el;
  }
}));

const lightTheme = vi.hoisted(() => ({
  pinLightTheme: vi.fn(),
  unpinLightTheme: vi.fn()
}));

vi.mock('@/vkgram/lightTheme', () => lightTheme);

const htmlClasses = () => [...document.documentElement.classList];

afterEach(() => {
  // every mount returns its dispose; the «kept mounted» assertions run it themselves
  document.getElementById('vkgram-login-root')?.remove();
  document.getElementById('vkgram-root')?.remove();
  document.documentElement.classList.remove('is-vkgram');
  vi.clearAllMocks();
});

describe('mountVKLoginFlow', () => {
  it('renders the VK page around the auth flow', () => {
    const dispose = mountVKLoginFlow({_: 'authStateSignIn'});

    const root = document.getElementById('vkgram-login-root');
    expect(root).not.toBeNull();
    expect(root!.className).toContain('vkgram');
    expect(root!.className).toContain('vk-login-page');

    const logo = root!.querySelector('.vk-header .vk-header-logo');
    expect(logo?.textContent).toBe('VKGRAM');

    expect(root!.querySelector('[data-testid="auth-cards-host"]')).not.toBeNull();

    expect(htmlClasses()).toContain('is-vkgram');
    expect(lightTheme.pinLightTheme).toHaveBeenCalled();
    expect(document.title).toBe('VKGRAM - Вход');

    dispose();
  });

  it('opens the flow on the card the auth state maps to', () => {
    const dispose = mountVKLoginFlow({_: 'authStateSignIn'});
    expect(currentCard()?.name).toBe('signIn');
    dispose();

    mountVKLoginFlow({_: 'authStatePassword'});
    expect(currentCard()).toEqual({name: 'password'});

    const sentCode = {_: 'authSentCode', phone_code_hash: 'hash'} as any;
    mountVKLoginFlow({_: 'authStateAuthCode', sentCode} as any);
    expect(currentCard()).toEqual({name: 'authCode', payload: sentCode});

    const data = {token: 't', dcId: 2, userId: '1', isTest: false} as any;
    mountVKLoginFlow({_: 'authStateSignImport', data} as any);
    expect(currentCard()).toEqual({name: 'signImport', payload: data});
  });

  it('tears the page down and gives the html flag back when no IM layout is up', () => {
    // a leftover auth page from another test disposes itself on the remount below
    // and restores its own (already lost) title — flush it before pinning the expectations
    disposeActiveAuthFlow();
    document.title = 'Предыдущая страница';
    const dispose = mountVKLoginFlow({_: 'authStateSignIn'});
    expect(document.getElementById('vkgram-login-root')).not.toBeNull();
    expect(document.title).toBe('VKGRAM - Вход');

    dispose();

    expect(document.getElementById('vkgram-login-root')).toBeNull();
    expect(document.title).toBe('Предыдущая страница');
    expect(htmlClasses()).not.toContain('is-vkgram');
    expect(lightTheme.unpinLightTheme).toHaveBeenCalled();
    expect(lightTheme.pinLightTheme).toHaveBeenCalledTimes(1);
  });

  it('leaves is-vkgram to the IM layout and re-holds the light theme pin for it', () => {
    const dispose = mountVKLoginFlow({_: 'authStateSignIn'});

    // bootstrapIm mounts the IM layout (its #vkgram-root) before the auth flow is disposed
    const imRoot = document.createElement('div');
    imRoot.id = 'vkgram-root';
    document.body.appendChild(imRoot);
    lightTheme.pinLightTheme.mockClear();

    dispose();

    expect(document.getElementById('vkgram-login-root')).toBeNull();
    expect(htmlClasses()).toContain('is-vkgram');
    // the layout's own pin was a no-op while the login page held one — held again on its behalf
    expect(lightTheme.pinLightTheme).toHaveBeenCalledTimes(1);
  });

  it('allows only one auth page at a time', () => {
    const first = mountVKLoginFlow({_: 'authStateSignIn'});
    const authCode = {phone_number: '+7', phone_code_hash: 'h'};
    const second = mountVKLoginFlow({_: 'authStateSignUp', authCode} as any);

    expect(document.querySelectorAll('#vkgram-login-root')).toHaveLength(1);
    expect(currentCard()?.name).toBe('signUp');

    second();
    // the first instance was already torn down by the remount
    expect(() => first()).not.toThrow();
    expect(document.getElementById('vkgram-login-root')).toBeNull();
  });
});

describe('placeSplitQrHalves', () => {
  // the phone card as the flow renders it: the QR action is a sibling OF
  // `.input-wrapper`, the language row is the wrapper's own last child
  const mountPhoneCard = () => {
    document.body.innerHTML = `
      <div class="auth-card">
        <div class="input-wrapper">
          <div class="input-field"></div>
          <button class="btn-primary btn-color-primary" data-vk-cta>Далее</button>
          <div><button class="btn-primary">Продолжить на English</button></div>
        </div>
        <button class="btn-primary" data-vk-qr-link>Вход по QR</button>
      </div>`;
    return document.querySelector<HTMLElement>('.auth-card')!;
  };

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('moves the QR half next to «Далее», not through the language row', () => {
    const card = mountPhoneCard();
    placeSplitQrHalves(card);

    const cta = card.querySelector('[data-vk-cta]')!;
    const qr = card.querySelector('[data-vk-qr-link]')!;
    expect(qr.parentElement).toBe(cta.parentElement);
    expect(qr.previousElementSibling).toBe(cta);
    // the language row stays below the pair, never between the halves
    expect(cta.nextElementSibling).toBe(qr);
    expect(qr.nextElementSibling!.tagName).toBe('DIV');
  });

  it('is a no-op once the halves sit together (the observer re-runs it)', () => {
    const card = mountPhoneCard();
    placeSplitQrHalves(card);
    const qr = card.querySelector('[data-vk-qr-link]')!;
    placeSplitQrHalves(card);
    expect(card.querySelector('[data-vk-qr-link]')).toBe(qr);
    expect(qr.previousElementSibling).toBe(card.querySelector('[data-vk-cta]'));
  });

  it('does nothing without both halves', () => {
    document.body.innerHTML = '<div class="auth-card"><div class="input-wrapper"></div></div>';
    const card = document.querySelector<HTMLElement>('.auth-card')!;
    expect(() => placeSplitQrHalves(card)).not.toThrow();
  });
});

describe('tagQrCard', () => {
  // QR-карточка так, как её рендерит флоу (SignQRCard, CSS-модульные классы):
  // код, заголовок и подзаголовок в одном контейнере, шаги и кнопка — рядом.
  // Русские строки: теги должны ставиться независимо от языка.
  const mountQrCard = (withCode: boolean) => {
    document.body.innerHTML = `
      <div class="vk-login-box-body">
        <div class="auth-card">
          <div class="_container_x">
            <div class="_sticker_x _qrContainer_x" style="--sticker-size: 240px;">
              ${withCode ? '<canvas width="480" height="480" class="_qrCanvas_x" data-vk-qr-code=""></canvas>' : ''}
            </div>
            <h1 class="_title_x text-center"><span class="i18n">Быстрый вход по QR-коду</span></h1>
            <div class="_subtitle_x secondary"><span class="i18n">Сканируйте в мобильном приложении Telegram</span></div>
          </div>
          <ol class="_qrDescription_x" data-vk-steps="">
            <li data-vk-step=""><span data-vk-step-num="">1</span><div>Откройте Telegram с телефона</div></li>
            <li data-vk-step=""><span data-vk-step-num="">2</span><div>Откройте Настройки › Устройства › Подключить устройство.</div></li>
          </ol>
          <button class="rp btn-primary btn-secondary btn-primary-transparent primary">Вход по номеру телефона</button>
        </div>
      </div>`;
    return {
      body: document.querySelector<HTMLElement>('.vk-login-box-body')!,
      card: document.querySelector<HTMLElement>('.auth-card')!
    };
  };

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('tags the heading and the subtitle by structure, whatever the language', () => {
    const {body, card} = mountQrCard(true);
    tagQrCard(body);

    const title = card.querySelector('h1')!;
    const sub = card.querySelector('._subtitle_x')!;
    expect(title.hasAttribute('data-vk-qr-title')).toBe(true);
    expect(sub.hasAttribute('data-vk-qr-sub')).toBe(true);
    // общий контейнер кода и заголовка — карточка с тегом скина
    expect(card.hasAttribute('data-vk-qr-card')).toBe(true);
    expect(card.querySelector('[data-vk-qr-code]')).not.toBeNull();
  });

  it('tags the heading before the code is drawn (the pending plate on screen)', () => {
    const {body, card} = mountQrCard(false);
    tagQrCard(body);

    expect(card.querySelector('h1')!.hasAttribute('data-vk-qr-title')).toBe(true);
    expect(card.querySelector('._subtitle_x')!.hasAttribute('data-vk-qr-sub')).toBe(true);
    // без кода карточка и её порядок не размечаются — размечать нечего
    expect(card.hasAttribute('data-vk-qr-card')).toBe(false);
  });

  it('is idempotent — the observer re-runs it on its own mutations', () => {
    const {body} = mountQrCard(true);
    tagQrCard(body);
    const title = body.querySelector('h1')!;
    tagQrCard(body);
    expect(body.querySelector('[data-vk-qr-title]')).toBe(title);
  });
});
