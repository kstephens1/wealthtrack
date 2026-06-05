import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { allocation, buildNetWorthSeries, buildProjectedNetWorthSeries, monthlyChange, netWorth, staleAccounts, twoPointComparison } from "./calculations";
import { initializeDatabase, openDatabase } from "./db";
import { Account, AccountWithLatest, ValueEntry } from "./types";

const accountSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["asset", "liability"]),
  category: z.string().min(1),
  currency: z.string().min(3).max(3).default("GBP"),
  updateFrequency: z.string().default("monthly"),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional().nullable(),
  initialValue: z.number().nonnegative().optional(),
  valueDate: z.string().optional()
});
const valueSchema = z.object({ value: z.number().nonnegative(), valueDate: z.string(), note: z.string().optional().nullable(), source: z.string().default("manual") });
const profileSchema = z.object({
  retirementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
});

export function createApp(db = openDatabase()) {
  initializeDatabase(db);
  const app = express();
  const allowedOrigins = new Set([
    process.env.FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ].flatMap((value) => String(value || "").split(","))
    .map(normalizeOrigin)
    .filter(Boolean));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(normalizeOrigin(origin))) return callback(null, true);
      callback(new Error("Origin not allowed"));
    },
    credentials: true
  }));
  app.use((err: Error, _req: Request, res: Response, next: NextFunction) => {
    if (err.message === "Origin not allowed") return res.status(403).json({ error: err.message });
    next(err);
  });
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  const jwtSecret = process.env.JWT_SECRET || "dev-only-change-me";
  const tokenFor = (user: { id: number; email: string }) => jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: "12h" });

  function requireAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.wealthtrack_token;
    if (!token) return res.status(401).json({ error: "Authentication required" });
    try {
      const payload = jwt.verify(token, jwtSecret) as unknown as { sub: number; email: string };
      (req as any).user = { id: Number(payload.sub), email: payload.email };
      next();
    } catch {
      res.status(401).json({ error: "Invalid session" });
    }
  }

  app.get("/api/hello", (_req, res) => res.json({ ok: true, name: "WealthTrack" }));

  app.post("/api/auth/login", (req, res) => {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid credentials payload" });
    const user = db.prepare("SELECT id, email, passwordHash FROM users WHERE email = ?").get(parsed.data.email) as any;
    if (!user || !bcrypt.compareSync(parsed.data.password, user.passwordHash)) return res.status(401).json({ error: "Invalid email or password" });
    const token = tokenFor(user);
    res.cookie("wealthtrack_token", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 12 * 60 * 60 * 1000 });
    res.json({ token, user: { id: user.id, email: user.email } });
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie("wealthtrack_token");
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    const user = (req as any).user;
    const profile = db.prepare("SELECT * FROM profiles WHERE userId = ?").get(user.id);
    res.json({ user, profile });
  });

  app.patch("/api/profile", requireAuth, (req, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const userId = (req as any).user.id;
    db.prepare(`
      UPDATE profiles SET retirementDate = ?, updatedAt = CURRENT_TIMESTAMP WHERE userId = ?
    `).run(parsed.data.retirementDate ?? null, userId);
    res.json({ profile: db.prepare("SELECT * FROM profiles WHERE userId = ?").get(userId) });
  });

  function latestAccounts(userId: number): AccountWithLatest[] {
    const accounts = db.prepare(`
      SELECT a.*,
        (SELECT value FROM value_entries v WHERE v.accountId = a.id ORDER BY valueDate DESC, id DESC LIMIT 1) AS latestValue,
        (SELECT valueDate FROM value_entries v WHERE v.accountId = a.id ORDER BY valueDate DESC, id DESC LIMIT 1) AS latestValueDate,
        (SELECT value FROM value_entries v WHERE v.accountId = a.id ORDER BY valueDate ASC, id ASC LIMIT 1) AS initialValue,
        (SELECT valueDate FROM value_entries v WHERE v.accountId = a.id ORDER BY valueDate ASC, id ASC LIMIT 1) AS initialValueDate,
        (SELECT value FROM value_entries v WHERE v.accountId = a.id ORDER BY valueDate DESC, id DESC LIMIT 1 OFFSET 1) AS previousValue,
        (SELECT valueDate FROM value_entries v WHERE v.accountId = a.id ORDER BY valueDate DESC, id DESC LIMIT 1 OFFSET 1) AS previousValueDate,
        (SELECT value FROM value_entries v WHERE v.accountId = a.id AND v.valueDate <= date((SELECT valueDate FROM value_entries lv WHERE lv.accountId = a.id ORDER BY valueDate DESC, id DESC LIMIT 1), '-1 month') ORDER BY valueDate DESC, id DESC LIMIT 1) AS lastMonthValue,
        (SELECT valueDate FROM value_entries v WHERE v.accountId = a.id AND v.valueDate <= date((SELECT valueDate FROM value_entries lv WHERE lv.accountId = a.id ORDER BY valueDate DESC, id DESC LIMIT 1), '-1 month') ORDER BY valueDate DESC, id DESC LIMIT 1) AS lastMonthValueDate,
        (SELECT value FROM value_entries v WHERE v.accountId = a.id AND v.valueDate <= date((SELECT valueDate FROM value_entries lv WHERE lv.accountId = a.id ORDER BY valueDate DESC, id DESC LIMIT 1), '-3 months') ORDER BY valueDate DESC, id DESC LIMIT 1) AS lastQuarterValue,
        (SELECT valueDate FROM value_entries v WHERE v.accountId = a.id AND v.valueDate <= date((SELECT valueDate FROM value_entries lv WHERE lv.accountId = a.id ORDER BY valueDate DESC, id DESC LIMIT 1), '-3 months') ORDER BY valueDate DESC, id DESC LIMIT 1) AS lastQuarterValueDate,
        (SELECT value FROM value_entries v WHERE v.accountId = a.id AND v.valueDate <= date(strftime('%Y', (SELECT valueDate FROM value_entries lv WHERE lv.accountId = a.id ORDER BY valueDate DESC, id DESC LIMIT 1)) || '-01-01') ORDER BY valueDate DESC, id DESC LIMIT 1) AS yearStartValue,
        (SELECT valueDate FROM value_entries v WHERE v.accountId = a.id AND v.valueDate <= date(strftime('%Y', (SELECT valueDate FROM value_entries lv WHERE lv.accountId = a.id ORDER BY valueDate DESC, id DESC LIMIT 1)) || '-01-01') ORDER BY valueDate DESC, id DESC LIMIT 1) AS yearStartValueDate,
        (SELECT value FROM value_entries v WHERE v.accountId = a.id AND v.valueDate <= date((SELECT valueDate FROM value_entries lv WHERE lv.accountId = a.id ORDER BY valueDate DESC, id DESC LIMIT 1), '-1 year') ORDER BY valueDate DESC, id DESC LIMIT 1) AS lastYearValue,
        (SELECT valueDate FROM value_entries v WHERE v.accountId = a.id AND v.valueDate <= date((SELECT valueDate FROM value_entries lv WHERE lv.accountId = a.id ORDER BY valueDate DESC, id DESC LIMIT 1), '-1 year') ORDER BY valueDate DESC, id DESC LIMIT 1) AS lastYearValueDate
      FROM accounts a WHERE a.userId = ? ORDER BY a.isArchived ASC, a.name ASC
    `).all(userId) as AccountWithLatest[];
    const recentValues = db.prepare(`
      SELECT value FROM (
        SELECT value, valueDate, id FROM value_entries WHERE accountId = ? ORDER BY valueDate DESC, id DESC LIMIT 8
      ) ORDER BY valueDate ASC, id ASC
    `);
    return accounts.map((account) => ({
      ...account,
      recentValues: (recentValues.all(account.id) as Array<{ value: number }>).map((row) => Number(row.value))
    }));
  }

  function netWorthRows(userId: number) {
    return db.prepare(`
      SELECT a.id AS accountId, a.kind, v.value, v.valueDate
      FROM accounts a JOIN value_entries v ON v.accountId = a.id
      WHERE a.userId = ? AND a.isArchived = 0
      ORDER BY v.valueDate ASC, v.id ASC
    `).all(userId) as Array<{ accountId: number; kind: string; value: number; valueDate: string }>;
  }

  function netWorthSeries(userId: number) {
    return buildNetWorthSeries(netWorthRows(userId));
  }

  function projectedNetWorthSeries(userId: number, retirementDate: string | null | undefined) {
    return buildProjectedNetWorthSeries(netWorthRows(userId), retirementDate);
  }

  app.get("/api/dashboard", requireAuth, (req, res) => {
    const userId = (req as any).user.id;
    const accounts = latestAccounts(userId);
    const series = netWorthSeries(userId);
    const profile = db.prepare("SELECT retirementDate FROM profiles WHERE userId = ?").get(userId) as { retirementDate: string | null } | undefined;
    const retirementDate = profile?.retirementDate ?? null;
    const active = accounts.filter((account) => !account.isArchived);
    const totalAssets = active.filter((account) => account.kind === "asset").reduce((sum, account) => sum + Number(account.latestValue ?? 0), 0);
    const totalLiabilities = active.filter((account) => account.kind === "liability").reduce((sum, account) => sum + Math.abs(Number(account.latestValue ?? 0)), 0);
    res.json({
      totals: { netWorth: netWorth(accounts), assets: totalAssets, liabilities: totalLiabilities, monthlyChange: monthlyChange(series) },
      accounts,
      allocation: allocation(accounts),
      staleAccounts: staleAccounts(accounts),
      insights: buildInsights(accounts, series),
      series,
      projection: {
        retirementDate,
        series: projectedNetWorthSeries(userId, retirementDate)
      }
    });
  });

  app.get("/api/accounts", requireAuth, (req, res) => res.json({ accounts: latestAccounts((req as any).user.id) }));

  app.post("/api/accounts", requireAuth, (req, res) => {
    const parsed = accountSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const data = parsed.data;
    const insert = db.transaction(() => {
      const info = db.prepare(`
        INSERT INTO accounts (userId, name, kind, category, currency, updateFrequency, tagsJson, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run((req as any).user.id, data.name, data.kind, data.category, data.currency, data.updateFrequency, JSON.stringify(data.tags), data.notes ?? null);
      if (data.initialValue !== undefined) {
        db.prepare("INSERT INTO value_entries (accountId, value, valueDate, note, source) VALUES (?, ?, ?, ?, 'manual')")
          .run(info.lastInsertRowid, data.initialValue, data.valueDate || new Date().toISOString().slice(0, 10), "Initial value");
      }
      return info.lastInsertRowid;
    });
    const accountId = Number(insert());
    res.status(201).json({ account: latestAccounts((req as any).user.id).find((account) => account.id === accountId) });
  });

  app.patch("/api/accounts/:id", requireAuth, (req, res) => {
    const existing = assertAccount(db, Number(req.params.id), (req as any).user.id, res);
    if (!existing) return;
    const fields = { ...existing, ...req.body };
    const parsed = accountSchema.omit({ initialValue: true, valueDate: true }).safeParse({ ...fields, tags: req.body.tags ?? JSON.parse(existing.tagsJson) });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const data = parsed.data;
    db.prepare(`
      UPDATE accounts SET name=?, kind=?, category=?, currency=?, updateFrequency=?, tagsJson=?, notes=?, updatedAt=CURRENT_TIMESTAMP WHERE id=?
    `).run(data.name, data.kind, data.category, data.currency, data.updateFrequency, JSON.stringify(data.tags), data.notes ?? null, existing.id);
    res.json({ account: latestAccounts((req as any).user.id).find((account) => account.id === existing.id) });
  });

  app.post("/api/accounts/:id/archive", requireAuth, (req, res) => {
    if (!assertAccount(db, Number(req.params.id), (req as any).user.id, res)) return;
    db.prepare("UPDATE accounts SET isArchived = 1, updatedAt = CURRENT_TIMESTAMP WHERE id = ?").run(Number(req.params.id));
    res.json({ ok: true });
  });

  app.get("/api/accounts/:id/values", requireAuth, (req, res) => {
    const account = assertAccount(db, Number(req.params.id), (req as any).user.id, res);
    if (!account) return;
    const values = db.prepare("SELECT * FROM value_entries WHERE accountId = ? ORDER BY valueDate ASC, id ASC").all(account.id);
    const compareIds = String(req.query.compare || "").split(",").map(Number).filter(Boolean);
    const compare = compareIds.length === 2 ? twoPointComparison(
      db.prepare("SELECT * FROM value_entries WHERE id = ? AND accountId = ?").get(compareIds[0], account.id) as ValueEntry,
      db.prepare("SELECT * FROM value_entries WHERE id = ? AND accountId = ?").get(compareIds[1], account.id) as ValueEntry,
      account
    ) : null;
    res.json({ account, values, compare });
  });

  app.post("/api/accounts/:id/values", requireAuth, (req, res) => {
    const account = assertAccount(db, Number(req.params.id), (req as any).user.id, res);
    if (!account) return;
    const parsed = valueSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const data = parsed.data;
    const info = db.prepare("INSERT INTO value_entries (accountId, value, valueDate, note, source) VALUES (?, ?, ?, ?, ?)")
      .run(account.id, data.value, data.valueDate, data.note ?? null, data.source);
    res.status(201).json({ value: db.prepare("SELECT * FROM value_entries WHERE id = ?").get(info.lastInsertRowid) });
  });

  app.patch("/api/values/:id", requireAuth, (req, res) => {
    const row = assertValue(db, Number(req.params.id), (req as any).user.id, res);
    if (!row) return;
    const parsed = valueSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const next = { ...row, ...parsed.data };
    db.prepare("UPDATE value_entries SET value=?, valueDate=?, note=?, source=?, updatedAt=CURRENT_TIMESTAMP WHERE id=?")
      .run(next.value, next.valueDate, next.note ?? null, next.source, row.id);
    res.json({ value: db.prepare("SELECT * FROM value_entries WHERE id = ?").get(row.id) });
  });

  app.delete("/api/values/:id", requireAuth, (req, res) => {
    const row = assertValue(db, Number(req.params.id), (req as any).user.id, res);
    if (!row) return;
    db.prepare("DELETE FROM value_entries WHERE id = ?").run(row.id);
    res.json({ ok: true });
  });

  app.post("/api/monthly-reviews", requireAuth, (req, res) => {
    const parsed = z.object({
      reviewMonth: z.string().regex(/^\d{4}-\d{2}$/),
      notes: z.string().optional().nullable(),
      recordUnchanged: z.boolean().default(false),
      values: z.array(z.object({ accountId: z.number(), value: z.number().nonnegative(), note: z.string().optional().nullable() }))
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const userId = (req as any).user.id;
    const valueDate = `${parsed.data.reviewMonth}-01`;
    const result = db.transaction(() => {
      const review = db.prepare(`
        INSERT INTO monthly_reviews (userId, reviewMonth, notes, completedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(userId, reviewMonth) DO UPDATE SET notes=excluded.notes, completedAt=CURRENT_TIMESTAMP, updatedAt=CURRENT_TIMESTAMP
      `).run(userId, parsed.data.reviewMonth, parsed.data.notes ?? null);
      let inserted = 0;
      for (const entry of parsed.data.values) {
        const account = assertAccount(db, entry.accountId, userId);
        if (!account || account.isArchived) continue;
        const latest = db.prepare("SELECT value FROM value_entries WHERE accountId = ? ORDER BY valueDate DESC, id DESC LIMIT 1").get(account.id) as { value: number } | undefined;
        if (parsed.data.recordUnchanged || !latest || Number(latest.value) !== entry.value) {
          db.prepare("INSERT INTO value_entries (accountId, value, valueDate, note, source) VALUES (?, ?, ?, ?, 'monthly_review')")
            .run(account.id, entry.value, valueDate, entry.note ?? null);
          inserted += 1;
        }
      }
      return { reviewId: review.lastInsertRowid, valuesInserted: inserted };
    })();
    res.status(201).json(result);
  });

  app.get("/api/goals", requireAuth, (req, res) => res.json({ goals: db.prepare("SELECT * FROM goals WHERE userId = ? ORDER BY isArchived ASC, targetDate ASC").all((req as any).user.id) }));
  app.post("/api/goals", requireAuth, (req, res) => {
    const parsed = z.object({ name: z.string().min(1), goalType: z.string().min(1), targetValue: z.number().positive(), targetDate: z.string().optional().nullable(), accountId: z.number().optional().nullable() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const data = parsed.data;
    const info = db.prepare("INSERT INTO goals (userId, name, goalType, targetValue, targetDate, accountId) VALUES (?, ?, ?, ?, ?, ?)")
      .run((req as any).user.id, data.name, data.goalType, data.targetValue, data.targetDate ?? null, data.accountId ?? null);
    res.status(201).json({ goal: db.prepare("SELECT * FROM goals WHERE id = ?").get(info.lastInsertRowid) });
  });
  app.patch("/api/goals/:id", requireAuth, (req, res) => {
    const goal = db.prepare("SELECT * FROM goals WHERE id = ? AND userId = ?").get(Number(req.params.id), (req as any).user.id) as any;
    if (!goal) return res.status(404).json({ error: "Goal not found" });
    const next = { ...goal, ...req.body };
    db.prepare("UPDATE goals SET name=?, goalType=?, targetValue=?, targetDate=?, accountId=?, isArchived=?, updatedAt=CURRENT_TIMESTAMP WHERE id=?")
      .run(next.name, next.goalType, next.targetValue, next.targetDate ?? null, next.accountId ?? null, next.isArchived ? 1 : 0, goal.id);
    res.json({ goal: db.prepare("SELECT * FROM goals WHERE id = ?").get(goal.id) });
  });

  app.get("/api/export", requireAuth, (req, res) => {
    const userId = (req as any).user.id;
    res.json({
      exportedAt: new Date().toISOString(),
      accounts: db.prepare("SELECT * FROM accounts WHERE userId = ?").all(userId),
      values: db.prepare("SELECT v.* FROM value_entries v JOIN accounts a ON a.id = v.accountId WHERE a.userId = ?").all(userId),
      goals: db.prepare("SELECT * FROM goals WHERE userId = ?").all(userId),
      monthlyReviews: db.prepare("SELECT * FROM monthly_reviews WHERE userId = ?").all(userId)
    });
  });

  app.post("/api/import", requireAuth, (req, res) => {
    const userId = (req as any).user.id;
    const payload = z.object({
      fileName: z.string().default("manual-import.json"),
      accounts: z.array(z.any()).default([]),
      values: z.array(z.any()).default([]),
      goals: z.array(z.any()).default([]),
      monthlyReviews: z.array(z.any()).default([])
    }).safeParse(req.body);
    if (!payload.success) return res.status(400).json({ error: payload.error.flatten() });
    let rowsImported = 0;
    const errors: string[] = [];
    db.transaction(() => {
      const accountIdMap = new Map<number, number>();
      for (const account of payload.data.accounts) {
        try {
          const tagsJson = account.tagsJson ?? JSON.stringify(account.tags ?? []);
          const info = db.prepare("INSERT INTO accounts (userId, name, kind, category, currency, updateFrequency, tagsJson, notes, isArchived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .run(userId, account.name, account.kind, account.category, account.currency ?? "GBP", account.updateFrequency ?? "monthly", tagsJson, account.notes ?? null, account.isArchived ? 1 : 0);
          if (account.id !== undefined) accountIdMap.set(Number(account.id), Number(info.lastInsertRowid));
          rowsImported += 1;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "Unknown import error");
        }
      }
      const nestedValues = payload.data.accounts.flatMap((account) => (account.values ?? []).map((value: any) => ({ ...value, accountId: account.id })));
      const values = payload.data.values.length ? payload.data.values : nestedValues;
      for (const value of values) {
        try {
          const accountId = accountIdMap.get(Number(value.accountId));
          if (!accountId) throw new Error(`Missing imported account for value ${value.id ?? value.valueDate}`);
          db.prepare("INSERT INTO value_entries (accountId, value, valueDate, note, source) VALUES (?, ?, ?, ?, ?)")
            .run(accountId, value.value, value.valueDate, value.note ?? null, value.source ?? "import");
          rowsImported += 1;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "Unknown value import error");
        }
      }
      for (const goal of payload.data.goals) {
        try {
          db.prepare("INSERT INTO goals (userId, name, goalType, targetValue, targetDate, accountId, isArchived) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .run(userId, goal.name, goal.goalType, goal.targetValue, goal.targetDate ?? null, goal.accountId ? accountIdMap.get(Number(goal.accountId)) ?? null : null, goal.isArchived ? 1 : 0);
          rowsImported += 1;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "Unknown goal import error");
        }
      }
      for (const review of payload.data.monthlyReviews) {
        try {
          db.prepare("INSERT OR IGNORE INTO monthly_reviews (userId, reviewMonth, notes, completedAt) VALUES (?, ?, ?, ?)")
            .run(userId, review.reviewMonth, review.notes ?? null, review.completedAt ?? null);
          rowsImported += 1;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "Unknown review import error");
        }
      }
      db.prepare("INSERT INTO import_jobs (userId, fileName, status, rowsImported, errorsJson) VALUES (?, ?, ?, ?, ?)")
        .run(userId, payload.data.fileName, errors.length ? "completed_with_errors" : "completed", rowsImported, JSON.stringify(errors));
    })();
    res.status(201).json({ rowsImported, errors });
  });

  return app;
}

function normalizeOrigin(origin: string) {
  const trimmed = origin.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`;
  } catch {
    return trimmed;
  }
}

function assertAccount(db: any, id: number, userId: number, res?: Response): Account | null {
  const account = db.prepare("SELECT * FROM accounts WHERE id = ? AND userId = ?").get(id, userId) as Account | undefined;
  if (!account && res) res.status(404).json({ error: "Account not found" });
  return account ?? null;
}

function assertValue(db: any, id: number, userId: number, res: Response): ValueEntry | null {
  const row = db.prepare("SELECT v.* FROM value_entries v JOIN accounts a ON a.id = v.accountId WHERE v.id = ? AND a.userId = ?").get(id, userId) as ValueEntry | undefined;
  if (!row) res.status(404).json({ error: "Value not found" });
  return row ?? null;
}

function buildInsights(accounts: AccountWithLatest[], series: Array<{ date: string; netWorth: number }>) {
  const insights = [];
  const stale = staleAccounts(accounts);
  if (stale.length) insights.push({ title: "Updates due", body: `${stale.length} account${stale.length === 1 ? "" : "s"} need a fresh manual value.` });
  const change = monthlyChange(series);
  if (change.change !== 0) insights.push({ title: "Latest movement", body: `Net worth changed by ${change.change.toFixed(2)} since the prior point.` });
  const liabilities = accounts.filter((account) => !account.isArchived && account.kind === "liability").reduce((sum, account) => sum + Number(account.latestValue ?? 0), 0);
  if (liabilities > 0) insights.push({ title: "Liability tracking", body: "Liability balances are stored as positive owed amounts and subtracted from net worth." });
  if (!insights.length) insights.push({ title: "Ready for review", body: "Add manual account values to build your trend history." });
  return insights;
}
