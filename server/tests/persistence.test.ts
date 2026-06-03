import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeDatabase } from "../src/db";
import { netWorth } from "../src/calculations";

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
});
