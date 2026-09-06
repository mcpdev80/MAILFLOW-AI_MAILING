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

  await expect(page.getByText("Select a message", { exact: true })).toBeVisible();
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

  await expect(page.getByText("Select a message", { exact: true })).toBeVisible();
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

  await expect(page.getByText("Select a message", { exact: true })).toBeVisible();
  expect(actions).toContainEqual({ action: "trash" });
});
