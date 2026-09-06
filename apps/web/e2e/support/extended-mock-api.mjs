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

const provider = {
  id: "llm-1",
  org_id: "org-1",
  label: "Local provider",
  type: "custom",
  base_url: "http://127.0.0.1:18080/v1",
  default_classification_model: "local-classifier",
  default_generation_model: "local-generator",
  fast_classification_model: "local-classifier",
  deep_classification_model: "local-classifier",
  generation_model: "local-generator",
  fast_classification_base_url: null,
  deep_classification_base_url: null,
  generation_base_url: null,
  is_active: true,
  has_api_key: false,
  has_fast_api_key: false,
  has_deep_api_key: false,
  has_generation_api_key: false,
  created_at: now,
};

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export async function installExtendedMockApi(page) {
  await page.route("**/api/auth/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("passkey/list-user-passkeys")) return json(route, []);
    if (path.includes("organization/list-members")) {
      return json(route, {
        members: [
          {
            id: "member-1",
            userId: "user-1",
            role: "owner",
            user: { id: "user-1", name: "E2E User", email: "e2e@example.test" },
          },
        ],
      });
    }
    if (path.includes("organization/list-invitations")) return json(route, []);
    return route.fallback();
  });

  await page.route("**/api/mf/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/mf/, "");
    const method = request.method();

    if (path === "/llm-providers" && method === "GET")
      return json(route, [provider]);
    if (path === `/llm-providers/${provider.id}` && method === "PATCH") {
      return json(route, { ...provider, ...request.postDataJSON() });
    }
    if (path === `/accounts/${account.id}` && method === "GET")
      return json(route, account);
    if (path === `/accounts/${account.id}/cycles` && method === "GET")
      return json(route, []);
    if (path === `/accounts/${account.id}/access` && method === "GET")
      return json(route, []);
    if (path === "/billing/plan" && method === "GET") {
      return json(route, {
        plan: "free",
        label: "Free",
        seats: 1,
        max_accounts: 1,
        max_emails_per_day: 100,
        accounts_used: 1,
        emails_today: 5,
        billing_enabled: false,
      });
    }
    if (path === "/attention/daily-summary" && method === "GET") {
      const item = {
        account_id: account.id,
        account_label: account.username,
        message_id: "<summary@example.test>",
        subject: "Project update",
        from_email: "sender@example.test",
        category: "work",
        importance: "high",
        urgency: "today",
        action_required: "yes",
        reason: "Action required.",
      };
      return json(route, {
        generated_at: now,
        since: "2026-09-05T10:00:00Z",
        counters: {
          urgent: 1,
          action_required: 1,
          review_needed: 1,
          failures: 0,
          security: 0,
          unread_notifications: 1,
        },
        urgent: [item],
        action_required: [item],
        awaiting_review: [item],
        important_new: [item],
        failures: [],
      });
    }

    return route.fallback();
  });
}
