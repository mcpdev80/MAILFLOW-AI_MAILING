"use client";

import { useSession } from "@/lib/auth-client";
import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { useAccountDetailActions } from "./use-account-detail-actions";
import { useAccountDetailData } from "./use-account-detail-data";

export function useAccountDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const id = params.id;
  const userId = session?.user?.id;
  const data = useAccountDetailData(id, userId);
  const push = useCallback((href: string) => router.push(href), [router]);
  const actions = useAccountDetailActions(id, userId, push, data);
  return {
    id,
    session,
    ...data,
    ...actions,
  };
}
