// @vitest-environment jsdom
/**
 * THE PLANNER MOUNTS — every tab, and the dialogs a tap opens.
 *
 * Round: Planner rework, Sep 2026. A clean typecheck, a green suite and a
 * production build all passed while the four-tab profile crashed on its first
 * tap (see client-profile/profile-nav.render.test.tsx), so the Planner's four
 * tabs are mounted here for real, over a Firestore that answers every read
 * with an empty list. What this catches: a hook ordering mistake, a render
 * that throws on empty data, a component that assumed a field the database
 * doesn't have yet.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "t-lead" } },
  functions: {},
}));

vi.mock("../../ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "s1",
    activeStudio: { id: "s1", name: "Solon" },
    availableStudios: [],
    setActiveStudioId: () => {},
    isChangingStudio: false,
  }),
}));

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/"), id: "id" });
  const emptySnap = {
    docs: [],
    size: 0,
    empty: true,
    forEach: () => {},
    metadata: { fromCache: false, hasPendingWrites: false },
    docChanges: () => [],
  };
  const emptyDoc = { exists: () => false, data: () => undefined, id: "id", metadata: { fromCache: false } };
  return {
    collection: ref,
    collectionGroup: ref,
    doc: ref,
    query: (q: unknown) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    startAfter: () => ({}),
    documentId: () => "__name__",
    onSnapshot: (target: { path: string }, a: unknown, b?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      const isDoc = target.path.split("/").length % 2 === 0;
      const t = setTimeout(() => next(isDoc ? emptyDoc : emptySnap), 0);
      return () => clearTimeout(t);
    },
    getDocs: async () => emptySnap,
    getDoc: async () => emptyDoc,
    setDoc: async () => {},
    updateDoc: async () => {},
    addDoc: async () => ({ id: "new" }),
    deleteDoc: async () => {},
    writeBatch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }),
    serverTimestamp: () => new Date(),
    arrayUnion: (...v: unknown[]) => v,
    arrayRemove: (...v: unknown[]) => v,
    increment: (n: number) => n,
    deleteField: () => null,
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d },
  };
});

import { ToastProvider } from "../../contexts/ToastContext";
import { PlannerView } from "./PlannerView";

const lead = {
  id: "t-lead",
  fullName: "Lee Leader",
  role: "HeadTrainer",
  primaryHomeStudioId: "s1",
} as never;
const trainer = { ...(lead as object), role: "LifeTransformer" } as never;

let mounted: Root | null = null;
let host: HTMLElement | null = null;

async function mount(authTrainer: unknown) {
  host = document.createElement("div");
  document.body.appendChild(host);
  mounted = createRoot(host);
  await act(async () => {
    mounted!.render(
      <StrictMode>
        <ToastProvider>
          <PlannerView authTrainer={authTrainer as never} clients={[]} trainers={[lead]} />
        </ToastProvider>
      </StrictMode>,
    );
  });
  await settle();
  return host;
}

const settle = () => act(async () => {
  await new Promise((r) => setTimeout(r, 5));
});

function tab(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent?.includes(name));
}

async function click(el: Element | undefined | null) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

afterEach(() => {
  act(() => mounted?.unmount());
  host?.remove();
  mounted = null;
  host = null;
  document.body.innerHTML = "";
});

describe("Relay", () => {
  it("mounts the Floor with the Now Bar, the glance band and an empty team-jobs lane", async () => {
    const h = await mount(lead);
    expect(h.textContent).toContain("Relay");
    expect(h.textContent).toContain("Pulse");
    expect(h.textContent).toContain("No sessions on your schedule");
    expect(h.textContent).toContain("Today's shift");
    expect(h.textContent).toContain("Team jobs");
    expect(h.textContent).toContain("Post a job");
  });

  it("unfolds the day strip from the gap meter", async () => {
    const h = await mount(lead);
    await click(h.querySelector('[aria-controls="relay-daystrip"]'));
    expect(h.textContent).toContain("The whole day is a gap");
  });

  it("shows the Team tab to a leader and walks every tab without throwing", async () => {
    const h = await mount(lead);
    await click(tab("Mine"));
    expect(h.textContent).toContain("Your list");
    expect(h.textContent).toContain("New reminder");
    await click(tab("Notes"));
    expect(h.textContent).toContain("New note");
    await click(tab("Team"));
    expect(h.textContent).toContain("Your team");
    expect(h.textContent).toContain("Only work with someone's name on it counts");
    await click(tab("Floor"));
    expect(h.textContent).toContain("Today's shift");
  });

  it("offers the Network tab only to a franchise or super role", async () => {
    await mount({ ...(lead as object), role: "FranchiseOwner" });
    expect(tab("Network")).toBeTruthy();
    expect(tab("Team")).toBeTruthy();
  });

  it("never offers the Team tab to a trainer", async () => {
    await mount(trainer);
    expect(tab("Team")).toBeUndefined();
    expect(document.body.textContent).not.toContain("Post a job");
  });

  it("treats a head trainer visiting another studio as a trainer there", async () => {
    await mount({ ...(lead as object), primaryHomeStudioId: "s9" });
    expect(tab("Team")).toBeUndefined();
    expect(document.body.textContent).not.toContain("Post a job");
  });

  it("opens a new note, the task wizard and the job composer", async () => {
    const h = await mount(lead);
    await click(tab("Notes"));
    await click([...h.querySelectorAll("button")].find((b) => b.textContent?.includes("New note")));
    expect(document.body.textContent).toContain("Working notes");
    expect(document.body.textContent).toContain("Share with colleagues");

    await click(tab("Mine"));
    await click([...h.querySelectorAll("button")].find((b) => b.textContent?.includes("New reminder")));
    expect(document.body.textContent).toContain("New reminder");
    expect(document.body.textContent).toContain("1. What");

    await click(tab("Floor"));
    await click([...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Post a job")));
    expect(document.body.textContent).toContain("Post a team job");
  });
});
