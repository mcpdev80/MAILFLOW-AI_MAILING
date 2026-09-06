"use client";

import { authClient } from "@/lib/auth-client";
import { useCallback, useEffect, useState } from "react";

export interface Member {
  id: string;
  role: string;
  user?: { email?: string; name?: string };
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
}

export function useMembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const membersResult = await authClient.organization.listMembers();
    if (membersResult.error) {
      setError(membersResult.error.message ?? "members_load_failed");
      setLoading(false);
      return;
    }
    const data = membersResult.data as unknown as { members?: Member[] };
    setMembers(data?.members ?? []);
    const invitationResult = await authClient.organization.listInvitations();
    if (!invitationResult.error) {
      setInvitations((invitationResult.data as unknown as Invitation[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function invite() {
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.organization.inviteMember({ email, role });
      if (result.error) throw new Error(result.error.message ?? "members_invite_failed");
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "members_invite_failed");
    } finally {
      setBusy(false);
    }
  }

  return { members, invitations, email, setEmail, role, setRole, loading, error, busy, reload: load, invite };
}

export type MembersController = ReturnType<typeof useMembersPage>;
