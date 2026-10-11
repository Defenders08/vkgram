import {JSX} from 'solid-js';

/**
 * VKgram's own section icons — thin line glyphs at home in the old VK left
 * menu (deliberately not Web K's `tgico` set: these belong to the VK look,
 * not to Telegram's). 24×24 viewBox, stroked with `currentColor`, so color
 * and size come from the surrounding control.
 */

export type VKIconName =
  | 'profile'
  | 'news'
  | 'messages'
  | 'telegram'
  | 'friends'
  | 'groups'
  | 'channels'
  | 'audio'
  | 'photos'
  | 'videos'
  | 'docs'
  | 'apps'
  | 'settings'
  | 'search'
  | 'close'
  | 'more'
  | 'more-vertical'
  | 'play'
  | 'pause'
  | 'volume'
  | 'mute'
  | 'fullscreen'
  | 'back'
  | 'up'
  | 'logout'
  | 'bell'
  | 'bell-off'
  | 'discussion'
  | 'select'
  | 'gift'
  | 'boost'
  | 'flag'
  | 'share'
  | 'forward'
  | 'edit'
  | 'smile'
  | 'plus'
  | 'minus'
  | 'reply'
  | 'link'
  | 'copy'
  | 'pin'
  | 'unpin'
  | 'bookmark'
  | 'trash'
  | 'eye'
  | 'eye-off'
  | 'chevron'
  | 'record-video'
  | 'poll'
  | 'checklist'
  | 'cassette'
  | 'camera-flip'
  | 'clock'
  | 'sticker'
  | 'gif'
  | 'heart'
  | 'like'
  | 'dislike'
  | 'party'
  | 'sad'
  | 'wow'
  | 'angry'
  | 'neutral'
  | 'doubt'
  | 'silly'
  | 'star'
  | 'lock'
  | 'animals'
  | 'food'
  | 'travel'
  | 'activity'
  | 'objects';

const ICONS: {[name in VKIconName]: () => JSX.Element} = {
  chevron: () => <path d="m9 5 7 7-7 7" />,
  profile: () => (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 19.5c0-3.3 3-5.2 7-5.2s7 1.9 7 5.2" />
    </>
  ),
  news: () => (
    <>
      <rect x="3.5" y="5" width="13" height="14" rx="1.5" />
      <path d="M16.5 8H19a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-2.5" />
      <line x1="7" y1="9" x2="13" y2="9" />
      <line x1="7" y1="12" x2="13" y2="12" />
      <line x1="7" y1="15" x2="10.5" y2="15" />
    </>
  ),
  messages: () => (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="m5.5 8 5.3 3.8c.7.5 1.7.5 2.4 0L18.5 8" />
    </>
  ),
  telegram: () => (
    <>
      <path d="M21 4 3.7 10.7c-.9.35-.85 1.65.08 1.9l4.45 1.2 1.65 5.05c.28.86 1.37 1.08 2.12.42l2.45-2.16 4.28 3.05c.77.55 1.84.14 2.02-.79L23 5.35C23.2 4.43 22.05 3.6 21 4Z" />
      <path d="m8.4 13.8 9.9-6.3-6.7 8.1" />
    </>
  ),
  friends: () => (
    <>
      <circle cx="9.5" cy="8.5" r="3.5" />
      <path d="M3.5 19.5c0-3.3 2.7-5.2 6-5.2s6 1.9 6 5.2" />
      <path d="M16 5.3a3 3 0 0 1 0 5.9" />
      <path d="M17.5 14.7c1.9.6 3 2.1 3 4.3" />
    </>
  ),
  groups: () => (
    <>
      <circle cx="12" cy="9" r="3.4" />
      <path d="M6 19.5c0-3.1 2.7-4.9 6-4.9s6 1.8 6 4.9" />
      <path d="M6.4 6.2a2.7 2.7 0 0 0-.2 5.2" />
      <path d="M4.3 13.4c-1 .8-1.6 1.9-1.6 3.4" />
      <path d="M17.6 6.2a2.7 2.7 0 0 1 .2 5.2" />
      <path d="M19.7 13.4c1 .8 1.6 1.9 1.6 3.4" />
    </>
  ),
  channels: () => (
    <>
      <path d="M4 10v4h2.5L11 17.5v-11L6.5 10H4Z" />
      <path d="M14.5 9.5a3.5 3.5 0 0 1 0 5" />
      <path d="M17 7.5a6 6 0 0 1 0 9" />
    </>
  ),
  audio: () => (
    <>
      <path d="M9 18V6.5l10-2V16" />
      <line x1="9" y1="10" x2="19" y2="8" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  photos: () => (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 17 5-4.5 3.5 3 3-2.5L20 17" />
    </>
  ),
  videos: () => (
    <>
      <rect x="3.5" y="6" width="12.5" height="12" rx="1.5" />
      <path d="m16 10.5 4.5-2.5v8L16 13.5" />
    </>
  ),
  docs: () => (
    <>
      <path d="M14 3.5H7.5A1.5 1.5 0 0 0 6 5v14a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V7.5L14 3.5Z" />
      <path d="M14 3.5v4h4" />
      <line x1="9" y1="12.5" x2="15" y2="12.5" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </>
  ),
  apps: () => (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
    </>
  ),
  settings: () => (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.51 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.28.63.9 1.04 1.51 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" />
    </>
  ),
  search: () => (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="20.5" y1="20.5" x2="16" y2="16" />
    </>
  ),
  close: () => (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  play: () => <path d="M8 5.5v13a.6.6 0 0 0 .92.5l10.24-6.5a.6.6 0 0 0 0-1L8.92 5a.6.6 0 0 0-.92.5Z" />,
  pause: () => (
    <>
      <line x1="9" y1="5.5" x2="9" y2="18.5" />
      <line x1="15" y1="5.5" x2="15" y2="18.5" />
    </>
  ),
  volume: () => (
    <>
      <path d="M11.5 4.8 7 8.5H4.5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1H7l4.5 3.7a.6.6 0 0 0 1-.46V5.26a.6.6 0 0 0-1-.46Z" />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
      <path d="M17.8 6.6a7.6 7.6 0 0 1 0 10.8" />
    </>
  ),
  mute: () => (
    <>
      <path d="M11.5 4.8 7 8.5H4.5a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1H7l4.5 3.7a.6.6 0 0 0 1-.46V5.26a.6.6 0 0 0-1-.46Z" />
      <line x1="15.5" y1="9.5" x2="20.5" y2="14.5" />
      <line x1="20.5" y1="9.5" x2="15.5" y2="14.5" />
    </>
  ),
  fullscreen: () => (
    <>
      <path d="M4 9.5V5a1 1 0 0 1 1-1h4.5" />
      <path d="M14.5 4H19a1 1 0 0 1 1 1v4.5" />
      <path d="M20 14.5V19a1 1 0 0 1-1 1h-4.5" />
      <path d="M9.5 20H5a1 1 0 0 1-1-1v-4.5" />
    </>
  ),
  more: () => (
    <>
      <line x1="5" y1="12" x2="5.01" y2="12" />
      <line x1="12" y1="12" x2="12.01" y2="12" />
      <line x1="19" y1="12" x2="19.01" y2="12" />
    </>
  ),
  'more-vertical': () => (
    <>
      <line x1="12" y1="5" x2="12" y2="5.01" />
      <line x1="12" y1="12" x2="12" y2="12.01" />
      <line x1="12" y1="19" x2="12" y2="19.01" />
    </>
  ),
  back: () => (
    <>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </>
  ),
  up: () => (
    <>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </>
  ),
  logout: () => (
    <>
      <path d="M14 4.5h3.5A1.5 1.5 0 0 1 19 6v12a1.5 1.5 0 0 1-1.5 1.5H14" />
      <polyline points="9.5 8 5.5 12 9.5 16" />
      <line x1="5.5" y1="12" x2="14.5" y2="12" />
    </>
  ),
  bell: () => (
    <>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5l1.5-1.5Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  'bell-off': () => (
    <>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5l1.5-1.5Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
      <line x1="4" y1="4" x2="20" y2="20" />
    </>
  ),
  discussion: () => (
    <>
      <path d="M4 5.5h16v11H11l-4 3.5v-3.5H4Z" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="13" x2="13" y2="13" />
    </>
  ),
  select: () => (
    <>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <polyline points="8 12.5 11 15.5 16.5 9" />
    </>
  ),
  gift: () => (
    <>
      <rect x="4" y="11" width="16" height="9" />
      <rect x="3" y="7.5" width="18" height="3.5" />
      <line x1="12" y1="7.5" x2="12" y2="20" />
      <path d="M12 7.5 8 4.5 7 7.5h5Zm0 0 4-3 1 3h-5Z" />
    </>
  ),
  boost: () => <path d="M13.5 3 5.5 13.5H11L10 21l8.5-10.5H13l.5-7.5Z" />,
  flag: () => (
    <>
      <line x1="6" y1="4" x2="6" y2="21" />
      <path d="M6 5h12l-2.5 4 2.5 4H6" />
    </>
  ),
  edit: () => (
    <>
      <path d="M4.5 19.5v-4l11-11 4 4-11 11h-4Z" />
      <line x1="13" y1="7" x2="17" y2="11" />
    </>
  ),
  share: () => (
    <>
      <path d="M8.5 10H5.5v10.5h13V10h-3" />
      <line x1="12" y1="15" x2="12" y2="3.5" />
      <polyline points="8 7.5 12 3.5 16 7.5" />
    </>
  ),
  forward: () => (
    <>
      <path d="M14.5 5.5 21 11.5l-6.5 6v-3.4c-4.6-.2-7.6 1-10 4.4.5-5.7 3.6-9.4 10-10v-3Z" />
    </>
  ),
  plus: () => (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  minus: () => (
    <>
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  reply: () => (
    <>
      <path d="M9.5 5.5 3 11.5l6.5 6v-3.4c4.6-.2 7.6 1 10 4.4-.5-5.7-3.6-9.4-10-10v-3Z" />
    </>
  ),
  link: () => (
    <>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </>
  ),
  copy: () => (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
      <path d="M15.5 8.5v-3a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3" />
    </>
  ),
  pin: () => (
    <>
      <path d="M9 4h6l-1 6 3 3.5H7L10 10 9 4Z" />
      <line x1="12" y1="13.5" x2="12" y2="20" />
    </>
  ),
  unpin: () => (
    <>
      <path d="M9 4h6l-1 6 3 3.5H7L10 10 9 4Z" />
      <line x1="12" y1="13.5" x2="12" y2="20" />
      <line x1="4.5" y1="4.5" x2="19.5" y2="19.5" />
    </>
  ),
  bookmark: () => (
    <>
      <path d="M6.5 4h11v16.5L12 16.5l-5.5 4V4Z" />
    </>
  ),
  trash: () => (
    <>
      <line x1="4.5" y1="7" x2="19.5" y2="7" />
      <path d="M9.5 7V4.5h5V7" />
      <path d="M6.5 7l1 13h9l1-13" />
    </>
  ),
  eye: () => (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  'eye-off': () => (
    <>
      <path d="M2.5 12S6 5.5 12 5.5c1.3 0 2.5.3 3.5.8M21.5 12S18 18.5 12 18.5c-1.3 0-2.5-.3-3.5-.8" />
      <path d="M9.6 9.7a2.8 2.8 0 0 0 3.9 3.9" />
      <line x1="4" y1="4" x2="20" y2="20" />
    </>
  ),
  smile: () => (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14c.8 1.3 2 2 3.5 2s2.7-.7 3.5-2" />
      <line x1="9.5" y1="9.8" x2="9.5" y2="9.81" />
      <line x1="14.5" y1="9.8" x2="14.5" y2="9.81" />
    </>
  ),
  // a poll: the bars of the answers
  poll: () => (
    <>
      <line x1="4.5" y1="6.5" x2="19.5" y2="6.5" />
      <line x1="4.5" y1="12" x2="14" y2="12" />
      <line x1="4.5" y1="17.5" x2="17" y2="17.5" />
    </>
  ),
  // a checklist: ticked rows
  checklist: () => (
    <>
      <path d="m4 6.8 1.6 1.6L8.6 5.2" />
      <path d="m4 15.8 1.6 1.6 3-3.2" />
      <line x1="12" y1="7" x2="20" y2="7" />
      <line x1="12" y1="16" x2="20" y2="16" />
    </>
  ),
  // a video message: a video camera — the body and the lens
  'record-video': () => (
    <>
      <rect x="2.5" y="6.5" width="13" height="11" rx="2.5" />
      <path d="M15.5 10.4 21 7.4v9.2l-5.5-3" />
    </>
  ),
  // a voice message: a cassette — the tape window with its reels, the head under it
  cassette: () => (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <rect x="5.5" y="8" width="13" height="5.2" rx="2.6" />
      <circle cx="9" cy="10.6" r=".5" />
      <circle cx="15" cy="10.6" r=".5" />
      <path d="M8 19v-2.3h8V19" />
    </>
  ),
  'camera-flip': () => (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M12 1.5 15.2 4.7 12 7.9" />
      <circle cx="12" cy="12" r="2.7" />
    </>
  ),
  // the window of emoji / stickers / GIF (the sections and the searches of it)
  clock: () => (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2V12l3.2 2" />
    </>
  ),
  sticker: () => (
    <>
      <path d="M6 4.5h12a1.5 1.5 0 0 1 1.5 1.5v8L14 19.5H6A1.5 1.5 0 0 1 4.5 18V6A1.5 1.5 0 0 1 6 4.5Z" />
      <path d="M19.5 14H15.7a1.7 1.7 0 0 0-1.7 1.7v3.8" />
      <line x1="9" y1="9.6" x2="9" y2="9.61" />
      <line x1="13.5" y1="9.6" x2="13.5" y2="9.61" />
      <path d="M8.6 13c.7.7 1.5 1 2.4 1" />
    </>
  ),
  gif: () => (
    <>
      <rect x="2.8" y="6" width="18.4" height="12" rx="2" />
      <path d="M10.4 10.4c-.4-.4-.9-.6-1.5-.6-1.2 0-2.1.9-2.1 2.2s.9 2.2 2.1 2.2c.6 0 1.1-.2 1.5-.6v-1.5H9" />
      <line x1="12.7" y1="9.9" x2="12.7" y2="14.1" />
      <path d="M15.2 14.1V9.9h2.6M15.2 12h2" />
    </>
  ),
  heart: () => (
    <path d="M12 19.5S4.8 15.2 4.8 9.9A3.9 3.9 0 0 1 12 7.8a3.9 3.9 0 0 1 7.2 2.1c0 5.3-7.2 9.6-7.2 9.6Z" />
  ),
  like: () => (
    <>
      <path d="M4.5 11H7v8.5H4.5Z" />
      <path d="M7 11l3.2-6.3c1.3 0 2.2 1.1 1.9 2.3L11.6 10h5.5a1.8 1.8 0 0 1 1.8 2.2l-1.3 5.8a2 2 0 0 1-2 1.5H7" />
    </>
  ),
  dislike: () => (
    <g transform="rotate(180 12 12)">
      <path d="M4.5 11H7v8.5H4.5Z" />
      <path d="M7 11l3.2-6.3c1.3 0 2.2 1.1 1.9 2.3L11.6 10h5.5a1.8 1.8 0 0 1 1.8 2.2l-1.3 5.8a2 2 0 0 1-2 1.5H7" />
    </g>
  ),
  party: () => (
    <>
      <path d="M4.5 19.5 8 9l7 7Z" />
      <path d="M11.5 5.5v2M18 9.5l1.6-1.2M16.5 4.5l.01 0M19.5 13.5h2" />
    </>
  ),
  sad: () => (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.6 16c.8-1.2 2-1.8 3.4-1.8s2.6.6 3.4 1.8" />
      <line x1="9.5" y1="9.8" x2="9.5" y2="9.81" />
      <line x1="14.5" y1="9.8" x2="14.5" y2="9.81" />
    </>
  ),
  // the quick searches of the emoji window and the rest of its sections
  wow: () => (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="15.4" r="1.7" />
      <line x1="9.5" y1="9.6" x2="9.5" y2="9.61" />
      <line x1="14.5" y1="9.6" x2="14.5" y2="9.61" />
    </>
  ),
  angry: () => (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M7.8 8.2l3 1.4M16.2 8.2l-3 1.4" />
      <path d="M8.8 16.2c.8-1 2-1.5 3.2-1.5s2.4.5 3.2 1.5" />
    </>
  ),
  neutral: () => (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <line x1="9" y1="15.2" x2="15" y2="15.2" />
      <line x1="9.5" y1="9.8" x2="9.5" y2="9.81" />
      <line x1="14.5" y1="9.8" x2="14.5" y2="9.81" />
    </>
  ),
  doubt: () => (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.8 15.4c1-.9 2-.9 3.1-.2s2.1.5 3.3-.4" />
      <line x1="9.5" y1="9.8" x2="9.5" y2="9.81" />
      <line x1="14.5" y1="9.8" x2="14.5" y2="9.81" />
    </>
  ),
  silly: () => (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.6 13.8c.8 1.2 2 1.8 3.4 1.8s2.6-.6 3.4-1.8" />
      <path d="M10.6 15.6v2a1.4 1.4 0 0 0 2.8 0v-2" />
      <line x1="9.5" y1="9.6" x2="9.5" y2="9.61" />
      <line x1="14.5" y1="9.6" x2="14.5" y2="9.61" />
    </>
  ),
  star: () => <path d="m12 4 2.4 5 5.5.8-4 3.9.9 5.5L12 16.6 7.2 19.2l.9-5.5-4-3.9 5.5-.8L12 4Z" />,
  lock: () => (
    <>
      <rect x="6" y="10.5" width="12" height="9" rx="2" />
      <path d="M8.6 10.5V8a3.4 3.4 0 0 1 6.8 0v2.5" />
    </>
  ),
  animals: () => (
    <>
      <path d="M5 9.5V4.6l3.9 2.6h6.2l3.9-2.6v4.9c0 4.6-2.5 8-6.9 8S5 14.1 5 9.5Z" />
      <line x1="9.4" y1="11" x2="9.4" y2="11.01" />
      <line x1="14.6" y1="11" x2="14.6" y2="11.01" />
      <path d="M10.8 13.6h2.4" />
    </>
  ),
  food: () => (
    <>
      <path d="M5 9h11v4.6A4.4 4.4 0 0 1 11.6 18H9.4A4.4 4.4 0 0 1 5 13.6V9Z" />
      <path d="M16 10.4h1.4a2 2 0 0 1 0 4H16" />
      <path d="M8.6 4.8v1.8M12.4 4.8v1.8" />
    </>
  ),
  travel: () => (
    <>
      <path d="M4 17.5v-3.7l1.6-4a2 2 0 0 1 1.9-1.3h9a2 2 0 0 1 1.9 1.3l1.6 4v3.7h-2.4V16H6.4v1.5Z" />
      <line x1="4" y1="13.6" x2="20" y2="13.6" />
      <line x1="7.6" y1="15" x2="7.61" y2="15" />
      <line x1="16.4" y1="15" x2="16.41" y2="15" />
    </>
  ),
  activity: () => (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <line x1="3.5" y1="12" x2="20.5" y2="12" />
      <path d="M6 5.8c3 2.5 3 9.9 0 12.4M18 5.8c-3 2.5-3 9.9 0 12.4" />
    </>
  ),
  objects: () => (
    <>
      <path d="M12 3.8a5.5 5.5 0 0 0-3.2 10c.5.4.7.9.7 1.5v.4h5v-.4c0-.6.2-1.1.7-1.5A5.5 5.5 0 0 0 12 3.8Z" />
      <path d="M9.8 18.2h4.4M10.6 20.4h2.8" />
    </>
  )
};

export default function VKIcon(props: {name: VKIconName, size?: number, class?: string}) {
  return (
    <svg
      class={props.class}
      width={props.size ?? 18}
      height={props.size ?? 18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {ICONS[props.name]()}
    </svg>
  );
}
