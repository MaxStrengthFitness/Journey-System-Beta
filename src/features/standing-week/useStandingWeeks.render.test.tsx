// @vitest-environment jsdom
/**
 * The standing weeks, read live (voice-review round, Sep 27 2026): a failed
 * read is "unknown", never "nobody has a week", and the rules not being
 * deployed yet says so. Since the follow-up, a snapshot only this iPad's
 * cache answered is not an answer either: the first answer is the server's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const listeners = vi.hoisted(() => ({
  list: [] as { path: string; options: unknown; next: (snap: unknown) => void; fail: (err: unknown) => void; off: () => void }[],
}));

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: null }, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    ...real,
    doc: ref,
    collection: ref,
    // Called as (ref, { includeMetadataChanges }, next, fail): the first
    // answer must be the server's (voice review follow-up).
    onSnapshot: (r: { path: string }, options: unknown, next: (snap: unknown) => void, fail: (err: unknown) => void) => {
      const off = vi.fn();
      listeners.list.push({ path: r.path, options, next, fail, off });
      return off;
    },
  };
});

import { OFFLINE_ERROR, useStandingWeek, useStandingWeeks } from "./useStandingWeeks";
import { SERVER_WAIT_MS } from "./server-read";

const docSnap = (id: string, data: Record<string, unknown>) => ({ id, exists: () => true, data: () => data });
const cached = { fromCache: true, hasPendingWrites: false };
const confirmed = { fromCache: false, hasPendingWrites: false };
const setOnline = (online: boolean) => {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
};
const week = { hours: [{ weekday: 1, from: "07:00", to: "13:00" }], regulars: [] };

let root: Root;
let host: HTMLDivElement;
let seen: unknown;

function Weeks({ studioId }: { studioId: string | null }) {
  seen = useStandingWeeks(studioId);
  return null;
}
function Mine({ studioId, uid }: { studioId: string; uid: string }) {
  seen = useStandingWeek(studioId, uid);
  return null;
}

beforeEach(() => {
  listeners.list.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  setOnline(true);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useStandingWeeks", () => {
  it("reads the studio's weeks, by name, and stops listening on unmount", () => {
    act(() => root.render(<Weeks studioId="solon" />));
    expect(seen).toMatchObject({ loading: true, docs: [] });
    expect(listeners.list[0].path).toBe("studios/solon/standingWeeks");
    // Told when the server merely confirms the cache, or the wait could never end.
    expect(listeners.list[0].options).toEqual({ includeMetadataChanges: true });
    act(() =>
      listeners.list[0].next({
        docs: [
          docSnap("uid-sam", { studioId: "solon", trainerId: "t-sam", trainerName: "Sam Lee", proposed: week, final: null }),
          docSnap("uid-ann", { studioId: "solon", trainerId: "t-ann", trainerName: "Ann Park", proposed: week, final: week }),
        ],
      }),
    );
    expect(seen).toMatchObject({ loading: false, error: null });
    expect((seen as { docs: { trainerName: string }[] }).docs.map((d) => d.trainerName)).toEqual(["Ann Park", "Sam Lee"]);
    act(() => root.render(<Weeks studioId={null} />));
    expect(listeners.list[0].off).toHaveBeenCalled();
    expect(seen).toMatchObject({ loading: false, docs: [], error: null });
  });

  it("says a failed read failed, and names undeployed rules", () => {
    act(() => root.render(<Weeks studioId="solon" />));
    act(() => listeners.list[0].fail({ code: "permission-denied" }));
    expect(seen).toMatchObject({ loading: false, docs: [], error: expect.stringContaining("rules may not be deployed yet") });
    act(() => root.render(<Weeks studioId="westlake" />));
    act(() => listeners.list[1].fail({ code: "unavailable" }));
    expect(seen).toMatchObject({ error: "Couldn't load the standing weeks. Check the connection." });
  });
});

describe("the first answer is the server's", () => {
  it("never reads a cache-only empty list as nobody having a week", () => {
    act(() => root.render(<Weeks studioId="solon" />));
    act(() => listeners.list[0].next({ docs: [], metadata: cached }));
    expect(seen).toMatchObject({ loading: true, docs: [], error: null });
    // The server confirms: now it is an answer.
    act(() => listeners.list[0].next({ docs: [docSnap("uid-sam", { trainerId: "t-sam", trainerName: "Sam Lee", proposed: week })], metadata: confirmed }));
    expect(seen).toMatchObject({ loading: false, error: null });
    expect((seen as { docs: unknown[] }).docs).toHaveLength(1);
    // Once in step with the server, a blip in the connection keeps what is shown.
    act(() => listeners.list[0].next({ docs: [docSnap("uid-sam", { trainerId: "t-sam", trainerName: "Sam Lee", proposed: week })], metadata: cached }));
    expect(seen).toMatchObject({ loading: false, error: null });
    expect((seen as { docs: unknown[] }).docs).toHaveLength(1);
  });

  it("says it can't tell when the iPad is offline, and reads again once it's back", () => {
    act(() => root.render(<Weeks studioId="solon" />));
    act(() => listeners.list[0].next({ docs: [], metadata: cached }));
    act(() => setOnline(false));
    expect(seen).toMatchObject({ loading: false, docs: [], error: OFFLINE_ERROR });
    act(() => setOnline(true));
    expect(seen).toMatchObject({ loading: true, error: null });
    act(() => listeners.list[0].next({ docs: [], metadata: confirmed }));
    expect(seen).toMatchObject({ loading: false, docs: [], error: null });
  });

  it("says it can't tell when the server hasn't answered in time", () => {
    vi.useFakeTimers();
    act(() => root.render(<Mine studioId="solon" uid="uid-sam" />));
    act(() => listeners.list[0].next({ id: "uid-sam", exists: () => false, data: () => undefined, metadata: cached }));
    expect(seen).toMatchObject({ doc: null, loading: true, error: null });
    act(() => {
      vi.advanceTimersByTime(SERVER_WAIT_MS);
    });
    expect(seen).toMatchObject({ doc: null, loading: false, error: OFFLINE_ERROR });
    act(() => listeners.list[0].next({ id: "uid-sam", exists: () => true, data: () => ({ trainerId: "t-sam", proposed: week }), metadata: confirmed }));
    expect(seen).toMatchObject({ doc: { trainerId: "t-sam" }, loading: false, error: null });
  });
});

describe("useStandingWeek", () => {
  it("reads one trainer's week, or null when there is none", () => {
    act(() => root.render(<Mine studioId="solon" uid="uid-sam" />));
    expect(listeners.list[0].path).toBe("studios/solon/standingWeeks/uid-sam");
    act(() => listeners.list[0].next({ id: "uid-sam", exists: () => false, data: () => undefined }));
    expect(seen).toMatchObject({ doc: null, loading: false, error: null });
    act(() => listeners.list[0].next({ id: "uid-sam", exists: () => true, data: () => ({ trainerId: "t-sam", trainerName: "Sam Lee", proposed: week }) }));
    expect(seen).toMatchObject({ doc: { trainerUid: "uid-sam", trainerId: "t-sam", final: null }, loading: false });
  });
});
