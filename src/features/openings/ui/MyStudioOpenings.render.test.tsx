// @vitest-environment jsdom
/**
 * OPENINGS IN MY STUDIO'S SHELL (Openings round, phase 4), mounted with the
 * real MyStudioView over a Firestore that answers every read with nothing:
 * the masthead's sections are Relay · Openings · Machines (· Team · Studio
 * for a leader), a trainer who works at the studio opens Openings, someone
 * who doesn't never sees it, a door on another section can send someone
 * there, and the part this iPad was on is remembered until sign-out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "t-lead" } }, functions: {} }));
vi.mock("../../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "s1",
    activeStudio: { id: "s1", name: "Solon", timezone: "America/New_York", mindbodySiteId: "5746957" },
    availableStudios: [{ id: "s1", name: "Solon" }],
    setActiveStudioId: () => {},
    isChangingStudio: false,
  }),
}));
vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/"), id: "id" });
  const emptySnap = { docs: [], size: 0, empty: true, forEach: () => {}, metadata: { fromCache: false, hasPendingWrites: false }, docChanges: () => [] };
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
    onSnapshot: (target: { path: string }, a: unknown, b?: unknown, c?: unknown) => {
      const next = [a, b, c].find((f) => typeof f === "function") as (s: unknown) => void;
      const isDoc = target.path.split("/").length % 2 === 0;
      const t = setTimeout(() => next(isDoc ? emptyDoc : emptySnap), 0);
      return () => clearTimeout(t);
    },
    getDocs: async () => emptySnap,
    getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
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

import { ToastProvider } from "../../../contexts/ToastContext";
import { MyStudioView } from "../../my-studio/MyStudioView";
import { openMyStudioSection, rememberedMyStudioSection } from "../../my-studio/section-memory";
import { forgetPersonalMemory } from "../../sign-out/memory";
import { UnsavedChangesProvider } from "../../unsaved-changes";
import { rememberedOpeningsPart } from "./part-memory";

const lead = { id: "t-lead", fullName: "Lee Leader", role: "HeadTrainer", primaryHomeStudioId: "s1", accessibleStudioIds: ["s1"] } as never;
const trainer = { ...(lead as object), role: "LifeTransformer" } as never;
const elsewhere = { id: "t-far", fullName: "Far Away", role: "LifeTransformer", primaryHomeStudioId: "s2", accessibleStudioIds: ["s2"] } as never;

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  forgetPersonalMemory();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = "";
});

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });

async function mount(authTrainer: unknown) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <ToastProvider>
          <UnsavedChangesProvider>
            <MyStudioView authTrainer={authTrainer as never} clients={[]} trainers={[lead]} />
          </UnsavedChangesProvider>
        </ToastProvider>
      </StrictMode>,
    );
  });
  await settle();
  return host;
}

const sections = () => [...document.querySelectorAll<HTMLButtonElement>('[aria-label="My Studio"] [role="tab"]')].map((b) => b.textContent);
const tab = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent?.includes(name));
async function click(el: Element | undefined | null) {
  expect(el).toBeTruthy();
  await act(async () => (el as HTMLElement).click());
  await settle();
}

describe("Openings in My Studio", () => {
  it("sits second, for a trainer who works at the studio, and opens on The usual week", async () => {
    const h = await mount(trainer);
    expect(sections()).toEqual(["Relay", "Openings", "Machines"]);
    await click(tab("Openings"));
    expect(tab("Openings")?.getAttribute("aria-selected")).toBe("true");
    expect(tab("The usual week")?.getAttribute("aria-selected")).toBe("true");
    const parts = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Openings"] [role="tab"]')].map((b) => b.textContent);
    expect(parts).toEqual(["The usual week", "Next 7 days", "A new regular time", "Who's usually in"]);
    // Every part mounts in the real shell, over a database with nothing in it.
    await click(tab("Next 7 days"));
    await click(tab("A new regular time"));
    expect(h.textContent).toContain("Safe to show a client");
    await click(tab("Who's usually in"));
    expect(h.textContent).toContain("Lee Leader");
    expect(rememberedOpeningsPart()).toBe("who");
    await click(tab("The usual week"));
    // Nothing has been built for Solon yet: said, not an empty grid.
    expect(h.textContent).toContain("The usual week is built early each Sunday. The first one comes this Sunday.");
    expect(rememberedMyStudioSection()).toBe("openings");
  });

  it("sits between Relay and Machines for a leader, beside Team and Studio", async () => {
    await mount(lead);
    expect(sections()).toEqual(["Relay", "Openings", "Machines", "Team", "Studio"]);
  });

  it("isn't there for someone who doesn't work at the studio", async () => {
    await mount(elsewhere);
    expect(sections()).toEqual(["Relay", "Machines"]);
  });

  it("opens from a door on another section, and a sign-out forgets it", async () => {
    const h = await mount(lead);
    await click(tab("Team"));
    await act(async () => openMyStudioSection("openings"));
    await settle();
    expect(tab("Openings")?.getAttribute("aria-selected")).toBe("true");
    expect(h.textContent).toContain("The usual week is built early each Sunday.");
    forgetPersonalMemory();
    expect(rememberedMyStudioSection()).toBe("relay");
    expect(rememberedOpeningsPart()).toBe("usual");
  });
});
