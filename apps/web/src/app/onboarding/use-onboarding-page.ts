"use client";

import { ApiError, api } from "@/lib/api";
import { authClient, useSession } from "@/lib/auth-client";
import { backfillApi } from "@/lib/backfill-api";
import type { EmailAccount, LLMProvider } from "@/lib/types";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

export type OnboardingStep =
  | "welcome"
  | "mailbox"
  | "privacy"
  | "behavior"
  | "existing"
  | "ready";
export type MailProviderChoice = "gmail" | "microsoft" | "imap";
export type OrganizationMember = {
  id: string;
  userId?: string;
  role: string;
  user?: { id?: string; email?: string; name?: string };
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
  const params = useSearchParams();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [providerChoice, setProviderChoice] =
    useState<MailProviderChoice>("gmail");
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [account, setAccount] = useState<EmailAccount | null>(null);
  const [accountForm, setAccountForm] = useState<AccountForm>({
    imap_host: "",
    username: "",
    password: "",
    interval_minutes: 5,
    llm_provider_id: "",
    ownership_mode: "private",
    shared_user_ids: [],
  });
  const [analyzeExisting, setAnalyzeExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const addMailbox = params.get("new") === "1";
    const connectedAccountId = params.get("account_id");
    void Promise.allSettled([api.listProviders(), api.listAccounts()]).then(
      ([providerResult, accountResult]) => {
        if (providerResult.status === "fulfilled") {
          setProviders(providerResult.value);
          if (providerResult.value[0]) {
            setAccountForm((current) => ({
              ...current,
              llm_provider_id: providerResult.value[0].id,
            }));
          }
        }
        const accounts =
          accountResult.status === "fulfilled" ? accountResult.value : [];
        const connectedAccount = connectedAccountId
          ? accounts.find((candidate) => candidate.id === connectedAccountId)
          : addMailbox
            ? undefined
            : accounts[0];
        if (connectedAccount) {
          setAccount(connectedAccount);
          setProviderChoice(
            connectedAccount.provider_type === "gmail"
              ? "gmail"
              : connectedAccount.provider_type === "microsoft"
                ? "microsoft"
                : "imap",
          );
          setAccountForm((current) => ({
            ...current,
            ownership_mode:
              connectedAccount.ownership_mode === "shared"
                ? "shared"
                : "private",
          }));
        } else {
          setAccount(null);
        }
        if (params.get("connected") && connectedAccount) {
          setStep("privacy");
        } else if (params.get("connected") && connectedAccountId) {
          setError("The connected mailbox could not be loaded.");
          setStep("mailbox");
        } else if (params.get("step") === "mailbox") {
          setStep("mailbox");
        }
        setLoading(false);
      },
    );
  }, [params]);

  useEffect(() => {
    if (!userId) return;
    void authClient.organization
      .listMembers()
      .then((result) => {
        if (!result.error) {
          const data = result.data as unknown as {
            members?: OrganizationMember[];
          };
          setMembers(data.members ?? []);
        }
      })
      .catch(() => undefined);
  }, [userId]);

  const currentMember = useMemo(
    () => members.find((member) => memberUserId(member) === userId),
    [members, userId],
  );
  const canCreateShared =
    currentMember?.role === "owner" || currentMember?.role === "admin";

  const toggleSharedUser = useCallback((memberId: string, checked: boolean) => {
    setAccountForm((current) => ({
      ...current,
      shared_user_ids: checked
        ? [...new Set([...current.shared_user_ids, memberId])]
        : current.shared_user_ids.filter((id) => id !== memberId),
    }));
  }, []);

  const connectOAuth = useCallback(async (provider: "gmail" | "microsoft") => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.oauthAuthorizeUrl(provider, {
        ownershipMode: "private",
        sharedUserIds: [],
      });
      window.location.href = result.authorize_url;
    } catch (err) {
      setError(messageOf(err, "onboarding_oauth_failed"));
      setBusy(false);
    }
  }, []);

  const continueFromMailbox = useCallback(() => {
    setError(null);
    if (
      providerChoice === "imap" &&
      (!accountForm.imap_host || !accountForm.username || !accountForm.password)
    ) {
      setError("Enter the IMAP host, username and password before continuing.");
      return;
    }
    if (providerChoice !== "imap" && !account) {
      setError(
        `Connect ${providerChoice === "gmail" ? "Gmail" : "Microsoft"} before continuing.`,
      );
      return;
    }
    setStep("privacy");
  }, [account, accountForm, providerChoice]);

  const savePrivacyAndMailbox = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      let currentAccount = account;
      if (!currentAccount) {
        currentAccount = await api.createAccount({
          imap_host: accountForm.imap_host,
          username: accountForm.username,
          password: accountForm.password,
          interval_minutes: accountForm.interval_minutes,
          llm_provider_id: accountForm.llm_provider_id || null,
          ownership_mode: accountForm.ownership_mode,
          shared_user_ids:
            accountForm.ownership_mode === "shared"
              ? accountForm.shared_user_ids
              : [],
          move_policy: "automatic",
          archive_policy: "review",
        });
        setAccount(currentAccount);
      } else {
        const desiredMode = accountForm.ownership_mode;
        const desiredUsers =
          desiredMode === "shared" ? accountForm.shared_user_ids : [];
        if (currentAccount.ownership_mode !== desiredMode) {
          currentAccount = await api.changeMailboxOwnership(currentAccount.id, {
            mode: desiredMode,
            shared_user_ids: desiredUsers,
          });
          setAccount(currentAccount);
        } else if (desiredMode === "shared") {
          await api.replaceSharedAccess(currentAccount.id, desiredUsers);
        }
      }
      setStep("behavior");
    } catch (err) {
      setError(messageOf(err, "onboarding_account_failed"));
    } finally {
      setBusy(false);
    }
  }, [account, accountForm]);

  const saveBehavior = useCallback(async () => {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateAccount(account.id, {
        move_policy: "automatic",
        archive_policy: "review",
      });
      setAccount(updated);
      setStep("existing");
    } catch (err) {
      setError(messageOf(err, "onboarding_behavior_failed"));
    } finally {
      setBusy(false);
    }
  }, [account]);

  const finishExisting = useCallback(async () => {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      if (analyzeExisting) {
        const existing = await backfillApi.list(account.id);
        const active = existing.some((job) =>
          ["running", "paused"].includes(job.state),
        );
        if (!active) {
          await backfillApi.start(account.id, {
            folder: account.inbox_folder || "INBOX",
            mode: "dry_run",
            batch_size: 10,
          });
        }
      }
      setStep("ready");
    } catch (err) {
      setError(messageOf(err, "onboarding_backfill_failed"));
    } finally {
      setBusy(false);
    }
  }, [account, analyzeExisting]);

  return {
    step,
    setStep,
    providerChoice,
    setProviderChoice,
    providers,
    members,
    account,
    accountForm,
    setAccountForm,
    analyzeExisting,
    setAnalyzeExisting,
    busy,
    loading,
    error,
    setError,
    canCreateShared,
    toggleSharedUser,
    connectOAuth,
    continueFromMailbox,
    savePrivacyAndMailbox,
    saveBehavior,
    finishExisting,
    openMailflow: () => router.push("/app/dashboard"),
  };
}

export type OnboardingController = ReturnType<typeof useOnboardingPage>;

export function memberUserId(member: OrganizationMember): string | null {
  return member.userId ?? member.user?.id ?? null;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : fallback;
}
