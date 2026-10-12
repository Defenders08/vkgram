import {createRoot, createSignal} from 'solid-js';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';

/**
 * Открытое окно поиска (панель возле поиска в шапке) и его запрос. Сигналы на
 * уровне модуля, потому что окно открывают из двух разных деревьев — поля в
 * шапке (десктоп) и кнопки в мобильной шапке, — а само окно живёт внутри
 * якоря-триггера. Запрос общий: на десктопе текст вводится прямо в поле
 * шапки, окно его только читает; на телефоне поле у окна.
 */
const [isOpen, setOpen] = createRoot(() => createSignal(false));
const [query, setQuery] = createRoot(() => createSignal(''));

export function isVKSearchOpen() {
  return isOpen();
}

/** Текущий поисковый запрос — общий для поля шапки и окна. */
export function vkSearchQuery() {
  return query();
}

export function setVKSearchQuery(value: string) {
  setQuery(value);
}

let historyItem: NavigationItem | undefined;

/** закрытое окно — как новое: запрос начат заново */
function reset() {
  setQuery('');
}

/**
 * Открыть поиск. Как открытие канала в «Каналах»: на стек навигации Web K
 * кладётся свой элемент, чтобы кнопка «Назад» браузера закрыла окно, а не
 * ушла из раздела; само окно закрывается через `closeVKSearch`, который по
 * этому же элементу снимает его со стека.
 */
export function openVKSearch() {
  if(isOpen()) return;
  setOpen(true);
  const item: NavigationItem = {
    type: 'vkgram-section',
    onPop: () => {
      if(historyItem === item) historyItem = undefined;
      setOpen(false);
      reset();
    },
    onEscape: () => false
  };
  historyItem = item;
  appNavigationController.pushItem(item);
}

export function closeVKSearch() {
  if(!isOpen()) return;
  const item = historyItem;
  historyItem = undefined;
  setOpen(false);
  reset();
  // закрытие «своей» кнопкой: элемент снимается со стека, Back не срабатывает второй раз
  if(item) appNavigationController.backByItem(item);
}
