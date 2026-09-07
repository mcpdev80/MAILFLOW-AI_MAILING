"use client";

import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/lib/i18n";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type InstanceBootstrapStatus = {
  auth_enabled: boolean;
  instance_owner_exists: boolean;
};

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
  const [ready, setReady] = useState(false);

  const redirectAfterSignup = useMemo(() => {
    const value = searchParams.get("redirect");
    if (!value || !value.startsWith("/") || value.startsWith("//")) {
      return "/onboarding";
    }
    return value;
  }, [searchParams]);

  useEffect(() => {
    void fetch("/api/instance-bootstrap/status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("instance_bootstrap_status_failed");
        return (await response.json()) as InstanceBootstrapStatus;
      })
      .then((status) => {
        if (status.auth_enabled && status.instance_owner_exists) {
          router.replace("/login");
          return;
        }
        setReady(true);
      })
      .catch(() => {
        setError("Unable to verify whether initial setup is still available.");
        setReady(true);
      });
  }, [router]);

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

    const statusResponse = await fetch("/api/instance-bootstrap/status", {
      cache: "no-store",
    });
    if (!statusResponse.ok) {
      setError("Unable to verify initial administrator state.");
      setBusy(false);
      return;
    }
    const bootstrapStatus = (await statusResponse.json()) as InstanceBootstrapStatus;
    if (bootstrapStatus.auth_enabled && bootstrapStatus.instance_owner_exists) {
      setError("Initial administrator already exists. Please sign in instead.");
      setBusy(false);
      return;
    }

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

    const claim = await fetch("/api/instance-bootstrap/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!claim.ok) {
      setError(
        claim.status === 409
          ? "Initial administrator was already claimed by another setup session."
          : "Unable to assign the initial instance owner.",
      );
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
    ready,
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
