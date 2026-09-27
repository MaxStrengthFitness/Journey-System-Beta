// @vitest-environment jsdom
/**
 * The standing weeks, read live (voice-review round, Sep 27 2026): a failed
 * read is "unknown", never "nobody has a week", and the rules not being
 * deployed yet says so.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const listeners = vi.hoisted(() => ({
  list: [] as { path: string; next: (snap: unknown) => void; fail: (err: unknown) => void; off: () => void }[],
}));

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: null }, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    ...real,
    doc: ref,
    collection: ref,
    onSnapshot: (r: { path: string }, next: (snap: unknown) => void, fail: (err: unknown) => void) => {
      const off = vi.fn();
      listeners.list.push({ path: r.path, next, fail, off });
      return off;
    },
  };
});

import { useStandingWeek, useStandingWeeks } from "./useStandingWeeks";

const docSnap = (id: string, data: Record<string, unknown>) => ({ id, exists: () => true, data: () => data });
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
  vi.restoreAllMocks();
});

describe("useStandingWeeks", () => {
  it("reads the studio's weeks, by name, and stops listening on unmount", () => {
    act(() => root.render(<Weeks studioId="solon" />));
    expect(seen).toMatchObject({ loading: true, docs: [] });
    expect(listeners.list[0].path).toBe("studios/solon/standingWeeks");
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
