// @vitest-environment jsdom
/**
 * THE ROUTINE TEMPLATE EDITOR'S "FOR NEW CLIENTS" PART, MOUNTED (the design
 * round, Oct 8 2026; AJ: "studios will chose their own, admins will create
 * the routines to pick from in the app during beta").
 *
 * The real tab and the real editor (the routine builder drawn as a stub)
 * over a small in-memory Firestore that keeps Firestore's own rules for a
 * batch's set and update, dotted paths and deleteField(), feeding the tab's
 * own listener. What matters is silent when wrong:
 *   - a start part round-trips: what the editor shows is what is written,
 *     and the app's reader (`startingRoutineFromPreset`) reads it back as the
 *     starting routine the admin saw;
 *   - a word taken out, or the switch turned off, is gone from the database
 *     (a merge would have kept it), and a part switched off is kept beside
 *     the template, so switching it back on in a later sitting brings back a
 *     seeded routine's steps, source and kind, which the editor can't set;
 *   - switching off and on in one sitting loses nothing marked;
 *   - a word typed but not added counts as unsaved and goes in with Save;
 *   - Cancel on an editor holding a change asks first, and Stay keeps it;
 *   - head office's default is one template: saving another as it takes the
 *     flag off the first in the same batch;
 *   - a starting routine with nothing on day one is refused, with a sentence;
 *   - the list says which templates are starting routines, and which is the
 *     default.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// The kit's switch (base-ui) builds a PointerEvent on a click; jsdom has none.
if (typeof (globalThis as { PointerEvent?: unknown }).PointerEvent === "undefined") {
  (globalThis as { PointerEvent?: unknown }).PointerEvent = class PointerEvent extends MouseEvent {};
}

type Doc = Record<string, unknown>;

const fs = vi.hoisted(() => {
  const DELETE = Symbol("deleteField");
  const docs = new Map<string, Doc>();
  const commits: Array<Array<{ kind: "set" | "update"; path: string; data: Doc }>> = [];
  const listeners = new Set<() => void>();
  const isMap = (v: unknown): v is Doc => typeof v === "object" && v !== null && !Array.isArray(v);
  const clone = (d: Doc): Doc => JSON.parse(JSON.stringify(d));
  let next = 0;

  /** update: every key is a field path, and its value replaces that field whole. */
  const update = (base: Doc, patch: Doc): Doc => {
    const out = clone(base);
    for (const [path, value] of Object.entries(patch)) {
      const keys = path.split(".");
      const last = keys.pop()!;
      let node: Doc | undefined = out;
      for (const key of keys) {
        if (!isMap(node![key])) {
          if (value === DELETE) {
            node = undefined;
            break;
          }
          node![key] = {};
        }
        node = node![key] as Doc;
      }
      if (!node) continue;
      if (value === DELETE) delete node[last];
      else node[last] = isMap(value) ? clone(value) : value;
    }
    return out;
  };
  /** set without merge: the document is exactly the data, a deleteField refused. */
  const set = (data: Doc): Doc => {
    if (Object.values(data).some((v) => v === DELETE)) throw new Error("deleteField() in a set without merge");
    return clone(data);
  };
  const notify = () => listeners.forEach((l) => l());
  return { DELETE, docs, commits, listeners, update, set, notify, clone, newId: () => `new-${++next}` };
});

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/"), kind: "collection" }),
  doc: (first: { path?: string; kind?: string } | unknown, ...parts: string[]) => {
    const base = first && typeof first === "object" && (first as { kind?: string }).kind === "collection" ? (first as { path: string }).path : null;
    if (base !== null) return { path: `${base}/${parts[0] ?? fs.newId()}` };
    return { path: parts.join("/") };
  },
  serverTimestamp: () => "NOW",
  deleteField: () => fs.DELETE,
  onSnapshot: (ref: { path: string }, next: (snap: unknown) => void) => {
    const fire = () =>
      next({
        docs: [...fs.docs.entries()]
          .filter(([p]) => p.startsWith(`${ref.path}/`) && !p.slice(ref.path.length + 1).includes("/"))
          .map(([p, data]) => ({ id: p.split("/").pop(), data: () => fs.clone(data) })),
      });
    fs.listeners.add(fire);
    const t = setTimeout(fire, 0);
    return () => {
      clearTimeout(t);
      fs.listeners.delete(fire);
    };
  },
  writeBatch: () => {
    const ops: Array<{ kind: "set" | "update"; path: string; data: Doc }> = [];
    return {
      set: (ref: { path: string }, data: Doc) => ops.push({ kind: "set", path: ref.path, data }),
      update: (ref: { path: string }, data: Doc) => ops.push({ kind: "update", path: ref.path, data }),
      commit: async () => {
        for (const op of ops) {
          if (op.kind === "set") fs.docs.set(op.path, fs.set(op.data));
          else {
            const before = fs.docs.get(op.path);
            if (!before) throw new Error(`No document to update: ${op.path}`);
            fs.docs.set(op.path, fs.update(before, op.data));
          }
        }
        fs.commits.push(ops);
        fs.notify();
      },
    };
  },
  addDoc: async () => ({ id: "unused" }),
  deleteDoc: async () => {},
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-admin" } } }));

const toasts = vi.hoisted(() => ({ ok: [] as string[], bad: [] as string[] }));
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ success: (m: string) => toasts.ok.push(m), error: (m: string) => toasts.bad.push(m), info: () => {} }),
}));

vi.mock("../../../hooks/useMachineCatalog", () => {
  const catalog = [
    { id: "m-leg-press", name: "LEG PRESS", status: "active", defaultOrder: 1 },
    { id: "m-compound-row", name: "COMPOUND ROW", status: "active", defaultOrder: 2 },
    { id: "m-lumbar", name: "LUMBAR", status: "active", defaultOrder: 3 },
  ];
  const byId = Object.fromEntries(catalog.map((m) => [m.id, m]));
  return { useMachineCatalog: () => ({ catalog, byId, loading: false, failed: false }) };
});

// The builder is the routine builder's own business (and dnd-kit's): here it
// says what it holds and adds a machine on a tap, like the real one.
vi.mock("../../routine-builder", () => ({
  RoutineBuilder: (p: { machineIds: string[]; onChange: (ids: string[]) => void }) => (
    <div data-testid="routine-builder" data-ids={p.machineIds.join(",")}>
      <button type="button" onClick={() => p.onChange([...p.machineIds, "m-lumbar"])}>
        Builder adds Lumbar
      </button>
    </div>
  ),
}));

const { AdminRoutineTemplatesTab } = await import("./AdminRoutineTemplatesTab");
const { UnsavedChangesProvider } = await import("../../unsaved-changes");
const { startingRoutineFromPreset } = await import("../../routine-plan/starting-routines");
const { TEMPLATE_SOURCE } = await import("../../routine-plan/starting-plan");
import type { Trainer } from "../../../types";

const ADMIN = { id: "t-admin", fullName: "Ada Admin", role: "Admin", primaryHomeStudioId: "westlake" } as unknown as Trainer;
const PRESETS = "routinePresets";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  fs.docs.clear();
  fs.commits.length = 0;
  toasts.ok.length = 0;
  toasts.bad.length = 0;
  fs.docs.set(`${PRESETS}/t-low`, {
    name: "Low back issues",
    description: "For a client with a low back problem.",
    machineIds: ["m-leg-press", "m-compound-row", "m-lumbar"],
    machineNotes: {},
    tier: "company",
    scope: "global",
    start: { dayOne: ["m-leg-press"], matchWords: ["low back"], default: false, source: TEMPLATE_SOURCE, kind: "condition" },
  });
  fs.docs.set(`${PRESETS}/t-knee`, {
    name: "Knee issues",
    machineIds: ["m-leg-press", "m-compound-row"],
    machineNotes: {},
    tier: "company",
    scope: "global",
    start: { dayOne: ["m-leg-press"], matchWords: ["knee"], default: true },
  });
  fs.docs.set(`${PRESETS}/t-plain`, {
    name: "Full body",
    machineIds: ["m-leg-press", "m-compound-row"],
    machineNotes: { "m-leg-press": "Seat at 5." },
    tier: "company",
    scope: "global",
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  fs.listeners.clear();
  document.body.innerHTML = "";
});

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });

async function mount() {
  await act(async () => {
    root.render(<AdminRoutineTemplatesTab studios={[]} authTrainer={ADMIN} isAdmin />);
  });
  await settle();
}

/** Mounted under the app's unsaved-changes provider, as App.tsx mounts every screen. */
async function mountWithProvider() {
  await act(async () => {
    root.render(
      <UnsavedChangesProvider>
        <AdminRoutineTemplatesTab studios={[]} authTrainer={ADMIN} isAdmin />
      </UnsavedChangesProvider>,
    );
  });
  await settle();
}

/** A template's card on the list, by its name. */
function card(name: string): HTMLElement {
  const h = [...host.querySelectorAll<HTMLElement>(".adm-tpl__name")].find((el) => el.textContent === name);
  expect(h, `the card for ${name}`).toBeTruthy();
  return h!.closest<HTMLElement>(".adm-tpl")!;
}

const button = (within: ParentNode, text: RegExp) =>
  [...within.querySelectorAll<HTMLButtonElement>("button")].find((b) => text.test((b.textContent ?? "").trim()) || text.test(b.getAttribute("aria-label") ?? ""));

async function click(el: HTMLElement | undefined | null) {
  expect(el).toBeTruthy();
  await act(async () => el!.click());
  await settle();
}

async function type(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
  await act(async () => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** The open editor's "For new clients" part. */
const part = () => document.body.querySelector<HTMLElement>('section[aria-label="For new clients"]')!;
/** A switch by the words beside it (its label row). */
const switchNamed = (label: string) =>
  [...part().querySelectorAll<HTMLElement>(".srt-switch")].find((l) => l.textContent?.trim() === label)?.querySelector<HTMLElement>("[role='switch']") ?? null;
const pick = (name: string) => [...part().querySelectorAll<HTMLButtonElement>(".srt-pick")].find((b) => b.textContent?.includes(name));
const stored = (id: string) => fs.docs.get(`${PRESETS}/${id}`)!;

describe("the template list", () => {
  it("says which templates are starting routines, with day one, and which is head office's default", async () => {
    await mount();
    expect(card("Low back issues").textContent).toContain("Starting routine · day one: LEG PRESS");
    expect(card("Knee issues").textContent).toContain("Head office's default");
    expect(card("Low back issues").textContent).not.toContain("Head office's default");
    expect(card("Full body").querySelector(".adm-tpl__start")).toBeNull();
  });
});

describe("For new clients", () => {
  it("round-trips a start part: shown, changed, written whole, and read back as the routine the admin saw", async () => {
    await mount();
    await click(button(card("Low back issues"), /^Edit$/));

    // What is stored is what the editor shows.
    expect(switchNamed("Offer as a starting routine")?.getAttribute("aria-checked")).toBe("true");
    expect(pick("LEG PRESS")?.getAttribute("aria-pressed")).toBe("true");
    expect(pick("COMPOUND ROW")?.getAttribute("aria-pressed")).toBe("false");
    expect(part().textContent).toContain("Day one: LEG PRESS");
    expect(part().textContent).toContain("From the Academy's Exercise Selection Template");
    expect(button(part(), /Take out low back/)).toBeTruthy();
    expect(part().textContent).toContain("Now: Knee issues.");

    // Two more machines on day one, a word, and head office's default.
    await click(pick("COMPOUND ROW"));
    await click(pick("LUMBAR"));
    expect(part().textContent).toContain("Day one: LEG PRESS · COMPOUND ROW · LUMBAR");
    await type(part().querySelector<HTMLInputElement>('input[aria-label="A word that suggests it"]')!, "  Sciatica ");
    await click(button(part(), /Add word/));
    expect(button(part(), /Take out sciatica/)).toBeTruthy();
    await click(switchNamed("Head office's default"));
    expect(part().textContent).toContain("Saving this one as the default takes it off Knee issues.");

    await click(button(document.body, /^Save changes$/));

    // One batch: this template's start part whole, and the old default's flag off.
    expect(fs.commits).toHaveLength(1);
    const [own, other] = fs.commits[0];
    expect(own).toMatchObject({ kind: "update", path: `${PRESETS}/t-low` });
    expect(own.data.start).toEqual({
      dayOne: ["m-leg-press", "m-compound-row", "m-lumbar"],
      matchWords: ["low back", "sciatica"],
      default: true,
      source: TEMPLATE_SOURCE,
      kind: "condition",
    });
    // Only what changed: the name, the machines and the notes were not touched.
    expect(Object.keys(own.data).sort()).toEqual(["scope", "start", "tier", "updatedAt", "updatedBy"]);
    expect(own.data.updatedBy).toBe("uid-admin");
    expect(other).toEqual({
      kind: "update",
      path: `${PRESETS}/t-knee`,
      data: { "start.default": fs.DELETE, updatedAt: "NOW", updatedBy: "uid-admin" },
    });

    // Read back by the app's own reader: the starting routine the admin saw.
    expect(startingRoutineFromPreset({ id: "t-low", ...stored("t-low") })).toMatchObject({
      dayOne: ["m-leg-press", "m-compound-row", "m-lumbar"],
      matchWords: ["low back", "sciatica"],
      isDefault: true,
      source: TEMPLATE_SOURCE,
      kind: "condition",
    });
    expect(startingRoutineFromPreset({ id: "t-knee", ...stored("t-knee") })?.isDefault).toBe(false);
    expect(stored("t-knee").start).toEqual({ dayOne: ["m-leg-press"], matchWords: ["knee"] });

    expect(toasts.ok[0]).toBe('"Low back issues" saved. It is head office\'s starting default now, in place of "Knee issues".');
    // The list follows the database.
    expect(card("Low back issues").textContent).toContain("Starting routine · day one: LEG PRESS · COMPOUND ROW · LUMBAR");
    expect(card("Low back issues").textContent).toContain("Head office's default");
    expect(card("Knee issues").textContent).not.toContain("Head office's default");
  });

  it("takes a word out of the database when it is taken out, which a merge would have kept", async () => {
    await mount();
    await click(button(card("Low back issues"), /^Edit$/));
    await click(button(part(), /Take out low back/));
    await click(button(document.body, /^Save changes$/));
    expect(stored("t-low").start).toEqual({ dayOne: ["m-leg-press"], source: TEMPLATE_SOURCE, kind: "condition" });
  });

  it("removes the start part when the switch goes off, and keeps it beside the template without the default", async () => {
    await mount();
    await click(button(card("Knee issues"), /^Edit$/));
    await click(switchNamed("Offer as a starting routine"));
    expect(pick("LEG PRESS")).toBeUndefined();
    await click(button(document.body, /^Save changes$/));
    expect(fs.commits[0][0].data.start).toBe(fs.DELETE);
    expect("start" in stored("t-knee")).toBe(false);
    expect(stored("t-knee").startParked).toEqual({ dayOne: ["m-leg-press"], matchWords: ["knee"] });
    // Nothing reads the kept part as a starting routine.
    expect(startingRoutineFromPreset({ id: "t-knee", ...stored("t-knee") })).toBeNull();
    expect(card("Knee issues").querySelector(".adm-tpl__start")).toBeNull();
    expect(toasts.ok).toEqual(['"Knee issues" saved. Start a plan no longer offers it.']);
  });

  it("brings a seeded routine back whole in a later sitting: its day one, words, steps, source and kind", async () => {
    const seededStart = {
      dayOne: ["m-leg-press", "m-lumbar"],
      steps: [
        { label: "Consultation", machineIds: ["m-leg-press", "m-lumbar"] },
        { label: "First workout adds", machineIds: ["m-compound-row"] },
      ],
      matchWords: ["hip"],
      source: TEMPLATE_SOURCE,
      kind: "condition",
    };
    fs.docs.set(`${PRESETS}/academy-hip`, {
      name: "Hip issues",
      machineIds: ["m-leg-press", "m-compound-row", "m-lumbar"],
      machineNotes: {},
      tier: "company",
      scope: "global",
      start: seededStart,
    });
    await mount();

    // Switched off and saved.
    await click(button(card("Hip issues"), /^Edit$/));
    await click(switchNamed("Offer as a starting routine"));
    await click(button(document.body, /^Save changes$/));
    expect("start" in stored("academy-hip")).toBe(false);
    expect(stored("academy-hip").startParked).toEqual(seededStart);

    // A later sitting: the editor says the switch brings it back, and where it came from.
    await click(button(card("Hip issues"), /^Edit$/));
    expect(switchNamed("Offer as a starting routine")?.getAttribute("aria-checked")).toBe("false");
    expect(part().textContent).toContain("Switch it back on and Start a plan offers it again just as it was");
    expect(part().textContent).toContain("From the Academy's Exercise Selection Template");
    await click(switchNamed("Offer as a starting routine"));
    expect(pick("LEG PRESS")?.getAttribute("aria-pressed")).toBe("true");
    expect(pick("LUMBAR")?.getAttribute("aria-pressed")).toBe("true");
    expect(button(part(), /Take out hip/)).toBeTruthy();
    await click(button(document.body, /^Save changes$/));

    // Written back whole, and the kept copy removed with it.
    const last = fs.commits[fs.commits.length - 1][0];
    expect(last.data.startParked).toBe(fs.DELETE);
    expect(stored("academy-hip").start).toEqual(seededStart);
    expect("startParked" in stored("academy-hip")).toBe(false);
    expect(startingRoutineFromPreset({ id: "academy-hip", ...stored("academy-hip") })).toMatchObject({
      source: TEMPLATE_SOURCE,
      kind: "condition",
      steps: seededStart.steps,
    });
  });

  it("takes a machine off day one with its step, so On deck never calls it Consultation", async () => {
    fs.docs.set(`${PRESETS}/academy-hip`, {
      name: "Hip issues",
      machineIds: ["m-leg-press", "m-compound-row", "m-lumbar"],
      machineNotes: {},
      tier: "company",
      scope: "global",
      start: {
        dayOne: ["m-leg-press", "m-lumbar"],
        steps: [
          { label: "Consultation", machineIds: ["m-leg-press", "m-lumbar"] },
          { label: "First workout adds", machineIds: ["m-compound-row"] },
        ],
        source: TEMPLATE_SOURCE,
        kind: "condition",
      },
    });
    await mount();
    await click(button(card("Hip issues"), /^Edit$/));
    await click(pick("LUMBAR"));
    await click(button(document.body, /^Save changes$/));
    expect(stored("academy-hip").start).toEqual({
      dayOne: ["m-leg-press"],
      steps: [
        { label: "Consultation", machineIds: ["m-leg-press"] },
        { label: "First workout adds", machineIds: ["m-compound-row", "m-lumbar"] },
      ],
      source: TEMPLATE_SOURCE,
      kind: "condition",
    });
  });

  it("switched off and on in one sitting, loses nothing marked", async () => {
    await mount();
    await click(button(card("Low back issues"), /^Edit$/));
    await click(pick("COMPOUND ROW"));
    await type(part().querySelector<HTMLInputElement>('input[aria-label="A word that suggests it"]')!, "sciatica");
    await click(button(part(), /Add word/));
    await click(switchNamed("Offer as a starting routine"));
    expect(pick("COMPOUND ROW")).toBeUndefined();
    await click(switchNamed("Offer as a starting routine"));
    expect(pick("LEG PRESS")?.getAttribute("aria-pressed")).toBe("true");
    expect(pick("COMPOUND ROW")?.getAttribute("aria-pressed")).toBe("true");
    expect(button(part(), /Take out sciatica/)).toBeTruthy();
    expect(button(part(), /Take out low back/)).toBeTruthy();
    await click(button(document.body, /^Save changes$/));
    expect(stored("t-low").start).toMatchObject({ dayOne: ["m-leg-press", "m-compound-row"], matchWords: ["low back", "sciatica"] });
  });

  it("puts a word typed but not added in with Save, rather than dropping it", async () => {
    await mount();
    await click(button(card("Low back issues"), /^Edit$/));
    const save = () => button(document.body, /^Save changes$/)!;
    expect(save().disabled).toBe(true);
    await type(part().querySelector<HTMLInputElement>('input[aria-label="A word that suggests it"]')!, " Sciatica ");
    // Typing alone is a change: Save is offered.
    expect(save().disabled).toBe(false);
    await click(save());
    expect(stored("t-low").start).toMatchObject({ matchWords: ["low back", "sciatica"] });
    expect(document.body.querySelector('section[aria-label="For new clients"]')).toBeNull();
  });

  it("refuses a starting routine with nothing on day one, in a sentence, and writes nothing", async () => {
    await mount();
    await click(button(card("Full body"), /^Edit$/));
    await click(switchNamed("Offer as a starting routine"));
    expect(part().textContent).toContain("Nothing on day one yet");
    await click(button(document.body, /^Save changes$/));
    expect(toasts.bad).toEqual(["Mark at least one machine for day one, or switch off Offer as a starting routine."]);
    expect(fs.commits).toHaveLength(0);

    await click(pick("COMPOUND ROW"));
    await click(button(document.body, /^Save changes$/));
    expect(fs.commits).toHaveLength(1);
    // The only change is the start part; the notes stay as they were.
    expect(Object.keys(fs.commits[0][0].data).sort()).toEqual(["scope", "start", "tier", "updatedAt", "updatedBy"]);
    expect(stored("t-plain").start).toEqual({ dayOne: ["m-compound-row"] });
    expect(stored("t-plain").machineNotes).toEqual({ "m-leg-press": "Seat at 5." });
  });

  it("offers Save only once something has changed, in blue", async () => {
    await mount();
    await click(button(card("Full body"), /^Edit$/));
    const save = button(document.body, /^Save changes$/)!;
    expect(save.disabled).toBe(true);
    expect(save.className).toContain("adm-btn--primary");
    expect(save.className).not.toContain("adm-btn--hero");
    await click(switchNamed("Offer as a starting routine"));
    expect(button(document.body, /^Save changes$/)!.disabled).toBe(false);
  });

  it("writes a new template's start part with it, in one batch", async () => {
    await mount();
    await click(button(host, /New company standard/));
    await type(document.body.querySelector<HTMLInputElement>('input[placeholder="Full Body Foundations"]')!, "Shoulder start");
    await click(button(document.body, /Builder adds Lumbar/));
    await click(switchNamed("Offer as a starting routine"));
    await click(pick("LUMBAR"));
    await click(button(document.body, /^Create template$/));
    expect(fs.commits).toHaveLength(1);
    const [made] = fs.commits[0];
    expect(made.kind).toBe("set");
    expect(made.data).toMatchObject({
      name: "Shoulder start",
      machineIds: ["m-lumbar"],
      tier: "company",
      scope: "global",
      start: { dayOne: ["m-lumbar"] },
      createdBy: "uid-admin",
    });
    expect(JSON.stringify(made.data)).not.toContain("undefined");
    expect("studioId" in made.data).toBe(false);
  });

  it("offers head office's default on a company template only", async () => {
    fs.docs.set(`${PRESETS}/t-studio`, {
      name: "Westlake start",
      machineIds: ["m-leg-press"],
      machineNotes: {},
      tier: "studio",
      scope: "westlake",
      studioId: "westlake",
      start: { dayOne: ["m-leg-press"] },
    });
    await act(async () => {
      root.render(
        <AdminRoutineTemplatesTab studios={[{ id: "westlake", name: "Westlake" } as never]} activeStudioId="westlake" authTrainer={ADMIN} isAdmin />,
      );
    });
    await settle();
    await click([...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => /Studio Templates/.test(b.textContent ?? "")));
    await click(button(card("Westlake start"), /^Edit$/));
    expect(switchNamed("Offer as a starting routine")).toBeTruthy();
    expect(switchNamed("Head office's default")).toBeNull();
  });
});

describe("leaving the editor", () => {
  const question = () => document.body.querySelector<HTMLElement>('[data-testid="leave-confirm"]');
  const answerLeave = (action: "leave" | "keep-editing") =>
    document.body.querySelector<HTMLButtonElement>(`[data-testid="leave-confirm"] [data-action="${action}"]`);
  const open = () => document.body.querySelector('section[aria-label="For new clients"]');

  it("asks before Cancel drops a word typed but not added, and Stay keeps it", async () => {
    await mountWithProvider();
    await click(button(card("Low back issues"), /^Edit$/));
    const box = () => part().querySelector<HTMLInputElement>('input[aria-label="A word that suggests it"]')!;
    await type(box(), "sciatica");

    await click(button(document.body, /^Cancel$/));
    expect(question()?.textContent).toContain('You have unsaved changes to the template "Low back issues". Leave without saving?');
    await click(answerLeave("keep-editing"));
    expect(question()).toBeNull();
    expect(open()).toBeTruthy();
    expect(box().value).toBe("sciatica");

    await click(button(document.body, /^Cancel$/));
    await click(answerLeave("leave"));
    expect(question()).toBeNull();
    expect(open()).toBeNull();
    expect(fs.commits).toHaveLength(0);
  });

  it("asks before Cancel drops a day one changed, and closes at once when nothing changed", async () => {
    await mountWithProvider();
    await click(button(card("Low back issues"), /^Edit$/));
    await click(pick("COMPOUND ROW"));
    await click(button(document.body, /^Cancel$/));
    expect(question()).toBeTruthy();
    await click(answerLeave("keep-editing"));
    expect(pick("COMPOUND ROW")?.getAttribute("aria-pressed")).toBe("true");
    // Undone, it is no change: Cancel closes without asking.
    await click(pick("COMPOUND ROW"));
    await click(button(document.body, /^Cancel$/));
    expect(question()).toBeNull();
    expect(open()).toBeNull();
    expect(fs.commits).toHaveLength(0);
  });
});
