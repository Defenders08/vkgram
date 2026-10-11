import {paintQrCode} from '@helpers/qrCode/paintQrCode';

describe('paintQrCode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('waits for the current qr-code-styling canvas promise', async() => {
    vi.stubGlobal('fetch', vi.fn(async() => ({
      text: async() => '<svg style="fill:#000;"></svg>'
    })));

    class QRCodeStylingStub {
      public _canvasDrawingPromise = Promise.resolve();

      public append(host: HTMLElement) {
        host.append(document.createElement('canvas'));
      }
    }

    const host = document.createElement('div');
    const result = await paintQrCode({
      data: 'test',
      size: 128,
      host,
      background: '#fff',
      foreground: '#000',
      logoColor: '#123456',
      QRCodeStylingCtor: QRCodeStylingStub
    });

    expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(result.canvas.parentElement).toBe(host);
  });

  it('draws without the logo when the fetch returns a non-SVG page', async() => {
    // a 404 page / an HTML fallback instead of the SVG would never load as an image
    vi.stubGlobal('fetch', vi.fn(async() => ({
      text: async() => '<html><body>404 Not Found</body></html>'
    })));

    const images: any[] = [];
    class QRCodeStylingStub {
      public _canvasDrawingPromise = Promise.resolve();

      constructor(options: any) {
        images.push(options.image);
      }

      public append(host: HTMLElement) {
        host.append(document.createElement('canvas'));
      }
    }

    const host = document.createElement('div');
    const result = await paintQrCode({
      data: 'test',
      size: 128,
      host,
      background: '#fff',
      foreground: '#000',
      logoColor: '#234567',
      QRCodeStylingCtor: QRCodeStylingStub
    });

    expect(result.canvas.parentElement).toBe(host);
    expect(images).toEqual([undefined]);
  });

  it('repaints without the logo when the logoed draw never settles', async() => {
    // qr-code-styling v1.9.2 hangs forever when the embedded logo cannot load:
    // the canvas stays appended and blank, its drawing promise never settles
    vi.stubGlobal('fetch', vi.fn(async() => ({
      text: async() => '<svg style="fill:#000;"></svg>'
    })));

    const images: any[] = [];
    class QRCodeStylingStub {
      public _canvasDrawingPromise: Promise<void>;

      constructor(options: any) {
        images.push(options.image);
        this._canvasDrawingPromise = options.image ? new Promise(() => {}) : Promise.resolve();
      }

      public append(host: HTMLElement) {
        host.append(document.createElement('canvas'));
      }
    }

    const host = document.createElement('div');
    // pump the clock in steps: the logo fetch and its FileReader task settle
    // first, only then is the 3s draw timeout even scheduled
    vi.useFakeTimers();
    const promise = paintQrCode({
      data: 'test',
      size: 128,
      host,
      background: '#fff',
      foreground: '#000',
      logoColor: '#345678',
      QRCodeStylingCtor: QRCodeStylingStub
    });
    for(let i = 0; i < 20 && images.length < 2; i++) {
      await vi.advanceTimersByTimeAsync(500);
    }
    const result = await promise;

    expect(result.canvas.parentElement).toBe(host);
    // the stuck blank canvas is gone, the bare code is the only one left
    expect(host.querySelectorAll('canvas')).toHaveLength(1);
    expect(images).toHaveLength(2);
    expect(typeof images[0]).toBe('string');
    expect(images[1]).toBeUndefined();
  });
});
