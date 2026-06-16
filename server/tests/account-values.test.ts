import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";

let db: Database.Database;

beforeEach(() => {
  process.env.SEED_USER_EMAIL = "values@example.com";
  process.env.SEED_USER_PASSWORD = "password123";
  db = new Database(":memory:");
});

afterEach(() => db.close());

async function auth(app: ReturnType<typeof createApp>) {
  const response = await request(app).post("/api/auth/login").send({ email: "values@example.com", password: "password123" });
  return response.body.token as string;
}

function userId() {
  return (db.prepare("SELECT id FROM users WHERE email = ?").get("values@example.com") as { id: number }).id;
}

function createAccountWithValues() {
  const accountId = Number(db.prepare("INSERT INTO accounts (userId, name, kind, category, currency, updateFrequency) VALUES (?, 'Cash', 'asset', 'Cash', 'GBP', 'monthly')").run(userId()).lastInsertRowid);
  db.prepare("INSERT INTO value_entries (accountId, value, valueDate, source) VALUES (?, 100, '2026-01-01', 'manual')").run(accountId);
  db.prepare("INSERT INTO value_entries (accountId, value, valueDate, source) VALUES (?, 120, '2026-06-01', 'manual')").run(accountId);
  return accountId;
}

describe("account values", () => {
  it("returns account value projections when a retirement date and history exist", async () => {
    const app = createApp(db);
    const token = await auth(app);
    const accountId = createAccountWithValues();
    db.prepare("UPDATE profiles SET retirementDate = '2026-09-01' WHERE userId = ?").run(userId());

    const response = await request(app).get(`/api/accounts/${accountId}/values`).set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.values).toHaveLength(2);
    expect(response.body.projection.retirementDate).toBe("2026-09-01");
    expect(response.body.projection.series[0]).toEqual({ date: "2026-06-01", projectedValue: 120 });
    expect(response.body.projection.series.at(-1).date).toBe("2026-09-01");
    expect(response.body.projection.comparison).toMatchObject({
      previousProjectedValue: 100,
      latestValueDate: "2026-06-01",
      previousValueDate: "2026-01-01"
    });
    expect(response.body.projection.comparison.currentProjectedValue).toBeGreaterThan(120);
    expect(response.body.projection.comparison.change).toBeGreaterThan(20);
  });

  it("returns an empty projection without a retirement date", async () => {
    const app = createApp(db);
    const token = await auth(app);
    const accountId = createAccountWithValues();

    const response = await request(app).get(`/api/accounts/${accountId}/values`).set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.projection).toEqual({ retirementDate: null, series: [], comparison: null });
  });
});
