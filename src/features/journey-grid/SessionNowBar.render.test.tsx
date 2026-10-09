// @vitest-environment jsdom
/**
 * The Now Bar's commit, MOUNTED (session record, Sep 26 2026). A set's write
 * waits for the trainer to stop typing; leaving the field, or pressing Enter,
 * is the moment the set was entered, and the tracker sends it then. Only the
 * mounted bar shows that each keystroke reports a change but not a commit,
 * and that leaving the field reports one.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/* How many times the bar has drawn: it works out its settings button once a
   draw, so counting that counts the bar's renders (the memo test below). A
   pass-through otherwise. */
const draws = vi.hoisted(() => ({ n: 0 }));
vi.mock("./setup-button", async (importOriginal) => {
  const real = await importOriginal<typeof import("./setup-button")>();
  return {
    ...real,
    setupButtonOf: (...args: Parameters<typeof real.setupButtonOf>) => {
      draws.n++;
      return real.setupButtonOf(...args);
    },
  };
});

import { SessionNowBar } from "./SessionNowBar";
import type { JourneyRow, LiveSet } from "./types";
import { hasWeightOnFile, startingRangeSlot } from "../routine-plan/session-plan";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row: JourneyRow = {
  machine: { id: "leg_press", name: "LEG PRESS", group: "Lower Body" },
  sets: {},
  prescribedWeight: 150,
};

let root: Root | null = null;
let host: HTMLElement | null = null;

function mount(props: { onChange: (id: string, p: Partial<LiveSet>) => void; onCommit?: (id: string) => void; sides?: boolean }) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const r: JourneyRow = props.sides ? { ...row, machine: { ...row.machine, id: "torso_rotation", sides: true } } : row;
  act(() => {
    root!.render(<SessionNowBar row={r} history={[]} onChange={props.onChange} onCommit={props.onCommit} />);
  });
  return host;
}

/** Types into a controlled input the way a keystroke does. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("SessionNowBar commit", () => {
  it("reports each keystroke as a change, and leaving the reps field as a commit", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const el = mount({ onChange, onCommit });
    const reps = el.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]')!;
    expect(reps).not.toBeNull();

    act(() => reps.focus());
    type(reps, "1");
    type(reps, "12");
    expect(onChange).toHaveBeenLastCalledWith("leg_press", { reps: 12 });
    expect(onCommit).not.toHaveBeenCalled();

    act(() => reps.blur());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("leg_press");
  });

  it("treats Enter in the reps field as leaving it", () => {
    const onCommit = vi.fn();
    const el = mount({ onChange: vi.fn(), onCommit });
    const reps = el.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]')!;
    act(() => reps.focus());
    act(() => {
      reps.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onCommit).toHaveBeenCalledWith("leg_press");
  });

  it("commits the weight field when it is left", () => {
    const onCommit = vi.fn();
    const el = mount({ onChange: vi.fn(), onCommit });
    const weight = el.querySelector<HTMLInputElement>('input[aria-label="Weight in pounds"]')!;
    act(() => weight.focus());
    act(() => weight.blur());
    expect(onCommit).toHaveBeenCalledWith("leg_press");
  });

  it("does not commit on a stepper tap, which comes in runs the queue gathers", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const el = mount({ onChange, onCommit });
    const up = el.querySelector<HTMLButtonElement>('button[aria-label="Increase weight by 2"]')!;
    act(() => up.click());
    expect(onChange).toHaveBeenCalledWith("leg_press", { weight: 152 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits each side of a two-sided machine under the machine's id", () => {
    const onCommit = vi.fn();
    const el = mount({ onChange: vi.fn(), onCommit, sides: true });
    const right = el.querySelector<HTMLInputElement>('input[aria-label="Right side reps to failure"]')!;
    act(() => right.focus());
    act(() => right.blur());
    expect(onCommit).toHaveBeenCalledWith("torso_rotation");
  });

  it("says who set today's weight at the last Wrap-up, and nothing when nobody did (Oct 2 2026)", () => {
    const el = mount({ onChange: vi.fn() });
    expect(el.querySelector('[data-testid="weight-source"]')).toBeNull();
    act(() => root!.unmount());
    host!.remove();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(
        <SessionNowBar row={{ ...row, weightSource: "Set for today at the last Wrap-up by Sam." }} history={[]} onChange={vi.fn()} />,
      );
    });
    expect(host.querySelector('[data-testid="weight-source"]')!.textContent).toBe("Set for today at the last Wrap-up by Sam.");
  });

  it("still mounts and types without an onCommit", () => {
    const onChange = vi.fn();
    const el = mount({ onChange });
    const reps = el.querySelector<HTMLInputElement>('input[aria-label="reps to failure"]')!;
    act(() => reps.focus());
    type(reps, "9");
    act(() => reps.blur());
    expect(onChange).toHaveBeenLastCalledWith("leg_press", { reps: 9 });
  });
});

describe("SessionNowBar's Blood flow (Oct 3 2026)", () => {
  it("offers Blood flow beside Practice and Skip, and marks the set as a blood flow practice set", () => {
    const changes: Partial<LiveSet>[] = [];
    const el = mount({ onChange: (_id, p) => changes.push(p) });
    const btn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Blood flow")!;
    expect(btn).toBeTruthy();
    act(() => btn.click());
    expect(changes.at(-1)).toEqual({ outcome: "practice", bloodFlow: true });
    act(() => root?.unmount());
    host?.remove();
  });

  it("Practice clears a blood flow mark", () => {
    const changes: Partial<LiveSet>[] = [];
    const el = mount({ onChange: (_id, p) => changes.push(p) });
    const btn = [...el.querySelectorAll("button")].find((b) => b.textContent === "Practice")!;
    act(() => btn.click());
    expect(changes.at(-1)).toEqual({ outcome: "practice", bloodFlow: null });
    act(() => root?.unmount());
    host?.remove();
  });
});

describe("SessionNowBar's start and gain (Oct 3 2026; the machine menu's one figure since Oct 4 2026)", () => {
  const sessions = [
    { id: "a", sessionNumber: 1, date: "2026-08-01", trainerInitials: "AJ" },
    { id: "b", sessionNumber: 2, date: "2026-09-01", trainerInitials: "AJ" },
  ];
  const grown: JourneyRow = {
    ...row,
    sets: {
      a: { sessionId: "a", outcome: "performed", weight: 100, reps: 10, quality: 2 },
      b: { sessionId: "b", outcome: "performed", weight: 125, reps: 9, quality: 2 },
    },
  };
  const draw = (props: Partial<Parameters<typeof SessionNowBar>[0]>) =>
    act(() => root!.render(<SessionNowBar row={grown} history={sessions} onChange={() => {}} {...props} />));
  const start = () => host!.querySelector('[data-testid="nb-start"]')?.textContent ?? null;
  const gain = () => host!.querySelector('[data-testid="nb-gain"]')?.textContent ?? null;

  function open() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }

  it("counts from the starting weight on file, labelled Starting weight, never First in Journey (AJ's Q2 (a))", () => {
    open();
    draw({ row: { ...grown, startingWeight: 80 }, coverage: "partial" });
    expect(start()).toContain("Starting weight 80 lb");
    expect(start()).not.toContain("First in Journey");
    expect(gain()).toBe("+56%");
    expect(host!.textContent).not.toContain("Best");
    // A typed start counts whether or not the older sessions were read.
    draw({ row: { ...grown, startingWeight: 80 }, coverage: "complete", everythingRead: true });
    expect(start()).toContain("Starting weight 80 lb");
    expect(start()).not.toContain("Started");
  });

  it("falls back to the first counted set only once every session has been read, with the history words", () => {
    open();
    draw({ coverage: "complete", everythingRead: true });
    expect(start()).toContain("First performed 100 lb");
    expect(gain()).toBe("+25%");
    draw({ coverage: "partial", everythingRead: true });
    expect(start()).toContain("First in Journey 100 lb");
  });

  it("says no start and no % when nothing is on file and older sessions are unread: the oldest loaded is not where anyone began", () => {
    open();
    draw({ coverage: "partial" });
    expect(start()).toBeNull();
    expect(gain()).toBeNull();
    draw({ coverage: "complete", everythingRead: false });
    expect(start()).toBeNull();
  });

  it("shows the start but no % when the weight isn't up", () => {
    open();
    draw({ row: { ...grown, startingWeight: 130 } });
    expect(start()).toContain("Starting weight 130 lb");
    expect(gain()).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * The floor on day one (the first-session design round, Oct 8 2026, §4.6)
 * ------------------------------------------------------------------ */

describe("SessionNowBar on day one: the plan's next machine, Add a machine, the Academy's starting range", () => {
  const firstTime: JourneyRow = { machine: { id: "m-leg-press", name: "Leg Press", group: "Lower Body" }, sets: {} };
  const planNext = { id: "m-hip-abd", name: "Hip Abduction" };

  function draw(props: Partial<Parameters<typeof SessionNowBar>[0]>) {
    if (!host) {
      host = document.createElement("div");
      document.body.appendChild(host);
      root = createRoot(host);
    }
    act(() => root!.render(<SessionNowBar row={firstTime} history={[]} onChange={() => {}} {...props} />));
    return host;
  }
  const buttons = () => [...host!.querySelectorAll<HTMLButtonElement>("button")];
  const byWords = (words: string) => buttons().find((b) => (b.getAttribute("aria-label") || b.textContent || "").includes(words));

  it("on the last machine, offers the plan's next one as a dashed blue Add, beside a quieter Add another machine: today only, never orange", () => {
    const onAddPlanned = vi.fn();
    const onAddMachine = vi.fn();
    draw({ planNext, onAddPlanned, onAddMachine });
    const offer = host!.querySelector<HTMLButtonElement>(".jg-nb__next--plan")!;
    expect(offer).not.toBeNull();
    expect(offer.textContent).toContain("Next in the plan");
    expect(offer.textContent).toContain("Hip Abduction");
    expect(offer.textContent).toContain("Add");
    // The quiet dashed offer, never the orange of Go or the solid blue of Next.
    expect(offer.className).toContain("jg-nb__next--add");
    expect(host!.textContent).not.toContain("Last in today's order");
    act(() => offer.click());
    expect(onAddPlanned).toHaveBeenCalledTimes(1);
    expect(onAddPlanned).toHaveBeenCalledWith("m-hip-abd");
    expect(onAddMachine).not.toHaveBeenCalled();
    const more = byWords("Add another machine")!;
    expect(more.className).toBe("jg-nb__addmore");
    act(() => more.click());
    expect(onAddMachine).toHaveBeenCalledTimes(1);
  });

  it("with nothing next in the plan, the last machine's slot is as it was", () => {
    draw({ onAddMachine: vi.fn() });
    expect(host!.querySelector(".jg-nb__next--plan")).toBeNull();
    expect(host!.textContent).toContain("Last in today's order");
    expect(host!.textContent).toContain("Add another machine");
  });

  it("Next in today's order wins over the plan: the offer is only on the last machine", () => {
    draw({ planNext, onAddPlanned: vi.fn(), nextName: "Compound Row", onNext: vi.fn() });
    expect(host!.querySelector(".jg-nb__next--plan")).toBeNull();
    expect(host!.querySelector(".jg-nb__nextname")!.textContent).toBe("Compound Row");
  });

  it("an empty bar says nothing is in today's order and offers Add a machine, and the plan's next one", () => {
    const onAddMachine = vi.fn();
    const onAddPlanned = vi.fn();
    draw({ row: undefined, nothingToday: true, onAddMachine });
    expect(host!.textContent).toContain("Nothing in today's order yet.");
    expect(host!.querySelector(".jg-nb__next--plan")).toBeNull();
    act(() => byWords("Add a machine")!.click());
    expect(onAddMachine).toHaveBeenCalledTimes(1);
    draw({ row: undefined, nothingToday: true, onAddMachine, planNext: { id: "m-leg-press", name: "Leg Press" }, onAddPlanned });
    act(() => host!.querySelector<HTMLButtonElement>(".jg-nb__next--plan")!.click());
    expect(onAddPlanned).toHaveBeenCalledWith("m-leg-press");
  });

  // The FileMaker floor (the open session round, Oct 9 2026; AJ's "1b": "you
  // have every machine on the screen and you just fill in the ones you did").
  it("with the floor showing, an empty bar says where to tap, one line, and still offers Add a machine", () => {
    const onAddMachine = vi.fn();
    draw({ row: undefined, nothingToday: true, floorOpen: true, onAddMachine });
    expect(host!.querySelector(".jg-nb__idle")!.textContent).toBe("Tap + on a machine you're doing.");
    expect(host!.textContent).not.toContain("Nothing in today's order yet.");
    act(() => byWords("Add a machine")!.click());
    expect(onAddMachine).toHaveBeenCalledTimes(1);
    // A machine in hand: the floor changes nothing on the bar.
    draw({ floorOpen: true, onAddMachine });
    expect(host!.textContent).not.toContain("Tap + on a machine");
  });

  it("the range sits in the readout slot beside the weight, never in it, and its (i) opens the sheet's notes", () => {
    const onStartingRange = vi.fn();
    const startingRange = startingRangeSlot({
      canonicalMachineId: "m-leg-press",
      column: "female-novice",
      forToday: false,
      hasWeight: hasWeightOnFile({ prescribedWeight: firstTime.prescribedWeight, setsOnRecord: 0, knownElsewhere: false, totalsKnown: true }),
    });
    draw({ startingRange, onStartingRange });
    const line = host!.querySelector<HTMLButtonElement>('[data-testid="nb-range"]')!;
    expect(line.textContent).toBe("Academy's starting range: 60–100 lb (a reference, not a rule)");
    expect(line.closest(".jg-nb__expect")).not.toBeNull();
    // The weight stays blank: the app never suggests a weight.
    const weight = host!.querySelector<HTMLInputElement>('input[aria-label="Weight in pounds"]')!;
    expect(weight.value).toBe("");
    expect(weight.placeholder).toBe("–");
    act(() => line.click());
    expect(onStartingRange).toHaveBeenCalledWith("about");
  });

  it("says 'for today' when the column is kept for this session only", () => {
    draw({
      startingRange: startingRangeSlot({ canonicalMachineId: "m-leg-press", column: "male-novice", forToday: true, hasWeight: false }),
      onStartingRange: vi.fn(),
    });
    expect(host!.querySelector('[data-testid="nb-range"]')!.textContent).toBe("Academy's starting range: 160–190 lb (a reference, not a rule) · for today");
  });

  it("before a column is picked, asks quietly; the pick is the trainer's", () => {
    const onStartingRange = vi.fn();
    draw({ startingRange: startingRangeSlot({ canonicalMachineId: "m-leg-press", column: undefined, forToday: false, hasWeight: false }), onStartingRange });
    const ask = host!.querySelector<HTMLButtonElement>('[data-testid="nb-range-ask"]')!;
    expect(ask.textContent).toBe("Academy's starting range");
    act(() => ask.click());
    expect(onStartingRange).toHaveBeenCalledWith("pick");
  });

  it("shows no range for a machine with a weight on file: the prescribed weight fills the weight as it always has", () => {
    const onFile: JourneyRow = { ...firstTime, prescribedWeight: 120 };
    const startingRange = startingRangeSlot({
      canonicalMachineId: "m-leg-press",
      column: "female-novice",
      forToday: false,
      hasWeight: hasWeightOnFile({ prescribedWeight: onFile.prescribedWeight, setsOnRecord: 0, knownElsewhere: false, totalsKnown: true }),
    });
    expect(startingRange).toBeNull();
    draw({ row: onFile, startingRange, onStartingRange: vi.fn() });
    expect(host!.querySelector('[data-testid="nb-range"]')).toBeNull();
    expect(host!.querySelector('[data-testid="nb-range-ask"]')).toBeNull();
    expect(host!.querySelector<HTMLInputElement>('input[aria-label="Weight in pounds"]')!.value).toBe("120");
  });
});

describe("SessionNowBar on day one: never orange, and First time on this machine", () => {
  /* The plan's offer and Add another machine are blue and quiet: Start and
     Finish are the floor's only orange (CLAUDE.md, the Navy Frame). Read off
     the stylesheet the bar draws with, so a rule painting them orange fails. */
  it("paints the plan's offer and Add another machine in the live blue, never an orange token", () => {
    const css = readFileSync(resolve(__dirname, "journey-grid.css"), "utf8").replace(/\r\n/g, "\n");
    const rules = (selector: string) => {
      const out: string[] = [];
      const re = /([^{}]+)\{([^{}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(css))) if (m[1].split(",").some((sel) => sel.includes(selector))) out.push(m[2]);
      return out.join("\n");
    };
    const orange = /--jg-(?:go|hero)\b|--jg-go-|--jg-hero-|--eq-go|--eq-hero|orange/;
    for (const sel of [".jg-nb__next--plan", ".jg-nb__next--add", ".jg-nb__addmore", ".jg-nb__nextadd"]) {
      const body = rules(sel);
      expect(body, sel).not.toBe("");
      expect(body, sel).not.toMatch(orange);
    }
    expect(rules(".jg-nb__next.jg-nb__next--add")).toMatch(/color:\s*var\(--jg-live-text\)/);
    expect(rules(".jg-nb__addmore")).toMatch(/color:\s*var\(--jg-live-text\)/);
  });

  it("says First time on this machine in the readout when the caller can claim it, and nothing when it can't", () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const firstTime: JourneyRow = { machine: { id: "m-leg-press", name: "Leg Press", group: "Lower Body" }, sets: {} };
    act(() => root!.render(<SessionNowBar row={firstTime} history={[]} onChange={() => {}} noHistoryLine="First time on this machine" />));
    const line = host.querySelector('[data-testid="nb-first"]');
    expect(line?.textContent).toBe("First time on this machine");
    expect(line?.closest(".jg-nb__expect")).not.toBeNull();
    // The weight is blank and never prefilled.
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Weight in pounds"]')!.value).toBe("");
    act(() => root!.render(<SessionNowBar row={firstTime} history={[]} onChange={() => {}} />));
    expect(host.querySelector('[data-testid="nb-first"]')).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * The settings button (the open session round, Oct 9 2026; AJ's "2a")
 * ------------------------------------------------------------------ */

describe("SessionNowBar's settings button: Set up · 2 not set, then the settings themselves", () => {
  const fly = (machine: Partial<JourneyRow["machine"]>): JourneyRow => ({
    machine: { id: "m-chest-fly", name: "Chest Fly", group: "Push", settings: { G: "1" }, settingLabels: { G: "Gap" }, ...machine },
    sets: {},
  });
  // The bar's other props, the same each draw, as the tracker's memoised ones are.
  const NO_HISTORY: never[] = [];
  const onChange = () => {};
  function draw(r: JourneyRow, onSetUp?: (id: string) => void) {
    if (!host) {
      host = document.createElement("div");
      document.body.appendChild(host);
      root = createRoot(host);
    }
    act(() => root!.render(<SessionNowBar row={r} history={NO_HISTORY} onChange={onChange} onSetUp={onSetUp} />));
    return host;
  }
  const setup = () => host!.querySelector<HTMLButtonElement>('[data-testid="nb-setup"]');

  it("is one button on a first time, Set up · 2 not set, and a tap opens the card on that machine", () => {
    const onSetUp = vi.fn();
    draw(fly({ dialsNotSet: 2, firstSetup: true }), onSetUp);
    const b = setup()!;
    expect(b.tagName).toBe("BUTTON");
    expect(b.className).toBe("jg-nb__setup");
    expect(b.getAttribute("data-kind")).toBe("setup");
    expect(b.textContent).toBe("Set up· 2 not set");
    expect(b.getAttribute("aria-label")).toBe("Set up Chest Fly: 2 not set. Opens the machine card on the first one.");
    act(() => b.click());
    expect(onSetUp).toHaveBeenCalledWith("m-chest-fly");
    // The read-only tiles are gone.
    expect(host!.querySelector(".jg-nb__chip")).toBeNull();
  });

  it("says the settings themselves once set, with their full names, and opens the card the same way", () => {
    const onSetUp = vi.fn();
    draw(
      fly({ settings: { G: "1", S: "12", B: "3" }, settingLabels: { G: "Gap", S: "Seat", B: "Back pad" }, dialsNotSet: 0, firstSetup: false }),
      onSetUp,
    );
    const b = setup()!;
    expect(b.getAttribute("data-kind")).toBe("settings");
    expect([...b.querySelectorAll(".jg-nb__setkv")].map((kv) => kv.textContent)).toEqual(["Gap1", "·Seat12", "·Back pad3"]);
    expect(b.getAttribute("aria-label")).toBe("Chest Fly settings: Gap 1 · Seat 12 · Back pad 3. Opens the machine card to change them.");
    act(() => b.click());
    expect(onSetUp).toHaveBeenCalledWith("m-chest-fly");
  });

  it("never claims a count while the settings are unread, and is no button with nothing to show", () => {
    draw(fly({ dialsNotSet: 2 }));
    expect(setup()!.textContent).toBe("Gap1");
    draw({ machine: { id: "m-neck", name: "Neck", group: "Neck", dialsNotSet: 0, firstSetup: true }, sets: {} });
    expect(setup()).toBeNull();
  });

  it("does nothing without a door: disabled, never a dead tap", () => {
    draw(fly({ dialsNotSet: 2, firstSetup: true }));
    expect(setup()!.disabled).toBe(true);
  });

  /* The bar is memo: given the same row and the same onSetUp it does not
     draw again, and a new function each time would draw it on every one of
     the tracker's renders. So the tracker hands it ONE function for the
     life of the screen (a callback with no deps, as onAddPlanned is). */
  it("does not draw again for the same row and the same onSetUp (the bar is memo), and does for a new function", () => {
    const onSetUp = vi.fn();
    const r = fly({ dialsNotSet: 2, firstSetup: true });
    draw(r, onSetUp);
    const before = draws.n;
    draw(r, onSetUp);
    expect(draws.n, "same props: no draw").toBe(before);
    draw(r, () => {});
    expect(draws.n, "a new function: a draw").toBe(before + 1);
  });

  it("is handed one stable function by the tracker: a callback with no deps, and none at all while an open session has no client", () => {
    const src = readFileSync(resolve(__dirname, "../../components/WorkoutTrackerView.tsx"), "utf8");
    expect(src).toMatch(/const onSetUpMachine = React\.useCallback\(\(id: string\) => \{[^}]*\}, \[\]\);/);
    expect(src).toMatch(/const onSetUpDoor = noClientYet \? undefined : onSetUpMachine;/);
    expect(src.match(/onSetUp=\{onSetUpDoor\}/g)).toHaveLength(2);
  });

  it("is drawn as a raised control at 40px that wraps, never cut (journey-grid.css)", () => {
    const css = readFileSync(resolve(__dirname, "journey-grid.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rule = /\.jg-nb__setup\s*\{([^}]*)\}/.exec(css)![1];
    expect(rule).toMatch(/min-height:\s*40px/);
    expect(rule).toMatch(/white-space:\s*normal/);
    expect(rule).toMatch(/background:\s*var\(--jg-raised\)/);
    expect(rule).not.toMatch(/text-overflow|nowrap|line-clamp/);
  });
});
