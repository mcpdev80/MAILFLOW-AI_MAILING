"use client";

import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

export function useSignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const redirectAfterSignup = useMemo(() => {
    const value = searchParams.get("redirect");
    if (!value || !value.startsWith("/") || value.startsWith("//")) {
      return "/setup";
    }
    return value;
  }, [searchParams]);

  const submit = useCallback(async () => {
    setError(null);
    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const signUp = await authClient.signUp.email({ email, password, name });
    if (signUp.error) {
      setError(signUp.error.message ?? t("auth.signup.accountFailed"));
      setBusy(false);
      return;
    }
    const orgName = organization.trim() || name.trim();
    const org = await authClient.organization.create({
      name: orgName,
      slug: organizationSlug(orgName),
    });
    if (org.error) {
      setError(org.error.message ?? t("auth.signup.organizationFailed"));
      setBusy(false);
      return;
    }
    router.push(redirectAfterSignup);
  }, [
    confirmPassword,
    email,
    name,
    organization,
    password,
    redirectAfterSignup,
    router,
    t,
  ]);

  return {
    name,
    setName,
    organization,
    setOrganization,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    error,
    busy,
    submit,
  };
}

function organizationSlug(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "org"}-${suffix}`;
}
