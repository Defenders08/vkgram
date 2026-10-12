// dev page for the search window: loads vk-base.scss only, no app
import './src/vkgram/styles/vk-base.scss';

// ночная тема — переключателем (как в остальных харнессах)
document.getElementById('night-toggle')?.addEventListener('click', () => {
  document.documentElement.classList.toggle('night');
});

// окно: десктоп открывается фокусом в поле шапки (и белеет), мобильный —
// кнопкой; Esc и клик мимо закрывают; ввод переключает полосу частых чатов и
// карточку результатов (заготовки обе)
for(const popup of Array.from(document.querySelectorAll<HTMLElement>('.vk-search-popup'))) {
  const header = popup.closest('.vk-header')!;
  const isDesktop = popup.id === 'popup-desktop';
  // у десктопного окна своего поля нет — текст живёт в поле шапки
  const input = (isDesktop ?
    header.querySelector<HTMLInputElement>('.vk-header-search-input') :
    popup.querySelector<HTMLInputElement>('.vk-search-input'))!;
  const strip = popup.querySelector<HTMLElement>('.vk-search-strip-block')!;
  const results = popup.querySelector<HTMLElement>('.vk-search-results-block')!;
  const toggle = header.querySelector('[data-search-toggle]');

  let closeTimer = 0;
  const open = () => {
    window.clearTimeout(closeTimer);
    popup.classList.remove('is-closing');
    popup.style.display = 'flex';
    input.classList.add('is-active');
    if(isDesktop) input.focus();
  };
  // как в живом компоненте: окно сворачивается (vk-settings-out) и только
  // через 140 мс уходит из страницы
  const close = () => {
    if(popup.style.display !== 'flex') return;
    window.clearTimeout(closeTimer);
    popup.classList.add('is-closing');
    input.classList.remove('is-active');
    input.blur();
    closeTimer = window.setTimeout(() => {
      popup.style.display = 'none';
      popup.classList.remove('is-closing');
      // в живом компоненте окно размонтируется и состояние начинается с нуля
      input.value = '';
      strip.style.display = '';
      results.style.display = 'none';
    }, 140);
  };

  if(toggle) toggle.addEventListener('click', () => {
    popup.style.display === 'flex' ? close() : open();
  });
  if(isDesktop) input.addEventListener('focus', open);

  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape' && popup.style.display === 'flex') close();
  });
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as Node;
    if(popup.style.display === 'flex' && !popup.contains(target) && !header.contains(target)) close();
  }, true);

  input.addEventListener('input', () => {
    const hasQuery = !!input.value.trim();
    strip.style.display = hasQuery ? 'none' : '';
    results.style.display = hasQuery ? '' : 'none';
  });

  // вкладки просто переключаются; поведение поиска покрыто тестами компонента
  const tabs = Array.from(popup.querySelectorAll<HTMLButtonElement>('.vk-tab'));
  for(const tab of tabs) {
    tab.addEventListener('click', () => {
      for(const other of tabs) {
        other.classList.toggle('is-active', other === tab);
        other.setAttribute('aria-selected', other === tab ? 'true' : 'false');
      }
    });
  }
}
