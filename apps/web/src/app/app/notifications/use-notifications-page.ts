"use client";

import {
  type NotificationCenter,
  type NotificationPreference,
  attentionApi,
} from "@/lib/attention-api";
import { useCallback, useEffect, useState } from "react";

export function useNotificationsPage() {
  const [center, setCenter] = useState<NotificationCenter | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextCenter, nextPreferences] = await Promise.all([
        attentionApi.notifications(),
        attentionApi.preferences(),
      ]);
      setCenter(nextCenter);
      setPreferences(nextPreferences);
    } catch (err) {
      setError(messageOf(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = useCallback(
    async (id: string) => {
      try {
        await attentionApi.markRead(id);
        await load();
      } catch (err) {
        setError(messageOf(err));
      }
    },
    [load],
  );

  const savePreferences = useCallback(async () => {
    if (!preferences) return;
    setSaving(true);
    setError(null);
    try {
      setPreferences(await attentionApi.savePreferences(preferences));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }, [preferences]);

  function patchPreferences(patch: Partial<NotificationPreference>) {
    setPreferences((current) => (current ? { ...current, ...patch } : current));
  }

  return {
    center,
    preferences,
    error,
    saving,
    reload: load,
    markRead,
    savePreferences,
    patchPreferences,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "notification_request_failed";
}
