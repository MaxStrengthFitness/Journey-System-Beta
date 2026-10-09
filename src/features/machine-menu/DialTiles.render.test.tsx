// @vitest-environment jsdom
/**
 * THE SETTINGS TILES, MOUNTED (the machine menu, phase 5).
 *
 * The tiles keep a draft, an open editor and a save's outcome in state, so
 * only a mount proves (machine menu design §C, "Settings: changing Seat 4 →
 * 5, tap by tap"):
 *
 *   - Seat 4 → 5 is saved in two taps once the card is open (+, then Save
 *     Seat 5), with no reason, and the strip turns into "Seat 5 saved" with
 *     Undo;
 *   - a reason chip's words go to `saveSettings` as they are;
 *   - Undo writes the reverse through the same path: reason "Undone", no
 *     second journal copy;
 *   - an empty dial has no ±, says "Not set" with "Use 6" and the studio
 *     standard, and Use fills the tile only when it is tapped;
 *   - offline the save is "saved on this iPad"; a refused save keeps the
 *     change and says so;
 *   - a watched session shows values and no buttons;
 *   - "Last changed …" selects that change; a failed read says so;
 *   - the position row, and the height-band line on an empty dial's editor,
 *     word for word.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const saves = vi.hoisted(() => ({
  calls: [] as Record<string, unknown>[],
  answer: "ok" as "ok" | "never" | "refuse" | "later",
  /** "later": each save's own answer, given by the test. */
  pending: [] as { reject: (e: unknown) => void }[],
}));
vi.mock("../equipment/mutations", () => ({
  saveSettings: (args: Record<string, unknown>) => {
    saves.calls.push(args);
    if (saves.answer === "never") return new Promise(() => {});
    if (saves.answer === "later") return new Promise((_resolve, reject) => saves.pending.push({ reject }));
    if (saves.answer === "refuse") return Promise.reject(new Error("permission-denied"));
    const fields = args.fields as { key: string }[];
    const settings: Record<string, string> = { ...(args.saved as Record<string, string>) };
    for (const f of fields) {
      const v = String((args.draft as Record<string, string>)[f.key] ?? "").trim();
      if (v) settings[f.key] = v;
      else delete settings[f.key];
    }
    return Promise.resolve({ changes: [], summary: "", reason: String(args.reason ?? ""), settings, sources: {} });
  },
}));

const trend = vi.hoisted(() => ({ value: null as unknown, enabledWith: [] as boolean[] }));
vi.mock("../equipment/useMachineTrend", () => ({
  useMachineTrend: (_id: string, enabled: boolean) => {
    trend.enabledWith.push(enabled);
    return enabled ? trend.value : null;
  },
}));

const acks = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[] }));
vi.mock("../machine-fit/setup-save", () => ({
  acknowledgeFlag: (args: Record<string, unknown>) => {
    acks.calls.push(args);
    return Promise.resolve();
  },
}));

import { DialTiles, type DialTilesProps, type TileField } from "./DialTiles";
import type { FitData } from "../machine-fit/fit-store";
import { normalizeSettingKey } from "../machine-trends/trends";
import { forgetPersonalMemory } from "../sign-out/memory";
import { LEG_PRESS_HISTORY, TODAY } from "./fixtures";
import { UNDO_REASON, parseSettingHistory } from "./setting-history";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIELDS: TileField[] = [
  { key: "seat", label: "Seat", type: "text", ghost: "6", absolute: false },
  { key: "backPad", label: "Back pad", type: "text", ghost: "3", absolute: false },
  { key: "footPlate", label: "Foot plate", type: "text", ghost: null, absolute: false },
];
const SAVED = { seat: "4", backPad: "3", footPlate: "High" };
const AUTHOR = { id: "uid-sam", fullName: "Sam Reyes", initials: "SR" };

function Tiles(over: Partial<DialTilesProps>) {
  return (
    <DialTiles
      machineId="leg-press"
      machineName="Leg Press"
      fields={FIELDS}
      saved={SAVED}
      clientId="avery"
      clientFirstName="Avery"
      author={AUTHOR}
      journal={{ studioId: "westlake", origin: "in_session", sessionId: "s-71", sessionNumber: 71, sessionDay: TODAY }}
      today={TODAY}
      history={[]}
      historyState="ready"
      online
      {...over}
    />
  );
}

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(node: ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  mounted.push({ root, host });
  return host;
}

beforeEach(() => {
  // What the cards knew of the settings (known-settings.ts), as at sign-in.
  forgetPersonalMemory();
  saves.calls = [];
  saves.pending = [];
  saves.answer = "ok";
  acks.calls = [];
  trend.value = null;
  trend.enabledWith = [];
});

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
  vi.useRealTimers();
});

async function click(el: Element | null) {
  expect(el).not.toBeNull();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const button = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent?.trim()) === label) ?? null;
const byText = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) ?? null;
const tile = (host: HTMLElement, key: string) => host.querySelector<HTMLElement>(`[data-dial="${key}"]`)!;

describe("Seat 4 → 5", () => {
  it("is saved in two taps once the card is open, with no reason, and turns into 'Seat 5 saved' with Undo", async () => {
    const onSaved = vi.fn();
    const host = await mount(<Tiles onSaved={onSaved} />);
    expect(host.querySelector('[data-strip="edit"]')).toBeNull();

    await click(button(host, "Seat up one")); // tap 1
    expect(tile(host, "seat").getAttribute("data-changed")).toBe("true");
    expect(tile(host, "seat").textContent).toContain("was 4");
    const strip = host.querySelector('[data-strip="edit"]')!;
    expect(strip.textContent).toContain("Seat 4 → 5");
    expect(strip.textContent).toContain("Why? (optional)");

    await click(byText(host, "Save Seat 5")); // tap 2
    expect(saves.calls).toHaveLength(1);
    expect(saves.calls[0]).toMatchObject({
      clientId: "avery",
      machineId: "leg-press",
      saved: SAVED,
      draft: { ...SAVED, seat: "5" },
      reason: "",
      isInitialSetup: false,
      machineName: "Leg Press",
      journal: { studioId: "westlake", origin: "in_session", sessionId: "s-71", sessionNumber: 71 },
    });
    expect(saves.calls[0].fileNote).toBeUndefined();
    const done = host.querySelector('[data-strip="done"]')!;
    expect(done.textContent).toContain("Seat 5 saved");
    expect(byText(host, "Undo")).not.toBeNull();
    expect(host.querySelector('[data-strip="edit"]')).toBeNull();
    expect(tile(host, "seat").getAttribute("data-changed")).toBeNull();
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("passes a reason chip's words through, and a second tap takes it back", async () => {
    const host = await mount(<Tiles />);
    await click(button(host, "Seat up one"));
    await click(byText(host, "Range of motion"));
    expect(byText(host, "Range of motion")!.getAttribute("aria-pressed")).toBe("true");
    await click(byText(host, "Alignment"));
    await click(byText(host, "Alignment"));
    expect(byText(host, "Alignment")!.getAttribute("aria-pressed")).toBe("false");
    await click(byText(host, "Comfort or fit"));
    await click(byText(host, "Save Seat 5"));
    expect(saves.calls[0].reason).toBe("Comfort or fit");
  });

  it("Undo writes the reverse through the same path: reason Undone, no second journal copy", async () => {
    const host = await mount(<Tiles />);
    await click(button(host, "Seat up one"));
    await click(byText(host, "Save Seat 5"));
    await click(byText(host, "Undo"));
    expect(saves.calls).toHaveLength(2);
    expect(saves.calls[1]).toMatchObject({
      saved: { ...SAVED, seat: "5" },
      draft: SAVED,
      reason: UNDO_REASON,
      isInitialSetup: false,
      fileNote: false,
    });
    expect(host.querySelector('[data-strip="done"]')!.textContent).toContain("Seat back to 4");
    expect(tile(host, "seat").textContent).toContain("4");
    expect(byText(host, "Undo")).toBeNull();
  });

  it("keeps Undo for ten seconds, and the words after", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const host = await mount(<Tiles />);
    await click(button(host, "Seat up one"));
    await click(byText(host, "Save Seat 5"));
    expect(byText(host, "Undo")).not.toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(10_001);
    });
    expect(byText(host, "Undo")).toBeNull();
    expect(host.querySelector('[data-strip="done"]')!.textContent).toContain("Seat 5 saved");
  });

  it("offers a Health note after a save for pain or discomfort, with the change typed", async () => {
    const onAddHealthNote = vi.fn();
    const host = await mount(<Tiles onAddHealthNote={onAddHealthNote} />);
    await click(button(host, "Seat up one"));
    await click(byText(host, "Pain or discomfort"));
    await click(byText(host, "Save Seat 5"));
    await click(byText(host, "Add a Health note"));
    expect(onAddHealthNote).toHaveBeenCalledWith("Seat 4 → 5");
  });

  it("is 'saved on this iPad' offline, without waiting for the database", async () => {
    saves.answer = "never";
    const host = await mount(<Tiles online={false} />);
    await click(button(host, "Seat up one"));
    await click(byText(host, "Save Seat 5"));
    expect(host.querySelector('[data-strip="done"]')!.textContent).toContain("Seat 5 saved on this iPad · it sends when the Wi-Fi is back");
    // Undo still knows what to put back: the map saveSettings builds.
    await click(byText(host, "Undo"));
    expect(saves.calls[1]).toMatchObject({ saved: { ...SAVED, seat: "5" }, draft: SAVED, reason: UNDO_REASON, fileNote: false });
  });

  it("keeps the change and says so when the save is refused", async () => {
    saves.answer = "refuse";
    const host = await mount(<Tiles />);
    await click(button(host, "Seat up one"));
    await click(byText(host, "Save Seat 5"));
    const strip = host.querySelector('[data-strip="edit"]')!;
    expect(strip.textContent).toContain("Couldn't save Seat 5. Your change is still here.");
    expect(tile(host, "seat").getAttribute("data-changed")).toBe("true");
    saves.answer = "ok";
    await click(byText(host, "Try again"));
    expect(saves.calls).toHaveLength(2);
    expect(host.querySelector('[data-strip="done"]')!.textContent).toContain("Seat 5 saved");
  });

  it("puts everything back on Cancel", async () => {
    const host = await mount(<Tiles />);
    await click(button(host, "Seat up one"));
    await click(byText(host, "Cancel"));
    expect(host.querySelector('[data-strip="edit"]')).toBeNull();
    expect(tile(host, "seat").getAttribute("data-changed")).toBeNull();
    expect(saves.calls).toHaveLength(0);
  });
});

describe("an empty dial", () => {
  const EMPTY_PAD = { seat: "4", footPlate: "High" };

  it("has no ±, says Not set with Use 3 and the studio standard, and Use fills only on tap", async () => {
    const host = await mount(<Tiles saved={EMPTY_PAD} />);
    const pad = tile(host, "backPad");
    expect(button(host, "Back pad up one")).toBeNull();
    expect(button(host, "Back pad down one")).toBeNull();
    expect(pad.textContent).toContain("Not set");
    expect(pad.textContent).toContain("Studio standard 3");
    // The standard shows only on an empty dial.
    expect(tile(host, "seat").textContent).not.toContain("Studio standard");
    expect(host.querySelector('[data-strip="edit"]')).toBeNull();

    await click(button(host, "Use 3 for Back pad"));
    expect(pad.getAttribute("data-changed")).toBe("true");
    expect(pad.textContent).toContain("was not set");
    expect(host.querySelector('[data-strip="edit"]')!.textContent).toContain("Back pad — → 3");
    await click(byText(host, "Save Back pad 3"));
    // Use marks the value "suggested" while it stands, for machine fit.
    expect(saves.calls[0]).toMatchObject({ draft: { ...EMPTY_PAD, backPad: "3" }, changedSources: { backPad: "suggested" } });
  });

  it("offers the height-band line on its editor, word for word, with its own Use", async () => {
    trend.value = { settings: { "back-pad": { "2": { clients: 9, byHeight: { "66": 3, "67": 2, "75": 4 } } } } };
    const host = await mount(<Tiles saved={EMPTY_PAD} clientHeight={`5'7"`} />);
    expect(trend.enabledWith.every((e) => e === false)).toBe(true);
    await click(button(host, "Back pad: not set. Set it"));
    expect(host.textContent).toContain(`Around 5'7" here, the most common setting is 2 (5 of 5 clients)`);
    await click(button(host, "Use 2 for Back pad"));
    expect(tile(host, "backPad").textContent).toContain("2");
    expect(host.querySelector('[data-strip="edit"]')!.textContent).toContain("Back pad — → 2");
  });

  it("starts a first set-up with no 'Why?' and saves it as one", async () => {
    const host = await mount(<Tiles saved={{}} />);
    await click(button(host, "Use 6 for Seat"));
    const strip = host.querySelector('[data-strip="edit"]')!;
    expect(strip.textContent).toContain("Seat — → 6");
    expect(strip.textContent).not.toContain("Why?");
    await click(byText(host, "Save set-up"));
    expect(saves.calls[0]).toMatchObject({ isInitialSetup: true, reason: "" });
  });
});

describe("a big jump", () => {
  it("opens a row of positions from the record, the saved one ringed with 'now'", async () => {
    const host = await mount(<Tiles snapshots={[{ seat: "3" }, { seat: "7" }]} />);
    await click(button(host, "Seat 4. Pick a position"));
    const row = host.querySelector('[data-editor="positions"]')!;
    const labels = [...row.querySelectorAll("button")].map((b) => b.textContent?.trim());
    expect(labels).toEqual(["Done", "3", "4", "5", "6", "7"]);
    expect(row.querySelector('[data-now="true"]')?.textContent).toBe("4");
    expect(row.textContent).toContain("now");
    expect(row.textContent).toContain("Studio standard: 6");
    await click([...row.querySelectorAll("button")].find((b) => b.textContent === "6")!);
    expect(host.querySelector('[data-strip="edit"]')!.textContent).toContain("Seat 4 → 6");
    await click(byText(host, "Done"));
    expect(host.querySelector('[data-editor="positions"]')).toBeNull();
  });

  it("shows a word value with Change, and its chips fill only when tapped", async () => {
    const host = await mount(<Tiles snapshots={[{ footPlate: "Low" }]} />);
    expect(button(host, "Foot plate up one")).toBeNull();
    await click(button(host, "Change Foot plate"));
    const editor = host.querySelector('[data-editor="field"]')!;
    expect(editor.querySelector("input")!.value).toBe("High");
    expect(host.querySelector('[data-strip="edit"]')).toBeNull();
    await click([...editor.querySelectorAll("button")].find((b) => b.textContent === "Low")!);
    expect(host.querySelector('[data-strip="edit"]')!.textContent).toContain("Foot plate High → Low");
  });
});

describe("the heading and a watched session", () => {
  const rows = parseSettingHistory(LEG_PRESS_HISTORY, "avery");

  it("says when it last changed, and selects that change when tapped", async () => {
    const onLastChanged = vi.fn();
    const host = await mount(<Tiles history={rows} onLastChanged={onLastChanged} />);
    const last = host.querySelector("[data-last-changed]")!;
    expect(last.textContent).toBe("Last changed Aug 18 · Back pad 3 → 2 ›");
    await click(last);
    expect(onLastChanged).toHaveBeenCalledWith(expect.objectContaining({ id: "h4" }));
  });

  it("never reads a failed read as 'never changed', and says nothing while loading", async () => {
    const failed = await mount(<Tiles history={null} historyState="failed" />);
    expect(failed.querySelector("[data-last-changed]")!.textContent).toBe("Changes couldn't be loaded");
    const cache = await mount(<Tiles history={[]} historyState="cache-only" />);
    expect(cache.querySelector("[data-last-changed]")!.textContent).toBe("Changes couldn't be loaded");
    const loading = await mount(<Tiles history={null} historyState="loading" />);
    expect(loading.querySelector("[data-last-changed]")).toBeNull();
    const none = await mount(<Tiles saved={{}} history={[]} historyState="ready" />);
    expect(none.querySelector("[data-last-changed]")!.textContent).toBe("No settings saved yet");
  });

  it("shows a watched session's values with no buttons at all", async () => {
    const host = await mount(<Tiles readOnly saved={{ seat: "4", footPlate: "High" }} />);
    expect(host.querySelectorAll(".mm-tiles button")).toHaveLength(0);
    expect(tile(host, "seat").textContent).toContain("4");
    expect(tile(host, "backPad").textContent).toContain("Not set");
    expect(tile(host, "backPad").textContent).not.toContain("Use");
  });

  it("draws nothing to change on a machine with no dials", async () => {
    const host = await mount(<Tiles fields={[]} saved={{}} />);
    expect(host.textContent).toContain("This machine has no adjustable settings on its catalog entry.");
  });
});

/** Mount, and a way to hand the same tiles new props (a catalog snapshot, another iPad's save). */
async function mountTiles(over: Partial<DialTilesProps>) {
  const host = await mount(<Tiles {...over} />);
  const { root } = mounted[mounted.length - 1];
  return { host, rerender: (next: Partial<DialTilesProps>) => act(async () => root.render(<Tiles {...next} />)) };
}

describe("the seed moving under the draft", () => {
  it("draws a catalog-only dial with its saved value when the catalog arrives, with no change strip", async () => {
    const { host, rerender } = await mountTiles({ fields: [], saved: { seat: "5" } });
    await rerender({ fields: [FIELDS[0]], saved: { seat: "5" } });
    expect(host.querySelector('[data-strip="edit"]')).toBeNull();
    expect(tile(host, "seat").textContent).toContain("5");
    expect(tile(host, "seat").textContent).not.toContain("Not set");
  });

  // Deliberately changed (the open session round, Oct 9 2026, finding 5): a
  // gap with no value of the machine's own opened as "0" until then, and the
  // first save wrote Gap 0. It is "Not set" now, until the catalog says 2.
  it("moves an untouched gap from Not set to the catalog's 2 without a change anybody made", async () => {
    const gap: TileField = { key: "gap", label: "Gap", type: "text", ghost: null, absolute: true };
    const { host, rerender } = await mountTiles({ fields: [gap], saved: {} });
    expect(tile(host, "gap").textContent).toContain("Not set");
    await rerender({ fields: [{ ...gap, ghost: "2" }], saved: {} });
    expect(host.querySelector('[data-strip="edit"]')).toBeNull();
    expect(tile(host, "gap").textContent).toContain("2");
  });

  it("keeps the trainer's change and takes another iPad's: the strip says only Seat, and Save never writes Back pad back", async () => {
    const { host, rerender } = await mountTiles({});
    await click(button(host, "Seat up one"));
    await rerender({ saved: { ...SAVED, backPad: "2" } });
    const strip = host.querySelector('[data-strip="edit"]')!;
    expect(strip.textContent).toContain("Seat 4 → 5");
    expect(strip.textContent).not.toContain("Back pad");
    expect(tile(host, "backPad").getAttribute("data-changed")).toBeNull();
    await click(byText(host, "Save Seat 5"));
    expect(saves.calls[0]).toMatchObject({ saved: { ...SAVED, backPad: "2" }, draft: { ...SAVED, backPad: "2", seat: "5" } });
  });
});

describe("a refusal that comes after 'saved on this iPad'", () => {
  it("takes back the Undo and brings the change back with Try again", async () => {
    saves.answer = "later";
    const host = await mount(<Tiles online={false} />);
    await click(button(host, "Seat up one"));
    await click(byText(host, "Save Seat 5"));
    expect(host.querySelector('[data-strip="done"]')!.textContent).toContain("saved on this iPad");
    await act(async () => {
      saves.pending[0].reject(new Error("permission-denied"));
    });
    expect(byText(host, "Undo")).toBeNull();
    const strip = host.querySelector('[data-strip="edit"]')!;
    expect(strip.textContent).toContain("Couldn't save Seat 5");
    expect(tile(host, "seat").getAttribute("data-changed")).toBe("true");
    expect(byText(host, "Try again")).not.toBeNull();
  });

  it("says a refused Undo, with Try again", async () => {
    const host = await mount(<Tiles online={false} />);
    await click(button(host, "Seat up one"));
    await click(byText(host, "Save Seat 5"));
    saves.answer = "later";
    await click(byText(host, "Undo"));
    await act(async () => {
      saves.pending[0].reject(new Error("permission-denied"));
    });
    expect(host.querySelector('[data-strip="done"]')!.textContent).toContain("Couldn't undo Seat 5");
    expect(byText(host, "Try again")).not.toBeNull();
  });

  it("says it in the app's toast once the card has closed", async () => {
    saves.answer = "later";
    const show = vi.fn();
    (window as unknown as { __showToast?: typeof show }).__showToast = show;
    try {
      const host = await mount(<Tiles online={false} />);
      await click(button(host, "Seat up one"));
      await click(byText(host, "Save Seat 5"));
      const m = mounted.pop()!;
      await act(async () => m.root.unmount());
      m.host.remove();
      await act(async () => {
        saves.pending[0].reject(new Error("permission-denied"));
      });
      expect(show).toHaveBeenCalledWith("Leg Press for Avery: couldn't save Seat 5. Set it again on the machine's card.", "error", 8000);
    } finally {
      delete (window as unknown as { __showToast?: unknown }).__showToast;
    }
  });
});

describe("a save the database never answers (speed round R9: the card never waits)", () => {
  it("is done at once, online: 'Seat 5 saved' with Undo, and the dials are free for the next change", async () => {
    saves.answer = "never";
    const host = await mount(<Tiles />);
    await click(button(host, "Seat up one"));
    await click(byText(host, "Save Seat 5"));
    expect(host.querySelector('[data-strip="done"]')!.textContent).toContain("Seat 5 saved");
    expect(button(host, "Back pad up one")!.hasAttribute("disabled")).toBe(false);
    expect(saves.calls).toHaveLength(1);
  });

  it("says 'saved on this iPad' once the answer is late, honestly, without ever holding the card", async () => {
    vi.useFakeTimers();
    saves.answer = "never";
    const host = await mount(<Tiles />);
    await click(button(host, "Seat up one"));
    await click(byText(host, "Save Seat 5"));
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(host.querySelector('[data-strip="done"]')!.textContent).not.toContain("on this iPad");
    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    expect(host.querySelector('[data-strip="done"]')!.textContent).toContain("Seat 5 saved on this iPad");
  });
});

/* ------------------------------------------------------------------ *
 * Quick set-up (the open session round, Oct 9 2026; AJ's "2a")
 * ------------------------------------------------------------------ */

const field = (host: HTMLElement) => host.querySelector<HTMLInputElement>('[data-editor="field"] input');
const editorTitle = (host: HTMLElement) => host.querySelector("[data-editor] .mm-pos__title")?.textContent ?? null;
const stepBtn = (host: HTMLElement, step: "next" | "done") => host.querySelector<HTMLButtonElement>(`[data-editor] [data-step="${step}"]`);

/** Draws the last card mounted again with new props, as its host does. */
async function rerender(node: ReactNode) {
  const m = mounted[mounted.length - 1];
  await act(async () => m.root.render(node));
}

/** Machine fit's answer: this studio's clients on the Leg Press, at these seats. */
const studioFit = (seats: string[]): FitData =>
  ({
    status: "ready",
    sources: { "leg-press": { studio: seats.map((v) => ({ settings: { [normalizeSettingKey("seat")]: v } })), company: null } },
    studioCounts: { "leg-press": seats.length },
  }) as unknown as FitData;

/** Unmounts the last card mounted, as its host does when Save closes it. */
async function closeLast() {
  const m = mounted.pop()!;
  await act(async () => m.root.unmount());
  m.host.remove();
}

/** Types into the open field one key at a time, as a finger does, checking the field holds still. */
async function typeKeys(host: HTMLElement, text: string) {
  const input = field(host);
  expect(input).not.toBeNull();
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  for (const ch of text) {
    await act(async () => {
      setValue.call(input, input!.value + ch);
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // The same field after every key: never swapped for a row of positions.
    expect(field(host)).toBe(input);
    expect(host.querySelector('[data-editor="positions"]')).toBeNull();
  }
}

describe("typing into an empty dial (finding 5)", () => {
  it("takes 12 as typed, on the number pad, and the field holds still", async () => {
    const host = await mount(<Tiles saved={{}} />);
    await click(button(host, "Seat: not set. Set it"));
    expect(field(host)!.getAttribute("inputmode")).toBe("decimal");
    await typeKeys(host, "12");
    expect(field(host)!.value).toBe("12");
    expect(tile(host, "seat").textContent).toContain("12");
    expect(host.querySelector('[data-strip="edit"]')!.textContent).toContain("Seat — → 12");
  });

  it("holds still when machine fit answers mid-typing: still the field, still the number pad, and 12 goes in", async () => {
    const loading: FitData = { status: "loading", sources: {}, studioCounts: {} };
    const host = await mount(<Tiles saved={{}} fit={loading} />);
    await click(button(host, "Seat: not set. Set it"));
    await typeKeys(host, "1");
    const input = field(host);
    // The studio's clients sit at 3 to 9: a row of those would hold no 12.
    await rerender(<Tiles saved={{}} fit={studioFit(["3", "5", "7", "9"])} />);
    expect(field(host)).toBe(input);
    expect(host.querySelector('[data-editor="positions"]')).toBeNull();
    expect(field(host)!.getAttribute("inputmode")).toBe("decimal");
    await typeKeys(host, "2");
    expect(field(host)!.value).toBe("12");
    expect(host.querySelector('[data-strip="edit"]')!.textContent).toContain("Seat — → 12");
  });

  it("opens an empty dial on the number pad even once the studio's span is known: a new client's value may be outside it", async () => {
    const host = await mount(<Tiles saved={{}} fit={studioFit(["3", "5", "7", "9"])} focusDial />);
    expect(editorTitle(host)).toBe("Seat");
    expect(host.querySelector('[data-editor="positions"]')).toBeNull();
    expect(field(host)!.getAttribute("inputmode")).toBe("decimal");
  });

  it("opens a row holding a value stepped past the record with +, ringed as the pick", async () => {
    const host = await mount(<Tiles snapshots={[{ seat: "3" }, { seat: "7" }]} />);
    for (let i = 0; i < 4; i++) await click(button(host, "Seat up one"));
    expect(tile(host, "seat").textContent).toContain("8");
    await click(button(host, "Seat 8. Pick a position"));
    const row = host.querySelector('[data-editor="positions"]')!;
    const labels = [...row.querySelectorAll(".mm-pos__btn")].map((b) => b.textContent?.trim());
    expect(labels).toEqual(["3", "4", "5", "6", "7", "8"]);
    expect(row.querySelector('[aria-pressed="true"]')?.textContent).toBe("8");
  });

  it("keeps the letters for a word dial", async () => {
    const host = await mount(<Tiles saved={{}} fields={[{ key: "footPlate", label: "Foot plate", type: "text", ghost: "High", absolute: false }]} />);
    await click(button(host, "Foot plate: not set. Set it"));
    expect(field(host)!.getAttribute("inputmode")).toBe("text");
  });

  it("never writes Gap 0 on a machine with no gap of its own: the gap is Not set and the save leaves it out", async () => {
    const gap: TileField = { key: "gap", label: "Gap", type: "text", ghost: null, absolute: false };
    const seat: TileField = { key: "seat", label: "Seat", type: "text", ghost: null, absolute: false };
    const host = await mount(<Tiles fields={[gap, seat]} saved={{}} />);
    expect(tile(host, "gap").textContent).toContain("Not set");
    expect(tile(host, "gap").textContent).not.toContain("Same for every client");
    await click(button(host, "Seat: not set. Set it"));
    await typeKeys(host, "12");
    const strip = host.querySelector('[data-strip="edit"]')!;
    expect(strip.textContent).toContain("Seat — → 12");
    expect(strip.textContent).not.toContain("Gap");
    await click(byText(host, "Save set-up"));
    expect((saves.calls[0].draft as Record<string, string>).gap).toBe("");
    expect(saves.calls[0].draft).toMatchObject({ seat: "12" });
  });
});

describe("Set up from the Now Bar (focusDial, onSaveClose)", () => {
  afterEach(() => {
    delete (window as unknown as { __showToast?: unknown }).__showToast;
  });

  it("opens on the first empty dial at once, its field focused on the number pad", async () => {
    const host = await mount(<Tiles saved={{ seat: "4" }} focusDial />);
    expect(editorTitle(host)).toBe("Back pad");
    expect(document.activeElement).toBe(field(host));
    expect(field(host)!.getAttribute("inputmode")).toBe("decimal");
  });

  it("opens nothing without focusDial, and nothing when every dial has a value", async () => {
    const plain = await mount(<Tiles saved={{}} />);
    expect(plain.querySelector("[data-editor]")).toBeNull();
    const full = await mount(<Tiles focusDial />);
    expect(full.querySelector("[data-editor]")).toBeNull();
  });

  it("Next walks the empty dials in order; Enter does the same; the last one says Done", async () => {
    const host = await mount(<Tiles saved={{}} focusDial />);
    expect(editorTitle(host)).toBe("Seat");
    await typeKeys(host, "12");
    expect(stepBtn(host, "next")!.getAttribute("aria-label")).toBe("Next: Back pad");
    await click(stepBtn(host, "next"));
    expect(editorTitle(host)).toBe("Back pad");
    expect(document.activeElement).toBe(field(host));
    await typeKeys(host, "3");
    // Enter, from the keyboard: on to Foot plate, the last empty dial.
    await act(async () => {
      field(host)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    expect(editorTitle(host)).toBe("Foot plate");
    expect(stepBtn(host, "next")).toBeNull();
    await click(stepBtn(host, "done"));
    expect(host.querySelector("[data-editor]")).toBeNull();
    expect(host.querySelector('[data-strip="edit"]')!.textContent).toContain("Seat — → 12 · Back pad — → 3");
  });

  it("Use studio standard for all fills every empty dial with one, still unsaved, and saves them as suggested", async () => {
    const host = await mount(<Tiles saved={{}} focusDial />);
    const all = host.querySelector<HTMLButtonElement>("[data-use-all]");
    expect(all!.textContent).toBe("Use studio standard for all");
    await click(all);
    expect(saves.calls).toHaveLength(0);
    expect(tile(host, "seat").textContent).toContain("6");
    expect(tile(host, "backPad").textContent).toContain("3");
    expect(tile(host, "footPlate").textContent).toContain("Not set");
    expect(host.querySelector("[data-use-all]")).toBeNull();
    // The editor on Seat closed: Seat has its value.
    expect(host.querySelector("[data-editor]")).toBeNull();
    await click(byText(host, "Save set-up"));
    expect(saves.calls[0]).toMatchObject({
      draft: { seat: "6", backPad: "3", footPlate: "" },
      changedSources: { seat: "suggested", backPad: "suggested" },
    });
  });

  it("opens on the first EMPTY dial when the dials arrive after the card: not on a gap the machine filled", async () => {
    const gap: TileField = { key: "gap", label: "Gap", type: "text", ghost: "2", absolute: true };
    const host = await mount(<Tiles saved={{}} fields={[]} focusDial />);
    expect(host.querySelector("[data-editor]")).toBeNull();
    await rerender(<Tiles saved={{}} fields={[gap, FIELDS[0], FIELDS[1]]} focusDial />);
    expect(tile(host, "gap").textContent).toContain("2");
    expect(editorTitle(host)).toBe("Seat");
  });

  it("offers Next only on Set up's walk: from any other door the editor keeps Done", async () => {
    const host = await mount(<Tiles saved={{}} />);
    await click(button(host, "Seat: not set. Set it"));
    expect(stepBtn(host, "next")).toBeNull();
    await click(stepBtn(host, "done"));
    expect(host.querySelector("[data-editor]")).toBeNull();
  });

  it("offers Use studio standard for all only from two empty dials with a standard", async () => {
    const host = await mount(<Tiles saved={{ seat: "4" }} />);
    expect(host.querySelector("[data-use-all]")).toBeNull();
  });

  it("Seat 12 and Back pad 3 on a first time: three taps and the digits, then the card closes with Undo in the toast", async () => {
    const show = vi.fn();
    (window as unknown as { __showToast?: typeof show }).__showToast = show;
    const onSaveClose = vi.fn();
    const twoDials: TileField[] = [FIELDS[0], FIELDS[1]];
    // Tap 1 is the Now Bar's Set up: the card opens like this.
    const host = await mount(<Tiles fields={twoDials} saved={{}} focusDial onSaveClose={onSaveClose} />);
    await typeKeys(host, "12");
    await click(stepBtn(host, "next")); // tap 2
    await typeKeys(host, "3");
    await click(byText(host, "Save set-up")); // tap 3
    expect(saves.calls).toHaveLength(1);
    expect(saves.calls[0]).toMatchObject({ draft: { seat: "12", backPad: "3" }, isInitialSetup: true, reason: "" });
    expect(onSaveClose).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledTimes(1);
    const [words, kind, ms, action] = show.mock.calls[0];
    expect([words, kind, ms]).toEqual(["Leg Press for Avery: set-up saved", "success", 10_000]);
    expect(action.label).toBe("Undo");
    // The toast's Undo works with the card gone: the same reverse write.
    const m = mounted.pop()!;
    await act(async () => m.root.unmount());
    m.host.remove();
    await act(async () => action.run());
    expect(saves.calls).toHaveLength(2);
    expect(saves.calls[1]).toMatchObject({
      saved: { seat: "12", backPad: "3" },
      draft: { seat: "", backPad: "" },
      reason: UNDO_REASON,
      fileNote: false,
    });
  });

  it("the toast's Undo never takes back a later save: Set up twice, then the first toast's Undo puts back only Seat", async () => {
    const show = vi.fn();
    (window as unknown as { __showToast?: typeof show }).__showToast = show;
    const twoDials: TileField[] = [FIELDS[0], FIELDS[1]];
    // Set up, Seat 12, Save: the card closes with toast 1.
    const first = await mount(<Tiles fields={twoDials} saved={{}} focusDial onSaveClose={() => {}} />);
    await typeKeys(first, "12");
    await click(byText(first, "Save set-up"));
    const undo1 = show.mock.calls[0][3];
    await closeLast();
    // The button says "Seat 12 · 1 not set": Set up again, Back pad 3, Save (toast 2).
    const second = await mount(<Tiles fields={twoDials} saved={{ seat: "12" }} focusDial onSaveClose={() => {}} />);
    expect(editorTitle(second)).toBe("Back pad");
    await typeKeys(second, "3");
    await click(byText(second, "Save Back pad 3"));
    expect(saves.calls).toHaveLength(2);
    await closeLast();
    // Toast 1's Undo, inside its ten seconds: Seat goes, Back pad 3 stays.
    await act(async () => undo1.run());
    expect(saves.calls).toHaveLength(3);
    expect(saves.calls[2]).toMatchObject({ saved: { seat: "12", backPad: "3" }, draft: { seat: "", backPad: "3" }, reason: UNDO_REASON });
  });

  it("the toast's Undo writes nothing when every dial it saved has changed since, and says so", async () => {
    const show = vi.fn();
    (window as unknown as { __showToast?: typeof show }).__showToast = show;
    const first = await mount(<Tiles fields={[FIELDS[0], FIELDS[1]]} saved={{}} focusDial onSaveClose={() => {}} />);
    await typeKeys(first, "12");
    await click(byText(first, "Save set-up"));
    const undo1 = show.mock.calls[0][3];
    await closeLast();
    // Another card on the same client and machine moves Seat to 13.
    const second = await mount(<Tiles fields={[FIELDS[0], FIELDS[1]]} saved={{ seat: "12" }} />);
    await click(button(second, "Seat up one"));
    await click(byText(second, "Save Seat 13"));
    expect(saves.calls).toHaveLength(2);
    await act(async () => undo1.run());
    expect(saves.calls).toHaveLength(2);
    expect(show).toHaveBeenLastCalledWith("Leg Press for Avery: changed again since, so nothing was undone.", "info", 6000);
  });

  it("says 'saved on this iPad' in the toast when the save is still out after the card closed", async () => {
    vi.useFakeTimers();
    saves.answer = "never";
    const show = vi.fn();
    (window as unknown as { __showToast?: typeof show }).__showToast = show;
    const host = await mount(<Tiles fields={[FIELDS[0], FIELDS[1]]} saved={{}} focusDial onSaveClose={() => {}} />);
    await typeKeys(host, "12");
    await click(byText(host, "Save set-up"));
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(show.mock.calls[0].slice(0, 3)).toEqual(["Leg Press for Avery: set-up saved", "success", 10_000]);
    await closeLast();
    await act(async () => {
      vi.advanceTimersByTime(3_000);
    });
    expect(show).toHaveBeenLastCalledWith("Leg Press for Avery: set-up saved on this iPad · it sends when the Wi-Fi is back", "info", 8000);
  });

  it("says a refused Undo in the toast once the card has closed", async () => {
    const show = vi.fn();
    (window as unknown as { __showToast?: typeof show }).__showToast = show;
    const host = await mount(<Tiles saved={{}} fields={[FIELDS[0], FIELDS[1]]} focusDial onSaveClose={() => {}} />);
    await typeKeys(host, "12");
    await click(byText(host, "Save set-up"));
    const action = show.mock.calls[0][3];
    saves.answer = "refuse";
    await act(async () => action.run());
    expect(show).toHaveBeenLastCalledWith("Leg Press for Avery: couldn't undo set-up. Set it again on the machine's card.", "error", 8000);
  });

  it("keeps the card open after a save for pain, so Add a Health note is still there", async () => {
    const onSaveClose = vi.fn();
    const host = await mount(<Tiles onSaveClose={onSaveClose} onAddHealthNote={() => {}} />);
    await click(button(host, "Seat up one"));
    await click(byText(host, "Pain or discomfort"));
    await click(byText(host, "Save Seat 5"));
    expect(onSaveClose).not.toHaveBeenCalled();
    expect(byText(host, "Add a Health note")).not.toBeNull();
  });

  it("does not close on a refused save: the change stays", async () => {
    saves.answer = "refuse";
    const onSaveClose = vi.fn();
    const host = await mount(<Tiles saved={{}} focusDial onSaveClose={onSaveClose} />);
    await typeKeys(host, "12");
    await click(byText(host, "Save set-up"));
    expect(onSaveClose).not.toHaveBeenCalled();
    expect(host.querySelector('[data-strip="edit"]')!.textContent).toContain("Couldn't save set-up");
  });
});
