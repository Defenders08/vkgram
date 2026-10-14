/*
 * VKgram: максимально простая анонимная телеметрия.
 *
 * Считаем только установки (анонимный UUID в localStorage, никакой связи
 * с аккаунтами) и активность за сутки. Один beacon за сессию, fire-and-forget.
 */

// статистика публичная, на деве она берётся прямо с прода (приёмник отдаёт CORS)
const PROD_STATS_URL = 'https://vkgram.defenders08.tech/telemetry/stats';

const ID_KEY = 'vkgram-install-id';
const SENT_KEY = 'vkgram-telemetry-sent';

function isProdHost(): boolean {
  const host = location.hostname;
  return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1' && !host.endsWith('.local');
}

function getInstallId(): string {
  let id = localStorage.getItem(ID_KEY);
  if(!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

/** Отправить пинг телеметрии. Вызывается один раз из bootstrapIm(). */
export function sendTelemetryPing(): void {
  try {
    // пингуем только с прода — дев-сессии счётчики не двигают
    if(!isProdHost() || sessionStorage.getItem(SENT_KEY)) return;
    sessionStorage.setItem(SENT_KEY, '1');
    const blob = new Blob([JSON.stringify({id: getInstallId()})], {type: 'application/json'});
    navigator.sendBeacon('/telemetry', blob);
  } catch(err) {
    // телеметрия не должна ломать запуск
  }
}

/** Забрать статистику для счётчика на странице входа. null при ошибке. */
export async function fetchTelemetryStats(): Promise<{total: number, active24h: number} | null> {
  try {
    const url = isProdHost() ? '/telemetry/stats' : PROD_STATS_URL;
    const res = await fetch(url);
    if(!res.ok) return null;
    return await res.json();
  } catch(err) {
    return null;
  }
}
