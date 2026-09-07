import type { SVGProps } from "react";

export type MailIconName =
  | "archive"
  | "chevron"
  | "folder"
  | "forward"
  | "inbox"
  | "mail"
  | "more"
  | "paperclip"
  | "refresh"
  | "reply"
  | "replyAll"
  | "search"
  | "settings"
  | "star"
  | "tag"
  | "trash";

export function MailIcon({
  name,
  size = 18,
  ...props
}: SVGProps<SVGSVGElement> & { name: MailIconName; size?: number }) {
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
      {...props}
    >
      {iconPath(name)}
    </svg>
  );
}

function iconPath(name: MailIconName) {
  switch (name) {
    case "archive":
      return <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10h14V9M10 13h4" /></>;
    case "chevron":
      return <path d="m9 18 6-6-6-6" />;
    case "folder":
      return <path d="M3 7.5h6l2 2h10v9.5H3zM3 7.5V5h6l2 2h8" />;
    case "forward":
      return <path d="m14 7 5 5-5 5v-3H9c-2.5 0-4.2 1-5 3 .2-4.5 2.3-7 6.5-7H14z" />;
    case "inbox":
      return <><path d="M4 5h16l1 14H3z" /><path d="M3.7 14h5l1.5 2h3.6l1.5-2h5" /></>;
    case "mail":
      return <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>;
    case "more":
      return <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>;
    case "paperclip":
      return <path d="m8.5 12.5 6.8-6.8a3 3 0 0 1 4.2 4.2l-8.4 8.4a4.5 4.5 0 0 1-6.4-6.4l8-8" />;
    case "refresh":
      return <><path d="M20 6v5h-5" /><path d="M19 11a7.5 7.5 0 1 0 .2 4" /></>;
    case "reply":
      return <path d="m10 7-6 5 6 5v-3h4c3 0 5 1.2 6 3.5C19.8 12.7 17.5 10 13 10h-3z" />;
    case "replyAll":
      return <><path d="m8 8-5 4 5 4v-2.5h3.5c3 0 5 1.2 6 3.5-.2-4.7-2.5-7-6.5-7H8z" /><path d="m12 7 5 5-2 1.7" /></>;
    case "search":
      return <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>;
    case "settings":
      return <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.6-.8-1.9 1-1.8-2.1-2.1-1.8 1-.8-.3L12 3h-3l-.6 2-.9.4-1.8-1-2.1 2.1 1 1.8-.4 1L3 10v3l2 .6.4 1-1 1.8 2.1 2.1 1.8-1 .9.4L10 20h3l.6-2 .9-.4 1.8 1 2.1-2.1-1-1.8.4-1z" /></>;
    case "star":
      return <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z" />;
    case "tag":
      return <><path d="M4 4h7l9 9-7 7-9-9z" /><circle cx="8" cy="8" r="1.3" /></>;
    case "trash":
      return <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /><path d="M10 11v5M14 11v5" /></>;
  }
}
