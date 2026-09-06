import { expect, test } from "@playwright/test";
import { installMockApi } from "./support/mock-api.mjs";

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

async function installActionRecorder(page) {
  const actions = [];
  await page.route(
    "**/api/mf/mail-client/accounts/acct-1/messages/42/actions**",
    async (route) => {
      const payload = route.request().postDataJSON();
      actions.push(payload);
      const destinations = {
        archive: "Archive",
        trash: "Trash",
        move: payload.destination_folder ?? null,
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          action: payload.action,
          applied: true,
          destination_folder: destinations[payload.action] ?? null,
        }),
      });
    },
  );
  return actions;
}

async function installDraftRecorder(page) {
  const drafts = [];
  await page.route("**/api/mf/mail/drafts", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const payload = route.request().postDataJSON();
    drafts.push(payload);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "draft-reply",
        org_id: "org-1",
        owner_user_id: "user-1",
        status: "draft",
        send_attempts: 0,
        sent_message_id: null,
        last_error: null,
        attachments: [],
        created_at: "2026-09-06T10:00:00Z",
        updated_at: "2026-09-06T10:00:00Z",
        sent_at: null,
        bcc_recipients: [],
        body_html: null,
        ...payload,
      }),
    });
  });
  return drafts;
}

async function openMessage(page) {
  await page.goto("/app/mail");
  await page.getByText("Project update", { exact: true }).first().click();
  await expect(
    page.getByText("The project update is ready for review."),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await installSession(page);
  await installMockApi(page);
});

test("archive moves the selected message to Archive and clears the detail pane", async ({
  page,
}) => {
  const actions = await installActionRecorder(page);
  await openMessage(page);

  await page.getByRole("button", { name: "Archive", exact: true }).click();

  await expect(
    page.getByText("Select a message", { exact: true }),
  ).toBeVisible();
  expect(actions).toContainEqual({ action: "archive" });
});

test("move sends the selected destination and clears the detail pane", async ({
  page,
}) => {
  const actions = await installActionRecorder(page);
  await openMessage(page);

  const moveFolder = page.getByRole("combobox").last();
  await moveFolder.selectOption("Archive");
  await page.getByRole("button", { name: "Move", exact: true }).click();

  await expect(
    page.getByText("Select a message", { exact: true }),
  ).toBeVisible();
  expect(actions).toContainEqual({
    action: "move",
    destination_folder: "Archive",
  });
});

test("delete requires confirmation and moves the selected message to Trash", async ({
  page,
}) => {
  const actions = await installActionRecorder(page);
  await openMessage(page);

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(
    page.getByText("Select a message", { exact: true }),
  ).toBeVisible();
  expect(actions).toContainEqual({ action: "trash" });
});

test("reply draft targets the sender and preserves reply threading", async ({
  page,
}) => {
  const drafts = await installDraftRecorder(page);
  await openMessage(page);

  await page.getByRole("button", { name: "Reply", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/compose\?draft=draft-reply/);

  expect(drafts).toHaveLength(1);
  expect(drafts[0]).toMatchObject({
    account_id: "acct-1",
    message_type: "reply",
    in_reply_to: "<message-42@example.test>",
    references: ["<message-42@example.test>"],
    to_recipients: ["sender@example.test"],
    cc_recipients: [],
    subject: "Re: Project update",
  });
});

test("reply all excludes the mailbox owner from recipients", async ({
  page,
}) => {
  const drafts = await installDraftRecorder(page);
  await openMessage(page);

  await page.getByRole("button", { name: "Reply all", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/compose\?draft=draft-reply/);

  expect(drafts).toHaveLength(1);
  expect(drafts[0]).toMatchObject({
    message_type: "reply_all",
    to_recipients: ["sender@example.test"],
    cc_recipients: [],
  });
  expect(drafts[0].to_recipients).not.toContain("owner@example.test");
});

test("forward starts a new thread without reply references", async ({
  page,
}) => {
  const drafts = await installDraftRecorder(page);
  await openMessage(page);

  await page.getByRole("button", { name: "Forward", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/compose\?draft=draft-reply/);

  expect(drafts).toHaveLength(1);
  expect(drafts[0]).toMatchObject({
    message_type: "forward",
    in_reply_to: null,
    references: [],
    to_recipients: [],
    cc_recipients: [],
    subject: "Fwd: Project update",
  });
  expect(drafts[0].body_text).toContain(
    "---------- Forwarded message ----------",
  );
});
