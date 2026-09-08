import type { SVGProps } from "react";

export type UiIconName =
  | "dashboard"
  | "mail"
  | "review"
  | "search"
  | "processing"
  | "attachment"
  | "mailbox"
  | "learning"
  | "settings"
  | "bell"
  | "chevronDown"
  | "organization"
  | "models"
  | "system"
  | "refresh"
  | "backup"
  | "certificate"
  | "members"
  | "profile"
  | "appearance"
  | "layout"
  | "rules"
  | "security"
  | "retention"
  | "folder"
  | "discovery"
  | "mapping"
  | "check";

export function UiIcon({
  name,
  size = 18,
  ...props
}: SVGProps<SVGSVGElement> & { name: UiIconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...props}
    >
      {iconPath(name)}
    </svg>
  );
}

function iconPath(name: UiIconName) {
  switch (name) {
    case "dashboard":
      return <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>;
    case "mail":
      return <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>;
    case "review":
      return <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>;
    case "search":
      return <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>;
    case "processing":
      return <><path d="M4 7h10M4 12h7M4 17h10" /><path d="M17 9v6M14 12h6" /></>;
    case "attachment":
      return <path d="m8.5 12.5 6.8-6.8a3 3 0 0 1 4.2 4.2l-8.4 8.4a4.5 4.5 0 0 1-6.4-6.4l8-8" />;
    case "mailbox":
      return <><path d="M4 6h11a5 5 0 0 1 5 5v7H4z" /><path d="M4 11h16M9 6v12M14 6V3h4" /></>;
    case "learning":
      return <><path d="M12 3a5 5 0 0 0-3 9v3h6v-3a5 5 0 0 0-3-9Z" /><path d="M9 18h6M10 21h4" /></>;
    case "settings":
      return <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.6-.8-1.9 1-1.8-2.1-2.1-1.8 1-.8-.3L12 3h-3l-.6 2-.9.4-1.8-1-2.1 2.1 1 1.8-.4 1L3 10v3l2 .6.4 1-1 1.8 2.1 2.1 1.8-1 .9.4L10 20h3l.6-2 .9-.4 1.8 1 2.1-2.1-1-1.8.4-1z" /></>;
    case "bell":
      return <><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8" /><path d="M10 20h4" /></>;
    case "chevronDown":
      return <path d="m7 10 5 5 5-5" />;
    case "organization":
      return <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h2M14 7h2M8 11h2M14 11h2M9 21v-5h6v5" /></>;
    case "models":
      return <><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="m4 7 8 4 8-4M12 11v10" /></>;
    case "system":
      return <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 21h8M12 18v3M7 9h10M7 13h6" /></>;
    case "refresh":
      return <><path d="M20 6v5h-5" /><path d="M19 11a7.5 7.5 0 1 0 .2 4" /></>;
    case "backup":
      return <><path d="M4 5h16v14H4z" /><path d="M8 5v6h8V5M8 16h8" /></>;
    case "certificate":
      return <><path d="M6 3h12v18H6z" /><path d="M9 7h6M9 11h4" /><circle cx="14" cy="16" r="2" /><path d="m13 18-1 3 2-1 2 1-1-3" /></>;
    case "members":
      return <><circle cx="9" cy="9" r="3" /><circle cx="17" cy="10" r="2" /><path d="M4 20a5 5 0 0 1 10 0M14 16a4 4 0 0 1 6 4" /></>;
    case "profile":
      return <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>;
    case "appearance":
      return <><circle cx="12" cy="12" r="9" /><path d="M12 3v18M12 3a9 9 0 0 1 0 18" /></>;
    case "layout":
      return <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M9 10h12" /></>;
    case "rules":
      return <><path d="M4 7h10M4 12h16M4 17h12" /><circle cx="17" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>;
    case "security":
      return <><path d="M12 3 5 6v5c0 4.8 2.7 8 7 10 4.3-2 7-5.2 7-10V6z" /><path d="m9 12 2 2 4-4" /></>;
    case "retention":
      return <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /><path d="M10 11v5M14 11v5" /></>;
    case "folder":
      return <path d="M3 7.5h6l2 2h10v9.5H3zM3 7.5V5h6l2 2h8" />;
    case "discovery":
      return <><path d="M3 7.5h6l2 2h7v6" /><circle cx="16" cy="16" r="4" /><path d="m19 19 2 2" /></>;
    case "mapping":
      return <><path d="M5 6h6M5 12h6M5 18h6M15 6h4M15 12h4M15 18h4" /><path d="m11 6 4 0M11 12h4M11 18h4" /></>;
    case "check":
      return <path d="m5 12 4 4 10-10" />;
  }
}
