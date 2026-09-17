/**
 * MACHINE FIT — planning the Setup screen's one Save.
 *
 * The Setup screen edits up to thirty machines as drafts and writes them in
 * one go. This file decides WHAT is written, as plain data, so the decision
 * is tested without Firestore; setup-save.ts does the writing.
 *
 * It follows the rules the Settings card and the Equipment tab already keep
 * (equipment/mutations.ts), because a machine set up here must look exactly
 * like one set up there:
 *
 *   · Only what changed is written. An untouched machine is not in the plan.
 *   · A cleared field is removed; a key the screen does not show survives
 *     (settings-write.ts).
 *   · Every settings change leaves an audit row in the machine's
 *     settingHistory, with a reason. A first-time set-up needs none; changing
 *     values that were already saved does — once, for the whole Save.
 *   · A load typed here is the CURRENT weight. It becomes the starting weight
 *     too only when the client has none, the way the Equipment tab does it.
 *   · Anything the shorthand reader could not place is kept as a note on the
 *     machine. Nothing is dropped.
 *   · ONE journal entry for the Save, not one per machine: thirty "initial
 *     setup" lines would bury every coaching note written that week.
 */

import { nextSettings, nextSources } from "./settings-write.ts";
import type { SettingSource } from "./types.ts";

export interface SetupField {
  key: string;
  label: string;
}

export interface SetupMachineInput {
  machineId: string;
  machineName: string;
  fields: readonly SetupField[];
  /** Every key on the saved document, not just this machine's fields. */
  saved: Record<string, string>;
  /** This machine's fields as they stand on screen. A field not in the draft is left as saved. */
  draft: Record<string, string>;
  existingSources?: Record<string, SettingSource> | null;
  /** Where each value on screen came from, for the fields the trainer touched. */
  draftSources?: Record<string, SettingSource | undefined> | null;
  savedStartingWeight: number | null;
  savedCurrentWeight: number | null;
  /** The load typed on this screen; undefined or "" means untouched. */
  draftWeight?: string;
  /** Text to keep as a note on the machine (the shorthand reader's leftovers). */
  note?: string;
}

export interface FieldChange {
  key: string;
  label: string;
  from: string;
  to: string;
}

export interface SetupPlanEntry {
  machineId: string;
  machineName: string;
  isInitialSetup: boolean;
  changes: FieldChange[];
  /** Present when a setting changed: the whole maps to store. */
  settings?: Record<string, string>;
  sources?: Record<string, SettingSource>;
  /** Present when the load changed. */
  weight?: { current: number; starting: number | null; stampStart: boolean; from: number | null };
  note?: string;
}

export interface SetupPlan {
  entries: SetupPlanEntry[];
  /** True when values that were already saved are being changed: the Save needs a reason. */
  needsReason: boolean;
  settingsChanged: number;
  weightsChanged: number;
}

const clean = (v: unknown): string => (v ?? "").toString().trim();

export function parseWeight(text: string | undefined): number | null {
  const t = clean(text);
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 2000 ? n : null;
}

export function planSetupSave(machines: readonly SetupMachineInput[]): SetupPlan {
  const entries: SetupPlanEntry[] = [];
  let needsReason = false;
  let settingsChanged = 0;
  let weightsChanged = 0;

  for (const m of machines) {
    // A field the draft does not mention stays exactly as it was saved.
    const draft: Record<string, string> = {};
    for (const f of m.fields) draft[f.key] = f.key in m.draft ? clean(m.draft[f.key]) : clean(m.saved[f.key]);

    const changes: FieldChange[] = [];
    for (const f of m.fields) {
      const from = clean(m.saved[f.key]);
      const to = draft[f.key];
      if (from !== to) changes.push({ key: f.key, label: f.label, from, to });
    }

    const weightTyped = parseWeight(m.draftWeight);
    const weightMoved = weightTyped !== null && weightTyped !== m.savedCurrentWeight;
    const note = clean(m.note);
    if (changes.length === 0 && !weightMoved && !note) continue;

    const hadSettings = m.fields.some((f) => clean(m.saved[f.key]) !== "");
    const entry: SetupPlanEntry = {
      machineId: m.machineId,
      machineName: m.machineName,
      isInitialSetup: !hadSettings,
      changes,
    };

    if (changes.length > 0) {
      const settings = nextSettings(m.fields, m.saved, draft);
      entry.settings = settings;
      entry.sources = nextSources(m.fields, m.saved, settings, m.existingSources, m.draftSources);
      settingsChanged += 1;
      // Filling in an empty field is set-up. Changing or clearing a saved one is an override.
      if (changes.some((c) => c.from !== "")) needsReason = true;
    }
    if (weightMoved) {
      const stampStart = m.savedStartingWeight === null;
      entry.weight = {
        current: weightTyped as number,
        starting: stampStart ? (weightTyped as number) : m.savedStartingWeight,
        stampStart,
        from: m.savedCurrentWeight,
      };
      weightsChanged += 1;
    }
    if (note) entry.note = note;
    entries.push(entry);
  }

  return { entries, needsReason, settingsChanged, weightsChanged };
}

/** "Seat — → 3, Gap 4 → 5" */
export function describeFieldChanges(changes: readonly FieldChange[]): string {
  return changes.map((c) => `${c.label} ${c.from || "—"} → ${c.to || "—"}`).join(", ");
}

/** The reason stored with each audit row. */
export function reasonFor(entry: SetupPlanEntry, typedReason: string, legacy: boolean): string {
  const typed = clean(typedReason);
  if (typed) return typed;
  if (legacy) return "Copied from the FileMaker chart";
  return entry.isInitialSetup ? "Initial setup" : "Settings update";
}

const JOURNAL_LIMIT = 900;

/** The ONE journal entry for the Save, or "" when no setting changed (weights are never journalled). */
export function journalBodyFor(plan: SetupPlan, typedReason: string, legacy: boolean): string {
  const withSettings = plan.entries.filter((e) => e.changes.length > 0);
  if (withSettings.length === 0) return "";
  const head = `${legacy ? "Machine set-up copied from the FileMaker chart" : "Machine set-up saved"} — ${withSettings.length} ${
    withSettings.length === 1 ? "machine" : "machines"
  }.`;
  const lines: string[] = [];
  let used = head.length;
  let left = withSettings.length;
  for (const e of withSettings) {
    const line = `${e.machineName}: ${describeFieldChanges(e.changes)}`;
    if (used + line.length + 2 > JOURNAL_LIMIT) break;
    lines.push(line);
    used += line.length + 2;
    left -= 1;
  }
  const tail = left > 0 ? ` … and ${left} more.` : "";
  const reason = clean(typedReason);
  return `${head} ${lines.join("; ")}${lines.length ? "." : ""}${tail}${reason ? ` Reason: ${reason}` : ""}`.trim();
}
