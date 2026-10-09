// @vitest-environment jsdom
/**
 * MY STUDIO → STUDIO → STARTING ROUTINES, MOUNTED (the design round, Oct 8
 * 2026; AJ: "studios will chose their own, admins will create the routines
 * to pick from in the app during beta").
 *
 * The real panel and the real `useStartingRoutines`, over the store's two
 * reads held open until the test answers them, and its write recorded. What
 * matters is silent when wrong:
 *   - nothing is written until a leader presses Save, and Save writes the
 *     whole choice, signed with the Auth uid;
 *   - a trainer reads it in words (never faded, locked boxes), with a line
 *     saying who changes it;
 *   - what a tick means is measured from what was last SAVED: after a save
 *     the studio's own list stays its own, even with every routine ticked;
 *   - while a read hasn't answered it never says "none" or offers a save,
 *     and a read that failed says so;
 *   - before head office has added any, it says Start a plan offers the
 *     Academy's eleven.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const store = vi.hoisted(() => ({
  routineReads: [] as Array<Deferred<unknown>>,
  choiceReads: [] as Array<Deferred<unknown>>,
  saves: [] as Array<{ studioId: string; choice: unknown; uid: string }>,
}));

vi.mock("../../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-leader" } } }));
vi.mock("../starting-store", () => ({
  readStartingRoutines: () => {
    const d = deferred<unknown>();
    store.routineReads.push(d);
    return d.promise;
  },
  readStartingChoice: () => {
    const d = deferred<unknown>();
    store.choiceReads.push(d);
    return d.promise;
  },
  saveStartingChoice: async (_db: unknown, studioId: string, choice: unknown, uid: string) => {
    store.saves.push({ studioId, choice, uid });
  },
}));

const toasts = vi.hoisted(() => [] as string[]);
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ success: (m: string) => toasts.push(m), error: (m: string) => toasts.push(m), info: () => {} }),
}));

vi.mock("../../../hooks/useMachineCatalog", () => {
  const catalog = [{ id: "m-sled", name: "Sled" }];
  const byId = Object.fromEntries(catalog.map((m) => [m.id, m]));
  return { useMachineCatalog: () => ({ catalog, byId, loading: false, failed: false }) };
});

const { StartingRoutinesPanel } = await import("./StartingRoutinesPanel");
import type { StartingRoutine } from "../starting-routines";

const company = (id: string, name: string, dayOne: string[], extra: Partial<StartingRoutine> = {}): StartingRoutine => ({
  id,
  name,
  machineIds: dayOne,
  dayOne,
  matchWords: [],
  isDefault: false,
  tier: "company",
  ...extra,
});

const ROUTINES: StartingRoutine[] = [
  company("academy-knee", "Knee issues", ["m-leg-press", "m-leg-curl"], { isDefault: true }),
  company("academy-low-back", "Low back issues with a very long name that has to wrap on an upright iPad", ["m-leg-press", "m-compound-row", "m-lumbar"]),
  { ...company("own-sled", "Westlake's sled start", ["m-sled"]), tier: "studio", studioId: "westlake" },
];

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  store.routineReads.length = 0;
  store.choiceReads.length = 0;
  store.saves.length = 0;
  toasts.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

async function mount(canEdit: boolean) {
  await act(async () => {
    root.render(
      <StrictMode>
        <StartingRoutinesPanel studioId="westlake" studioName="Westlake" canEdit={canEdit} />
      </StrictMode>,
    );
  });
}

/** Both reads answered (every read StrictMode made). */
async function answer(routines: StartingRoutine[] | Error, choice: { use: string[] | null; defaultId: string | null } | Error) {
  for (const d of store.routineReads) {
    if (routines instanceof Error) d.reject(routines);
    else d.resolve({ routines, known: true });
  }
  for (const d of store.choiceReads) {
    if (choice instanceof Error) d.reject(choice);
    else d.resolve(choice);
  }
  await settle();
}

const seeBox = (name: string) => host.querySelector<HTMLInputElement>(`input[aria-label="Our trainers see ${name}"]`)!;
const defaultRadio = (name: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${name} is Westlake's default"]`)!;
const button = (text: RegExp) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => text.test((b.textContent ?? "").trim()));

async function click(el: HTMLElement | undefined | null) {
  expect(el).toBeTruthy();
  await act(async () => el!.click());
  await settle();
}

describe("Starting routines on My Studio → Studio", () => {
  it("never says none, and offers nothing to save, while the reads haven't answered", async () => {
    await mount(true);
    expect(store.routineReads.length).toBeGreaterThan(0);
    expect(host.textContent).toContain("Loading this studio's starting routines…");
    expect(host.textContent).not.toMatch(/No default|hasn't added|0 of|offered/);
    expect(host.querySelector("input")).toBeNull();
    expect(button(/Save changes/)).toBeUndefined();
  });

  it("lists each routine with its day one and its name whole, following head office's list", async () => {
    await mount(true);
    await answer(ROUTINES, { use: null, defaultId: null });
    const names = [...host.querySelectorAll(".srt-row__name")].map((n) => n.textContent);
    expect(names).toEqual(ROUTINES.map((r) => r.name));
    expect(host.textContent).toContain("Day one: Leg Press · Compound Row · Lumbar Extension");
    expect(host.textContent).toContain("Day one: Sled");
    expect(host.textContent).toContain("Following head office's list");
    expect(host.textContent).toContain("Head office's default");
    expect(host.textContent).toContain("Westlake's own");
    expect(host.textContent).toContain("3 of 3 offered");
    expect(host.textContent).toContain("No default of our own: Start a plan suggests head office's, Knee issues");
    for (const r of ROUTINES) expect(seeBox(r.name).checked).toBe(true);
    expect(button(/Follow head office's list again/)).toBeUndefined();
    expect(host.textContent).not.toContain("Head office hasn't added starting routines yet");
  });

  it("writes nothing until Save, then the whole choice, signed with the Auth uid", async () => {
    await mount(true);
    await answer(ROUTINES, { use: null, defaultId: null });
    await click(seeBox("Knee issues"));
    expect(seeBox("Knee issues").checked).toBe(false);
    expect(host.textContent).toContain("Westlake's own choice");
    expect(host.textContent).toContain("2 of 3 offered");
    // Head office's default is no longer among what the trainers see.
    expect(host.textContent).toContain("No default of our own: the trainer picks when the intake names nothing");
    await click(defaultRadio("Westlake's sled start"));
    expect(store.saves).toHaveLength(0);

    await click(button(/^Save changes$/));
    expect(store.saves).toEqual([
      {
        studioId: "westlake",
        choice: { use: ["academy-low-back", "own-sled"], defaultId: "own-sled" },
        uid: "uid-leader",
      },
    ]);
    expect(toasts).toEqual(["Saved. Start a plan at Westlake offers the new list."]);
  });

  it("ticks a default the trainers didn't see, clears one unticked, and goes back to head office's list", async () => {
    await mount(true);
    await answer(ROUTINES, { use: ["academy-low-back"], defaultId: "academy-low-back" });
    expect(seeBox("Knee issues").checked).toBe(false);
    expect(defaultRadio(ROUTINES[1].name).checked).toBe(true);

    await click(defaultRadio("Knee issues"));
    expect(seeBox("Knee issues").checked).toBe(true);
    await click(seeBox("Knee issues"));
    expect(defaultRadio("Knee issues").checked).toBe(false);
    expect(host.querySelector<HTMLInputElement>('input[type="radio"]:not([aria-label])')!.checked).toBe(true);

    await click(button(/Follow head office's list again/));
    expect(host.textContent).toContain("Following head office's list");
    for (const r of ROUTINES) expect(seeBox(r.name).checked).toBe(true);
    await click(button(/^Save changes$/));
    expect(store.saves[0].choice).toEqual({ use: null, defaultId: null });
  });

  it("an undone change is no change: nothing to save", async () => {
    await mount(true);
    await answer(ROUTINES, { use: null, defaultId: null });
    await click(seeBox("Knee issues"));
    expect(button(/^Save changes$/)).toBeTruthy();
    await click(seeBox("Knee issues"));
    expect(button(/^Save changes$/)).toBeUndefined();
  });

  it("reads for a trainer in words, never faded boxes, with who changes it, and no save", async () => {
    await mount(false);
    await answer(ROUTINES, { use: ["academy-knee"], defaultId: "academy-knee" });
    // Nothing to tap: no box, no radio, no save, no way back to head office's list.
    expect(host.querySelector("input")).toBeNull();
    expect(button(/Save changes/)).toBeUndefined();
    expect(button(/Follow head office's list again/)).toBeUndefined();
    // Which are offered, and which is the default, said in words on each row.
    const row = (name: string) =>
      [...host.querySelectorAll<HTMLElement>(".srt-row")].find((r) => r.querySelector(".srt-row__name")?.textContent === name)!;
    expect(row("Knee issues").textContent).toContain("Our trainers see this");
    expect(row("Knee issues").textContent).toContain("Default");
    expect(row(ROUTINES[1].name).textContent).toContain("Not offered here");
    expect(row(ROUTINES[1].name).textContent).not.toContain("Default");
    // Said to a reader: nothing about ticking it themselves.
    expect(host.textContent).toContain("Westlake's own choice: its trainers see the ones offered here. One added later waits until a leader offers it.");
    expect(host.textContent).not.toContain("until you tick it");
    expect(host.textContent).toContain("Only this studio's leaders change which starting routines its trainers see.");
  });

  it("tells a trainer what No default of our own means when the studio has none", async () => {
    await mount(false);
    await answer(ROUTINES, { use: null, defaultId: null });
    expect(host.textContent).toContain("No default of our own: Start a plan suggests head office's, Knee issues");
    expect(host.querySelector("input")).toBeNull();
  });

  it("after a save, measures the next tick from what was saved: the studio's own list stays its own", async () => {
    await mount(true);
    await answer(ROUTINES, { use: null, defaultId: null });
    await click(seeBox("Knee issues"));
    await click(button(/^Save changes$/));
    expect(store.saves[0].choice).toEqual({ use: ["academy-low-back", "own-sled"], defaultId: null });

    // Ticked again: every routine is ticked, but the saved choice is the
    // studio's own list, so it stays one rather than quietly following
    // head office's again (where a routine added later would be offered
    // without anyone choosing it).
    await click(seeBox("Knee issues"));
    expect(host.textContent).toContain("Westlake's own choice");
    expect(host.textContent).not.toContain("Following head office's list");
    await click(button(/^Save changes$/));
    expect(store.saves[1].choice).toEqual({ use: ["academy-knee", "academy-low-back", "own-sled"], defaultId: null });
  });

  it("says a read failed, offers Try again, never a list or a save, and reads again", async () => {
    await mount(true);
    await answer(new Error("offline"), { use: null, defaultId: null });
    expect(host.textContent).toContain("Couldn't read this studio's starting routines just now");
    expect(host.querySelector("input")).toBeNull();
    expect(host.textContent).not.toMatch(/No default|offered/);
    const before = store.routineReads.length;
    await click(button(/^Try again$/));
    expect(store.routineReads.length).toBeGreaterThan(before);
  });

  it("says the choice's read failed as a read that failed, never as a studio that hasn't chosen", async () => {
    await mount(true);
    await answer(ROUTINES, new Error("permission-denied"));
    expect(host.textContent).toContain("Couldn't read this studio's starting routines just now");
    expect(host.textContent).not.toContain("Following head office's list");
  });

  it("before head office has added any, says Start a plan offers the Academy's eleven, and lists them", async () => {
    await mount(true);
    await answer([], { use: null, defaultId: null });
    expect(host.textContent).toContain(
      "Head office hasn't added starting routines yet. Until then, Start a plan offers the Academy's eleven.",
    );
    expect(host.querySelectorAll(".srt-row__name")).toHaveLength(11);
    expect(host.textContent).toContain("11 of 11 offered");
  });
});
