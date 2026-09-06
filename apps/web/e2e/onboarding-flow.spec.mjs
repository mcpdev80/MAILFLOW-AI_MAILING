import { expect, test } from "@playwright/test";

const now = "2026-09-06T10:00:00Z";

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function provider() {
  return {
    id: "llm-onboarding-1",
    org_id: "org-1",
    label: "Local provider",
    type: "custom",
    base_url: "http://127.0.0.1:18080/v1",
    default_classification_model: "local-classifier",
    default_generation_model: "local-generator",
    fast_classification_model: null,
    deep_classification_model: null,
    generation_model: null,
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
}

function account(ownerUserId, username) {
  return {
    id: `acct-${ownerUserId}`,
    org_id: "org-1",
    owner_user_id: ownerUserId,
    ownership_mode: "private",
    provider_type: "imap",
    imap_host: "imap.example.test",
    imap_port: 993,
    use_ssl: true,
    username,
    inbox_folder: "INBOX",
    unclassified_folder: "Unclassified",
    drafts_folder: "Drafts",
    smtp_host: null,
    smtp_port: null,
    smtp_security: "starttls",
    smtp_username: null,
    has_smtp_password: false,
    interval_minutes: 5,
    is_active: true,
    last_cycle_at: null,
    llm_provider_id: "llm-onboarding-1",
    move_policy: "review",
    archive_policy: "review",
    action_confidence_threshold: 0.9,
    created_at: now,
  };
}

function preferences() {
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

async function useEnglish(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("mailflow.locale", "en");
  });
}

async function setSessionCookie(page, userId) {
  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: `session-token-${userId}`,
      url: "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function mockAuth(
  page,
  { userId, email, role, initiallySignedIn = true },
) {
  let signedIn = initiallySignedIn;
  const calls = {
    signup: 0,
    signIn: 0,
    createOrganization: 0,
    acceptInvitation: 0,
    setActiveOrganization: 0,
  };

  if (initiallySignedIn) await setSessionCookie(page, userId);

  await page.route("**/api/auth/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/get-session")) {
      if (!signedIn) return json(route, null);
      return json(route, {
        session: {
          id: `session-${userId}`,
          userId,
          activeOrganizationId: "auth-org-1",
          createdAt: now,
        },
        user: {
          id: userId,
          name: role === "owner" ? "Owner" : "Member",
          email,
        },
      });
    }
    if (path.endsWith("/sign-up/email")) {
      calls.signup += 1;
      signedIn = true;
      await setSessionCookie(page, userId);
      return json(route, {
        token: "test-token",
        user: { id: userId, name: "Owner", email },
      });
    }
    if (path.endsWith("/sign-in/email")) {
      calls.signIn += 1;
      signedIn = true;
      await setSessionCookie(page, userId);
      return json(route, {
        redirect: false,
        token: "test-token",
        user: { id: userId, name: "Member", email },
      });
    }
    if (path.endsWith("/organization/create")) {
      calls.createOrganization += 1;
      return json(route, {
        id: "auth-org-1",
        name: "Mailflow Test Org",
        slug: "mailflow-test-org",
      });
    }
    if (path.includes("organization/list-members")) {
      return json(route, {
        members: [
          {
            id: `membership-${userId}`,
            userId,
            role,
            user: {
              id: userId,
              email,
              name: role === "owner" ? "Owner" : "Member",
            },
          },
        ],
      });
    }
    if (path.includes("organization/get-invitation")) {
      return json(route, {
        id: "inv-member-1",
        email,
        role: "member",
        status: "pending",
        organizationId: "auth-org-1",
        organizationName: "Mailflow Test Org",
      });
    }
    if (path.includes("organization/accept-invitation")) {
      calls.acceptInvitation += 1;
      return json(route, {
        invitation: { id: "inv-member-1", status: "accepted" },
        member: { userId, role: "member" },
      });
    }
    if (path.includes("organization/set-active")) {
      calls.setActiveOrganization += 1;
      return json(route, { id: "auth-org-1", name: "Mailflow Test Org" });
    }
    return json(route, {});
  });

  return calls;
}

async function mockMailflow(page, { userId, email }) {
  const calls = { createAccount: 0, updateAccount: 0, accountPayload: null };
  let configuredAccount = null;

  await page.route("**/api/mf/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/mf/, "");
    const method = request.method();

    if (path === "/user/preferences" && method === "GET") {
      return json(route, preferences());
    }
    if (path === "/llm-providers" && method === "GET") {
      return json(route, [provider()]);
    }
    if (path === "/accounts" && method === "GET") {
      return json(route, configuredAccount ? [configuredAccount] : []);
    }
    if (path === "/accounts" && method === "POST") {
      calls.createAccount += 1;
      calls.accountPayload = request.postDataJSON?.() ?? null;
      configuredAccount = {
        ...account(userId, email),
        ...calls.accountPayload,
      };
      return json(route, configuredAccount, 201);
    }
    if (
      configuredAccount &&
      path === `/accounts/${configuredAccount.id}` &&
      method === "PATCH"
    ) {
      calls.updateAccount += 1;
      configuredAccount = {
        ...configuredAccount,
        ...(request.postDataJSON?.() ?? {}),
      };
      return json(route, configuredAccount);
    }
    if (path === "/dashboard/overview" && method === "GET") {
      return json(route, {
        range_days: 7,
        generated_at: now,
        counters: {
          total_processed: 0,
          processed_range: 0,
          processed_today: 0,
          pending_or_queued: 0,
          review_required: 0,
          urgent: 0,
          action_required: 0,
          failed_or_deferred: 0,
          automated_actions: 0,
          decision_memory: 0,
          fast_model: 0,
          deep_model: 0,
          active_backfills: 0,
        },
        trend: [],
        categories: [],
        handling: [],
        mailboxes: [],
        inference_status: "ok",
        inference_warning: null,
      });
    }
    return json(route, { detail: `Unmocked endpoint: ${method} ${path}` }, 501);
  });

  return calls;
}

async function completePrivateMailboxOnboarding(page, email) {
  await expect(
    page.getByRole("heading", { name: "Welcome to Mailflow" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect your mailbox" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect your mailbox" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "IMAP" }).click();
  await page.getByLabel("IMAP host").fill("imap.example.test");
  await page.getByLabel("Username").fill(email);
  await page.getByLabel("Password").fill("mailbox-secret");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Mailbox privacy" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Mailflow behavior" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(
    page.getByRole("heading", { name: "Existing email" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Analyze existing messages" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "You're all set!" })).toBeVisible();
  await expect(page.getByText(/Step 6 of 6/i)).toBeVisible();
  await page.getByRole("button", { name: "Open Mailflow" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
}

test("owner signup creates the organization and routes to instance setup", async ({
  page,
}) => {
  await useEnglish(page);
  const authCalls = await mockAuth(page, {
    userId: "owner-1",
    email: "owner@example.test",
    role: "owner",
    initiallySignedIn: false,
  });

  await page.goto("/signup");
  await page.locator("#name").fill("Owner");
  await page.locator("#organization").fill("Mailflow Test Org");
  await page.locator("#email").fill("owner@example.test");
  await page.locator("#password").fill("owner-password-123");
  await page.locator("#confirm-password").fill("owner-password-123");
  await page.locator('form button[type="submit"]').click();

  await expect(page).toHaveURL(/\/setup$/);
  expect(authCalls.signup).toBe(1);
  expect(authCalls.createOrganization).toBe(1);
});

test("member completes the canonical six-step private-mailbox onboarding", async ({
  page,
}) => {
  await useEnglish(page);
  await mockAuth(page, {
    userId: "member-1",
    email: "member@example.test",
    role: "member",
  });
  const mfCalls = await mockMailflow(page, {
    userId: "member-1",
    email: "member@example.test",
  });

  await page.goto("/onboarding");
  await completePrivateMailboxOnboarding(page, "member@example.test");

  expect(mfCalls.createAccount).toBe(1);
  expect(mfCalls.updateAccount).toBe(1);
  expect(mfCalls.accountPayload?.ownership_mode).toBe("private");
  expect(mfCalls.accountPayload?.shared_user_ids).toEqual([]);
});

test("invited member accepts invitation and enters canonical onboarding", async ({
  page,
}) => {
  await useEnglish(page);
  const authCalls = await mockAuth(page, {
    userId: "member-1",
    email: "member@example.test",
    role: "member",
    initiallySignedIn: false,
  });
  await mockMailflow(page, {
    userId: "member-1",
    email: "member@example.test",
  });

  await page.goto("/accept-invitation/inv-member-1");
  await expect(page).toHaveURL(
    /\/login\?redirect=%2Faccept-invitation%2Finv-member-1$/,
  );
  await page.locator("#email").fill("member@example.test");
  await page.locator("#password").fill("member-password-123");
  await page.locator('form button[type="submit"]').click();

  await expect(page).toHaveURL(/\/accept-invitation\/inv-member-1$/);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(
    page.getByRole("heading", { name: "Welcome to Mailflow" }),
  ).toBeVisible();

  expect(authCalls.signIn).toBe(1);
  expect(authCalls.acceptInvitation).toBe(1);
  expect(authCalls.setActiveOrganization).toBe(1);
});
