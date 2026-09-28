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

// Team stands in for any section holding typing: dirty when a test says so.
const team = vi.hoisted(() => ({ dirty: false }));
vi.mock("../../my-studio/TeamSection", async () => {
  const { useUnsavedChanges } = await import("../../unsaved-changes");
  return {
    TeamSection: function TeamSection() {
      useUnsavedChanges(team.dirty, "A standing week");
      return <p>Team</p>;
    },
  };
});

import { ToastProvider } from "../../../contexts/ToastContext";
import { MyStudioView } from "../../my-studio/MyStudioView";
import { openMyStudioSection, rememberedMyStudioSection } from "../../my-studio/section-memory";
import { forgetPersonalMemory } from "../../sign-out/memory";
import { UnsavedChangesProvider } from "../../unsaved-changes";
import { rememberedOpeningsPart, rememberedWhoseTimes, showOpenings } from "./part-memory";

const lead = { id: "t-lead", fullName: "Lee Leader", role: "HeadTrainer", primaryHomeStudioId: "s1", accessibleStudioIds: ["s1"] } as never;
const trainer = { ...(lead as object), role: "LifeTransformer" } as never;
const elsewhere = { id: "t-far", fullName: "Far Away", role: "LifeTransformer", primaryHomeStudioId: "s2", accessibleStudioIds: ["s2"] } as never;

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  forgetPersonalMemory();
  team.dirty = false;
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
    await act(async () => openMyStudioSection("openings", () => showOpenings("next", { kind: "anyone" })));
    await settle();
    expect(tab("Openings")?.getAttribute("aria-selected")).toBe("true");
    // The door's part, set as the move happened and read as the section mounted.
    expect(h.querySelector("#op-tab-next")?.getAttribute("aria-selected")).toBe("true");
    await click(h.querySelector("#op-tab-usual"));
    expect(h.textContent).toContain("The usual week is built early each Sunday.");
    forgetPersonalMemory();
    expect(rememberedMyStudioSection()).toBe("relay");
    expect(rememberedOpeningsPart()).toBe("usual");
  });

  it("a door asks about typing first, and 'Keep editing' keeps the section and the memory where they were", async () => {
    team.dirty = true;
    await mount(lead);
    await click(tab("Team"));
    expect(rememberedMyStudioSection()).toBe("team");
    await act(async () => openMyStudioSection("openings", () => showOpenings("next", { kind: "anyone" })));
    await settle();
    const keep = document.querySelector('[data-action="keep-editing"]');
    await click(keep);
    expect(tab("Team")?.getAttribute("aria-selected")).toBe("true");
    // The next plain open of My Studio lands where they stayed, not where they chose not to go,
    // and the next plain open of Openings where it was, not on the part the door would have set.
    expect(rememberedMyStudioSection()).toBe("team");
    expect(rememberedOpeningsPart()).toBe("usual");
    expect(rememberedWhoseTimes()).toBeNull();
  });

  it("with no My Studio on screen, a door only remembers the section", () => {
    openMyStudioSection("openings");
    expect(rememberedMyStudioSection()).toBe("openings");
  });
});
