"use client";

import { ApiError, api } from "@/lib/api";
import { authClient, useSession } from "@/lib/auth-client";
import type { LLMProvider } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export type OnboardingStep = "llm" | "account" | "done";
export type OrganizationMember = {
  id: string;
  userId?: string;
  role: string;
  user?: { id?: string; email?: string; name?: string };
};
export type ProviderForm = {
  label: string;
  type: string;
  base_url: string;
  default_classification_model: string;
  default_generation_model: string;
  api_key: string;
};
export type AccountForm = {
  imap_host: string;
  username: string;
  password: string;
  interval_minutes: number;
  llm_provider_id: string;
  ownership_mode: "private" | "shared";
  shared_user_ids: string[];
};

export function useOnboardingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [step, setStep] = useState<OnboardingStep>("llm");
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [providerForm, setProviderForm] = useState<ProviderForm>(emptyProviderForm);
  const [accountForm, setAccountForm] = useState<AccountForm>(emptyAccountForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void loadProviders(setProviders, setAccountForm, setStep, setLoading); }, []);
  useEffect(() => { void loadMembers(session?.user?.id, setMembers); }, [session?.user?.id]);

  const currentMember = useMemo(
    () => members.find((member) => memberUserId(member) === session?.user?.id),
    [members, session?.user?.id],
  );
  const canCreateShared = currentMember?.role === "owner" || currentMember?.role === "admin";

  const submitProvider = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createProvider({
        ...providerForm,
        api_key: providerForm.api_key || null,
      });
      setProviders((current) => [...current, created]);
      setAccountForm((current) => ({ ...current, llm_provider_id: created.id }));
      setStep("account");
    } catch (err) {
      setError(messageOf(err, "onboarding_provider_failed"));
    } finally {
      setBusy(false);
    }
  }, [providerForm]);

  const submitAccount = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createAccount(accountPayload(accountForm, session?.user?.id));
      setStep("done");
      window.setTimeout(() => router.push("/app/dashboard"), 900);
    } catch (err) {
      setError(messageOf(err, "onboarding_account_failed"));
    } finally {
      setBusy(false);
    }
  }, [accountForm, router, session?.user?.id]);

  const connectOAuth = useCallback(async (provider: "gmail" | "microsoft") => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.oauthAuthorizeUrl(provider, ownershipOptions(accountForm, session?.user?.id));
      window.location.href = result.authorize_url;
    } catch (err) {
      setError(messageOf(err, "onboarding_oauth_failed"));
      setBusy(false);
    }
  }, [accountForm, session?.user?.id]);

  function toggleSharedUser(userId: string, checked: boolean) {
    setAccountForm((current) => ({
      ...current,
      shared_user_ids: checked
        ? [...new Set([...current.shared_user_ids, userId])]
        : current.shared_user_ids.filter((id) => id !== userId),
    }));
  }

  return {
    step, providers, members, providerForm, setProviderForm, accountForm, setAccountForm,
    loading, error, busy, canCreateShared, hasUserIdentity: Boolean(session?.user?.id),
    submitProvider, submitAccount, connectOAuth, toggleSharedUser,
  };
}

export type OnboardingController = ReturnType<typeof useOnboardingPage>;

const emptyProviderForm: ProviderForm = {
  label: "",
  type: "ollama",
  base_url: "",
  default_classification_model: "",
  default_generation_model: "",
  api_key: "",
};
const emptyAccountForm: AccountForm = {
  imap_host: "", username: "", password: "", interval_minutes: 5,
  llm_provider_id: "", ownership_mode: "private", shared_user_ids: [],
};

async function loadProviders(
  setProviders: (items: LLMProvider[]) => void,
  setAccountForm: React.Dispatch<React.SetStateAction<AccountForm>>,
  setStep: (step: OnboardingStep) => void,
  setLoading: (value: boolean) => void,
) {
  try {
    const providers = await api.listProviders();
    setProviders(providers);
    if (providers.length > 0) {
      setAccountForm((current) => ({ ...current, llm_provider_id: providers[0].id }));
      setStep("account");
    }
  } catch {
    // A missing provider is a valid first-run state; provider creation remains available.
  } finally {
    setLoading(false);
  }
}

async function loadMembers(userId: string | undefined, setMembers: (items: OrganizationMember[]) => void) {
  if (!userId) return;
  try {
    const result = await authClient.organization.listMembers();
    if (!result.error) {
      const data = result.data as unknown as { members?: OrganizationMember[] };
      setMembers(data.members ?? []);
    }
  } catch {
    // Membership is optional unless a shared mailbox is selected.
  }
}

function accountPayload(form: AccountForm, userId?: string) {
  return {
    imap_host: form.imap_host,
    username: form.username,
    password: form.password,
    interval_minutes: Number(form.interval_minutes),
    llm_provider_id: form.llm_provider_id || null,
    ...(userId ? { ownership_mode: form.ownership_mode, shared_user_ids: form.ownership_mode === "shared" ? form.shared_user_ids : [] } : {}),
  };
}

function ownershipOptions(form: AccountForm, userId?: string) {
  if (!userId) return undefined;
  return {
    ownershipMode: form.ownership_mode,
    sharedUserIds: form.ownership_mode === "shared" ? form.shared_user_ids : [],
  } as const;
}

export function memberUserId(member: OrganizationMember): string | null {
  return member.userId ?? member.user?.id ?? null;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}
