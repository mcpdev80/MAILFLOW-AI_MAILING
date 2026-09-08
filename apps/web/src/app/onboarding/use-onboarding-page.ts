"use client";

import { ApiError, api } from "@/lib/api";
import { authClient, useSession } from "@/lib/auth-client";
import { backfillApi } from "@/lib/backfill-api";
import {
  mailboxConnectionApi,
  mailboxConnectionErrorMessage,
} from "@/lib/mailbox-connection-api";
import type {
  ActionMode,
  EmailAccount,
  EmailAccountCreate,
  SmtpSecurity,
} from "@/lib/types";
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
  imap_port: number;
  use_ssl: boolean;
  username: string;
  password: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: SmtpSecurity;
  smtp_username: string;
  smtp_password: string;
  smtp_same_credentials: boolean;
  interval_minutes: number;
  ownership_mode: "private" | "shared";
  shared_user_ids: string[];
  move_policy: ActionMode;
  archive_policy: ActionMode;
};

export function useOnboardingPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [providerChoice, setProviderChoice] =
    useState<MailProviderChoice>("gmail");
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [account, setAccount] = useState<EmailAccount | null>(null);
  const [accountForm, setAccountForm] = useState<AccountForm>({
    imap_host: "",
    imap_port: 993,
    use_ssl: true,
    username: "",
    password: "",
    smtp_host: "",
    smtp_port: 587,
    smtp_security: "starttls",
    smtp_username: "",
    smtp_password: "",
    smtp_same_credentials: true,
    interval_minutes: 5,
    ownership_mode: "private",
    shared_user_ids: [],
    move_policy: "automatic",
    archive_policy: "review",
  });
  const [analyzeExisting, setAnalyzeExisting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const addMailbox = params.get("new") === "1";
    const connectedAccountId = params.get("account_id");
    void api
      .listAccounts()
      .then((accounts) => {
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
            imap_host: connectedAccount.imap_host,
            imap_port: connectedAccount.imap_port,
            use_ssl: connectedAccount.use_ssl,
            username: connectedAccount.username,
            smtp_host: connectedAccount.smtp_host ?? "",
            smtp_port: connectedAccount.smtp_port ?? 587,
            smtp_security: connectedAccount.smtp_security,
            smtp_username: connectedAccount.smtp_username ?? "",
            smtp_same_credentials:
              !connectedAccount.smtp_username ||
              connectedAccount.smtp_username === connectedAccount.username,
            ownership_mode:
              connectedAccount.ownership_mode === "shared"
                ? "shared"
                : "private",
            move_policy: connectedAccount.move_policy,
            archive_policy: connectedAccount.archive_policy,
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
      })
      .catch((err) => setError(messageOf(err, "onboarding_accounts_load_failed")))
      .finally(() => setLoading(false));
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

  const continueFromMailbox = useCallback(async () => {
    setError(null);
    if (providerChoice === "imap") {
      if (
        !accountForm.imap_host ||
        !accountForm.imap_port ||
        !accountForm.username ||
        !accountForm.password
      ) {
        setError("Enter the IMAP server, port, username and password before continuing.");
        return;
      }
      if (!accountForm.smtp_host || !accountForm.smtp_port) {
        setError("Enter the SMTP server and port before continuing.");
        return;
      }
      if (
        !accountForm.smtp_same_credentials &&
        (!accountForm.smtp_username || !accountForm.smtp_password)
      ) {
        setError("Enter the SMTP username and password or use the IMAP credentials.");
        return;
      }

      setBusy(true);
      try {
        await mailboxConnectionApi.testNew(accountPayload(accountForm));
      } catch (err) {
        setError(mailboxConnectionErrorMessage(err));
        return;
      } finally {
        setBusy(false);
      }
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
        currentAccount = await api.createAccount(accountPayload(accountForm));
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
      setError(
        providerChoice === "imap"
          ? mailboxConnectionErrorMessage(err)
          : messageOf(err, "onboarding_account_failed"),
      );
    } finally {
      setBusy(false);
    }
  }, [account, accountForm, providerChoice]);

  const saveBehavior = useCallback(async () => {
    if (!account) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateAccount(account.id, {
        move_policy: accountForm.move_policy,
        archive_policy: accountForm.archive_policy,
      });
      setAccount(updated);
      setStep("existing");
    } catch (err) {
      setError(messageOf(err, "onboarding_behavior_failed"));
    } finally {
      setBusy(false);
    }
  }, [account, accountForm.archive_policy, accountForm.move_policy]);

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

function accountPayload(form: AccountForm): EmailAccountCreate {
  const smtpUsername = form.smtp_same_credentials ? form.username : form.smtp_username;
  const smtpPassword = form.smtp_same_credentials ? form.password : form.smtp_password;
  return {
    imap_host: form.imap_host.trim(),
    imap_port: form.imap_port,
    use_ssl: form.use_ssl,
    username: form.username.trim(),
    password: form.password,
    smtp_host: form.smtp_host.trim() || null,
    smtp_port: form.smtp_port || null,
    smtp_security: form.smtp_security,
    smtp_username: smtpUsername.trim() || null,
    smtp_password: smtpPassword || null,
    interval_minutes: form.interval_minutes,
    ownership_mode: form.ownership_mode,
    shared_user_ids: form.ownership_mode === "shared" ? form.shared_user_ids : [],
    move_policy: form.move_policy,
    archive_policy: form.archive_policy,
  };
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : fallback;
}
