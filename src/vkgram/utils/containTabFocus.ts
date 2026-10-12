// what the Tab key can land on inside a layer
export const FOCUSABLE = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

/**
 * Держит Tab внутри слоя (`role="dialog"` и подобных): циклит фокус по
 * видимым интерактивным элементам, а с краёв слоя возвращает на первый
 * (или последний при Shift). Общий код `VKModal` и полноэкранного блока
 * поиска — обоим нужно одно и то же кольцо. Возвращает true, когда нажатие
 * обработано и дальнейшая обработка Tab не нужна.
 */
export default function containTabFocus(layer: HTMLElement, e: KeyboardEvent): boolean {
  if(e.key !== 'Tab') return false;

  const items = Array.from(layer.querySelectorAll<HTMLElement>(FOCUSABLE))
  .filter((el) => el.getClientRects().length);
  if(!items.length) {
    e.preventDefault();
    layer.focus();
    return true;
  }

  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if(!layer.contains(active) || active === layer) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
    return true;
  }
  if(e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
    return true;
  }
  if(!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
    return true;
  }

  return false;
}
