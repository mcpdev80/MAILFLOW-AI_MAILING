"use client";

import { useCallback, useEffect, useState } from "react";

export type InstanceRole = "owner" | "admin";
export type OrganizationRole = "owner" | "admin" | "member" | string;

export interface OrganizationAccess {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
}

export interface AccessContext {
  authenticated: boolean;
  user_id: string | null;
  instance_role: InstanceRole | null;
  active_organization_id: string | null;
  organizations: OrganizationAccess[];
  recommended_area: "instance" | "organization" | "mail";
}

const EMPTY_CONTEXT: AccessContext = {
  authenticated: false,
  user_id: null,
  instance_role: null,
  active_organization_id: null,
  organizations: [],
  recommended_area: "mail",
};

export async function getAccessContext(): Promise<AccessContext> {
  const response = await fetch("/api/access-context", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (response.status === 401) return EMPTY_CONTEXT;
  if (!response.ok) throw new Error(`access_context_failed:${response.status}`);
  return (await response.json()) as AccessContext;
}

export function useAccessContext() {
  const [context, setContext] = useState<AccessContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setContext(await getAccessContext());
    } catch (err) {
      setError(err instanceof Error ? err.message : "access_context_failed");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { context, error, reload };
}
