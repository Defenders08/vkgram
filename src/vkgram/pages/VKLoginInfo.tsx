import {For, Show, createSignal, onMount} from 'solid-js';
import VKIcon, {VKIconName} from '@/vkgram/components/VKIcons';
import {fetchTelemetryStats} from '@/vkgram/telemetry';

type Feature = {
  // the project's own line icons — the same set as the left menu and the settings button
  icon: VKIconName,
  title: string,
  text: string
};

const FEATURES: Feature[] = [
  {
    icon: 'messages',
    title: 'Сообщения',
    text: 'Диалоги, голосовые и круглые видео, реакции и папки чатов. Локальные папки можно создавать, не затрагивая список в Telegram.'
  },
  {
    icon: 'news',
    title: 'Новости из каналов',
    text: 'Посты подписок собираются в одну ленту с историями, комментариями и реакциями. Ленту можно настроить: что показывать и в каком порядке.'
  },
  {
    icon: 'friends',
    title: 'Страница, друзья и сообщества',
    text: 'Профиль с подарками, закреплённым постом и днём рождения. Контакты отображаются как друзья, а каналы — как сообщества.'
  },
  {
    icon: 'audio',
    title: 'Аудиозаписи',
    text: 'Создавайте локальные папки для музыки и добавляйте в них любые каналы для удобной сортировки.'
  },
  {
    icon: 'settings',
    title: 'Настройки под себя',
    text: 'Локальные конфиги позволяют сохранять настройки и персонализацию VKGRAM прямо на устройстве — от интерфейса до локальных папок и других функций приложения.'
  }
];

/**
 * The «about the project» block of the login page: a large VK content block
 * to the right of the authorization flow. Static content only — the real
 * sign-in lives in `<AuthCardsHost>` next to it. Styled in the «Login page»
 * section of `vk-base.scss` (`.vk-login-info`).
 *
 * Under the lead paragraph — the compact «Статистика» line: anonymous
 * telemetry counters. Loaded with one fetch on mount; not in prod (or if the
 * server is silent) the whole section is not shown.
 */
export default function VKLoginInfo() {
  const [stats, setStats] = createSignal<{total: number, active24h: number}>();
  onMount(() => {
    fetchTelemetryStats().then((s) => s && setStats(s));
  });

  return (
    <section class="vk-login-info" aria-labelledby="vk-login-info-title">
      <div class="vk-login-info-head">
        <h2 id="vk-login-info-title" class="vk-login-info-title">Чаты и каналы в привычном оформлении ВКонтакте</h2>
        <p class="vk-login-info-note">
          VKGRAM — неофициальный клиент Telegram, созданный на основе открытого Telegram Web K. Серверная часть и протокол взаимодействия с Telegram не изменялись — VKgram работает через стандартную инфраструктуру Telegram, изменяя в основном интерфейс и клиентскую часть. Ваш аккаунт и данные остаются в Telegram.
        </p>
      </div>

      <Show when={stats()}>
        {(s) => (
          <section class="vk-login-info-stats" aria-labelledby="vk-login-info-stats-title">
            <h3 id="vk-login-info-stats-title" class="vk-login-info-stats-head">Статистика</h3>
            <p class="vk-login-info-stats-line">
              <span class="vk-login-info-stat">Активные пользователи: {s().active24h.toLocaleString('ru-RU')}</span>
              <span class="vk-login-info-stat">Общее за всё время пользователей: {s().total.toLocaleString('ru-RU')}</span>
            </p>
          </section>
        )}
      </Show>

      <div class="vk-login-info-features">
        <For each={FEATURES}>{(f) => (
          <article class="vk-login-info-feature">
            <span class="vk-login-tile" aria-hidden="true">
              <VKIcon name={f.icon} size={28} />
            </span>
            <div class="vk-login-info-feature-text">
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          </article>
        )}</For>
      </div>

    </section>
  );
}
