"use client";

import { ApiError, api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { MessageDetail } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export function useMailPrintPage() {
  const params = useSearchParams();
  const { t } = useI18n();
  const request = useMemo(() => parsePrintRequest(params), [params]);
  const [messages, setMessages] = useState<MessageDetail[]>([]);
  const [error, setError] = useState<string | null>(request ? null : t("mail.printInvalid"));
  const [loading, setLoading] = useState(Boolean(request));

  useEffect(() => {
    if (!request) {
      setError(t("mail.printInvalid"));
      setLoading(false);
      return;
    }
    let cancelled = false;
    void loadMessages(request)
      .then((items) => {
        if (!cancelled) setMessages(items);
      })
      .catch((err) => {
        if (!cancelled) setError(messageOf(err, t("mail.loadFailed")));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [request, t]);

  return { messages, error, loading };
}

type PrintRequest = {
  accountId: string;
  folder: string;
  uid: number;
  mode: "message" | "thread";
};

function parsePrintRequest(params: ReturnType<typeof useSearchParams>): PrintRequest | null {
  const accountId = params.get("account");
  const folder = params.get("folder");
  const uid = Number(params.get("uid"));
  if (!accountId || !folder || !Number.isInteger(uid) || uid <= 0) return null;
  return {
    accountId,
    folder,
    uid,
    mode: params.get("mode") === "thread" ? "thread" : "message",
  };
}

async function loadMessages(request: PrintRequest): Promise<MessageDetail[]> {
  const message = await api.messageDetail(request.accountId, request.folder, request.uid);
  if (request.mode !== "thread" || !message.thread_id) return [message];
  const thread = await api.threadDetail(request.accountId, message.thread_id);
  return thread.messages;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback;
}
