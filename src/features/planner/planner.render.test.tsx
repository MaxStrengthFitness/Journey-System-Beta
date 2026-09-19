// @vitest-environment jsdom
/**
 * MY STUDIO MOUNTS — every section and every Relay tab, and the dialogs a
 * tap opens.
 *
 * Round: Planner rework, Sep 2026; My Studio round, Sep 2026 (the shell is
 * MyStudioView now, with Relay as its first section and Team as a section
 * of its own). A clean typecheck, a green suite and a
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
    availableStudios: [{ id: "s1", name: "Solon" }, { id: "s2", name: "Westlake" }],
    network: { id: "n1", name: "MSF Ohio", studioIds: ["s1", "s2"] },
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

import { ToastProvider } from "../../contexts/ToastContext";
import { MyStudioView } from "../my-studio/MyStudioView";

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
          <MyStudioView authTrainer={authTrainer as never} clients={[]} trainers={[lead]} />
        </ToastProvider>
      </StrictMode>,
    );
  });
  await settle();
  // The shell remembers the last section on this iPad (module memory), so a
  // test that ended on Team would hand the next one a board with no tabs.
  // Start each test on Relay, the way a person would tap back to it.
  const relay = tab("Relay");
  if (relay && relay.getAttribute("aria-selected") !== "true") await click(relay);
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

describe("My Studio", () => {
  it("mounts on Relay's Floor with the Now Bar, Next up, the shift rings and an empty team-jobs lane", async () => {
    const h = await mount(lead);
    expect(h.textContent).toContain("My Studio");
    expect(h.textContent).toContain("Relay");
    expect(h.textContent).toContain("Pulse");
    expect(h.textContent).toContain("No sessions on your schedule");
    expect(h.textContent).toContain("Next up");
    expect(h.textContent).toContain("Nothing waiting on the Floor.");
    expect(h.querySelectorAll(".sr__ring")).toHaveLength(3);
    expect(h.textContent).toContain("The floor");
    expect(h.textContent).toContain("Team jobs");
    expect(h.textContent).toContain("Post a job");
  });

  it("unfolds the day strip from the gap meter", async () => {
    const h = await mount(lead);
    await click(h.querySelector('[aria-controls="relay-daystrip"]'));
    expect(h.textContent).toContain("The whole day is a gap");
  });

  it("shows the Team section to a leader and walks every tab and section without throwing", async () => {
    const h = await mount(lead);
    await click(tab("Mine"));
    expect(h.textContent).toContain("Your list");
    expect(h.textContent).toContain("New reminder");
    await click(tab("Notes"));
    expect(h.textContent).toContain("New note");
    await click(tab("Team"));
    expect(h.textContent).toContain("Your team");
    expect(h.textContent).toContain("Who's in today");
    expect(h.textContent).toContain("Open loops");
    expect(h.textContent).toContain("This month");
    expect(h.textContent).toContain("Renewals due");
    expect(h.textContent).toContain("The vault");
    expect(h.textContent).toContain("Only work with someone's name on it counts");
    // The studio's staff, under the cockpit (My Studio round).
    expect(h.textContent).toContain("Solon's staff");
    expect(h.textContent).toContain("Temporary");
    // Team is a section, not a Relay tab: the board's tabs are gone while it shows.
    expect(tab("Floor")).toBeUndefined();
    await click(tab("Relay"));
    await click(tab("Floor"));
    expect(h.textContent).toContain("Next up");
  });

  it("mounts the Studio section for a leader: details, sync, the studio's day, renewals and announcements", async () => {
    const h = await mount(lead);
    await click(tab("Studio"));
    expect(h.textContent).toContain("Studio details");
    expect(h.textContent).toContain("Journey cutover date");
    expect(h.textContent).toContain("Mindbody Site ID");
    expect(h.textContent).toContain("Mindbody");
    expect(h.textContent).toContain("The studio's day");
    expect(h.textContent).toContain("Deep clean every");
    expect(h.textContent).toContain("Announcements");
    expect(h.textContent).toContain("Everyone at Solon.");
    // The studio's own notices: no audience picker, the audience is fixed.
    expect(h.textContent).not.toContain("Who gets it");
  });

  it("mounts the Machines section for a trainer: the floor and what other studios shared, nothing that writes", async () => {
    const h = await mount(trainer);
    await click(tab("Machines"));
    expect(h.textContent).toContain("The floor");
    expect(h.textContent).toContain("Shared by other MSF studios");
    expect(h.textContent).not.toContain("Custom machine");
    expect(h.textContent).not.toContain("Adopt the MSF standard");
  });

  it("mounts the Machines section for a leader without pushing anything onto an empty floor", async () => {
    const h = await mount(lead);
    await click(tab("Machines"));
    expect(h.textContent).toContain("The floor");
    // An empty floor and an empty catalog: nothing to adopt yet, nothing pushed.
    expect(h.textContent).not.toContain("New in the MSF standard");
  });

  it("never offers the Studio section to a trainer", async () => {
    await mount(trainer);
    expect(tab("Studio")).toBeUndefined();
  });

  it("shows the Team section to a trainer the studio's leadership granted the studio (My Studio, Sep 2026)", async () => {
    const h = await mount({ ...(trainer as object), managedStudioIds: ["s1"] });
    expect(tab("Team")).toBeTruthy();
    await click(tab("Team"));
    expect(h.textContent).toContain("Your team");
  });

  it("offers the Network tab only to a franchise or super role, and it mounts", async () => {
    const h = await mount({ ...(lead as object), role: "FranchiseOwner" });
    expect(tab("Network")).toBeTruthy();
    expect(tab("Team")).toBeTruthy();
    await click(tab("Network"));
    expect(h.textContent).toContain("The network");
    expect(h.textContent).toContain("Launch an initiative");
    expect(h.textContent).toContain("Studios are ranked here; people never are.");
  });

  it("never offers the Team section to a trainer", async () => {
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
    expect(document.body.textContent).toContain("Capture");
    expect(document.body.textContent).toContain("Relay it");
    // A reminder preset lands with a time, so the bell choices are in view.
    expect(document.body.textContent).toContain("Your bell");
    expect(document.body.textContent).toContain("At the time");
  });

  it("captures: the sentence follows the destination and the chips", async () => {
    const h = await mount(lead);
    await click(h.querySelector(".cf"));
    const sheet = document.body;
    expect(sheet.textContent).toContain("Say what it is, then who it's for.");
    const text = sheet.querySelector<HTMLTextAreaElement>(".cs__text");
    expect(text).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(text, "Deep-clean the leg press");
      text!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect(sheet.textContent).toContain("For you, today. Only you see it.");

    await click([...sheet.querySelectorAll("button")].find((b) => b.textContent === "The Floor"));
    expect(sheet.textContent).toContain("Anyone at Solon can take it.");
    // A leader is offered the studio-task form and the ask kinds.
    expect(sheet.textContent).toContain("A studio task");
    expect(sheet.textContent).toContain("Heads-up");

    await click([...sheet.querySelectorAll("button")].find((b) => b.textContent === "Someone"));
    expect(sheet.textContent).toContain("Hand it to one person");

    // Relay it with nobody named: the problem shows, nothing is written.
    await click([...sheet.querySelectorAll("button")].find((b) => b.textContent === "Relay it"));
    expect(sheet.textContent).toContain("Name who it goes to.");

    await click([...sheet.querySelectorAll("button")].find((b) => b.textContent?.includes("~min")));
    await click([...sheet.querySelectorAll("button")].find((b) => b.textContent === "~10 min"));
    await click([...sheet.querySelectorAll("button")].find((b) => b.textContent === "The Floor"));
    expect(sheet.textContent).toContain("About 10 min.");
  });
});
