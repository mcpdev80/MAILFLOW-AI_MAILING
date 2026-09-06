"use client";

import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AccountsPage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    api
      .listAccounts()
      .then((accounts) => {
        if (!active) return;
        router.replace(accounts.length > 0 ? `/app/accounts/${accounts[0].id}` : "/onboarding");
      })
      .catch(() => {
        if (active) router.replace("/onboarding");
      });
    return () => {
      active = false;
    };
  }, [router]);

  return null;
}
