import { expect, test } from "@playwright/test";
import { installMockApi } from "./support/mock-api.mjs";

test.beforeEach(async ({ page }) => {
  await installMockApi(page);
});

test("dashboard and search render through real frontend contracts", async ({ page }) => {
  await page.goto("/app/dashboard");
  await expect(page.getByTestId("app-shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await expect(page.getByText("owner@example.test", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/app\/search/);
  await expect(page.getByRole("heading", { name: "Search / Advanced Lookup" })).toBeVisible();
  await expect(page.getByText("Project update", { exact: true })).toBeVisible();
});

test("mail workspace opens a message and exposes thread content", async ({ page }) => {
  await page.goto("/app/mail");
  await expect(page.getByTestId("app-shell")).toBeVisible();
  const subject = page.getByText("Project update", { exact: true }).first();
  await expect(subject).toBeVisible();
  await subject.click();
  await expect(page.getByText("The project update is ready for review.")).toBeVisible();
  await expect(page.getByText("Project update summary")).toBeVisible();
});

test("composer persists and sends only through explicit user action", async ({ page }) => {
  await page.goto("/app/compose?draft=draft-1");
  await expect(page.getByDisplayValue("Draft subject")).toBeVisible();
  await expect(page.getByDisplayValue("Draft body")).toBeVisible();

  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Sent/).first()).toBeVisible();
});

test("review inbox and appearance settings remain interactive", async ({ page }) => {
  await page.goto("/app/review");
  await expect(page.getByText("Project update", { exact: true })).toBeVisible();
  await expect(page.getByText("Classification requires confirmation.")).toBeVisible();

  await page.goto("/app/settings/preferences");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Dark Mode" }).click();
  await page.getByRole("button", { name: "Apply Settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("core app surfaces remain usable at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/mail");
  await expect(page.getByTestId("app-shell")).toBeVisible();
  await expect(page.getByText("Project update", { exact: true }).first()).toBeVisible();
});
