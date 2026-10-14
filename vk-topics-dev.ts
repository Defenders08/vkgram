// dev page for the topics screen of a forum group: loads vk-base.scss only, no app
import './src/vkgram/styles/vk-base.scss';

document.getElementById('night-toggle')?.addEventListener('click', () => {
  document.documentElement.classList.toggle('night');
});

const show = (id: string, showIt: boolean) => {
  const layer = document.getElementById(id);
  if(layer) layer.hidden = !showIt;
};

document.getElementById('show-create')?.addEventListener('click', () => show('create-layer', true));
document.getElementById('close-create')?.addEventListener('click', () => show('create-layer', false));

// выбор цвета иконки в окне создания
for(const color of document.querySelectorAll('.vk-topic-color')) {
  color.addEventListener('click', () => {
    for(const other of document.querySelectorAll('.vk-topic-color')) {
      other.classList.toggle('is-active', other === color);
      other.setAttribute('aria-checked', other === color ? 'true' : 'false');
    }
  });
}

// активная строка: клик переносит подсветку (в приложении этим занимается компонент)
for(const row of document.querySelectorAll('.vk-topics-row')) {
  row.addEventListener('click', () => {
    for(const other of document.querySelectorAll('.vk-topics-row')) {
      other.classList.toggle('is-active', other === row);
    }
  });
}

// поиск по темам: живая фильтрация реплики
document.querySelector<HTMLInputElement>('.vk-topics-search .vk-search')?.addEventListener('input', (e) => {
  const query = (e.target as HTMLInputElement).value.trim().toLowerCase();
  for(const row of document.querySelectorAll<HTMLElement>('.vk-topics-row')) {
    const name = row.querySelector('.vk-topics-row-name')?.textContent?.toLowerCase() ?? '';
    row.hidden = !!query && !name.includes(query);
  }
});
