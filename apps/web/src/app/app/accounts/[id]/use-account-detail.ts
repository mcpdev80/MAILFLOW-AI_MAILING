"use client";

import { ApiError, api } from "@/lib/api";
import { authClient, useSession } from "@/lib/auth-client";
import type { Cycle, EmailAccount, SharedMailboxAccess } from "@/lib/types";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export type AccountMember = {
  id: string;
  userId?: string;
  role: string;
  user?: { id?: string; email?: string; name?: string };
};

export function useAccountDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const id = params.id;
  const [account, setAccount] = useState<EmailAccount | null>(null);
  const [contentAccessible, setContentAccessible] = useState(true);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [sharedAccess, setSharedAccess] = useState<SharedMailboxAccess[] | null>(null);
  const [selectedSharedUsers, setSelectedSharedUsers] = useState<string[]>([]);
  const [transferUserId, setTransferUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const resolved = await resolveAccount(id, setError);
    if (!resolved) return;
    setAccount(resolved.account);
    setContentAccessible(resolved.contentAccessible);
    await loadAccountData(id, resolved.account, resolved.contentAccessible, setCycles, setSharedAccess, setSelectedSharedUsers, setError);
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadMembers(session?.user?.id, setMembers); }, [session?.user?.id]);

  const permissions = useMemo(
    () => derivePermissions(account, sharedAccess, session?.user?.id),
    [account, sharedAccess, session?.user?.id],
  );
  const memberOptions = useMemo(() => normalizeMembers(members), [members]);
  const totals = useMemo(() => sumCycles(cycles), [cycles]);

  const runNow = useCallback(async () => {
    if (!contentAccessible) return;
    await runBusy(setBusy, setError, setNotice, async () => {
      await api.runCycle(id);
      window.setTimeout(() => void load(), 1200);
    });
  }, [contentAccessible, id, load]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    try {
      await api.deleteAccount(id);
      router.push("/app/dashboard");
    } catch (err) {
      setError(apiMessage(err, "mailbox_delete_failed"));
      setBusy(false);
    }
  }, [id, router]);

  const saveSharedAccess = useCallback(async () => {
    await runBusy(setBusy, setError, setNotice, async () => {
      const access = await api.replaceSharedAccess(id, selectedSharedUsers);
      setSharedAccess(access);
      const selected = access.filter((grant) => grant.can_use).map((grant) => grant.user_id);
      setSelectedSharedUsers(selected);
      const stillVisible = selected.includes(session?.user?.id ?? "");
      setContentAccessible(stillVisible);
      if (!stillVisible) setCycles([]);
      setNotice("shared_access_updated");
    });
  }, [id, selectedSharedUsers, session?.user?.id]);

  const makeShared = useCallback(async () => {
    await runBusy(setBusy, setError, setNotice, async () => {
      await api.changeMailboxOwnership(id, { mode: "shared", shared_user_ids: selectedSharedUsers });
      await load();
      setNotice("mailbox_shared");
    });
  }, [id, load, selectedSharedUsers]);

  const makePrivate = useCallback(async () => {
    if (!transferUserId) return setError("select_private_owner");
    await runBusy(setBusy, setError, setNotice, async () => {
      const updated = await api.changeMailboxOwnership(id, { mode: "private", target_owner_user_id: transferUserId });
      if (updated.owner_user_id !== session?.user?.id) return router.push("/app/dashboard");
      await load();
      setNotice("mailbox_private");
    });
  }, [id, load, router, session?.user?.id, transferUserId]);

  const transferPrivateMailbox = useCallback(async () => {
    if (!transferUserId) return setError("select_new_owner");
    setBusy(true);
    setError(null);
    try {
      await api.changeMailboxOwnership(id, { mode: "private", target_owner_user_id: transferUserId });
      router.push("/app/dashboard");
    } catch (err) {
      setError(apiMessage(err, "mailbox_transfer_failed"));
      setBusy(false);
    }
  }, [id, router, transferUserId]);

  function toggleSharedUser(userId: string, checked: boolean) {
    setSelectedSharedUsers((current) => checked ? [...new Set([...current, userId])] : current.filter((value) => value !== userId));
  }

  return {
    id, session, account, setAccount, contentAccessible, cycles, memberOptions, sharedAccess,
    selectedSharedUsers, transferUserId, setTransferUserId, error, notice, busy, permissions, totals,
    reload: load, runNow, disconnect, saveSharedAccess, makeShared, makePrivate, transferPrivateMailbox, toggleSharedUser,
  };
}

async function resolveAccount(id: string, setError: (value: string | null) => void) {
  try {
    return { account: await api.getAccount(id), contentAccessible: true };
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) {
      setError(apiMessage(err, "mailbox_load_failed"));
      return null;
    }
  }
  try {
    return { account: await api.getManagedMailbox(id), contentAccessible: false };
  } catch (err) {
    setError(apiMessage(err, "mailbox_load_failed"));
    return null;
  }
}

async function loadAccountData(
  id: string,
  account: EmailAccount,
  contentAccessible: boolean,
  setCycles: (value: Cycle[]) => void,
  setSharedAccess: (value: SharedMailboxAccess[] | null) => void,
  setSelected: (value: string[]) => void,
  setError: (value: string | null) => void,
) {
  if (contentAccessible) {
    try { setCycles(await api.listCycles(id)); } catch (err) { setCycles([]); setError(apiMessage(err, "cycles_load_failed")); }
  } else setCycles([]);
  if (account.ownership_mode !== "shared") {
    setSharedAccess(null); setSelected([]); return;
  }
  try {
    const access = await api.listSharedAccess(id);
    setSharedAccess(access);
    setSelected(access.filter((grant) => grant.can_use).map((grant) => grant.user_id));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) setSharedAccess(null);
    else setError(apiMessage(err, "mailbox_access_load_failed"));
  }
}

async function loadMembers(userId: string | undefined, setMembers: (value: AccountMember[]) => void) {
  if (!userId) return;
  try {
    const result = await authClient.organization.listMembers();
    if (!result.error) setMembers(((result.data as unknown as { members?: AccountMember[] }).members) ?? []);
  } catch {
    // Membership data is only required for optional ownership management.
  }
}

function derivePermissions(account: EmailAccount | null, access: SharedMailboxAccess[] | null, userId?: string) {
  const isSingleTenant = !userId;
  const isPrivateOwner = account?.ownership_mode === "private" && account.owner_user_id === userId;
  const canManageShared = access !== null;
  return { isSingleTenant, isPrivateOwner, canManageShared, canManageOwnership: isSingleTenant || isPrivateOwner || canManageShared };
}

function normalizeMembers(members: AccountMember[]) {
  return members.map((member) => ({
    id: member.userId ?? member.user?.id ?? "",
    label: member.user?.email ?? member.user?.name ?? member.userId ?? member.user?.id ?? member.id,
    role: member.role,
  })).filter((member) => member.id);
}

function sumCycles(cycles: Cycle[]) {
  return cycles.reduce((sum, cycle) => ({ emails: sum.emails + cycle.emails_processed, drafts: sum.drafts + cycle.drafts_saved, errors: sum.errors + cycle.error_count }), { emails: 0, drafts: 0, errors: 0 });
}

async function runBusy(setBusy: (value: boolean) => void, setError: (value: string | null) => void, setNotice: (value: string | null) => void, action: () => Promise<void>) {
  setBusy(true); setError(null); setNotice(null);
  try { await action(); } catch (err) { setError(apiMessage(err, "mailbox_update_failed")); } finally { setBusy(false); }
}

function apiMessage(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}
