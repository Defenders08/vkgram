import {createSignal} from 'solid-js';
import type {BotMenuButton, User} from '@layer';
import rootScope from '@lib/rootScope';
import {openVKChat} from '@/vkgram/pages/messages/openChat';

// popular apps asked at a time
const PAGE = 24;
// recent apps shown in the strip
export const RECENT_APPS_LIMIT = 12;

/**
 * Opens a mini app the way Telegram does, inside the client: Web K's own
 * web-app window (`appImManager.openWebApp` — the same popup the chat's
 * «Открыть» and the global search use, with its confirmation, theme and
 * permissions). A bot with a main app opens it; one with a menu-button app
 * opens that; a bot without an app opens its chat instead.
 */
export async function openVKMiniApp(peerId: PeerId) {
  const botId = peerId.toUserId();
  try {
    const [{default: appImManager}, user] = await Promise.all([
      import('@lib/appImManager'),
      rootScope.managers.appUsersManager.getUser(botId) as Promise<User.user>
    ]);

    if(user?.pFlags?.bot_has_main_app) {
      await appImManager.openWebApp({botId, peerId, main: true});
      return;
    }

    const userFull = await rootScope.managers.appProfileManager.getProfile(botId);
    const menuButton = userFull?.bot_info?.menu_button as BotMenuButton.botMenuButton;
    if(menuButton?._ === 'botMenuButton') {
      await appImManager.openWebApp({
        botId,
        peerId,
        url: menuButton.url,
        buttonText: menuButton.text,
        fromBotMenu: true
      });
      return;
    }
  } catch(err) {
    // the user closed the confirmation, or the bot has no app after all: its chat is the fallback
    if(err) console.error('VKgram: failed to open the mini app', err);
    else return;
  }

  openVKChat(peerId);
}

/**
 * The mini apps catalog: «Недавние» (the apps the user opened, Telegram's top
 * peers `bots_app`) and «Популярные» (Telegram's catalog,
 * `bots.getPopularAppBots`, paged as the end of the list comes near). Both
 * lists and the bots' data are Web K's (`appUsersManager.getTopPeers`,
 * `appAttachMenuBotsManager.getPopularAppBots`). Used by the «Приложения»
 * page (which pages the popular list with a sentinel) and by the search
 * block's tab of the same name (which filters what is loaded).
 */
export default function createAppsCatalog(options?: {recentLimit?: number}) {
  const recentLimit = options?.recentLimit ?? RECENT_APPS_LIMIT;

  const [recent, setRecent] = createSignal<PeerId[]>();
  rootScope.managers.appUsersManager.getTopPeers('bots_app').then((topPeers) => {
    setRecent(topPeers.map((peer) => peer.id).slice(0, recentLimit));
  }, (err) => {
    console.error('VKgram: failed to load the recent apps', err);
    setRecent([]);
  });

  // * «Популярные», a page at a time
  const [popular, setPopular] = createSignal<PeerId[]>([]);
  const [isLoading, setLoading] = createSignal(false);
  const [isFailed, setFailed] = createSignal(false);
  // undefined: nothing more to load
  let nextOffset: string | undefined = '';
  let disposed = false;

  const loadMore = async() => {
    if(isLoading() || nextOffset === undefined) return;
    setLoading(true);
    setFailed(false);
    try {
      const result = await rootScope.managers.appAttachMenuBotsManager.getPopularAppBots(nextOffset, PAGE);
      if(disposed) return;
      const known = new Set(popular());
      setPopular((list) => [...list, ...result.userIds.map((id) => id.toPeerId(false)).filter((peerId) => !known.has(peerId))]);
      nextOffset = result.nextOffset || undefined;
    } catch(err) {
      console.error('VKgram: failed to load the popular apps', err);
      setFailed(true);
    } finally {
      if(!disposed) setLoading(false);
    }
  };

  void loadMore();

  return {
    recent,
    popular,
    isLoading,
    isFailed,
    loadMore,
    onDispose: () => {
      disposed = true;
    }
  };
}
