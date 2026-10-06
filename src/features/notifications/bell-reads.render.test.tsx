// @vitest-environment jsdom
/**
 * THE BELL'S READS (the speed round, Oct 5 2026, R16).
 *
 * The bell read every notification the person ever had and every notice the
 * company ever posted, on every iPad. These pin the two smaller shapes (the
 * newest fifty plus the unread ones; the newest hundred notices, no isActive
 * filter) and the rule that a read that breaks is unknown, never empty.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "u1" } } }));

type Listener = { path: string; parts: unknown[]; next: (s: unknown) => void; fail: (e: unknown) => void };
const listeners: Listener[] = [];

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => {
    const first = parts[0] as { path?: string } | undefined;
    const base = first && typeof first === "object" && typeof first.path === "string" ? [first.path] : [];
    return { path: [...base, ...parts.filter((p) => typeof p === "string")].join("/") };
  };
  return {
    collection: ref,
    doc: ref,
    query: (target: { path: string }, ...parts: unknown[]) => ({ path: target.path, parts }),
    where: (field: string, op: string, value: unknown) => ({ where: [field, op, value] }),
    orderBy: (field: string, dir: string) => ({ orderBy: [field, dir] }),
    limit: (n: number) => ({ limit: n }),
    onSnapshot: (target: { path: string; parts?: unknown[] }, next: (s: unknown) => void, fail: (e: unknown) => void) => {
      listeners.push({ path: target.path, parts: target.parts ?? [], next, fail });
      return () => {};
    },
    serverTimestamp: () => "ts",
    setDoc: vi.fn(async () => {}),
    addDoc: vi.fn(async () => {}),
    updateDoc: vi.fn(async () => {}),
    writeBatch: () => ({ set() {}, update() {}, commit: async () => {} }),
  };
});

import { useNotifications } from "./useNotifications";
import { ANNOUNCEMENTS_READ_LIMIT, useHubAnnouncements } from "./useHubAnnouncements";
import type { Trainer } from "../../types";

const me = { id: "u1", fullName: "Austin Jurgens", role: "LifeTransformer", primaryHomeStudioId: "westlake" } as unknown as Trainer;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  listeners.length = 0;
});

let seen: { notes?: ReturnType<typeof useNotifications>; notices?: ReturnType<typeof useHubAnnouncements> } = {};
function Probe() {
  seen = { notes: useNotifications("u1"), notices: useHubAnnouncements(me, "westlake") };
  return null;
}

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Probe />));
}

const snap = (docs: Record<string, unknown>[]) => ({ docs: docs.map((d, i) => ({ id: String(d.id ?? i), data: () => d })) });
const find = (path: string, has: (parts: unknown[]) => boolean) => listeners.find((l) => l.path === path && has(l.parts))!;

describe("the bell's reads", () => {
  it("reads the newest fifty notifications and, apart, the unread ones", async () => {
    await mount();
    const list = find("trainers/u1/notifications", (p) => !p.some((x) => (x as { where?: unknown }).where));
    const unread = find("trainers/u1/notifications", (p) => p.some((x) => (x as { where?: unknown }).where));
    expect(list.parts).toEqual([{ orderBy: ["createdAt", "desc"] }, { limit: 50 }]);
    expect(unread.parts).toEqual([{ where: ["readAt", "==", null] }, { orderBy: ["createdAt", "desc"] }, { limit: 100 }]);

    await act(async () => {
      list.next(snap([{ id: "n1", title: "Done", readAt: null }]));
      unread.next(snap([{ id: "n1", title: "Done", readAt: null }]));
    });
    expect(seen.notes!.notifications.map((n) => n.id)).toEqual(["n1"]);
    expect(seen.notes!.unreadCount).toBe(1);
    expect(seen.notes!.failed).toBe(false);
  });

  it("a notification read that breaks keeps what it had and says so", async () => {
    await mount();
    const list = find("trainers/u1/notifications", (p) => !p.some((x) => (x as { where?: unknown }).where));
    await act(async () => list.next(snap([{ id: "n1", title: "Done", readAt: null }])));
    await act(async () => list.fail(new Error("offline")));
    expect(seen.notes!.notifications).toHaveLength(1);
    expect(seen.notes!.failed).toBe(true);
  });

  it("reads the newest hundred notices with no isActive filter", async () => {
    await mount();
    const notices = find("hub_announcements", () => true);
    expect(ANNOUNCEMENTS_READ_LIMIT).toBe(100);
    expect(notices.parts).toEqual([{ orderBy: ["createdAt", "desc"] }, { limit: 100 }]);
    expect(JSON.stringify(notices.parts)).not.toContain("isActive");
  });

  it("a notice read that breaks is unknown, never an empty list", async () => {
    await mount();
    const notices = find("hub_announcements", () => true);
    expect(seen.notices!.status).toBe("loading");
    const notice = { id: "a1", title: "Holiday hours", studioId: "westlake", createdAt: new Date() };
    await act(async () => notices.next(snap([notice])));
    expect(seen.notices!.status).toBe("ready");
    expect(seen.notices!.announcements.map((a) => a.id)).toEqual(["a1"]);
    await act(async () => notices.fail(new Error("refused")));
    expect(seen.notices!.status).toBe("failed");
    expect(seen.notices!.announcements.map((a) => a.id)).toEqual(["a1"]);
  });
});
