"use client";

import { authClient } from "@/lib/auth-client";
import { useCallback, useEffect, useState } from "react";

export type UserPasskey = {
  id: string;
  name?: string | null;
  createdAt?: Date | string | null;
  deviceType?: string | null;
  backedUp?: boolean | null;
};

export function useSecuritySettings() {
  const [passkeys, setPasskeys] = useState<UserPasskey[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsRecentAuth, setNeedsRecentAuth] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await authClient.passkey.listUserPasskeys();
    if (result.error) setError(result.error.message ?? "security_load_failed");
    else setPasskeys((result.data ?? []) as UserPasskey[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    await runMutation(async () => {
      const result = await authClient.passkey.addPasskey({
        name: name.trim() || undefined,
      });
      if (result?.error)
        throw new Error(result.error.message ?? "security_add_failed");
      setName("");
      await load();
    });
  }

  async function rename(passkey: UserPasskey, nextName: string) {
    await runMutation(async () => {
      const result = await authClient.passkey.updatePasskey({
        id: passkey.id,
        name: nextName,
      });
      if (result.error)
        throw new Error(result.error.message ?? "security_rename_failed");
      await load();
    });
  }

  async function remove(passkey: UserPasskey) {
    await runMutation(async () => {
      const result = await authClient.passkey.deletePasskey({ id: passkey.id });
      if (result.error) {
        const message = result.error.message ?? "security_delete_failed";
        if (message.includes("Recent authentication required"))
          setNeedsRecentAuth(true);
        throw new Error(message);
      }
      await load();
    });
  }

  async function runMutation(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNeedsRecentAuth(false);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "security_update_failed");
    } finally {
      setBusy(false);
    }
  }

  return {
    passkeys,
    name,
    setName,
    loading,
    busy,
    error,
    needsRecentAuth,
    reload: load,
    add,
    rename,
    remove,
  };
}

export type SecuritySettingsController = ReturnType<typeof useSecuritySettings>;
