const now = "2026-09-06T10:00:00Z";

const account = {
  id: "acct-1",
  org_id: "org-1",
  owner_user_id: "user-1",
  ownership_mode: "private",
  provider_type: "imap",
  imap_host: "imap.test.invalid",
  imap_port: 993,
  use_ssl: true,
  username: "owner@example.test",
  inbox_folder: "INBOX",
  unclassified_folder: "Unclassified",
  drafts_folder: "Drafts",
  smtp_host: "smtp.test.invalid",
  smtp_port: 465,
  smtp_security: "ssl",
  smtp_username: "owner@example.test",
  has_smtp_password: true,
  interval_minutes: 5,
  is_active: true,
  last_cycle_at: now,
  llm_provider_id: "llm-1",
  move_policy: "review",
  archive_policy: "review",
  action_confidence_threshold: 0.9,
  created_at: now,
};

const message = {
  account_id: account.id,
  account_address: account.username,
  ownership_mode: "private",
  uid: 42,
  folder: "INBOX",
  message_id: "<message-42@example.test>",
  thread_id: "thread-1",
  subject: "Project update",
  from_email: "sender@example.test",
  to_emails: [account.username],
  cc_emails: [],
  date: now,
  seen: false,
  flagged: false,
  answered: false,
  keywords: [],
  attachments: [],
};

const messageDetail = {
  ...message,
  body_text: "The project update is ready for review.",
  safe_html: null,
  in_reply_to: null,
  references: [],
};

const counters = {
  urgent: 1,
  action_required: 1,
  review_needed: 1,
  failures: 0,
  security: 0,
  unread_notifications: 1,
};

const reviewItem = {
  id: "review-1",
  account_id: account.id,
  account_label: account.username,
  ownership_mode: "private",
  uid: message.uid,
  folder: message.folder,
  thread_id: message.thread_id,
  subject: message.subject,
  from_email: message.from_email,
  category: "work",
  subcategory: "project",
  importance: "high",
  urgency: "today",
  action_required: "yes",
  confidence: 0.74,
  reason: "Classification requires confirmation.",
  review_type: "classification",
  priority: 90,
  destination_folder: "Work",
  system_tags: [],
  user_tags: [],
  suspicious_content: false,
  action_review_required: true,
  processed_at: now,
};

const dashboard = {
  range_days: 7,
  generated_at: now,
  counters: {
    total_processed: 42,
    processed_range: 20,
    processed_today: 5,
    pending_or_queued: 2,
    review_required: 1,
    urgent: 1,
    action_required: 1,
    failed_or_deferred: 0,
    automated_actions: 3,
    decision_memory: 4,
    fast_model: 10,
    deep_model: 6,
    active_backfills: 0,
  },
  trend: [{ day: "2026-09-06", processed: 5, review: 1, failures: 0 }],
  categories: [{ key: "work", count: 5 }],
  handling: [{ key: "fast_model", count: 5 }],
  mailboxes: [
    {
      account_id: account.id,
      label: account.username,
      ownership_mode: "private",
      is_active: true,
      last_cycle_at: now,
      processed_today: 5,
      review_count: 1,
      pending_count: 1,
      health: "healthy",
      last_error: null,
      backfill_status: null,
      backfill_processed: null,
      backfill_total: null,
    },
  ],
  inference_status: "ok",
  inference_warning: null,
};

function initialPreferences() {
  return {
    locale: "en",
    locale_configured: true,
    theme: "light",
    density: "comfortable",
    workspace_layout: "classic",
    side_panel_alignment: "left",
    workspace_custom_config: null,
  };
}

function initialDraft() {
  return {
    id: "draft-1",
    org_id: "org-1",
    account_id: account.id,
    owner_user_id: "user-1",
    message_type: "new",
    in_reply_to: null,
    references: [],
    to_recipients: ["recipient@example.test"],
    cc_recipients: [],
    bcc_recipients: [],
    subject: "Draft subject",
    body_text: "Draft body",
    body_html: null,
    editor_mode: "markdown",
    status: "draft",
    send_attempts: 0,
    sent_message_id: null,
    last_error: null,
    attachments: [],
    created_at: now,
    updated_at: now,
    sent_at: null,
  };
}

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export async function installMockApi(page) {
  let preferences = initialPreferences();
  let draft = initialDraft();

  await page.addInitScript(() => {
    window.localStorage.setItem("mailflow.locale", "en");
  });

  await page.route("**/api/auth/**", (route) =>
    json(route, {
      session: { id: "session-1", userId: "user-1" },
      user: { id: "user-1", name: "E2E User", email: "e2e@example.test" },
    }),
  );

  await page.route("**/api/mf/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/mf/, "");
    const method = request.method();

    if (path === "/health") return json(route, { status: "ok", db: "up" });
    if (path === "/user/preferences" && method === "GET")
      return json(route, preferences);
    if (path === "/user/preferences" && method === "PUT") {
      preferences = { ...preferences, ...(request.postDataJSON?.() ?? {}) };
      return json(route, preferences);
    }
    if (path === "/attention/review" && method === "GET") {
      return json(route, { items: [reviewItem], operational: [], counters });
    }
    if (path === "/attention/notifications") {
      return json(route, {
        notifications: [
          {
            id: "notification-1",
            account_id: account.id,
            event_type: "urgent",
            severity: "warning",
            title: "Action required",
            body: "A message needs attention.",
            read_at: null,
            resolved_at: null,
            created_at: now,
            metadata: {},
          },
        ],
        unread: 1,
        counters,
      });
    }
    if (path === "/attention/preferences") {
      return json(route, {
        urgent_enabled: true,
        security_review_enabled: true,
        jobs_enabled: true,
        mailbox_health_enabled: true,
        daily_summary_enabled: true,
        daily_summary_hour: 8,
        timezone: "Europe/Berlin",
      });
    }
    if (path === "/dashboard/overview") return json(route, dashboard);
    if (path === "/dashboard/search") {
      return json(route, {
        total: 1,
        limit: 100,
        offset: 0,
        items: [
          {
            id: "processed-1",
            account_id: account.id,
            account_label: account.username,
            ownership_mode: "private",
            uid: message.uid,
            folder: message.folder,
            from_email: message.from_email,
            subject: message.subject,
            processed_at: now,
            category: "work",
            subcategory: "project",
            importance: "high",
            urgency: "today",
            action_required: "yes",
            review_required: true,
            suspicious_content: false,
            system_tags: [],
            user_tags: [],
            destination_folder: "Work",
            classification_source: "fast_model",
            processed_state: "execute",
          },
        ],
      });
    }
    if (path === "/accounts" && method === "GET") return json(route, [account]);
    if (path === `/accounts/${account.id}/cycles/run` && method === "POST") {
      return json(route, {
        account_id: account.id,
        enqueued: true,
        job_id: "job-1",
      });
    }
    if (path === "/mail-client/inbox") {
      return json(route, {
        messages: [message],
        counters: [
          {
            account_id: account.id,
            account_address: account.username,
            folder: "INBOX",
            total: 1,
            unread: message.seen ? 0 : 1,
          },
        ],
        total_unread: message.seen ? 0 : 1,
        next_before_uid_by_account: {},
      });
    }
    if (path === `/mail-client/accounts/${account.id}/metadata`) {
      return json(route, {
        capabilities: {
          read_state: true,
          flag: true,
          move: true,
          archive: true,
          trash: true,
          spam: true,
          restore: true,
          tags: true,
          attachments: true,
        },
        folders: [
          { name: "INBOX", role: "inbox", selectable: true },
          { name: "Archive", role: "archive", selectable: true },
          { name: "Trash", role: "trash", selectable: true },
        ],
      });
    }
    if (
      path === `/mail-client/accounts/${account.id}/messages/${message.uid}` &&
      method === "GET"
    ) {
      return json(route, messageDetail);
    }
    if (
      path ===
        `/mail-client/accounts/${account.id}/messages/${message.uid}/actions` &&
      method === "POST"
    ) {
      return json(route, {
        action: request.postDataJSON().action,
        applied: true,
        destination_folder: null,
      });
    }
    if (
      path ===
      `/mail-client/accounts/${account.id}/threads/${message.thread_id}`
    ) {
      return json(route, {
        account_id: account.id,
        thread_id: message.thread_id,
        messages: [messageDetail],
        insights: {
          overview: "Project update summary",
          key_points: ["Review requested"],
          todos: ["Review project update"],
          open_questions: [],
          open_action_required: true,
          deadline: null,
        },
      });
    }
    if (path === "/mail/drafts" && method === "GET")
      return json(route, [draft]);
    if (path === "/mail/drafts" && method === "POST") return json(route, draft);
    if (path === `/mail/drafts/${draft.id}` && method === "GET")
      return json(route, draft);
    if (path === `/mail/drafts/${draft.id}` && method === "PATCH") {
      draft = { ...draft, ...request.postDataJSON(), updated_at: now };
      return json(route, draft);
    }
    if (path === `/mail/drafts/${draft.id}` && method === "DELETE") {
      draft = { ...draft, status: "discarded" };
      return route.fulfill({ status: 204, body: "" });
    }
    if (path === `/mail/drafts/${draft.id}/pre-send` && method === "GET") {
      return json(route, { warning_codes: [], can_send: true });
    }
    if (path === `/mail/drafts/${draft.id}/send` && method === "POST") {
      draft = {
        ...draft,
        status: "sent",
        sent_message_id: "<sent@example.test>",
        sent_at: now,
      };
      return json(route, {
        draft_id: draft.id,
        status: "sent",
        message_id: draft.sent_message_id,
        warning_codes: [],
      });
    }
    if (path === `/attention/review/${reviewItem.id}` && method === "PATCH") {
      return json(route, reviewItem);
    }

    return json(
      route,
      { detail: `Unmocked E2E endpoint: ${method} ${path}` },
      501,
    );
  });
}
