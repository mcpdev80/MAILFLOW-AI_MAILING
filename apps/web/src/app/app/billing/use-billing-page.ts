"use client";

import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { PlanStatus } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

export const TEAM_MIN_SEATS = 3;

export function useBillingPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [teamSeats, setTeamSeats] = useState(TEAM_MIN_SEATS);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStatus(await api.planStatus());
    } catch (err) {
      setError(messageOf(err, t("billing.loadFailed")));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const upgrade = useCallback(
    async (plan: "pro" | "team") => {
      setBusy(true);
      setError(null);
      try {
        const { url } = await api.checkout(
          plan,
          plan === "team" ? teamSeats : undefined,
        );
        window.location.href = url;
      } catch (err) {
        setError(checkoutMessage(err, t));
        setBusy(false);
      }
    },
    [t, teamSeats],
  );

  const openPortal = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.billingPortal();
      window.location.href = url;
    } catch (err) {
      setError(messageOf(err, t("billing.portalFailed")));
      setBusy(false);
    }
  }, [t]);

  return {
    status,
    error,
    busy,
    teamSeats,
    setTeamSeats,
    upgrade,
    openPortal,
    reload: load,
  };
}

function checkoutMessage(
  error: unknown,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (error instanceof ApiError && error.status === 501)
    return t("billing.notConfigured");
  return messageOf(error, t("billing.checkoutFailed"));
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : fallback;
}
