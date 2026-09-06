"use client";

import { ApiError, api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import type { Cycle, EmailAccount, SharedMailboxAccess } from "@/lib/types";
import { useCallback, useEffect, useMemo, useState } from "react";

export type AccountMember = {
  id: string;
  userId?: string;
  role: string;
  user?: { id?: string; email?: string; name?: string };
};

export function useAccountDetailData(id: string, userId?: string) {
  const [account, setAccount] = useState<EmailAccount | null>(null);
  const [contentAccessible, setContentAccessible] = useState(true);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [sharedAccess, setSharedAccess] = useState<
    SharedMailboxAccess[] | null
  >(null);
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
    await loadAccountData(id, resolved.account, resolved.contentAccessible, {
      setCycles,
      setSharedAccess,
      setSelectedSharedUsers,
      setError,
    });
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadMembers(userId, setMembers);
  }, [userId]);
  const permissions = useMemo(
    () => derivePermissions(account, sharedAccess, userId),
    [account, sharedAccess, userId],
  );
  const memberOptions = useMemo(() => normalizeMembers(members), [members]);
  const totals = useMemo(() => sumCycles(cycles), [cycles]);
  return {
    account,
    setAccount,
    contentAccessible,
    setContentAccessible,
    cycles,
    setCycles,
    memberOptions,
    sharedAccess,
    setSharedAccess,
    selectedSharedUsers,
    setSelectedSharedUsers,
    transferUserId,
    setTransferUserId,
    error,
    setError,
    notice,
    setNotice,
    busy,
    setBusy,
    permissions,
    totals,
    reload: load,
  };
}

async function resolveAccount(
  id: string,
  setError: (value: string | null) => void,
) {
  try {
    return { account: await api.getAccount(id), contentAccessible: true };
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) {
      setError(apiMessage(err, "mailbox_load_failed"));
      return null;
    }
  }
  try {
    return {
      account: await api.getManagedMailbox(id),
      contentAccessible: false,
    };
  } catch (err) {
    setError(apiMessage(err, "mailbox_load_failed"));
    return null;
  }
}

type AccountDataSetters = {
  setCycles: (value: Cycle[]) => void;
  setSharedAccess: (value: SharedMailboxAccess[] | null) => void;
  setSelectedSharedUsers: (value: string[]) => void;
  setError: (value: string | null) => void;
};

async function loadAccountData(
  id: string,
  account: EmailAccount,
  contentAccessible: boolean,
  setters: AccountDataSetters,
) {
  if (contentAccessible) {
    try {
      setters.setCycles(await api.listCycles(id));
    } catch (err) {
      setters.setCycles([]);
      setters.setError(apiMessage(err, "cycles_load_failed"));
    }
  } else setters.setCycles([]);
  await loadSharedAccess(id, account, setters);
}

async function loadSharedAccess(
  id: string,
  account: EmailAccount,
  setters: AccountDataSetters,
) {
  if (account.ownership_mode !== "shared") {
    setters.setSharedAccess(null);
    setters.setSelectedSharedUsers([]);
    return;
  }
  try {
    const access = await api.listSharedAccess(id);
    setters.setSharedAccess(access);
    setters.setSelectedSharedUsers(
      access.filter((grant) => grant.can_use).map((grant) => grant.user_id),
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404)
      setters.setSharedAccess(null);
    else setters.setError(apiMessage(err, "mailbox_access_load_failed"));
  }
}

async function loadMembers(
  userId: string | undefined,
  setMembers: (value: AccountMember[]) => void,
) {
  if (!userId) return;
  try {
    const result = await authClient.organization.listMembers();
    if (!result.error) {
      const data = result.data as unknown as { members?: AccountMember[] };
      setMembers(data.members ?? []);
    }
  } catch {
    // Membership data is only required for optional ownership management.
  }
}

function derivePermissions(
  account: EmailAccount | null,
  access: SharedMailboxAccess[] | null,
  userId?: string,
) {
  const isSingleTenant = !userId;
  const isPrivateOwner =
    account?.ownership_mode === "private" && account.owner_user_id === userId;
  const canManageShared = access !== null;
  return {
    isSingleTenant,
    isPrivateOwner,
    canManageShared,
    canManageOwnership: isSingleTenant || isPrivateOwner || canManageShared,
  };
}

function normalizeMembers(members: AccountMember[]) {
  return members
    .map((member) => ({
      id: member.userId ?? member.user?.id ?? "",
      label:
        member.user?.email ??
        member.user?.name ??
        member.userId ??
        member.user?.id ??
        member.id,
      role: member.role,
    }))
    .filter((member) => member.id);
}

function sumCycles(cycles: Cycle[]) {
  return cycles.reduce(
    (sum, cycle) => ({
      emails: sum.emails + cycle.emails_processed,
      drafts: sum.drafts + cycle.drafts_saved,
      errors: sum.errors + cycle.error_count,
    }),
    { emails: 0, drafts: 0, errors: 0 },
  );
}

function apiMessage(error: unknown, fallback: string) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : fallback;
}
