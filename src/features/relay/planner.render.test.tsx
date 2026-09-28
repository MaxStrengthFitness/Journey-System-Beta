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

vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "s1",
    activeStudio: { id: "s1", name: "Solon" },
    availableStudios: [{ id: "s1", name: "Solon" }, { id: "s2", name: "Westlake" }],
    network: { id: "n1", name: "MSF Ohio", studioIds: ["s1", "s2"] },
    setActiveStudioId: () => {},
    isChangingStudio: false,
  }),
}));

/** Pending access requests the fake answers `access_requests` with; empty unless a test sets it. */
const fakeData = vi.hoisted(() => ({ accessRequests: [] as { id: string; data: Record<string, unknown> }[] }));

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
      if (target.path === "access_requests" && fakeData.accessRequests.length > 0) {
        const docs = fakeData.accessRequests.map((r) => ({ id: r.id, data: () => r.data }));
        const t = setTimeout(() => next({ ...emptySnap, docs, size: docs.length, empty: false, forEach: (f: (d: unknown) => void) => docs.forEach(f) }), 0);
        return () => clearTimeout(t);
      }
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
  if (currentSection() !== "Relay") await openSection("Relay");
  return host;
}

const settle = () => act(async () => {
  await new Promise((r) => setTimeout(r, 5));
});

/** Relay's own tabs (and any other tab list on screen). */
function tab(name: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent?.includes(name));
}

/*
 * My Studio's sections live in the one header's menu (Relay room, Sep 28
 * 2026): the section button opens it, and each section is a menu item.
 */
function currentSection(): string | null | undefined {
  return document.querySelector(".msh__sect-name")?.textContent;
}

async function sectionNames(): Promise<string[]> {
  await click(document.querySelector(".msh__sect"));
  const names = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].map(
    (b) => b.querySelector(".msh__pop-text")?.firstChild?.textContent ?? "",
  );
  await click(document.querySelector(".msh__sect"));
  return names;
}

async function openSection(name: string) {
  await click(document.querySelector(".msh__sect"));
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].find(
      (b) => b.querySelector(".msh__pop-text")?.firstChild?.textContent === name,
    ),
  );
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
  it("mounts on the Board: Right now, the five doors, the dealt card, Just now, and Floor work's lanes behind its door", async () => {
    const h = await mount(lead);
    expect(h.textContent).toContain("My Studio");
    expect(h.textContent).toContain("Relay");
    // The teammates line is "Just now" (it was "Pulse", the living assessment's name, until Sep 27 2026).
    expect(h.textContent).toContain("Just now");
    expect(h.textContent).toContain("No sessions on your schedule");
    // Right now won't guess how busy the floor is from a list with nothing on it.
    expect(h.querySelector(".rbd-lens")?.textContent).toContain("Relay isn't saying how busy the floor is");
    const doors = [...h.querySelectorAll(".rbd-door .rbd-door__label")].map((d) => d.textContent);
    expect(doors).toEqual(["Floor work", "Desk work", "Help a teammate", "From leadership", "Mine"]);
    expect(h.textContent).toContain("Dealt to you");
    expect(h.textContent).toContain("Nothing waiting on the floor.");
    // Behind Floor work: the shift rings, the floor map and the team jobs, unchanged.
    expect(h.textContent).toContain("Behind Floor work");
    expect(h.querySelectorAll(".shr__ring")).toHaveLength(3);
    expect(h.textContent).toContain("The floor");
    expect(h.textContent).toContain("Team jobs");
    expect(h.textContent).toContain("Post a job");
  });

  it("opens each door on a tap and shows what sits behind it, with the way back to Relay's pick", async () => {
    const h = await mount(lead);
    const door = (label: string) => [...h.querySelectorAll<HTMLButtonElement>(".rbd-door")].find((d) => d.textContent?.includes(label));
    await click(door("Help a teammate"));
    expect(door("Help a teammate")?.getAttribute("aria-pressed")).toBe("true");
    expect(h.textContent).toContain("Behind Help a teammate");
    expect(h.textContent).toContain("Asks from teammates");
    expect(h.textContent).toContain("You opened Help a teammate.");
    await click(door("From leadership"));
    expect(h.textContent).toContain("Behind From leadership");
    expect(h.textContent).toContain("No initiatives from the studio's leaders right now.");
    await click(door("Desk work"));
    expect(h.textContent).toContain("Behind Desk work");
    await click(door("Mine"));
    expect(h.textContent).toContain("Nothing on the board has your name on it right now.");
    await click([...h.querySelectorAll("button")].find((b) => b.textContent?.includes("Back to Relay's pick")));
    expect(h.textContent).toContain("Behind Floor work");
  });

  it("unfolds the day strip from the gap meter", async () => {
    const h = await mount(lead);
    await click(h.querySelector('[aria-controls="relay-daystrip"]'));
    expect(h.textContent).toContain("The whole day is a gap");
  });

  it("has one header: the section and its menu, Relay's tabs, the time, Tracking, Ask and + (Relay room, Sep 28 2026)", async () => {
    const h = await mount(lead);
    // One bar, not three: no masthead, no second row of Relay tabs, no Now Bar.
    expect(h.querySelectorAll("header.msh")).toHaveLength(1);
    expect(h.querySelector(".pl__mast")).toBeNull();
    expect(h.querySelector(".pl__subbar")).toBeNull();
    expect(h.querySelector(".rnb")).toBeNull();
    expect(currentSection()).toBe("Relay");
    expect(await sectionNames()).toEqual(["Relay", "Openings", "Machines", "Team", "Studio"]);
    expect([...h.querySelectorAll('[role="tablist"][aria-label="Relay"] [role="tab"]')].map((t) => t.textContent)).toEqual(["Floor", "Mine", "Notes"]);
    expect(h.querySelector(".msh__track")?.textContent).toBe("Tracking: nothing yet");
    // "Just now" is a still list on the Floor, with nothing ticking.
    expect(h.querySelector(".rjn")?.textContent).toContain("Quiet so far today.");
    // A leader's + holds the studio task and the team job beside their own things.
    await click(h.querySelector(".msh__plus"));
    const plus = [...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent ?? "");
    expect(plus.some((t) => t.startsWith("A to-do for me"))).toBe(true);
    expect(plus.some((t) => t.startsWith("A studio task"))).toBe(true);
    expect(plus.some((t) => t.startsWith("A team job"))).toBe(true);
  });

  it("keeps a trainer's + to their own things", async () => {
    const h = await mount(trainer);
    await click(h.querySelector(".msh__plus"));
    const plus = [...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent ?? "");
    expect(plus.some((t) => t.startsWith("A to-do for me"))).toBe(true);
    expect(plus.some((t) => t.startsWith("A reminder"))).toBe(true);
    expect(plus.some((t) => t.startsWith("A studio task"))).toBe(false);
    expect(plus.some((t) => t.startsWith("A team job"))).toBe(false);
  });

  it("shows the Team section to a leader and walks every tab and section without throwing", async () => {
    const h = await mount(lead);
    await click(tab("Mine"));
    expect(h.textContent).toContain("Your list");
    expect(h.textContent).toContain("New reminder");
    await click(tab("Notes"));
    expect(h.textContent).toContain("New note");
    await openSection("Team");
    expect(h.textContent).toContain("Your team");
    // People and standards (voice-review round, Sep 27 2026): the panels that
    // repeated the Hub (who's in today) and Operations (the month's client
    // groups) are gone, and so are the four tiles and the "Behind" verdict.
    expect(h.textContent).not.toContain("Who's in today");
    expect(h.textContent).not.toContain("This month");
    expect(h.textContent).not.toContain("Renewals due");
    expect(h.textContent).not.toContain("Up for grabs");
    expect(h.textContent).toContain("By name, never ranked.");
    expect(h.textContent).toContain("Only work with someone's name on it counts");
    expect(h.textContent).toContain("The studio's standards");
    expect(h.textContent).toContain("Open loops");
    expect(h.textContent).toContain("The vault");
    // The studio's staff, under the studio's standards (My Studio round).
    expect(h.textContent).toContain("Solon's staff");
    expect(h.textContent).toContain("Temporary");
    // Team is a section, not a Relay tab: the board's tabs are gone while it shows.
    expect(tab("Floor")).toBeUndefined();
    await openSection("Relay");
    await click(tab("Floor"));
    expect(h.textContent).toContain("Dealt to you");
  });

  it("mounts the Studio section for a leader: details, sync, the studio's day, renewals and announcements", async () => {
    const h = await mount(lead);
    await openSection("Studio");
    expect(h.textContent).toContain("Studio details");
    expect(h.textContent).toContain("Journey cutover date");
    expect(h.textContent).toContain("Mindbody Site ID");
    expect(h.textContent).toContain("Mindbody");
    expect(h.textContent).toContain("The studio's day");
    expect(h.textContent).toContain("Deep clean every");
    // Client codex (Sep 2026): the InBody variation, between the day and renewals.
    expect(h.textContent).toContain("InBody: the scanner's normal variation");
    expect(h.textContent).toContain("Max Strength's defaults. Change a number and save to make it this studio's own.");
    expect(h.textContent).toContain("Announcements");
    expect(h.textContent).toContain("Everyone at Solon.");
    // The studio's own notices: no audience picker, the audience is fixed.
    expect(h.textContent).not.toContain("Who gets it");
  });

  it("mounts the Machines section for a trainer: the floor and what other studios shared, nothing that writes", async () => {
    const h = await mount(trainer);
    await openSection("Machines");
    expect(h.textContent).toContain("The floor");
    expect(h.textContent).toContain("Shared by other MSF studios");
    expect(h.textContent).not.toContain("Custom machine");
    expect(h.textContent).not.toContain("Adopt the MSF standard");
  });

  it("mounts the Machines section for a leader without pushing anything onto an empty floor", async () => {
    const h = await mount(lead);
    await openSection("Machines");
    expect(h.textContent).toContain("The floor");
    // An empty floor and an empty catalog: nothing to adopt yet, nothing pushed.
    expect(h.textContent).not.toContain("New in the MSF standard");
  });

  it("shows a trainer the Studio section read only: every field locked, nothing to save or publish (AJ's voice review, Sep 2026)", async () => {
    const h = await mount(trainer);
    await openSection("Studio");
    expect(h.textContent).toContain("Studio details");
    expect(h.textContent).toContain("The studio's day");
    expect(h.textContent).toContain("InBody: the scanner's normal variation");
    expect(h.textContent).toContain("Announcements");
    // Each panel says who changes it.
    expect(h.textContent).toContain("Only this studio's leaders and administrators can change these details.");
    expect(h.textContent).toContain("Only this studio's leaders can change the studio's day.");
    expect(h.textContent).toContain("Only this studio's leaders can change these numbers.");
    expect(h.textContent).toContain("Only this studio's leaders can change these settings.");
    // Nothing that writes is offered.
    const buttons = [...h.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(buttons.some((t) => /Publish|Use Max Strength's defaults|Take down/.test(t))).toBe(false);
    expect(h.textContent).not.toContain("Change a number and save");
    expect(h.textContent).not.toContain("Change anything and save");
    // Every field in the section is locked: disabled itself, or inside a disabled fieldset.
    const fields = [...h.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("#ms-panel input, #ms-panel select, #ms-panel textarea")];
    const locked = (f: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => f.disabled || Boolean(f.closest("fieldset[disabled]"));
    expect(fields.length).toBeGreaterThan(5);
    expect(fields.filter((f) => !locked(f)).map((f) => f.id || f.getAttribute("aria-label") || f.name || f.type)).toEqual([]);
  });

  it("keeps Studio open to change for a trainer the studio's leadership granted the studio", async () => {
    const h = await mount({ ...(trainer as object), managedStudioIds: ["s1"] });
    await openSection("Studio");
    expect(h.textContent).toContain("Use Max Strength's defaults");
    expect(h.textContent).not.toContain("Only this studio's leaders can change the studio's day.");
  });

  it("shows the Team section to a trainer the studio's leadership granted the studio (My Studio, Sep 2026)", async () => {
    const h = await mount({ ...(trainer as object), managedStudioIds: ["s1"] });
    expect(await sectionNames()).toContain("Team");
    await openSection("Team");
    expect(h.textContent).toContain("Your team");
  });

  it("says at the top of Team who is waiting to be let in (voice-review round, Sep 27 2026)", async () => {
    fakeData.accessRequests = [{ id: "r1", data: { status: "Pending", fullName: "Nia New", email: "nia@example.com", userId: "u-nia" } }];
    try {
      const h = await mount(lead);
      await openSection("Team");
      await settle();
      expect(h.textContent).toContain("One person is waiting to be let in.");
      const go = [...h.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Let them in");
      expect(go).toBeDefined();
      // The staff list's own badge counts everyone waiting too.
      expect(h.textContent).toContain("1 waiting");
      expect(h.querySelector("#team-staff")).not.toBeNull();
    } finally {
      fakeData.accessRequests = [];
    }
  });

  it("has no Network tab, even for a franchise owner: it moved to Operations (voice-review round, Sep 27 2026)", async () => {
    // AJ: "Relay must prioritize the trainers transitioning between clients."
    // The network's focus and launch are on Operations → All my studios, and
    // the ranking of studios was dropped.
    const h = await mount({ ...(lead as object), role: "FranchiseOwner" });
    expect(tab("Network")).toBeUndefined();
    expect(tab("Floor")).toBeTruthy();
    expect(tab("Mine")).toBeTruthy();
    expect(tab("Notes")).toBeTruthy();
    expect(await sectionNames()).toContain("Team");
    expect(await sectionNames()).not.toContain("Network");
    expect(h.textContent).not.toContain("Launch an initiative");
    expect(h.textContent).not.toContain("Studios are ranked here");
  });

  it("never offers the Team section to a trainer", async () => {
    await mount(trainer);
    expect(await sectionNames()).not.toContain("Team");
    expect(document.body.textContent).not.toContain("Post a job");
  });

  it("treats a head trainer visiting another studio as a trainer there", async () => {
    await mount({ ...(lead as object), primaryHomeStudioId: "s9" });
    expect(await sectionNames()).not.toContain("Team");
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

  it("keeps Someone for a leader: a trainer offers work on the board instead (AJ, q5)", async () => {
    const h = await mount(trainer);
    await click(h.querySelector(".msh__plus"));
    await click([...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.startsWith("A to-do for me")));
    const labels = [...document.querySelectorAll(".rk-seg button")].map((b) => b.textContent);
    expect(labels).toContain("Me");
    expect(labels).not.toContain("Someone");
  });

  it("captures: the sentence follows the destination and the chips", async () => {
    const h = await mount(lead);
    // The header's + → "A to-do for me" (the floating Capture button went in the Relay room).
    await click(h.querySelector(".msh__plus"));
    await click([...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.startsWith("A to-do for me")));
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
