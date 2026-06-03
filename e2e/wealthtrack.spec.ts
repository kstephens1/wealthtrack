import { expect, test } from "@playwright/test";

const email = process.env.SMOKE_USER_EMAIL || "demo@example.com";
const password = process.env.SMOKE_USER_PASSWORD || "change-me";

test("login, create account, add value, and privacy mode", async ({ page }) => {
  await page.goto(process.env.FRONTEND_URL || "http://127.0.0.1:3000");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Accounts" }).click();
  await page.getByLabel("Account name").fill(`Playwright ${Date.now()}`);
  await page.getByLabel("Category").fill("Test");
  await page.getByLabel("Initial value").fill("123");
  await page.getByRole("button", { name: /add/i }).click();
  await page.getByRole("button", { name: "Dashboard" }).click();
  await expect(page.getByText(/£/).first()).toBeVisible();
  await page.getByTitle("Toggle privacy mode").click();
  await expect(page.getByText("••••••").first()).toBeVisible();
});
