import pause from '@helpers/schedulers/pause';
import textToSvgURL from '@helpers/textToSvgURL';

/**
 * Builds a Telegram-styled QR canvas for `data` using the supplied palette.
 * Shared between the auth-flow `SignQRCard` and the in-app "My QR code" popup.
 *
 * The host element receives the canvas as its last child; existing children
 * (e.g. a preloader) are left in place so the caller can decide when to fade
 * them out, mirroring the legacy `SignQRCard` behaviour.
 *
 * Returns a teardown that strips every QR canvas this call appended, so the
 * caller can reset the host before repainting (e.g. on theme change).
 */
export type PaintQrOptions = {
  data: string;
  size: number;
  host: HTMLElement;
  /** Backdrop color behind the dots (usually the QR card surface color). */
  background: string;
  /** Dot color — the "ink" of the QR code. */
  foreground: string;
  /** Color used to tint the embedded Telegram logo. */
  logoColor: string;
  /**
   * Device-pixel multiplier for the rendered QR bitmap. Defaults to the screen
   * DPR. The My QR popup passes max(screenDPR, 3) so the QR stays crisp in its
   * 3×-scale (1170×2532) export PNG even on 1×/2× displays.
   */
  pixelRatio?: number;
  /**
   * Class added to the QR canvas the instant it's appended — before the draw
   * race is awaited — so the canvas is already correctly sized while qr-code-
   * styling finishes loading the logo (the auth `SignQRCard` reveal relies on
   * the canvas filling its container during that window).
   */
  canvasClass?: string;
  /** Already-loaded `qr-code-styling` constructor; loaded lazily by the caller. */
  QRCodeStylingCtor: any;
};

// The Telegram logo SVG is identical for a given tint every paint; fetch +
// recolor + data-URL it once per colour instead of on every QR regenerate.
// A fetch that did not return the SVG (a 404 page, an HTML fallback) resolves
// to an empty string — no logo — and is dropped from the cache, so the next
// paint retries.
const logoUrlCache = new Map<string, Promise<string>>();
function getLogoUrl(logoColor: string): Promise<string> {
  let url = logoUrlCache.get(logoColor);
  if(!url) {
    url = fetch('assets/img/logo_padded.svg')
    .then((res) => res.text())
    .then((text) => {
      if(!text.includes('<svg')) return '';
      return textToSvgURL(text.replace(/(fill:).+?(;)/, `$1${logoColor}$2`));
    })
    .catch(() => '');
    logoUrlCache.set(logoColor, url);
    void url.then((resolved) => {
      if(!resolved) logoUrlCache.delete(logoColor);
    });
  }
  return url;
}

// How long a single draw may take before the code is repainted without its logo.
const DRAW_TIMEOUT = 3000;

/**
 * The promise qr-code-styling settles when a draw finishes. Newer builds expose
 * it directly; otherwise the embedded logo's load event (or a 1s cap) stands in
 * for it.
 */
function qrDrawPromise(qrCode: any): Promise<void> {
  const internalDrawingPromise = qrCode._drawingPromise || qrCode._canvasDrawingPromise;
  if(internalDrawingPromise) return internalDrawingPromise;

  const image = qrCode._canvas?._image;
  return Promise.race([
    pause(1000),
    new Promise<void>((resolve) => {
      if(!image || image.complete) {
        window.requestAnimationFrame(() => resolve());
        return;
      }

      image.addEventListener('load', () => {
        window.requestAnimationFrame(() => resolve());
      }, {once: true});
    })
  ]);
}

export async function paintQrCode(options: PaintQrOptions) {
  const {data, size, host, background, foreground, logoColor, pixelRatio = window.devicePixelRatio, QRCodeStylingCtor} = options;

  const logoUrl = await getLogoUrl(logoColor);

  const build = (withLogo: boolean) => {
    const qrCode = new QRCodeStylingCtor({
      width: size * pixelRatio,
      height: size * pixelRatio,
      data,
      image: withLogo && logoUrl ? logoUrl : undefined,
      dotsOptions: {color: foreground, type: 'rounded'},
      cornersSquareOptions: {type: 'extra-rounded', color: foreground},
      imageOptions: {imageSize: 1, margin: 0},
      backgroundOptions: {color: background},
      qrOptions: {errorCorrectionLevel: 'L'}
    });

    qrCode.append(host);
    const canvas = host.lastChild as HTMLCanvasElement;
    if(options.canvasClass) canvas.classList.add(options.canvasClass);

    return {canvas, qrCode};
  };

  const settled = (qrCode: any) => Promise.race([
    qrDrawPromise(qrCode).then(() => true, () => false),
    pause(DRAW_TIMEOUT).then(() => false)
  ]);

  // qr-code-styling hangs forever when the embedded logo never loads: the
  // appended canvas stays blank and its drawing promise never settles (seen on
  // v1.9.2). Bound the wait; if the draw did not finish, throw the blank canvas
  // away and draw a logo-less code — the logo is decoration, the code itself
  // is the point.
  let result = build(true);
  if(await settled(result.qrCode)) return result;

  result.canvas.remove();
  result = build(false);
  await settled(result.qrCode);

  return result;
}

/**
 * Builds the public `t.me/<username>` link encoded in a user's QR code (the
 * "My QR code" popup). Kept beside `paintQrCode` so the QR callers share one
 * place for the link shape.
 */
export function buildTelegramUserQrUrl(username: string) {
  return `https://t.me/${username}`;
}
