import Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app";

let previousFrontendUrl: string | undefined;

beforeEach(() => {
  previousFrontendUrl = process.env.FRONTEND_URL;
});

afterEach(() => {
  if (previousFrontendUrl === undefined) {
    delete process.env.FRONTEND_URL;
  } else {
    process.env.FRONTEND_URL = previousFrontendUrl;
  }
});

describe("CORS", () => {
  it("allows the configured production origin with or without a trailing slash", async () => {
    process.env.FRONTEND_URL = "https://wealthtracker-prod-ks-2026.web.app/";
    const db = new Database(":memory:");
    const app = createApp(db);

    const response = await request(app)
      .options("/api/auth/login")
      .set("Origin", "https://wealthtracker-prod-ks-2026.web.app")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://wealthtracker-prod-ks-2026.web.app");
    db.close();
  });

  it("rejects blocked origins without an internal server error", async () => {
    process.env.FRONTEND_URL = "https://wealthtracker-prod-ks-2026.web.app";
    const db = new Database(":memory:");
    const app = createApp(db);

    const response = await request(app)
      .get("/api/hello")
      .set("Origin", "https://example.com");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Origin not allowed" });
    db.close();
  });
});
