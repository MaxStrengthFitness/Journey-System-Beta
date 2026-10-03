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
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
  // The Board speaks the hour (mid-shift, or "closed now" after hours), so
  // the test holds the clock at a Thursday mid-morning, Eastern. On the real
  // clock it failed every evening (found Oct 1 2026, at 11:30 pm). Only Date
  // is faked: the settle timers stay real.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T14:30:00Z"));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("mounts on the Board: the parts of the day under the header, the four columns, and Just now (the Relay Board rebuild, Oct 3 2026)", async () => {
    const h = await mount(lead);
    expect(h.textContent).toContain("My Studio");
    expect(h.textContent).toContain("Relay");
    // The teammates line is "Just now" (it was "Pulse", the living assessment's name, until Sep 27 2026).
    expect(h.textContent).toContain("Just now");
    // The parts of the day live in the bar under the header, not in the Board's body.
    const parts = [...h.querySelectorAll(".msh-sub [role='tab']")].map((t) => t.textContent?.replace(/[0-9/✓]+$/, ""));
    expect(parts).toEqual(["Opening", "Between clients", "Close", "This week"]);
    // Nothing on the empty database: each part says so, and how to add to it.
    expect(h.querySelector(".rbd-empty")?.textContent).toContain("Add a studio task or a team job with +.");
    // The doors, the dealt card and the lanes behind them are gone.
    expect(h.querySelector(".rbd-door")).toBeNull();
    expect(h.textContent).not.toContain("Dealt to you");
    // What's new rides in the header.
    expect(h.querySelector(".msh__news .rbn__pill")?.textContent).toBe("All read");
  });

  it("switches the part of the day from the bar under the header", async () => {
    const h = await mount(lead);
    const tabIn = (name: string) => [...h.querySelectorAll<HTMLButtonElement>(".msh-sub [role='tab']")].find((t) => t.textContent?.startsWith(name));
    await click(tabIn("This week"));
    expect(tabIn("This week")?.getAttribute("aria-selected")).toBe("true");
    expect(h.querySelector(".rbd-status")?.textContent).toContain("This week");
    await click(tabIn("Opening"));
    expect(h.querySelector(".rbd-status")?.textContent).toContain("Opening");
  });

  it("has one header: the section and its menu, Relay's tabs, the day, Ask and +, and the bar the Board fills under it (Oct 3 2026)", async () => {
    const h = await mount(lead);
    // One bar, not three: no masthead, no Now Bar; under it only the sub-bar the Board fills.
    expect(h.querySelectorAll("header.msh")).toHaveLength(1);
    expect(h.querySelector(".pl__mast")).toBeNull();
    expect(h.querySelectorAll(".pl__subbar")).toHaveLength(1);
    expect(h.querySelector(".rnb")).toBeNull();
    expect(currentSection()).toBe("Relay");
    expect(await sectionNames()).toEqual(["Relay", "Openings", "Machines", "Team", "Studio"]);
    expect([...h.querySelectorAll('[role="tablist"][aria-label="Relay"] [role="tab"]')].map((t) => t.textContent)).toEqual(["Board", "Tracker", "Journal"]);
    // The time button and Tracking went in the Relay Board rebuild (AJ, Oct 3 2026: "Drop both").
    expect(h.querySelector(".msh__now")).toBeNull();
    expect(h.querySelector(".msh__track")).toBeNull();
    expect(h.querySelector(".msh__day")?.textContent).toBeTruthy();
    // "Just now" is a still list on the Board, with nothing ticking.
    expect(h.querySelector(".rjn")?.textContent).toContain("Quiet so far today.");
    // A leader's + holds the studio task and the team job beside their own things.
    await click(h.querySelector(".msh__plus"));
    const plus = [...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent ?? "");
    expect(plus.some((t) => t.startsWith("A to-do for me"))).toBe(true);
    expect(plus.some((t) => t.startsWith("A studio task"))).toBe(true);
    expect(plus.some((t) => t.startsWith("A team job"))).toBe(true);
  });

  it("opens Ask the team from the header's Ask: six tiles, and + stays for your own things (phase 7)", async () => {
    const h = await mount(trainer);
    await click(h.querySelector(".msh__ask"));
    expect(document.body.textContent).toContain("Ask the team");
    expect([...document.querySelectorAll(".rak-tile__t")].map((t) => t.textContent)).toEqual([
      "Cover me",
      "A hand on the floor",
      "Hand this off",
      "A question",
      "Something's broken",
      "Other",
    ]);
    // Capture, the composer for your own to-dos, is not what Ask opens.
    expect(document.body.textContent).not.toContain("Relay it");
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
    await click(tab("Tracker"));
    // The Tracker (Relay room, Sep 28 2026): your lists by when.
    expect(h.textContent).toContain("Someday · Growth");
    expect(h.textContent).toContain("New reminder");
    await click(tab("Journal"));
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
    expect(tab("Board")).toBeUndefined();
    await openSection("Relay");
    await click(tab("Board"));
    expect(h.querySelector(".rbd-status")).not.toBeNull();
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
    expect(tab("Board")).toBeTruthy();
    expect(tab("Tracker")).toBeTruthy();
    expect(tab("Journal")).toBeTruthy();
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
    await click(tab("Journal"));
    await click([...h.querySelectorAll("button")].find((b) => b.textContent?.includes("New note")));
    expect(document.body.textContent).toContain("Working notes");
    expect(document.body.textContent).toContain("Share with colleagues");

    await click(tab("Tracker"));
    await click([...h.querySelectorAll("button")].find((b) => b.textContent?.includes("New reminder")));
    expect(document.body.textContent).toContain("Capture");
    expect(document.body.textContent).toContain("Relay it");
    // A reminder preset lands with a time, so the bell choices are in view.
    expect(document.body.textContent).toContain("Your bell");
    expect(document.body.textContent).toContain("At the time");
  });

  it("writes in the Journal: six types with their templates, the shelves, the day logs and the Studio shelf (the second wave)", async () => {
    const h = await mount(trainer);
    await click(tab("Journal"));
    expect([...h.querySelectorAll(".jn-type__h")].map((b) => b.textContent)).toEqual(["Client", "Machine", "Protocol", "Research", "Trend", "Personal"]);
    const shelves = [...h.querySelectorAll(".jn-shelf")].map((b) => b.textContent ?? "");
    expect(shelves.some((t) => t.startsWith("Trends · hunches"))).toBe(true);
    expect(shelves.some((t) => t.startsWith("Studio shelf"))).toBe(true);

    // A Machine note: its three lines, its body as "more", and the Studio shelf rather than a client's record.
    await click([...h.querySelectorAll<HTMLButtonElement>(".jn-type")].find((b) => b.textContent?.startsWith("Machine")));
    const labels = [...document.querySelectorAll(".jn-field__l")].map((l) => l.textContent);
    expect(labels).toEqual(["Machine", "What I noticed", "Setting or cue"]);
    expect(document.body.textContent).toContain("More, if you want");
    expect(document.body.textContent).toContain("You can put it on the Studio shelf, which never names a client.");
    expect(document.body.textContent).not.toContain("On the client's record");

    // A Personal note is never shared: no colleagues, no record.
    await click([...h.querySelectorAll<HTMLButtonElement>(".jn-type")].find((b) => b.textContent?.startsWith("Personal")));
    expect([...document.querySelectorAll(".jn-field__l")].map((l) => l.textContent)).toEqual(["What?", "So what?", "Now what?"]);
    expect(document.body.textContent).toContain("Only you. Never shared.");
    expect(document.body.textContent).not.toContain("Share with colleagues");

    // A hunch asks for its sample, and waits for evidence until it is saved.
    await click([...h.querySelectorAll<HTMLButtonElement>(".jn-type")].find((b) => b.textContent?.startsWith("Trend")));
    expect(document.body.textContent).toContain("The sample that would show it");
    expect(document.body.textContent).toContain("Save the hunch, then add evidence each time you see it.");

    await click([...h.querySelectorAll<HTMLButtonElement>(".jn-shelf")].find((b) => b.textContent?.startsWith("Day logs")));
    expect(h.textContent).toContain("No day logs yet");
    await click([...h.querySelectorAll<HTMLButtonElement>(".jn-shelf")].find((b) => b.textContent?.startsWith("Studio shelf")));
    expect(h.textContent).toContain("Nothing on the Studio shelf yet");
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

    await click([...sheet.querySelectorAll("button")].find((b) => b.textContent === "The Board"));
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
    await click([...sheet.querySelectorAll("button")].find((b) => b.textContent === "The Board"));
    expect(sheet.textContent).toContain("About 10 min.");
  });
});
