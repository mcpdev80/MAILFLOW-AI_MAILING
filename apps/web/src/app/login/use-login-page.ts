"use client";

import { getAccessContext } from "@/lib/access-context";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function useLoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = useCallback(async () => {
    router.push(await redirectTarget());
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    void conditionalPasskey().then((authenticated) => {
      if (!cancelled && authenticated) void finish();
    });
    return () => {
      cancelled = true;
    };
  }, [finish]);

  const signInWithPasskey = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await authClient.signIn.passkey();
    if (result.error) {
      setError(result.error.message ?? t("auth.login.passkeyFailed"));
      setBusy(false);
      return;
    }
    await finish();
  }, [finish, t]);

  const signInWithPassword = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      setError(result.error.message ?? t("auth.login.failed"));
      setBusy(false);
      return;
    }
    await finish();
  }, [email, finish, password, t]);

  return {
    email,
    setEmail,
    password,
    setPassword,
    error,
    busy,
    signInWithPasskey,
    signInWithPassword,
  };
}

async function conditionalPasskey(): Promise<boolean> {
  if (typeof PublicKeyCredential === "undefined") return false;
  if (typeof PublicKeyCredential.isConditionalMediationAvailable !== "function")
    return false;
  if (!(await PublicKeyCredential.isConditionalMediationAvailable()))
    return false;
  const result = await authClient.signIn.passkey({ autoFill: true });
  return !result.error;
}

async function redirectTarget(): Promise<string> {
  if (typeof window === "undefined") return "/app/dashboard";
  const requested = new URLSearchParams(window.location.search).get("redirect");
  if (requested?.startsWith("/") && !requested.startsWith("//")) return requested;

  try {
    const context = await getAccessContext();
    if (context.recommended_area === "instance") return "/admin/instance";
    if (context.recommended_area === "organization") return "/admin/org";
  } catch {
    // Fall back to the personal mail area when context resolution is unavailable.
  }
  return "/app/dashboard";
}
