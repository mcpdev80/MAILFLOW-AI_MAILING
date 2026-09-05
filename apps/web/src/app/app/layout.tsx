"use client";

import { attentionApi } from "@/lib/attention-api";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    attentionApi
      .notifications()
      .then((center) => {
        if (active) setUnread(center.unread);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <nav
        aria-label="Mailflow"
        style={{
          display: "flex",
          gap: "0.75rem",
          alignItems: "center",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--border, #ddd)",
          flexWrap: "wrap",
        }}
      >
        <Link href="/app/dashboard"><strong>Mailflow</strong></Link>
        <Link href="/app/dashboard">Dashboard</Link>
        <Link href="/app/mail">Mail</Link>
        <Link href="/app/review">Review</Link>
        <Link href="/app/notifications">
          Notifications{unread > 0 ? ` (${unread})` : ""}
        </Link>
        <Link href="/app/daily-summary">Daily summary</Link>
      </nav>
      {children}
    </>
  );
}
