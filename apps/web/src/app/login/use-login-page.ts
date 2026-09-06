"use client";

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

  const finish = useCallback(() => router.push(redirectTarget()), [router]);

  useEffect(() => {
    let cancelled = false;
    void conditionalPasskey().then((authenticated) => {
      if (!cancelled && authenticated) finish();
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
    finish();
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
    finish();
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

function redirectTarget(): string {
  if (typeof window === "undefined") return "/app/dashboard";
  const requested = new URLSearchParams(window.location.search).get("redirect");
  return requested?.startsWith("/") && !requested.startsWith("//")
    ? requested
    : "/app/dashboard";
}
