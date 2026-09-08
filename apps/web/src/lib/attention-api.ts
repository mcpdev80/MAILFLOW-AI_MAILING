import { API_BASE } from "./config";

export interface AttentionCounters {
  urgent: number;
  action_required: number;
  review_needed: number;
  failures: number;
  security: number;
  unread_notifications: number;
}

export interface ReviewItem {
  id: string;
  account_id: string;
  account_label: string;
  ownership_mode: string;
  uid: number;
  folder: string;
  thread_id: string | null;
  subject: string;
  from_email: string;
  category: string;
  subcategory: string | null;
  importance: string;
  urgency: string;
  action_required: string;
  confidence: number;
  reason: string;
  review_type: string;
  priority: number;
  destination_folder: string;
  system_tags: string[];
  user_tags: string[];
  suspicious_content: boolean;
  action_review_required: boolean;
  processed_at: string;
}

export interface OperationalReviewItem {
  id: string;
  source_type: "backfill_failure" | "bulk_proposal" | "mailbox_ownership";
  account_id: string;
  account_label: string;
  ownership_mode: string;
  title: string;
  reason: string;
  status: string;
  priority: number;
  created_at: string;
  job_id: string | null;
  uid: number | null;
  folder: string | null;
  retry_available: boolean;
  management_url: string | null;
}

export interface ReviewInbox {
  items: ReviewItem[];
  operational: OperationalReviewItem[];
  counters: AttentionCounters;
}

export interface ReviewCorrection {
  category?: string | null;
  subcategory?: string | null;
  importance?: string | null;
  urgency?: string | null;
  action_required?: string | null;
  destination_folder?: string | null;
  system_tags?: string[] | null;
  user_tags?: string[] | null;
  routing_decision?: "approve" | "reject" | null;
  confirm?: boolean;
  dismiss?: boolean;
  remember?: boolean;
}

export interface MailboxFolder {
  name: string;
  role: string | null;
  selectable: boolean;
}

interface MailboxMetadata {
  folders: MailboxFolder[];
}

export interface NotificationPreference {
  urgent_enabled: boolean;
  security_review_enabled: boolean;
  jobs_enabled: boolean;
  mailbox_health_enabled: boolean;
  daily_summary_enabled: boolean;
  daily_summary_hour: number;
  timezone: string;
}

export interface NotificationItem {
  id: string;
  account_id: string | null;
  event_type: string;
  severity: string;
  title: string;
  body: string;
  read_at: string | null;
  resolved_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface NotificationCenter {
  notifications: NotificationItem[];
  unread: number;
  counters: AttentionCounters;
}

export interface DailySummaryItem {
  account_id: string;
  account_label: string;
  message_id: string;
  subject: string;
  from_email: string;
  category: string;
  importance: string;
  urgency: string;
  action_required: string;
  reason: string | null;
}

export interface DailySummary {
  generated_at: string;
  since: string;
  counters: AttentionCounters;
  urgent: DailySummaryItem[];
  action_required: DailySummaryItem[];
  awaiting_review: DailySummaryItem[];
  important_new: DailySummaryItem[];
  failures: DailySummaryItem[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
  }

  if (!res.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? String((body as { detail?: unknown }).detail ?? "")
        : "";
    throw new Error(detail || text || res.statusText || `HTTP ${res.status}`);
  }

  if (text && body === undefined) {
    throw new Error(`invalid_json_response:${res.status}`);
  }
  return body as T;
}

function withExplicitConfirmation(payload: ReviewCorrection): ReviewCorrection {
  if (payload.dismiss || payload.routing_decision || payload.confirm != null) {
    return payload;
  }
  const confirmsClassification = [
    payload.category,
    payload.subcategory,
    payload.importance,
    payload.urgency,
    payload.action_required,
    payload.destination_folder,
    payload.system_tags,
    payload.user_tags,
  ].some((value) => value !== undefined);
  return confirmsClassification ? { ...payload, confirm: true } : payload;
}

type UiLocale = "de" | "en" | "es";

const FOLDER_ROLE_LABELS: Record<UiLocale, Record<string, string>> = {
  de: {
    inbox: "Posteingang",
    archive: "Archiv",
    drafts: "Entwürfe",
    sent: "Gesendet",
    trash: "Papierkorb",
    spam: "Spam",
    all: "Alle Nachrichten",
  },
  en: {
    inbox: "Inbox",
    archive: "Archive",
    drafts: "Drafts",
    sent: "Sent",
    trash: "Trash",
    spam: "Spam",
    all: "All Mail",
  },
  es: {
    inbox: "Bandeja de entrada",
    archive: "Archivo",
    drafts: "Borradores",
    sent: "Enviados",
    trash: "Papelera",
    spam: "Spam",
    all: "Todos los mensajes",
  },
};

const TECHNICAL_FOLDER_LABELS: Record<UiLocale, Record<string, string>> = {
  de: {
    work: "Arbeit",
    private: "Privat",
    finance: "Finanzen",
    orders: "Bestellungen",
    appointments: "Termine",
    newsletters: "Newsletter",
    notifications: "Benachrichtigungen",
    other: "Sonstiges",
  },
  en: {
    work: "Work",
    private: "Private",
    finance: "Finance",
    orders: "Orders",
    appointments: "Appointments",
    newsletters: "Newsletters",
    notifications: "Notifications",
    other: "Other",
  },
  es: {
    work: "Trabajo",
    private: "Privado",
    finance: "Finanzas",
    orders: "Pedidos",
    appointments: "Citas",
    newsletters: "Boletines",
    notifications: "Notificaciones",
    other: "Otros",
  },
};

const SUBCATEGORY_LABELS: Record<UiLocale, Record<string, string>> = {
  de: {
    fundraising: "Spendenaufruf",
    donation: "Spende",
    donations: "Spenden",
    billing: "Abrechnung",
    invoice: "Rechnung",
    invoices: "Rechnungen",
    shipping: "Versand",
    delivery: "Lieferung",
    reminder: "Erinnerung",
    account: "Konto",
    security: "Sicherheit",
    marketing: "Marketing",
  },
  en: {
    fundraising: "Fundraising",
    donation: "Donation",
    donations: "Donations",
    billing: "Billing",
    invoice: "Invoice",
    invoices: "Invoices",
    shipping: "Shipping",
    delivery: "Delivery",
    reminder: "Reminder",
    account: "Account",
    security: "Security",
    marketing: "Marketing",
  },
  es: {
    fundraising: "Recaudación de fondos",
    donation: "Donación",
    donations: "Donaciones",
    billing: "Facturación",
    invoice: "Factura",
    invoices: "Facturas",
    shipping: "Envío",
    delivery: "Entrega",
    reminder: "Recordatorio",
    account: "Cuenta",
    security: "Seguridad",
    marketing: "Marketing",
  },
};

const REVIEW_REASON_LABELS: Record<UiLocale, Record<string, string>> = {
  de: {
    confidence_below_action_threshold:
      "Die Klassifizierung liegt unter der erforderlichen Sicherheit für automatische Postfachaktionen. Bitte prüfe das vorgeschlagene Ziel.",
    review_required:
      "Die Nachricht benötigt eine menschliche Prüfung, bevor Mailflow die vorgeschlagene Aktion ausführt.",
    mailbox_action_failed:
      "Die vorgeschlagene Postfachaktion konnte nicht ausgeführt werden.",
    mailbox_action_blocked:
      "Die vorgeschlagene Postfachaktion wurde aus Sicherheitsgründen blockiert.",
  },
  en: {
    confidence_below_action_threshold:
      "The classification is below the confidence required for automatic mailbox actions. Please review the proposed destination.",
    review_required:
      "The message requires human review before Mailflow executes the proposed action.",
    mailbox_action_failed:
      "The proposed mailbox action could not be completed.",
    mailbox_action_blocked:
      "The proposed mailbox action was blocked for safety reasons.",
  },
  es: {
    confidence_below_action_threshold:
      "La clasificación está por debajo de la confianza necesaria para acciones automáticas del buzón. Revisa el destino propuesto.",
    review_required:
      "El mensaje requiere revisión humana antes de que Mailflow ejecute la acción propuesta.",
    mailbox_action_failed:
      "No se pudo completar la acción propuesta del buzón.",
    mailbox_action_blocked:
      "La acción propuesta del buzón se bloqueó por motivos de seguridad.",
  },
};

function currentLocale(): UiLocale {
  if (typeof document === "undefined") return "en";
  const locale = document.documentElement.lang.toLowerCase().split("-")[0];
  return locale === "de" || locale === "es" ? locale : "en";
}

function folderDisplayName(folder: Pick<MailboxFolder, "name" | "role">): string {
  const locale = currentLocale();
  const role = folder.role?.toLowerCase();
  if (role && FOLDER_ROLE_LABELS[locale][role]) {
    return FOLDER_ROLE_LABELS[locale][role];
  }
  if (folder.name.toUpperCase() === "INBOX") {
    return FOLDER_ROLE_LABELS[locale].inbox;
  }
  const technical = TECHNICAL_FOLDER_LABELS[locale][folder.name.trim().toLowerCase()];
  return technical ?? folder.name;
}

function localizeSubcategory(value: string | null, locale: UiLocale): string | null {
  if (!value) return value;
  const key = value.trim().toLowerCase();
  return SUBCATEGORY_LABELS[locale][key] ?? value;
}

function localizeReviewReason(value: string, locale: UiLocale): string {
  const key = value.trim().toLowerCase();
  return REVIEW_REASON_LABELS[locale][key] ?? value;
}

function decodeMimeHeader(value: string): string {
  if (!value || !value.includes("=?")) return value;
  return value.replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
    (_match, charset: string, encoding: string, encoded: string) => {
      try {
        let bytes: Uint8Array;
        if (encoding.toUpperCase() === "B") {
          const binary = atob(encoded);
          bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        } else {
          const qp = encoded.replace(/_/g, " ");
          const data: number[] = [];
          for (let index = 0; index < qp.length; index += 1) {
            if (qp[index] === "=" && /^[0-9A-Fa-f]{2}$/.test(qp.slice(index + 1, index + 3))) {
              data.push(Number.parseInt(qp.slice(index + 1, index + 3), 16));
              index += 2;
            } else {
              data.push(qp.charCodeAt(index));
            }
          }
          bytes = Uint8Array.from(data);
        }
        const normalizedCharset = charset.trim().toLowerCase();
        const decoderCharset = normalizedCharset === "utf8" ? "utf-8" : normalizedCharset;
        return new TextDecoder(decoderCharset, { fatal: false }).decode(bytes);
      } catch {
        return encoded;
      }
    },
  ).replace(/\?=\s+=\?/g, "?==?");
}

const mailboxFolderCache = new Map<string, Promise<MailboxFolder[]>>();
const folderWireNames = new Map<string, Map<string, string>>();
const reviewAccountIds = new Map<string, string>();

async function mailboxFolders(accountId: string): Promise<MailboxFolder[]> {
  const cacheKey = `${accountId}:${currentLocale()}`;
  const cached = mailboxFolderCache.get(cacheKey);
  if (cached) return cached;

  const pending = request<MailboxMetadata>(
    `/mail-client/accounts/${encodeURIComponent(accountId)}/metadata`,
  )
    .then((metadata) => {
      const wireNames = new Map<string, string>();
      const folders = metadata.folders
        .filter((folder) => folder.selectable)
        .map((folder) => {
          const displayName = folderDisplayName(folder);
          wireNames.set(displayName, folder.name);
          return { ...folder, name: displayName };
        });
      folderWireNames.set(accountId, wireNames);
      return folders;
    })
    .catch((error) => {
      mailboxFolderCache.delete(cacheKey);
      throw error;
    });
  mailboxFolderCache.set(cacheKey, pending);
  return pending;
}

function localizeReviewInbox(inbox: ReviewInbox): ReviewInbox {
  const locale = currentLocale();
  return {
    ...inbox,
    items: inbox.items.map((item) => {
      reviewAccountIds.set(item.id, item.account_id);
      const destination = item.destination_folder.trim();
      const technicalDestination = TECHNICAL_FOLDER_LABELS[locale][destination.toLowerCase()];
      return {
        ...item,
        subject: decodeMimeHeader(item.subject),
        subcategory: localizeSubcategory(item.subcategory, locale),
        reason: localizeReviewReason(item.reason, locale),
        destination_folder:
          destination.toUpperCase() === "INBOX"
            ? FOLDER_ROLE_LABELS[locale].inbox
            : technicalDestination ?? destination,
      };
    }),
  };
}

function destinationWireName(reviewId: string, displayName: string): string {
  const accountId = reviewAccountIds.get(reviewId);
  const mapped = accountId
    ? folderWireNames.get(accountId)?.get(displayName)
    : undefined;
  if (mapped) return mapped;

  const inboxLabels = new Set(
    Object.values(FOLDER_ROLE_LABELS).map((labels) => labels.inbox),
  );
  if (inboxLabels.has(displayName)) return "INBOX";

  for (const labels of Object.values(TECHNICAL_FOLDER_LABELS)) {
    for (const [wire, label] of Object.entries(labels)) {
      if (label === displayName) return wire;
    }
  }
  return displayName;
}

function normalizeCorrectionForWire(
  reviewId: string,
  payload: ReviewCorrection,
): ReviewCorrection {
  if (payload.destination_folder === undefined || payload.destination_folder === null) {
    return payload;
  }
  return {
    ...payload,
    destination_folder: destinationWireName(reviewId, payload.destination_folder),
  };
}

export const attentionApi = {
  review: async () => localizeReviewInbox(await request<ReviewInbox>("/attention/review")),
  correctReview: (id: string, payload: ReviewCorrection) =>
    request<ReviewItem | undefined>(`/attention/review/${id}`, {
      method: "PATCH",
      body: JSON.stringify(
        withExplicitConfirmation(normalizeCorrectionForWire(id, payload)),
      ),
    }),
  mailboxFolders,
  retryBackfillFailure: (accountId: string, jobId: string, failureId: string) =>
    request<unknown>(
      `/accounts/${accountId}/backfill/${jobId}/failures/${failureId}/retry`,
      { method: "POST" },
    ),
  notifications: (includeResolved = false) =>
    request<NotificationCenter>(
      `/attention/notifications?include_resolved=${includeResolved}`,
    ),
  markRead: (id: string) =>
    request<void>(`/attention/notifications/${id}/read`, { method: "POST" }),
  preferences: () => request<NotificationPreference>("/attention/preferences"),
  savePreferences: (payload: NotificationPreference) =>
    request<NotificationPreference>("/attention/preferences", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  dailySummary: (hours = 24) =>
    request<DailySummary>(`/attention/daily-summary?hours=${hours}`),
};