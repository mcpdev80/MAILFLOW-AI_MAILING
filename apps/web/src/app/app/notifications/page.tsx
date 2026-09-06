"use client";

import { NotificationsUi } from "./notifications-ui";
import { useNotificationsPage } from "./use-notifications-page";

export default function NotificationsPage() {
  const notifications = useNotificationsPage();

  return (
    <NotificationsUi
      center={notifications.center}
      preferences={notifications.preferences}
      error={notifications.error}
      saving={notifications.saving}
      onReload={notifications.reload}
      onMarkRead={notifications.markRead}
      onSavePreferences={notifications.savePreferences}
      onPatchPreferences={notifications.patchPreferences}
    />
  );
}
