import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "../src/db";
import { netWorth } from "../src/calculations";
import { createApp } from "../src/app";
import request from "supertest";

let db: Database.Database;

beforeEach(() => {
  process.env.SEED_USER_EMAIL = "test@example.com";
  process.env.SEED_USER_PASSWORD = "password123";
  db = new Database(":memory:");
  initializeDatabase(db);
});

afterEach(() => db.close());

function userId() {
  return (db.prepare("SELECT id FROM users WHERE email = ?").get("test@example.com") as { id: number }).id;
}

function latestAccounts() {
  return db.prepare(`
    SELECT a.*,
      (SELECT value FROM value_entries v WHERE v.accountId = a.id ORDER BY valueDate DESC, id DESC LIMIT 1) AS latestValue,
      (SELECT valueDate FROM value_entries v WHERE v.accountId = a.id ORDER BY valueDate DESC, id DESC LIMIT 1) AS latestValueDate
    FROM accounts a WHERE a.userId = ? ORDER BY a.name ASC
  `).all(userId()) as any[];
}

describe("persistence workflows", () => {
  it("account create can create an initial value entry", () => {
    const account = db.prepare("INSERT INTO accounts (userId, name, kind, category, currency, updateFrequency) VALUES (?, 'Cash', 'asset', 'Cash', 'GBP', 'monthly')").run(userId());
    db.prepare("INSERT INTO value_entries (accountId, value, valueDate, note, source) VALUES (?, 100, '2026-06-01', 'Initial value', 'manual')").run(account.lastInsertRowid);
    const values = db.prepare("SELECT * FROM value_entries WHERE accountId = ?").all(account.lastInsertRowid);
    expect(values).toHaveLength(1);
  });

  it("monthly review records changed values only unless unchanged recording is requested", () => {
    const account = db.prepare("INSERT INTO accounts (userId, name, kind, category, currency, updateFrequency) VALUES (?, 'Cash', 'asset', 'Cash', 'GBP', 'monthly')").run(userId());
    db.prepare("INSERT INTO value_entries (accountId, value, valueDate, source) VALUES (?, 100, '2026-05-01', 'manual')").run(account.lastInsertRowid);
    const latest = db.prepare("SELECT value FROM value_entries WHERE accountId = ? ORDER BY valueDate DESC LIMIT 1").get(account.lastInsertRowid) as { value: number };
    if (latest.value !== 100) db.prepare("INSERT INTO value_entries (accountId, value, valueDate, source) VALUES (?, 100, '2026-06-01', 'monthly_review')").run(account.lastInsertRowid);
    db.prepare("INSERT INTO value_entries (accountId, value, valueDate, source) VALUES (?, 120, '2026-06-01', 'monthly_review')").run(account.lastInsertRowid);
    expect(db.prepare("SELECT * FROM value_entries WHERE accountId = ?").all(account.lastInsertRowid)).toHaveLength(2);
  });

  it("archive excludes account from current totals while retaining history", () => {
    const account = db.prepare("INSERT INTO accounts (userId, name, kind, category, currency, updateFrequency) VALUES (?, 'Cash', 'asset', 'Cash', 'GBP', 'monthly')").run(userId());
    db.prepare("INSERT INTO value_entries (accountId, value, valueDate, source) VALUES (?, 100, '2026-05-01', 'manual')").run(account.lastInsertRowid);
    db.prepare("UPDATE accounts SET isArchived = 1 WHERE id = ?").run(account.lastInsertRowid);
    expect(netWorth(latestAccounts())).toBe(0);
    expect(db.prepare("SELECT * FROM value_entries WHERE accountId = ?").all(account.lastInsertRowid)).toHaveLength(1);
  });

  it("does not reset an existing user password when seed password env is missing", () => {
    delete process.env.SEED_USER_PASSWORD;
    delete process.env.WEALTHTRACK_USER_PASSWORD;
    initializeDatabase(db);

    const user = db.prepare("SELECT passwordHash FROM users WHERE email = ?").get("test@example.com") as { passwordHash: string };
    expect(bcrypt.compareSync("password123", user.passwordHash)).toBe(true);
    expect(bcrypt.compareSync("change-me", user.passwordHash)).toBe(false);
  });

  it("updates an existing user password when seed password env is explicit", () => {
    process.env.SEED_USER_PASSWORD = "new-password";
    initializeDatabase(db);

    const user = db.prepare("SELECT passwordHash FROM users WHERE email = ?").get("test@example.com") as { passwordHash: string };
    expect(bcrypt.compareSync("new-password", user.passwordHash)).toBe(true);
  });

  it("allows a username as the login identifier", async () => {
    const info = db.prepare("INSERT INTO users (email, passwordHash) VALUES (?, ?)").run("demo", bcrypt.hashSync("demo", 4));
    db.prepare("INSERT INTO profiles (userId, name, defaultCurrency) VALUES (?, ?, ?)").run(info.lastInsertRowid, "Demo", "GBP");

    const response = await request(createApp(db)).post("/api/auth/login").send({ email: "demo", password: "demo" });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe("demo");
  });

  it("issues login cookies and tokens that expire after one year", async () => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const response = await request(createApp(db)).post("/api/auth/login").send({ email: "test@example.com", password: "password123" });
    const payload = jwt.decode(response.body.token) as { iat: number; exp: number };

    expect(response.status).toBe(200);
    expect(payload.exp - payload.iat).toBe(365 * 24 * 60 * 60);
    expect(payload.iat).toBeGreaterThanOrEqual(issuedAt);
    expect(response.headers["set-cookie"]).toEqual(expect.arrayContaining([expect.stringContaining("Max-Age=31536000")]));
  });

  it("defaults profiles to a one million target financial goal", () => {
    const profile = db.prepare("SELECT targetFinancialGoal FROM profiles WHERE userId = ?").get(userId()) as { targetFinancialGoal: number };
    expect(profile.targetFinancialGoal).toBe(1000000);
  });

  it("adds account thumbnail metadata columns", () => {
    const columns = db.prepare("PRAGMA table_info(accounts)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining(["thumbnailFileName", "thumbnailMimeType", "thumbnailUpdatedAt"]));
  });
});
