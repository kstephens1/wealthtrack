import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";

const pngDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

let db: Database.Database;
let imageDir: string;
let priorImageDir: string | undefined;

beforeEach(() => {
  process.env.SEED_USER_EMAIL = "image@example.com";
  process.env.SEED_USER_PASSWORD = "password123";
  priorImageDir = process.env.ACCOUNT_IMAGE_DIR;
  imageDir = fs.mkdtempSync(path.join(os.tmpdir(), "wealthtrack-images-"));
  process.env.ACCOUNT_IMAGE_DIR = imageDir;
  db = new Database(":memory:");
});

afterEach(() => {
  db.close();
  fs.rmSync(imageDir, { recursive: true, force: true });
  if (priorImageDir === undefined) delete process.env.ACCOUNT_IMAGE_DIR;
  else process.env.ACCOUNT_IMAGE_DIR = priorImageDir;
});

async function auth(app: ReturnType<typeof createApp>) {
  const response = await request(app).post("/api/auth/login").send({ email: "image@example.com", password: "password123" });
  return response.body.token as string;
}

function userId() {
  return (db.prepare("SELECT id FROM users WHERE email = ?").get("image@example.com") as { id: number }).id;
}

function createAccount() {
  return Number(db.prepare("INSERT INTO accounts (userId, name, kind, category, currency, updateFrequency) VALUES (?, 'Cash', 'asset', 'Cash', 'GBP', 'monthly')").run(userId()).lastInsertRowid);
}

describe("account images", () => {
  it("uploads, fetches, and deletes an account image", async () => {
    const app = createApp(db);
    const token = await auth(app);
    const accountId = createAccount();

    const upload = await request(app)
      .put(`/api/accounts/${accountId}/image`)
      .set("Authorization", `Bearer ${token}`)
      .send({ imageDataUrl: pngDataUrl });

    expect(upload.status).toBe(200);
    expect(upload.body.account).toMatchObject({ id: accountId, thumbnailFileName: `${accountId}.png`, thumbnailMimeType: "image/png" });
    expect(fs.existsSync(path.join(imageDir, `${accountId}.png`))).toBe(true);

    const image = await request(app).get(`/api/accounts/${accountId}/image`).set("Authorization", `Bearer ${token}`);
    expect(image.status).toBe(200);
    expect(image.headers["content-type"]).toContain("image/png");

    const deleted = await request(app).delete(`/api/accounts/${accountId}/image`).set("Authorization", `Bearer ${token}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.account.thumbnailFileName).toBeNull();
    expect(fs.existsSync(path.join(imageDir, `${accountId}.png`))).toBe(false);
  });

  it("rejects invalid image payloads", async () => {
    const app = createApp(db);
    const token = await auth(app);
    const accountId = createAccount();

    const response = await request(app)
      .put(`/api/accounts/${accountId}/image`)
      .set("Authorization", `Bearer ${token}`)
      .send({ imageDataUrl: "data:text/plain;base64,SGVsbG8=" });

    expect(response.status).toBe(400);
  });

  it("omits image metadata from exports", async () => {
    const app = createApp(db);
    const token = await auth(app);
    const accountId = createAccount();
    await request(app).put(`/api/accounts/${accountId}/image`).set("Authorization", `Bearer ${token}`).send({ imageDataUrl: pngDataUrl });

    const response = await request(app).get("/api/export").set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.accounts[0].thumbnailFileName).toBeUndefined();
    expect(response.body.accounts[0].thumbnailMimeType).toBeUndefined();
    expect(response.body.accounts[0].thumbnailUpdatedAt).toBeUndefined();
  });
});
