import { expect, test } from "@playwright/test";
import { installMockApi } from "./support/mock-api.mjs";

const mailActionPath =
  "/api/mf/mail-client/accounts/acct-1/messages/42/actions";

async function installSession(page) {
  await page.context().addCookies([
    {
      name: "better-auth.session_token",
      value: "session-token-user-1",
      url: "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function useCustomMailLayout(page) {
  await page.route("**/api/mf/user/preferences", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        locale: "en",
        locale_configured: true,
        theme: "light",
        density: "comfortable",
        workspace_layout: "custom",
        side_panel_alignment: "left",
        workspace_custom_config: {
          version: 1,
          panels: [
            {
              panel: "accounts",
              dock: "left",
              order: 0,
              size_px: 220,
              visible: true,
            },
            {
              panel: "message_list",
              dock: "center",
              order: 1,
              size_px: 360,
              visible: true,
            },
            {
              panel: "message_content",
              dock: "right",
              order: 2,
              size_px: null,
              visible: true,
            },
          ],
          message_content_overlay: false,
          show_resize_handles: false,
          action_bar_dock: "top",
          system_status_position: "top",
        },
      }),
    });
  });
}

function isMailActionRequest(request) {
  return new URL(request.url()).pathname === mailActionPath;
}

async function installDraftFlow(page, draftId) {
  let createPayload = null;
  let sendCalls = 0;
  let draft = null;

  await page.route("**/api/mf/mail/drafts", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    createPayload = route.request().postDataJSON();
    draft = {
      id: draftId,
      org_id: "org-1",
      owner_user_id: "user-1",
      bcc_recipients: [],
      status: "draft",
      send_attempts: 0,
      sent_message_id: null,
      last_error: null,
      attachments: [],
      created_at: "2026-09-06T10:00:00Z",
      updated_at: "2026-09-06T10:00:00Z",
      sent_at: null,
      body_html: null,
      ...createPayload,
    };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(draft),
    });
  });

  await page.route(`**/api/mf/mail/drafts/${draftId}**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/pre-send")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ warning_codes: [], can_send: true }),
      });
    }
    if (path.endsWith("/send")) {
      sendCalls += 1;
      draft = {
        ...draft,
        status: "sent",
        sent_message_id: `<${draftId}-sent@example.test>`,
        sent_at: "2026-09-06T10:01:00Z",
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft_id: draft.id,
          status: "sent",
          message_id: draft.sent_message_id,
          warning_codes: [],
        }),
      });
    }
    if (request.method() === "PATCH") {
      draft = { ...draft, ...request.postDataJSON() };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(draft),
      });
    }
    if (request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(draft),
      });
    }
    return route.fallback();
  });

  return {
    createPayload: () => createPayload,
    sendCalls: () => sendCalls,
  };
}

test.beforeEach(async ({ page }) => {
  await installSession(page);
  await installMockApi(page);
});

test("dashboard and search render through real frontend contracts", async ({
  page,
}) => {
  await page.goto("/app/dashboard");
  await expect(page.getByTestId("app-shell")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Dashboard", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("owner@example.test", { exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/app\/search/);
  await expect(
    page.getByRole("heading", { name: "Search / Advanced Lookup" }),
  ).toBeVisible();
  await expect(page.getByText("Project update", { exact: true })).toBeVisible();
});

test("mail workspace opens a message and exposes thread content", async ({
  page,
}) => {
  await page.goto("/app/mail");
  await expect(page.getByTestId("app-shell")).toBeVisible();
  const subject = page.getByText("Project update", { exact: true }).first();
  await expect(subject).toBeVisible();
  await subject.click();
  await expect(
    page.getByText("The project update is ready for review."),
  ).toBeVisible();
  await expect(page.getByText("Project update summary")).toBeVisible();
});

test("opening an unread message marks it read and decrements unread counters", async ({
  page,
}) => {
  await useCustomMailLayout(page);
  const actions = [];
  page.on("request", (request) => {
    if (isMailActionRequest(request)) actions.push(request.postDataJSON());
  });

  await page.goto("/app/mail");

  const allMailboxes = page
    .getByRole("button")
    .filter({ hasText: /^All\s*1$/ });
  const account = page
    .getByRole("button")
    .filter({ hasText: /owner@example\.test[\s\S]*1/ });
  await expect(allMailboxes).toBeVisible();
  await expect(account).toBeVisible();

  const messageRow = page
    .getByRole("button")
    .filter({ hasText: "Project update" })
    .first();
  await expect(messageRow).toHaveClass(/unread/);
  await messageRow.click();

  await expect(
    page.getByText("The project update is ready for review."),
  ).toBeVisible();
  await expect(messageRow).not.toHaveClass(/unread/);
  await expect(
    page.getByRole("button").filter({ hasText: /^All\s*0$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button").filter({ hasText: /owner@example\.test[\s\S]*0/ }),
  ).toBeVisible();
  expect(actions).toEqual([{ action: "mark_read" }]);
});

test("opening an already read message does not mark it read again", async ({
  page,
}) => {
  let actionCalls = 0;

  await page.route("**/api/mf/mail-client/inbox**", async (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            account_id: "acct-1",
            account_address: "owner@example.test",
            ownership_mode: "private",
            uid: 42,
            folder: "INBOX",
            message_id: "<message-42@example.test>",
            thread_id: "thread-1",
            subject: "Project update",
            from_email: "sender@example.test",
            to_emails: ["owner@example.test"],
            cc_emails: [],
            date: "2026-09-06T10:00:00Z",
            seen: true,
            flagged: false,
            answered: false,
            keywords: [],
            attachments: [],
          },
        ],
        counters: [
          {
            account_id: "acct-1",
            account_address: "owner@example.test",
            folder: "INBOX",
            total: 1,
            unread: 0,
          },
        ],
        total_unread: 0,
        next_before_uid_by_account: {},
      }),
    });
  });

  await page.route(
    "**/api/mf/mail-client/accounts/acct-1/messages/42**",
    async (route) => {
      if (isMailActionRequest(route.request())) return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          account_id: "acct-1",
          account_address: "owner@example.test",
          ownership_mode: "private",
          uid: 42,
          folder: "INBOX",
          message_id: "<message-42@example.test>",
          thread_id: "thread-1",
          subject: "Project update",
          from_email: "sender@example.test",
          to_emails: ["owner@example.test"],
          cc_emails: [],
          date: "2026-09-06T10:00:00Z",
          seen: true,
          flagged: false,
          answered: false,
          keywords: [],
          attachments: [],
          body_text: "The project update is ready for review.",
          safe_html: null,
          in_reply_to: null,
          references: [],
        }),
      });
    },
  );
  page.on("request", (request) => {
    if (isMailActionRequest(request)) actionCalls += 1;
  });

  await page.goto("/app/mail");
  const messageRow = page
    .getByRole("button")
    .filter({ hasText: "Project update" })
    .first();
  await expect(messageRow).not.toHaveClass(/unread/);
  await messageRow.click();
  await expect(
    page.getByText("The project update is ready for review."),
  ).toBeVisible();
  expect(actionCalls).toBe(0);
});

test("reply creates a threaded draft and sends only after explicit user action", async ({
  page,
}) => {
  const flow = await installDraftFlow(page, "reply-draft-1");

  await page.goto("/app/mail");
  await page.getByText("Project update", { exact: true }).first().click();
  await expect(
    page.getByText("The project update is ready for review."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reply", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/compose\?draft=reply-draft-1/);
  await expect(page.getByRole("heading", { name: "Reply" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "To" })).toHaveValue(
    "sender@example.test",
  );
  await expect(page.getByRole("textbox", { name: "Subject" })).toHaveValue(
    "Re: Project update",
  );
  expect(flow.createPayload()).toMatchObject({
    account_id: "acct-1",
    message_type: "reply",
    in_reply_to: "<message-42@example.test>",
    references: ["<message-42@example.test>"],
    to_recipients: ["sender@example.test"],
    cc_recipients: [],
    subject: "Re: Project update",
  });
  expect(flow.sendCalls()).toBe(0);

  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Sent/).first()).toBeVisible();
  expect(flow.sendCalls()).toBe(1);
});

test("reply all keeps other recipients but excludes the mailbox owner", async ({
  page,
}) => {
  await page.route(
    "**/api/mf/mail-client/accounts/acct-1/messages/42**",
    async (route) => {
      if (isMailActionRequest(route.request())) return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          account_id: "acct-1",
          account_address: "owner@example.test",
          ownership_mode: "private",
          uid: 42,
          folder: "INBOX",
          message_id: "<message-42@example.test>",
          thread_id: "thread-1",
          subject: "Project update",
          from_email: "sender@example.test",
          to_emails: ["owner@example.test", "colleague@example.test"],
          cc_emails: ["copy@example.test", "owner@example.test"],
          date: "2026-09-06T10:00:00Z",
          seen: true,
          flagged: false,
          answered: false,
          keywords: [],
          attachments: [],
          body_text: "The project update is ready for review.",
          safe_html: null,
          in_reply_to: null,
          references: ["<older@example.test>"],
        }),
      });
    },
  );
  const flow = await installDraftFlow(page, "reply-all-draft-1");

  await page.goto("/app/mail");
  await page.getByText("Project update", { exact: true }).first().click();
  await page.getByRole("button", { name: "Reply all", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/compose\?draft=reply-all-draft-1/);
  await expect(page.getByRole("heading", { name: "Reply all" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "To" })).toHaveValue(
    "sender@example.test, colleague@example.test",
  );
  await expect(
    page.getByRole("textbox", { name: "CC", exact: true }),
  ).toHaveValue("copy@example.test");
  expect(flow.createPayload()).toMatchObject({
    account_id: "acct-1",
    message_type: "reply_all",
    in_reply_to: "<message-42@example.test>",
    references: ["<older@example.test>", "<message-42@example.test>"],
    to_recipients: ["sender@example.test", "colleague@example.test"],
    cc_recipients: ["copy@example.test"],
    subject: "Re: Project update",
  });
  expect(flow.sendCalls()).toBe(0);
});

test("forward creates a clean draft with forwarded content and no thread reply headers", async ({
  page,
}) => {
  const flow = await installDraftFlow(page, "forward-draft-1");

  await page.goto("/app/mail");
  await page.getByText("Project update", { exact: true }).first().click();
  await page.getByRole("button", { name: "Forward", exact: true }).click();

  await expect(page).toHaveURL(/\/app\/compose\?draft=forward-draft-1/);
  await expect(page.getByRole("heading", { name: "Forward" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "To" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Subject" })).toHaveValue(
    "Fwd: Project update",
  );
  expect(flow.createPayload()).toMatchObject({
    account_id: "acct-1",
    message_type: "forward",
    in_reply_to: null,
    references: [],
    to_recipients: [],
    cc_recipients: [],
    subject: "Fwd: Project update",
  });
  expect(flow.createPayload().body_text).toContain(
    "---------- Forwarded message ----------",
  );
  expect(flow.createPayload().body_text).toContain("From: sender@example.test");
  expect(flow.createPayload().body_text).toContain(
    "The project update is ready for review.",
  );
  expect(flow.sendCalls()).toBe(0);
});

test("composer persists and sends only through explicit user action", async ({
  page,
}) => {
  await page.goto("/app/compose?draft=draft-1");
  await expect(page.getByRole("textbox", { name: "Subject" })).toHaveValue(
    "Draft subject",
  );
  await expect(page.getByRole("textbox", { name: "Message body" })).toHaveValue(
    "Draft body",
  );

  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Sent/).first()).toBeVisible();
});

test("review inbox and appearance settings remain interactive", async ({
  page,
}) => {
  await page.goto("/app/review");
  await expect(page.getByText("Project update", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Action Required", { exact: true }).first(),
  ).toBeVisible();

  await page.goto("/app/settings/preferences");
  await expect(
    page.getByRole("heading", { name: "Settings", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dark Mode" }).click();
  await page.getByRole("button", { name: "Apply Settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("core app surfaces remain usable at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/mail");
  await expect(page.getByTestId("app-shell")).toBeVisible();
  await expect(
    page.getByText("Project update", { exact: true }).first(),
  ).toBeVisible();
});
