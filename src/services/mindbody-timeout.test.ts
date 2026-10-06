/**
 * The Mindbody floor's time limit per attempt (server/mindbody-client.ts, the
 * speed round, Oct 5 2026): a call Mindbody accepted and never answered is
 * given up on and comes back as the route's usual failure (unknown, never
 * empty), instead of holding the request for ever. `fetch` is stubbed: no
 * call leaves this machine.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = [
  "MINDBODY_API_KEY",
  "MINDBODY_SOURCE_NAME",
  "MINDBODY_SOURCE_PASSWORD",
  "MINDBODY_ATTEMPT_TIMEOUT_MS",
  "MINDBODY_MAX_ATTEMPTS",
] as const;
const saved: Record<string, string | undefined> = {};

/** A fetch that never answers, and rejects only when its signal fires (as fetch does). */
function hangingFetch(signal?: AbortSignal | null) {
  return new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason));
  });
}

const tokenAnswer = () =>
  new Response(JSON.stringify({ AccessToken: "token-1", Expires: new Date(Date.now() + 3_600_000).toISOString() }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

async function loadClient() {
  vi.resetModules();
  return import("../../server/mindbody-client");
}

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.MINDBODY_API_KEY = "test-key";
  process.env.MINDBODY_SOURCE_NAME = "test-source";
  process.env.MINDBODY_SOURCE_PASSWORD = "test-password";
  process.env.MINDBODY_ATTEMPT_TIMEOUT_MS = "40";
  process.env.MINDBODY_MAX_ATTEMPTS = "1";
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the Mindbody floor's time limit", () => {
  it("is thirty seconds an attempt by default, and a minute for one large page", async () => {
    delete process.env.MINDBODY_ATTEMPT_TIMEOUT_MS;
    const client = await loadClient();
    expect(client.MINDBODY_ATTEMPT_TIMEOUT_MS).toBe(30_000);
    expect(client.MINDBODY_LARGE_PAGE_TIMEOUT_MS).toBe(60_000);
  });

  it("mindbodyGet answers ok: false with 504 when Mindbody never answers, and doesn't throw", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      String(url).includes("usertoken/issue") ? Promise.resolve(tokenAnswer()) : hangingFetch(init?.signal),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = await loadClient();
    const result = await client.mindbodyGet("29068", "client/clients", { limit: 1 });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(504);
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/did not answer/);
    // Every call carried a signal.
    for (const call of fetchMock.mock.calls) expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("a caller's own longer limit is used for that call", async () => {
    let seen: AbortSignal | null | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (String(url).includes("usertoken/issue")) return Promise.resolve(tokenAnswer());
        seen = init?.signal;
        return hangingFetch(init?.signal);
      }),
    );
    const client = await loadClient();
    const started = Date.now();
    const result = await client.mindbodyGet("29068", "appointment/staffappointments", {}, { timeoutMs: 150 });
    expect(result.status).toBe(504);
    expect(Date.now() - started).toBeGreaterThanOrEqual(120);
    expect(seen).toBeInstanceOf(AbortSignal);
  });

  it("mindbodyFetch hands back Mindbody's usual error shape when the call times out", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => hangingFetch(init?.signal)));
    const client = await loadClient();
    const res = await client.mindbodyFetch("29068", "push/subscriptions", "https://example.invalid/x", { method: "GET" });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.Error.Message).toMatch(/did not answer/);
  });

  it("a token call that never answers throws, as the token call always has", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => hangingFetch(init?.signal)));
    const client = await loadClient();
    await expect(client.getMindbodyToken("5746957")).rejects.toThrow(/Failed to issue Mindbody token/);
  });

  it("an answer that is not JSON is a failed read, never a throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          String(url).includes("usertoken/issue") ? tokenAnswer() : new Response("<html>oops</html>", { status: 200 }),
        ),
      ),
    );
    const client = await loadClient();
    const result = await client.mindbodyGet("29068", "client/clients", {});
    expect(result.ok).toBe(false);
    expect(result.status).toBe(502);
    expect(result.data).toBeNull();
  });

  it("still answers a quick call as before", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          String(url).includes("usertoken/issue")
            ? tokenAnswer()
            : new Response(JSON.stringify({ Clients: [{ Id: "1" }] }), { status: 200 }),
        ),
      ),
    );
    const client = await loadClient();
    const result = await client.mindbodyGet("29068", "client/clients", {});
    expect(result).toEqual({ ok: true, status: 200, data: { Clients: [{ Id: "1" }] }, error: "" });
  });
});
