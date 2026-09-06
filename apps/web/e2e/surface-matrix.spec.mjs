test("mailbox navigation resolves the account index to a real mailbox", async ({
  page,
}) => {
  await page.goto("/app/accounts");
  await expect(page).toHaveURL(/\/app\/accounts\/acct-1$/);
  await expect(page.getByTestId("app-shell")).toBeVisible();
  await expect(
    page.getByText("owner@example.test", { exact: true }).first(),
  ).toBeVisible();
});

test("onboarding renders the canonical six-step flow", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(
    page.getByRole("heading", { name: "Welcome to Mailflow" }),
  ).toBeVisible();
  await expect(page.getByLabel("Step 1 of 6")).toBeVisible();
  await page.getByRole("button", { name: "Connect your mailbox" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect your mailbox" }),
  ).toBeVisible();
  await expect(page.getByLabel("Step 2 of 6")).toBeVisible();
});