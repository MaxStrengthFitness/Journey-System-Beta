/**
 * The staff sign-in check's reads have a time limit (server/auth.ts, the
 * speed round's review, Oct 5 2026). Every /api/mindbody/* and /api/gemini/*
 * request waits on this check first; a Firestore read that never answered
 * used to hold the request for ever. Now it is UNKNOWN after the limit: the
 * request is answered 503 "Couldn't confirm your account just now", never as
 * signed out and never as not staff. Firebase's token check and Firestore are
 * stubbed; nothing leaves this machine.
 */

import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase-admin/app", () => ({
  getApps: () => [],
  initializeApp: () => ({}),
}));
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ verifyIdToken: async () => ({ uid: "trainer-1" }) }),
}));

import { AUTH_READ_TIMEOUT_MS, requireStaff, restGet } from "../../server/auth";

const realFetch = globalThis.fetch;
const saved: Record<string, string | undefined> = {};
const servers: { close: () => void }[] = [];

/** Firestore never answers, and the request rejects only when its signal fires (as fetch does). Everything else is real. */
function firestoreHangs() {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input: any, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input?.url ?? input);
    if (!url.includes("firestore.googleapis.com")) return realFetch(input, init);
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
    });
  });
}

beforeEach(() => {
  for (const k of ["AUTH_READ_TIMEOUT_MS", "VITE_FIREBASE_PROJECT_ID"]) saved[k] = process.env[k];
  process.env.AUTH_READ_TIMEOUT_MS = "40";
  process.env.VITE_FIREBASE_PROJECT_ID = "test-project";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  while (servers.length) servers.pop()!.close();
});

describe("restGet's time limit", () => {
  it("is fifteen seconds", () => {
    expect(AUTH_READ_TIMEOUT_MS).toBe(15_000);
  });

  it("gives up on a read that never answers, as a 504 with a reason, never as an empty document", async () => {
    const fetchSpy = firestoreHangs();
    const read = await restGet("https://firestore.googleapis.com/v1/projects/p/databases/d/documents/trainers/u", "token");
    expect(read.status).toBe(504);
    expect(read.body.error.message).toMatch(/didn't answer within/);
    expect(fetchSpy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("answers a quick read as before", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ fields: { name: { stringValue: "AJ" } } }), { status: 200 }),
    );
    const read = await restGet("https://firestore.googleapis.com/v1/x", "token");
    expect(read).toEqual({ status: 200, body: { fields: { name: { stringValue: "AJ" } } } });
  });
});

describe("requireStaff when Firestore doesn't answer", () => {
  it("answers 503 'Couldn't confirm your account', never signed out or not staff, and never reaches the route", async () => {
    firestoreHangs();
    const route = vi.fn((_req: express.Request, res: express.Response) => res.json({ ok: true }));
    const app = express();
    app.use(express.json());
    app.post("/api/mindbody/anything", requireStaff(), route);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    servers.push(server);

    const res = await realFetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/mindbody/anything`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer some-token" },
      body: JSON.stringify({ siteId: "29068" }),
    });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Couldn't confirm your account just now \(could not read your staff profile \(HTTP 504: Firestore didn't answer within/);
    expect(route).not.toHaveBeenCalled();
  });
});
