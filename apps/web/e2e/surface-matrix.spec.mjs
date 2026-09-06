import { expect, test } from "@playwright/test";
import { installMockApi } from "./support/mock-api.mjs";
import { installExtendedMockApi } from "./support/extended-mock-api.mjs";

async function prepare(page) {
  await installMockApi(page);
  await installExtendedMockApi(page);
}

test.beforeEach(async ({ page }) => {
  await prepare(page);
});

const appSurfaces = [
  ["/app/drafts", "Drafts"],
  ["/app/notifications", "Notifications"],
  ["/app/daily-summary", "Daily summary"],
  ["/app/billing", "Billing"],
  ["/app/settings/models", "Model roles"],
  ["/app/settings/preferences", "Settings"],
  ["/app/settings/workspace", "Workspace Layout Editor"],
  ["/app/settings/members", "Team members"],
  ["/app/settings/security", "Security"],
];

for (const [path, heading] of appSurfaces) {
  test(`${path} renders its primary surface`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByTestId("app-shell")).toBeVisible();
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  });
}

test("mailbox navigation resolves the account index to a real mailbox", async ({ page }) => {
  await page.goto("/app/accounts");
  await expect(page).toHaveURL(/\/app\/accounts\/acct-1$/);
  await expect(page.getByTestId("app-shell")).toBeVisible();
  await expect(page.getByText("owner@example.test", { exact: true }).first()).toBeVisible();
});

test("onboarding renders against provider/account contracts", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Get started" })).toBeVisible();
  await expect(page.getByText("2. Connect a mailbox", { exact: true })).toBeVisible();
});
