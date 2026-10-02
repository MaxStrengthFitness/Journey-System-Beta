// @vitest-environment jsdom
/**
 * "9 of 12 have read it", MOUNTED (the Atlas answers, Oct 2 2026): the
 * poster sees the count from the notice's own acks record; a trainer sees
 * nothing and opens no read.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const listened: string[] = [];
vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-lead" } } }));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  query: (q: unknown) => q,
  serverTimestamp: () => "__now__",
  setDoc: async () => {},
  writeBatch: () => ({ set: () => {}, commit: async () => {} }),
  onSnapshot: (ref: { path: string }, next: (snap: { docs: Array<{ id: string }> }) => void) => {
    listened.push(ref.path);
    next({ docs: [{ id: "uid-ana" }, { id: "uid-bo" }] });
    return () => {};
  },
}));

import type { HubAnnouncement, Trainer } from "../../types";
import { NoticeReadCount } from "./NoticeReadCount";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = (id: string, role = "LifeTransformer"): Trainer =>
  ({ id, authUid: `uid-${id}`, fullName: id, role, primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"] }) as Trainer;
const team = [t("ana"), t("bo"), t("cy"), t("lead", "StudioLeader")];
const notice = { id: "n1", studioId: "westlake", targetScope: "studio", targetId: "westlake", authorId: "uid-lead", asksRead: true } as HubAnnouncement;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  listened.length = 0;
});

function mount(viewer: Trainer, uid: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<NoticeReadCount announcement={notice} trainers={team} viewer={viewer} uid={uid} />));
  return host;
}

describe("NoticeReadCount", () => {
  it("tells the poster how many have read it", () => {
    const el = mount(team[3], "uid-lead");
    expect(el.textContent).toBe("2 of 3 have read it.");
    expect(listened).toEqual(["hub_announcements/n1/acks"]);
  });

  it("shows a trainer nothing, and reads nothing", () => {
    const el = mount(team[0], "uid-ana");
    expect(el.textContent).toBe("");
    expect(listened).toEqual([]);
  });
});
