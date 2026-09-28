// @vitest-environment jsdom
/**
 * OPENING A STUDIO MOUNTS — Launches listing the studios opening with a word
 * for each block and what is overdue; a checklist that couldn't be read
 * saying so; the three-screen Add a studio sheet writing the studio with its
 * stage, its franchise link and the standard set; a studio's checklist
 * ticking, skipping with a reason and handing over, each change then
 * recorded; and the Opening panel writing only what changed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  items: {} as Record<string, Record<string, Record<string, unknown>> | "fail">,
  rosters: {} as Record<string, number>,
  writes: [] as Array<{ op: string; path: string; data?: unknown }>,
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-tuor" } } }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));
vi.mock("../../../lib/authed-fetch", () => ({ authedFetch: async () => ({ ok: true, json: async () => ({ locations: [] }) }) }));
vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => {
    const first = parts[0] as { path?: string } | undefined;
    const base = first && typeof first === "object" && typeof first.path === "string" ? [first.path] : [];
    const path = [...base, ...parts.filter((p) => typeof p === "string")].join("/");
    return { path, id: path.split("/").pop() ?? "id" };
  };
  return {
    collection: ref,
    doc: ref,
    getDocs: async (r: { path: string }) => {
      const [, studioId, sub] = r.path.split("/");
      if (sub === "setupItems") {
        const v = state.items[studioId] ?? {};
        if (v === "fail") throw new Error("Missing or insufficient permissions.");
        return { docs: Object.entries(v).map(([id, data]) => ({ id, data: () => data })) };
      }
      if (sub === "roster") {
        const n = state.rosters[studioId] ?? 0;
        return { docs: Array.from({ length: n }, (_, i) => ({ id: `m${i}`, data: () => ({ status: "active" }) })) };
      }
      return { docs: [] };
    },
    setDoc: async (r: { path: string }, data: unknown) => void state.writes.push({ op: "set", path: r.path, data }),
    updateDoc: async (r: { path: string }, data: unknown) => void state.writes.push({ op: "update", path: r.path, data }),
    deleteDoc: async (r: { path: string }) => void state.writes.push({ op: "delete", path: r.path }),
    addDoc: async (r: { path: string }, data: unknown) => {
      state.writes.push({ op: "add", path: r.path, data });
      return { id: r.path === "studios" ? "helms-deep" : "entry" };
    },
    writeBatch: () => {
      const staged: Array<{ op: string; path: string; data?: unknown }> = [];
      return {
        set: (r: { path: string }, data: unknown) => staged.push({ op: "batch-set", path: r.path, data }),
        update: (r: { path: string }, data: unknown) => staged.push({ op: "batch-update", path: r.path, data }),
        commit: async () => void state.writes.push(...staged),
      };
    },
    deleteField: () => "<delete>",
    serverTimestamp: () => "SERVER_TIME",
  };
});

import { UnsavedChangesProvider, useLeaveGuard } from "../../unsaved-changes";
import { LaunchesPage } from "./LaunchesPage";
import { SetupChecklist } from "./SetupChecklist";
import { OpeningPanel } from "./OpeningPanel";
import type { FranchiseNetwork, Studio, Trainer } from "../../../types";
import type { MachineCatalogEntry } from "../../../types/machines";

const tz = "America/New_York";
// The studios opening, a studio already running, and one with no stage recorded.
const studios = [
  { id: "edoras", name: "Edoras", timezone: tz, stage: "setting-up", openingDay: "2027-01-12", mindbodySiteId: "7120334", contactEmail: "e@x.com", phone: "1" },
  { id: "aglarond", name: "Aglarond", timezone: tz, stage: "handed-over", openingDay: "2026-09-01", mindbodySiteId: "7120335" },
  { id: "minas-tirith", name: "Minas Tirith", timezone: tz, stage: "running", mindbodySiteId: "29068" },
  { id: "dol-amroth", name: "Dol Amroth", timezone: tz, mindbodySiteId: "5746957" },
] as unknown as Studio[];
const networks = [{ id: "rohan", name: "The Riddermark", studioIds: [] }] as unknown as FranchiseNetwork[];
const tuor = { id: "t-tuor", fullName: "Tuor", initials: "TU", role: "Admin", primaryHomeStudioId: "minas-tirith", accessibleStudioIds: [], activeGuestStudioIds: [] } as unknown as Trainer;
const trainers = [
  tuor,
  { id: "t-eowyn", fullName: "Éowyn", initials: "EO", role: "StudioLeader", primaryHomeStudioId: "edoras", accessibleStudioIds: [], activeGuestStudioIds: [], mindbodyStaffId: "1" },
] as unknown as Trainer[];
const catalog = [
  { id: "m-leg-press", name: "Leg Press", status: "active" },
  { id: "m-lumbar", name: "Lumbar Extension", status: "active" },
  { id: "m-old", name: "Old Machine", status: "retired" },
] as unknown as MachineCatalogEntry[];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T13:00:00Z"));
  state.items = { edoras: {}, aglarond: {} };
  state.rosters = { edoras: 19, aglarond: 20 };
  state.writes.length = 0;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
};
async function mount(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <UnsavedChangesProvider>{node}</UnsavedChangesProvider>
      </StrictMode>,
    );
  });
  await settle();
  return host;
}
const click = async (el: Element | null | undefined) => {
  expect(el, "element to click").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
};
async function typeInto(input: HTMLInputElement | null, text: string) {
  expect(input, "input").toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, text);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function choose(select: HTMLSelectElement | null, value: string) {
  expect(select, "select").toBeTruthy();
  await act(async () => {
    select!.value = value;
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const button = (el: ParentNode, text: string) => [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim() === text);
const launchesPage = (onOpenStudio = vi.fn(), onRefresh = vi.fn(async () => {})) => (
  <LaunchesPage
    studios={studios}
    networks={networks}
    trainers={trainers}
    authTrainer={tuor}
    catalog={catalog}
    catalogLoading={false}
    onOpenStudio={onOpenStudio}
    onRefresh={onRefresh}
  />
);

describe("Launches", () => {
  it("lists the studios opening, soonest first, each block in a word, and what is overdue", async () => {
    const opened = vi.fn();
    const el = await mount(launchesPage(opened));
    const rows = [...el.querySelectorAll(".hq-launch")];
    expect(rows.map((r) => r.querySelector(".hq-launch__name")?.textContent)).toEqual(["Aglarond", "Edoras"]);
    const edoras = rows[1];
    expect(edoras.querySelector(".hq-launch__when")?.textContent).toBe("Setting up · opens Tue, Jan 12, 2027");
    expect([...edoras.querySelectorAll(".hq-launch__cell")].map((c) => c.textContent)).toEqual([
      "The studioOverdue since Tue, Sep 22",
      "MindbodyDue Tue, Oct 13",
      "The floorDue Tue, Nov 3",
      // Éowyn leads it, and she is linked to Mindbody staff: People ticked itself.
      "PeopleDone",
      "First weekAfter Tue, Jan 12",
    ]);
    expect(edoras.querySelector(".hq-launch__say")?.textContent).toBe("Not ready to hand over: 3 things left.");
    expect(rows[0].querySelector(".hq-launch__say")?.textContent).toContain("Handed over.");
    // Overdue across every studio opening, said once at the top, a line per studio.
    expect(el.textContent).toContain("Overdue: Aglarond, 8 items, the oldest “Business email, phone and address”, due Tue, May 12, 2026;");
    expect(el.textContent).toContain("Edoras's “Business email, phone and address”, due Tue, Sep 22, 2026.");
    await click(edoras);
    expect(opened).toHaveBeenCalledWith("edoras");
  });

  it("says a checklist it couldn't read, and never that nothing is done", async () => {
    state.items.edoras = "fail";
    const el = await mount(launchesPage());
    const edoras = [...el.querySelectorAll(".hq-launch")].find((r) => r.textContent?.includes("Edoras"))!;
    expect(edoras.textContent).toContain("Couldn't read its checklist just now");
    expect(edoras.querySelector(".hq-launch__cell")).toBeNull();
    expect(el.textContent).not.toContain("Nothing is overdue.");
  });

  it("adds a studio in three screens: who and where, Mindbody, the floor", async () => {
    const opened = vi.fn();
    const refresh = vi.fn(async () => {});
    const el = await mount(launchesPage(opened, refresh));
    await click(button(el, "Add a studio"));
    const sheet = () => document.querySelector<HTMLElement>('[role="dialog"][aria-label="Add a studio"]')!;
    expect(sheet().textContent).toContain("Step 1 of 3 · Who and where");
    expect(button(sheet(), "Continue")!.disabled).toBe(true);
    await typeInto(sheet().querySelector("#hq-new-name"), "Aglarond North");
    await choose(sheet().querySelector("#hq-new-network"), "rohan");
    await typeInto(sheet().querySelector("#hq-new-day"), "2027-01-19");
    await click(button(sheet(), "Continue"));
    expect(sheet().textContent).toContain("Step 2 of 3 · Mindbody");
    await choose(sheet().querySelector("#hq-new-mode"), "offline");
    await click(button(sheet(), "Continue"));
    expect(sheet().textContent).toContain("Step 3 of 3 · The floor");
    expect(sheet().textContent).toContain("Start Aglarond North on the MSF standard set: 2 machines.");
    expect(sheet().textContent).toContain("Aglarond North is added to The Riddermark, as setting up, opening Tue, Jan 19, 2027.");
    await click(button(sheet(), "Create Aglarond North"));
    expect(state.writes[0]).toEqual({
      op: "add",
      path: "studios",
      data: {
        name: "Aglarond North",
        timezone: tz,
        ownerId: "t-tuor",
        mindbodyMode: "offline",
        locationType: "franchise",
        stage: "setting-up",
        openingDay: "2027-01-19",
        createdAt: "SERVER_TIME",
      },
    });
    // Both sides of the franchise link, then the standard set onto its floor.
    expect(state.writes.filter((w) => w.op === "batch-update").map((w) => w.path).sort()).toEqual(["networks/rohan", "studios/helms-deep"]);
    expect(state.writes.filter((w) => w.op === "batch-set").map((w) => w.path)).toEqual(["studios/helms-deep/roster/m-leg-press", "studios/helms-deep/roster/m-lumbar"]);
    // Adding a studio is not recorded (AJ, q1).
    expect(state.writes.some((w) => w.path === "activity")).toBe(false);
    expect(refresh).toHaveBeenCalledWith("studios");
    expect(opened).toHaveBeenCalledWith("helms-deep");
    expect(document.querySelector('[aria-label="Add a studio"]')).toBeNull();
  });

  it("asks before a half-typed new studio is lost", async () => {
    function Harness() {
      const guard = useLeaveGuard();
      const [left, setLeft] = useState(false);
      return left ? (
        <p>Left</p>
      ) : (
        <>
          <button type="button" onClick={() => guard(() => setLeft(true))}>
            Go elsewhere
          </button>
          {launchesPage()}
        </>
      );
    }
    const el = await mount(<Harness />);
    await click(button(el, "Add a studio"));
    await typeInto(document.querySelector("#hq-new-name"), "Isengard");
    await click(button(el, "Go elsewhere"));
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("the new studio");
    await click(document.querySelector('[data-action="keep-editing"]'));
    expect(document.querySelector<HTMLInputElement>("#hq-new-name")?.value).toBe("Isengard");
  });

  it("says when no studio is opening", async () => {
    host = null;
    const el = await mount(
      <LaunchesPage studios={[studios[2], studios[3]]} networks={[]} trainers={[]} authTrainer={tuor} catalog={[]} catalogLoading={false} onOpenStudio={() => {}} />,
    );
    expect(el.textContent).toContain("No studio is opening right now");
  });
});

describe("a studio's checklist", () => {
  const checklist = (studio: Studio, onStageChanged = vi.fn(async () => {})) => (
    <SetupChecklist studio={studio} studios={studios} trainers={trainers} byName="Tuor" onStageChanged={onStageChanged} />
  );

  it("ticks an item, then records it", async () => {
    const el = await mount(checklist(studios[0]));
    expect(el.textContent).toContain("Not ready to hand over: 3 things left.");
    expect(el.textContent).toContain("Next due: Business email, phone and address, Tue, Sep 22, 2026.");
    await click(el.querySelector('[aria-label="Tick Each unit\'s name and starting settings checked"]'));
    expect(state.writes[0]).toEqual({
      op: "set",
      path: "studios/edoras/setupItems/floor-names",
      data: {
        block: "floor",
        title: "Each unit's name and starting settings checked",
        dueOn: "2026-11-03",
        doneAt: "SERVER_TIME",
        doneBy: { uid: "uid-tuor", name: "Tuor" },
      },
    });
    expect(state.writes[1]).toMatchObject({
      op: "add",
      path: "activity",
      data: { kind: "studio-stage", studioId: "edoras", what: "Ticked “Each unit's name and starting settings checked” on Edoras's setup checklist." },
    });
  });

  it("skips an item only with a reason, kept with it", async () => {
    const el = await mount(checklist(studios[0]));
    await click(el.querySelector('[aria-label="Skip Journey cutover date set"]'));
    const skip = button(el, "Skip it")!;
    expect(skip.disabled).toBe(true);
    await typeInto(el.querySelector("#hq-skip-cutover"), "Moves over after the January batch.");
    await click(button(el, "Skip it"));
    expect(state.writes[0]).toEqual({
      op: "set",
      path: "studios/edoras/setupItems/cutover",
      data: {
        block: "mindbody",
        title: "Journey cutover date set",
        dueOn: "2026-10-13",
        doneAt: null,
        doneBy: { uid: "uid-tuor", name: "Tuor" },
        skipReason: "Moves over after the January batch.",
      },
    });
    expect((state.writes[1].data as { after: unknown }).after).toEqual({ Reason: "Moves over after the January batch." });
  });

  it("says a skip and puts it back; a template item goes back to the template", async () => {
    state.items.edoras = { cutover: { block: "mindbody", title: "x", doneAt: null, doneBy: { uid: "u", name: "Idril" }, skipReason: "Later." } };
    const el = await mount(checklist(studios[0]));
    expect(el.textContent).toContain("Idril: “Later.”");
    await click(el.querySelector('[aria-label="Put it back: Journey cutover date set"]'));
    expect(state.writes[0]).toEqual({ op: "delete", path: "studios/edoras/setupItems/cutover" });
  });

  it("offers Mark it handed over once blocks one to four are done or skipped, and sets the stage", async () => {
    const ready = { ...studios[0], address: "Meduseld", journeyCutoverDate: "2027-01-12" } as Studio;
    state.items.edoras = { "floor-names": { block: "floor", title: "x", doneAt: { toMillis: () => 1 }, doneBy: { uid: "u", name: "Tuor" } } };
    const changed = vi.fn(async () => {});
    const el = await mount(checklist(ready, changed));
    expect(el.textContent).toContain("Ready to hand over.");
    await click(button(el, "Mark it handed over"));
    expect(state.writes[0]).toEqual({ op: "update", path: "studios/edoras", data: { stage: "handed-over" } });
    expect((state.writes[1].data as { what: string }).what).toBe("Set Edoras's stage to Handed over.");
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("says it couldn't read the checklist, with Try again", async () => {
    state.items.edoras = "fail";
    const el = await mount(checklist(studios[0]));
    expect(el.textContent).toContain("Couldn't read Edoras's checklist just now");
    expect(button(el, "Try again")).toBeTruthy();
  });
});

describe("the Opening panel", () => {
  it("writes only what changed, then records it", async () => {
    const saved = vi.fn(async () => {});
    const el = await mount(<OpeningPanel studio={studios[3]} byName="Tuor" onSaved={saved} />);
    expect(el.querySelector<HTMLSelectElement>("#hq-opening-stage")?.value).toBe("");
    await choose(el.querySelector("#hq-opening-stage"), "setting-up");
    await typeInto(el.querySelector("#hq-opening-day"), "2027-02-02");
    await click(button(el, "Save changes"));
    expect(state.writes[0]).toEqual({ op: "update", path: "studios/dol-amroth", data: { stage: "setting-up", openingDay: "2027-02-02" } });
    expect(state.writes[1]).toMatchObject({
      op: "add",
      path: "activity",
      data: {
        kind: "studio-stage",
        studioId: "dol-amroth",
        what: "Set Dol Amroth's stage to Setting up and its opening day to Tue, Feb 2, 2027.",
        before: { Stage: "Not recorded", "Opening day": "Not set" },
        after: { Stage: "Setting up", "Opening day": "Tue, Feb 2, 2027" },
      },
    });
    expect(saved).toHaveBeenCalledTimes(1);
  });
});
