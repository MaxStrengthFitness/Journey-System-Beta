import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNSENT_CHECK_MS, signOutQuestion, unsentWritesWaiting } from "./sign-out-check";

describe("signOutQuestion", () => {
  it("asks nothing when no session is open and everything has been sent", () => {
    expect(signOutQuestion({ openSessionClientName: null, unsent: false })).toBeNull();
  });

  it("names the client whose session is still open, in full", () => {
    const q = signOutQuestion({ openSessionClientName: "Judy Daus", unsent: false });
    expect(q).toBe("Your session with Judy Daus is still open. It stays open until someone finishes it. Sign out anyway?");
  });

  it("says unsent saves wait on this iPad until the same person signs in here again", () => {
    const q = signOutQuestion({ openSessionClientName: null, unsent: true })!;
    expect(q).toContain("haven't reached the studio's records yet");
    expect(q).toContain("wait on this iPad until you sign in here again");
    expect(q.endsWith("Sign out anyway?")).toBe(true);
  });

  it("says both when both are true, the session first", () => {
    const q = signOutQuestion({ openSessionClientName: "Judy Daus", unsent: true })!;
    expect(q.indexOf("Judy Daus")).toBeLessThan(q.indexOf("saves"));
  });

  it("never prints an empty name", () => {
    expect(signOutQuestion({ openSessionClientName: "  ", unsent: false })).toContain("Your session with a client");
  });
});

describe("unsentWritesWaiting", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("says nothing is waiting when the database has everything", async () => {
    await expect(unsentWritesWaiting(() => Promise.resolve())).resolves.toBe(false);
  });

  it("says something is waiting when the database has not confirmed in time", async () => {
    const answer = unsentWritesWaiting(() => new Promise<void>(() => {}));
    await vi.advanceTimersByTimeAsync(UNSENT_CHECK_MS);
    await expect(answer).resolves.toBe(true);
  });

  it("never holds sign-out up on a question it cannot ask", async () => {
    await expect(
      unsentWritesWaiting(() => {
        throw new TypeError("no database");
      }),
    ).resolves.toBe(false);
    await expect(unsentWritesWaiting(() => Promise.reject(new Error("x")))).resolves.toBe(false);
  });
});
