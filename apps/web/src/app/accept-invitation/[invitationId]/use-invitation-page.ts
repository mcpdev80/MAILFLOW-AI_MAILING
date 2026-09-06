"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export type InvitationInfo = {
  id: string;
  email: string;
  role: string;
  status: string;
  organizationId: string;
  organizationName?: string;
};

type PageState = "loading" | "ready" | "accepted" | "declined" | "invalid";

export function useInvitationPage(invitationId: string) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [state, setState] = useState<PageState>("loading");
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void authClient.organization
      .getInvitation({ query: { id: invitationId } })
      .then((result) => {
        if (!active) return;
        if (result.error || !result.data) {
          setState("invalid");
          return;
        }
        const parsed = invitationInfo(result.data);
        setInvitation(parsed);
        setState(parsed.status === "pending" ? "ready" : terminalState(parsed.status));
      })
      .catch(() => active && setState("invalid"));
    return () => {
      active = false;
    };
  }, [invitationId]);

  const accept = useCallback(async () => {
    if (!invitation) return;
    setBusy("accept");
    setError(null);
    const result = await authClient.organization.acceptInvitation({ invitationId });
    if (result.error) {
      setError(result.error.message ?? "invitation_accept_failed");
      setBusy(null);
      return;
    }
    const active = await authClient.organization.setActive({
      organizationId: invitation.organizationId,
    });
    if (active.error) {
      setError(active.error.message ?? "organization_activation_failed");
      setBusy(null);
      return;
    }
    setState("accepted");
    router.replace("/onboarding");
  }, [invitation, invitationId, router]);

  const decline = useCallback(async () => {
    setBusy("decline");
    setError(null);
    const result = await authClient.organization.rejectInvitation({ invitationId });
    if (result.error) {
      setError(result.error.message ?? "invitation_reject_failed");
      setBusy(null);
      return;
    }
    setState("declined");
    setBusy(null);
  }, [invitationId]);

  return { invitation, state, busy, error, accept, decline };
}

function invitationInfo(data: unknown): InvitationInfo {
  const item = data as Record<string, unknown>;
  const organization = item.organization as Record<string, unknown> | undefined;
  return {
    id: String(item.id ?? ""),
    email: String(item.email ?? ""),
    role: String(item.role ?? "member"),
    status: String(item.status ?? "pending"),
    organizationId: String(item.organizationId ?? organization?.id ?? ""),
    organizationName:
      typeof item.organizationName === "string"
        ? item.organizationName
        : typeof organization?.name === "string"
          ? organization.name
          : undefined,
  };
}

function terminalState(status: string): PageState {
  if (status === "accepted") return "accepted";
  if (status === "rejected" || status === "declined") return "declined";
  return "invalid";
}
