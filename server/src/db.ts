import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

export function openDatabase(dbPath = process.env.DB_PATH || path.join(process.cwd(), "server/data/wealthtrack.db")) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  initializeDatabase(db);
  return db;
}

export function initializeDatabase(db: Database.Database) {
  migrate(db);
  seedUser(db);
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS profiles (
      userId INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      defaultCurrency TEXT NOT NULL DEFAULT 'GBP',
      dateFormat TEXT NOT NULL DEFAULT 'yyyy-MM-dd',
      hideBalancesDefault INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('asset', 'liability')),
      category TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'GBP',
      updateFrequency TEXT NOT NULL DEFAULT 'monthly',
      tagsJson TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      isArchived INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS value_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      accountId INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      value REAL NOT NULL CHECK(value >= 0),
      valueDate TEXT NOT NULL,
      note TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS monthly_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reviewMonth TEXT NOT NULL,
      notes TEXT,
      completedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(userId, reviewMonth)
    );
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      goalType TEXT NOT NULL,
      targetValue REAL NOT NULL,
      targetDate TEXT,
      accountId INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      isArchived INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS import_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fileName TEXT NOT NULL,
      status TEXT NOT NULL,
      rowsImported INTEGER NOT NULL DEFAULT 0,
      errorsJson TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function seedUser(db: Database.Database) {
  const email = process.env.SEED_USER_EMAIL || process.env.WEALTHTRACK_USER_EMAIL || "demo@example.com";
  const password = process.env.SEED_USER_PASSWORD || process.env.WEALTHTRACK_USER_PASSWORD || "change-me";
  const passwordHash = bcrypt.hashSync(password, 12);
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: number } | undefined;
  if (existing) {
    db.prepare("UPDATE users SET passwordHash = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?").run(passwordHash, existing.id);
    db.prepare(`
      INSERT INTO profiles (userId, name, defaultCurrency) VALUES (?, ?, ?)
      ON CONFLICT(userId) DO UPDATE SET name = excluded.name, updatedAt = CURRENT_TIMESTAMP
    `).run(existing.id, "Keith Stephens", "GBP");
    return;
  }
  const users = db.prepare("SELECT id FROM users ORDER BY id").all() as Array<{ id: number }>;
  if (users.length === 1) {
    db.prepare("UPDATE users SET email = ?, passwordHash = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?").run(email, passwordHash, users[0].id);
    db.prepare(`
      INSERT INTO profiles (userId, name, defaultCurrency) VALUES (?, ?, ?)
      ON CONFLICT(userId) DO UPDATE SET name = excluded.name, updatedAt = CURRENT_TIMESTAMP
    `).run(users[0].id, "Keith Stephens", "GBP");
    return;
  }
  const info = db.prepare("INSERT INTO users (email, passwordHash) VALUES (?, ?)").run(email, passwordHash);
  db.prepare("INSERT INTO profiles (userId, name, defaultCurrency) VALUES (?, ?, ?)").run(info.lastInsertRowid, "Keith Stephens", "GBP");
}
