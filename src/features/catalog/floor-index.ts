/**
 * OUR FLOOR — what the Catalog's floor index says, without the screen.
 *
 * Round: the Machine Catalog, Sep 28 2026 (Catalog R2 "Our floor"). AJ's pick
 * opens the Catalog on the studio's own floor, in the order its leader set,
 * each row carrying what a trainer reads walking up to the unit: its name,
 * the Academy movement and code, its PRESET (where its dials sit), its
 * switches, and whether it is out of service or flagged.
 *
 * FOUR STATES, NEVER THREE
 * ------------------------
 * The pin this round was built around: "an empty floor pretends to be full".
 * When a studio's machine list was empty or could not be read, the index
 * showed the twenty MSF machines under "Machines at Westlake". So:
 *
 *   loading      the list or the catalog is still arriving — say so
 *   unreadable   a read FAILED — "can't read the floor", nothing in its place
 *   empty        read fine, nothing on it — say that, and point at All MSF
 *   ready        the floor
 *
 * The MSF standard is never drawn as if it were the studio's floor.
 *
 * WHERE THE PRESET COMES FROM
 * ---------------------------
 * The same order the Active Session's ghost values use
 * (features/equipment/adapters.ts): the studio's own setup for the machine
 * (studioMachineSettings, the Catalog's "Studio setup" card), then the unit's
 * dial defaults (the roster's defaultSettings over the catalog's). A dial
 * with no number is counted, never guessed; a unit with none says so.
 *
 * FLAGS ARE RELAY'S
 * -----------------
 * Question 4 of the room took its default: the Catalog shows Out of service
 * (the machine list) and Flagged (Relay's care record,
 * studios/{s}/machineCare, read only), and no longer counts cleaning of its
 * own. A flag that could not be read is unknown, never "none flagged".
 *
 * PURE MODULE — no React, no Firestore.
 */

import { formatStudioDate, formatStudioTime } from "../../lib/studio-time";

export type FloorState = "loading" | "ready" | "empty" | "unreadable";

/** Which of the four the floor is in. A failed read is final: it wins over loading. */
export function floorStateOf(input: { loading: boolean; failed: boolean; count: number }): FloorState {
  if (input.failed) return "unreadable";
  if (input.loading) return "loading";
  return input.count > 0 ? "ready" : "empty";
}

/* ------------------------------------------------------------------ *
 * The preset
 * ------------------------------------------------------------------ */

export interface PresetDial {
  label: string;
  value: string;
}

export interface Preset {
  /** The dials with a number, in the unit's order. */
  dials: PresetDial[];
  /** Dials the unit has with no number yet. */
  unset: number;
  /**
   * "set" every dial has a number · "partial" some do · "none" the unit has
   * dials and no numbers · "no-dials" no dial is recorded for the unit.
   */
  state: "set" | "partial" | "none" | "no-dials";
}

/** The studio's own setup card for a machine (studioMachineSettings), as far as the preset reads it. */
export interface StudioSetupLike {
  settingOptions?: string[];
  standardSettings?: Record<string, string>;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function valueIn(map: Record<string, string> | undefined, ...names: string[]): string {
  if (!map) return "";
  for (const n of names) {
    const direct = map[n];
    if (direct !== undefined && String(direct).trim() !== "") return String(direct).trim();
  }
  const wanted = new Set(names.map(slug));
  for (const [k, v] of Object.entries(map)) {
    if (wanted.has(slug(k)) && v !== undefined && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

/** Where this unit's dials sit, from the studio's setup first and the unit's defaults second. */
export function presetOf(
  machine: { dials?: { key: string; label: string }[]; dialDefaults?: Record<string, string> },
  studio?: StudioSetupLike | null,
): Preset {
  const fromStudio = (studio?.settingOptions ?? []).map((l) => l.trim()).filter(Boolean);
  const dials =
    fromStudio.length > 0
      ? fromStudio.map((label) => ({
          label,
          key: machine.dials?.find((d) => slug(d.label) === slug(label))?.key ?? label,
        }))
      : (machine.dials ?? []);
  if (dials.length === 0) return { dials: [], unset: 0, state: "no-dials" };

  const set: PresetDial[] = [];
  let unset = 0;
  for (const d of dials) {
    const value =
      valueIn(studio?.standardSettings, d.label, d.key) || valueIn(machine.dialDefaults, d.key, d.label);
    if (value) set.push({ label: d.label, value });
    else unset += 1;
  }
  const state = set.length === 0 ? "none" : unset > 0 ? "partial" : "set";
  return { dials: set, unset, state };
}

/** The preset as one line: "Gap 2 · Chest Pad 4 · Handles M", or what is missing, in words. */
export function presetLine(p: Preset): string {
  if (p.state === "no-dials") return "No dials recorded for this unit";
  if (p.state === "none") return "No numbers set for this unit yet";
  const line = p.dials.map((d) => `${d.label} ${d.value}`).join(" · ");
  return p.state === "partial" ? `${line} · ${p.unset} not set` : line;
}

/* ------------------------------------------------------------------ *
 * The floor, in one sentence
 * ------------------------------------------------------------------ */

/**
 * "20 machines in walking order · 1 out of service · 2 flagged".
 *
 * `flagged` is null while Relay's care record is loading (nothing is said)
 * or when it could not be read (`flagsFailed`: said so).
 */
export function floorSentence(input: {
  count: number;
  outOfService: number;
  flagged: number | null;
  flagsFailed?: boolean;
}): string {
  const parts = [`${input.count} ${input.count === 1 ? "machine" : "machines"} in walking order`];
  if (input.outOfService > 0) parts.push(`${input.outOfService} out of service`);
  if (input.flagsFailed) parts.push("flags couldn't be read");
  else if (input.flagged !== null && input.flagged > 0) parts.push(`${input.flagged} flagged`);
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ *
 * A flag, as the page says it
 * ------------------------------------------------------------------ */

/** Relay's flag on a machine, as far as the Catalog reads it. */
export interface FlagLike {
  note: string;
  by: { name: string };
  /** ms since epoch, 0 when unknown. */
  at: number;
}

export interface FlagLine {
  /** "Bergil", or "a trainer" when the name is missing. */
  who: string;
  /** "Sep 27, 8:52 AM" in the studio's zone, or null when the time is unknown. */
  when: string | null;
  note: string;
}

export function flagLineOf(flag: FlagLike, tz?: string): FlagLine {
  const first = (flag.by?.name ?? "").trim().split(/\s+/)[0];
  const when =
    flag.at > 0
      ? `${formatStudioDate(flag.at, { month: "short", day: "numeric" }, tz)}, ${formatStudioTime(flag.at, tz)}`
      : null;
  return { who: first || "a trainer", when, note: flag.note.trim() };
}
