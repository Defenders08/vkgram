import type {Dialog} from '@appManagers/appMessagesManager';
import rootScope from '@lib/rootScope';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE} from '@appManagers/constants';
import type {ButtonMenuItemOptionsVerifiable} from '@components/buttonMenu';
import createContextMenu from '@helpers/dom/createContextMenu';

/**
 * Меню диалога (строка списка и кнопка в шапке чата): прочитанность, закреп,
 * архив. Один и тот же список и для форума; темы меню per-topic живут рядом
 * (`VKTopicsList`).
 */
export default function createDialogContextMenu(options: {
  element: HTMLElement,
  // a getter: the row lives on while its dialog object is replaced by newer ones
  dialog: () => Dialog
}) {
  const managers = rootScope.managers;
  const peerId = options.dialog().peerId;
  const dialog = new Proxy({} as Dialog, {get: (_, key) => (options.dialog() as any)[key]});

  const buttons: ButtonMenuItemOptionsVerifiable[] = [{
    icon: 'unread',
    regularText: 'Пометить непрочитанным',
    onClick: () => managers.appMessagesManager.markDialogUnread({peerId}),
    verify: () => !dialog.unread_count
  }, {
    icon: 'readchats',
    regularText: 'Пометить прочитанным',
    onClick: () => managers.appMessagesManager.readHistory({peerId}),
    verify: () => !!dialog.unread_count
  }, {
    icon: 'pin',
    regularText: 'Закрепить',
    onClick: () => managers.appMessagesManager.toggleDialogPin({peerId, filterId: FOLDER_ID_ALL}),
    verify: () => !dialog.pFlags?.pinned
  }, {
    icon: 'unpin',
    regularText: 'Открепить',
    onClick: () => managers.appMessagesManager.toggleDialogPin({peerId, filterId: FOLDER_ID_ALL}),
    verify: () => !!dialog.pFlags?.pinned
  }, {
    icon: 'unarchive',
    regularText: 'Вернуть из архива',
    onClick: () => managers.appMessagesManager.editPeerFolders([peerId], FOLDER_ID_ALL),
    verify: () => !!dialog.folder_id
  }, {
    icon: 'archive',
    regularText: 'В архив',
    onClick: () => managers.appMessagesManager.editPeerFolders([peerId], FOLDER_ID_ARCHIVE),
    verify: () => !dialog.folder_id
  }];

  return createContextMenu({
    buttons,
    listenTo: options.element,
    findElement: () => options.element
  });
}
