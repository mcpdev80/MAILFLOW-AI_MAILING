"use client";

import { useMemo, useState } from "react";
import styles from "./mail-workspace.module.css";

export function SenderAvatar({
  address,
  size = "medium",
  unread = false,
}: {
  address: string;
  size?: "small" | "medium" | "large";
  unread?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const label = useMemo(() => initials(address), [address]);
  const src = `/api/mf/mail-client/sender-brand?address=${encodeURIComponent(address)}`;
  return (
    <span
      className={`${styles.brandAvatar} ${styles[`brandAvatar${capitalize(size)}`]}`}
      aria-hidden="true"
    >
      <span className={styles.brandFallback}>{label}</span>
      {!failed && (
        <img
          className={styles.brandImage}
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
      {unread && <span className={styles.avatarUnreadDot} />}
    </span>
  );
}

function displaySender(value: string): string {
  const match = value.match(/^\s*([^<]+?)\s*<[^>]+>\s*$/);
  return match?.[1]?.trim() || value;
}

function initials(value: string): string {
  const display = displaySender(value).replace(/["']/g, "").trim();
  if (!display) return "?";
  const parts = display.split(/[\s@._-]+/).filter(Boolean);
  return (parts.length > 1
    ? `${parts[0][0]}${parts[1][0]}`
    : parts[0].slice(0, 2)
  ).toUpperCase();
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}
