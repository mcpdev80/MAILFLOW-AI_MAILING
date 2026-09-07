import { expect, test } from "@playwright/test";
import { installMockApi } from "./support/mock-api.mjs";

function bootstrapStatus(route, ownerExists) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      auth_enabled: true,
      instance_owner_exists: ownerExists,
    }),
  });
}

test.beforeEach(async ({ page }) => {
  await installMockApi(page);
});

test("setup remains available before the first instance owner exists", async ({
  page,
}) => {
  await page.route("**/api/instance-bootstrap/status", (route) =>
    bootstrapStatus(route, false),
  );
  await page.goto("/setup");
  await expect(
    page.getByRole("heading", { name: "Welcome to Mailflow" }),
  ).toBeVisible();
});

test("setup redirects away after the first instance owner exists", async ({
  page,
}) => {
  await page.route("**/api/instance-bootstrap/status", (route) =>
    bootstrapStatus(route, true),
  );
  await page.goto("/setup");
  await page.waitForURL(/\/app(?:\/|$)/);
  await expect(page).toHaveURL(/\/app(?:\/|$)/);
});

test("public signup is closed after the first instance owner exists", async ({
  page,
}) => {
  await page.route("**/api/instance-bootstrap/status", (route) =>
    bootstrapStatus(route, true),
  );
  await page.goto("/signup");
  await page.waitForURL(/\/login(?:\?|$)/);
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});
