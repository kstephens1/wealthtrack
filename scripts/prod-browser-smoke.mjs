import { chromium } from "@playwright/test";

const frontendUrl = required("FRONTEND_URL");
const backendUrl = required("BACKEND_URL");
const email = process.env.SMOKE_USER_EMAIL || process.env.SEED_USER_EMAIL;
const password = process.env.SMOKE_USER_PASSWORD || process.env.SEED_USER_PASSWORD;

if (!email || !password) {
  throw new Error("Missing SMOKE_USER_EMAIL/SMOKE_USER_PASSWORD or SEED_USER_EMAIL/SEED_USER_PASSWORD");
}

const browser = await chromium.launch();
const page = await browser.newPage();
const failures = [];
const monitoredOrigins = new Set([
  new URL(frontendUrl).origin,
  new URL(backendUrl).origin
]);

page.on("pageerror", (error) => failures.push(`page error: ${error.message}`));
page.on("requestfailed", (request) => {
  const url = request.url();
  if (monitoredOrigins.has(new URL(url).origin)) {
    failures.push(`request failed: ${request.method()} ${url} ${request.failure()?.errorText || ""}`.trim());
  }
});
page.on("response", (response) => {
  const url = response.url();
  if (monitoredOrigins.has(new URL(url).origin) && url.includes("/api/") && response.status() >= 400) {
    failures.push(`API ${response.status()}: ${url}`);
  }
});

try {
  await page.goto(frontendUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.getByRole("heading", { name: "Dashboard" }).waitFor({ timeout: 20000 });
  await page.getByText("Assets & Liabilities").waitFor({ timeout: 10000 });

  if (failures.length) {
    throw new Error(failures.join("\n"));
  }

  console.log("Production browser login smoke passed");
} finally {
  await browser.close();
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
