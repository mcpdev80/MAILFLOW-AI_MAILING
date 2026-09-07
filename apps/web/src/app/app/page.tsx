"use client";

import { getAccessContext } from "@/lib/access-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AppEntryPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    void getAccessContext()
      .then((context) => {
        if (cancelled) return;
        if (!context.authenticated) {
          router.replace("/login?redirect=/app");
          return;
        }
        if (context.recommended_area === "instance") {
          router.replace("/admin/instance");
          return;
        }
        if (context.recommended_area === "organization") {
          router.replace("/admin/org");
          return;
        }
        router.replace("/app/dashboard");
      })
      .catch(() => {
        if (!cancelled) router.replace("/app/dashboard");
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return <div className="empty">Mailflow wird geöffnet…</div>;
}
