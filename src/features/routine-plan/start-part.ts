/**
 * The routine template editor's "For new clients" part, the pure half (the
 * design round, Oct 8 2026; AJ: "studios will chose their own, admins will
 * create the routines to pick from in the app during beta", and his "1a": a
 * starting routine is a routine preset with an optional `start` part).
 *
 * An administrator (head office's routines) or a studio's leaders (their own)
 * switch a template on as a starting routine and say three things about it:
 * - **Day one**: which of its machines a first session runs (at least one);
 * - **Words that suggest it**: the words in an intake or a Health note that
 *   make it the match ("low back", "sciatica");
 * - **Head office's default**, on a company routine only, at most one.
 * A seeded routine's `steps`, `source` and `kind` are carried as they came:
 * the editor shows the source and never edits it. The steps follow day one
 * when the first of them is day one (a seeded routine's "Consultation"), and
 * a part switched off is kept beside the template (`parkedStartOf`), so
 * nothing the editor can't put back is ever lost.
 *
 * What is saved is read back by `startingRoutineFromPreset`
 * (starting-routines.ts), so the save keeps the two in step: day one and the
 * steps hold only the template's own machines (the reader puts a day-one or a
 * step machine the road forgot back on the road, so a machine an admin took
 * out of the template would come back if a step still named it), the words
 * are lower case and listed once, and an empty list is left out rather than
 * written. Firestore refuses `undefined`, so nothing here carries one.
 *
 * Nothing here writes; `AdminRoutineTemplatesTab` writes what `startPartForSave`
 * gives, in one batch with the default taken off any other routine.
 */
import type { RoutinePreset, RoutinePresetTier } from "../../types";
import type { SelectionPurposeKind } from "../routine-builder/academy";
import { withoutUndefined } from "../studio-tasks/task-wizard";
import type { RoutinePresetStart, StartingRoutineStep } from "./starting-routines";

/** The longest word or phrase a routine may be suggested by. */
export const MATCH_WORD_MAX_LENGTH = 40;

/** The most words one routine may carry. Each is a whole-word search of every intake, so the list stays short. */
export const MATCH_WORDS_MAX = 40;

const KINDS: readonly SelectionPurposeKind[] = ["clear", "condition", "goal"];

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    const id = typeof v === "string" ? v.trim() : "";
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** A word as the matcher reads it: lower case, trimmed, one space between words. */
export function cleanMatchWord(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanWords(value: unknown): string[] {
  const out: string[] = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const word = typeof raw === "string" ? cleanMatchWord(raw) : "";
    if (word && !out.includes(word)) out.push(word);
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a stored preset carries a `start` part at all (the editor's switch). */
export function hasStartPart(preset: Pick<RoutinePreset, "start"> | null | undefined): boolean {
  return isRecord(preset?.start);
}

/**
 * A stored `start` part, read for the editor: undefined when there is none
 * (the switch is off), else every field checked. A part with no day one is
 * still a part (the switch is on, and the editor asks for a day one); the
 * app's reader skips it until it has one. An empty list is left out, so a
 * part read twice compares equal.
 */
export function readStartPart(raw: unknown): RoutinePresetStart | undefined {
  if (!isRecord(raw)) return undefined;
  const steps: StartingRoutineStep[] = (Array.isArray(raw.steps) ? raw.steps : [])
    .map((s: unknown) => {
      const step = isRecord(s) ? s : {};
      return { label: typeof step.label === "string" ? step.label.trim() : "", machineIds: cleanIds(step.machineIds) };
    })
    .filter((s) => s.label !== "" && s.machineIds.length > 0);
  const matchWords = cleanWords(raw.matchWords);
  const source = typeof raw.source === "string" ? raw.source.trim() : "";
  const kind = KINDS.find((k) => k === raw.kind);
  return {
    dayOne: cleanIds(raw.dayOne),
    ...(steps.length > 0 ? { steps } : null),
    ...(matchWords.length > 0 ? { matchWords } : null),
    ...(raw.default === true ? { default: true } : null),
    ...(source ? { source } : null),
    ...(kind ? { kind } : null),
  };
}

/** A part just switched on: nothing on day one yet. The admin taps the machines; nothing is guessed. */
export function newStartPart(): RoutinePresetStart {
  return { dayOne: [] };
}

/**
 * Day one as it stands: only the template's machines, in day one's own
 * order. The Academy's day one is its consultation repaired against the
 * sequencing rules, which is not always the road's order (Leg Press before
 * Compound Row, where the road has the row first), so the order is kept as
 * written rather than redrawn in the template's.
 */
export function dayOneOf(start: Pick<RoutinePresetStart, "dayOne"> | undefined, machineIds: readonly string[]): string[] {
  if (!start) return [];
  const road = cleanIds(machineIds);
  return cleanIds(start.dayOne).filter((id) => road.includes(id));
}

/**
 * The steps once day one has changed. A seeded routine's first step
 * ("Consultation") is its day one, the same machines, and Start a plan
 * labels each machine on deck by its step: left alone, a machine taken off
 * day one would still be called "Consultation", and one put on would be
 * drawn under "Day one" and under its old step both. So while the first step
 * holds exactly day one, it follows it: a machine put on day one leaves the
 * later step it was in, and one taken off joins the next step (the workout
 * after day one adds it) or, with no next step, is drawn under "Later in the
 * plan". A step emptied this way keeps its label in the draft, so the
 * machine can come back to it; the save leaves an empty step out. Steps that
 * never matched day one are left as they are.
 */
function stepsFollowingDayOne(
  steps: readonly StartingRoutineStep[],
  before: readonly string[],
  after: readonly string[],
  road: readonly string[],
): StartingRoutineStep[] {
  const [first, ...later] = steps;
  const firstHere = first.machineIds.filter((id) => road.includes(id));
  const tracksDayOne = firstHere.length === before.length && before.every((id) => firstHere.includes(id));
  if (!tracksDayOne) return [...steps];
  const added = after.filter((id) => !before.includes(id));
  const removed = before.filter((id) => !after.includes(id));
  const rest = later.map((s) => ({ ...s, machineIds: s.machineIds.filter((id) => !added.includes(id)) }));
  if (removed.length > 0 && rest.length > 0) {
    const elsewhere = new Set(rest.flatMap((s) => s.machineIds));
    rest[0] = { ...rest[0], machineIds: [...rest[0].machineIds, ...removed.filter((id) => !elsewhere.has(id))] };
  }
  return [{ ...first, machineIds: [...after] }, ...rest];
}

/**
 * A machine tapped on or off day one. Day one holds nothing the template
 * doesn't; one taken off leaves the rest in their order, and one put on goes
 * in before the first day-one machine that comes after it in the template.
 * The steps follow when the first of them is day one (`stepsFollowingDayOne`).
 */
export function withDayOneToggled(start: RoutinePresetStart, machineId: string, machineIds: readonly string[]): RoutinePresetStart {
  const road = cleanIds(machineIds);
  const on = dayOneOf(start, road);
  let dayOne: string[];
  if (on.includes(machineId)) {
    dayOne = on.filter((id) => id !== machineId);
  } else if (!road.includes(machineId)) {
    return { ...start, dayOne: on };
  } else {
    const at = road.indexOf(machineId);
    const before = on.findIndex((id) => road.indexOf(id) > at);
    dayOne = before === -1 ? [...on, machineId] : [...on.slice(0, before), machineId, ...on.slice(before)];
  }
  return start.steps && start.steps.length > 0
    ? { ...start, dayOne, steps: stepsFollowingDayOne(start.steps, on, dayOne, road) }
    : { ...start, dayOne };
}

/** A word added, or the sentence that says why it wasn't. */
export function withMatchWord(start: RoutinePresetStart, text: string): { start: RoutinePresetStart; problem: string | null } {
  const word = cleanMatchWord(text);
  const words = start.matchWords ?? [];
  if (!word) return { start, problem: "Type a word or a short phrase first." };
  if (word.length > MATCH_WORD_MAX_LENGTH) {
    return { start, problem: `Keep it to ${MATCH_WORD_MAX_LENGTH} letters or fewer: a word or a short phrase.` };
  }
  if (words.includes(word)) return { start, problem: `"${word}" is already there.` };
  if (words.length >= MATCH_WORDS_MAX) {
    return { start, problem: `A starting routine can carry up to ${MATCH_WORDS_MAX} words. Take one out first.` };
  }
  return { start: { ...start, matchWords: [...words, word] }, problem: null };
}

/**
 * A word typed in the box but not added, put in when the editor saves, so
 * Save never drops it. Nothing typed, or a word already on the list,
 * changes nothing; a word the list can't take says why, as Add word would.
 */
export function withPendingWord(start: RoutinePresetStart, text: string): { start: RoutinePresetStart; problem: string | null } {
  const word = cleanMatchWord(text);
  if (!word || (start.matchWords ?? []).includes(word)) return { start, problem: null };
  return withMatchWord(start, word);
}

/** A word taken out. The last one out leaves no list behind. */
export function withoutMatchWord(start: RoutinePresetStart, word: string): RoutinePresetStart {
  const words = (start.matchWords ?? []).filter((w) => w !== word);
  const { matchWords: _gone, ...rest } = start;
  return words.length > 0 ? { ...rest, matchWords: words } : rest;
}

/** Head office's default switched on or off. Only a company routine can be it (`startPartForSave`). */
export function withDefault(start: RoutinePresetStart, on: boolean): RoutinePresetStart {
  const { default: _was, ...rest } = start;
  return on ? { ...rest, default: true } : rest;
}

/**
 * The part kept beside a template when its switch goes off
 * (`RoutinePreset.startParked`): everything it had but head office's
 * default. Switching it back on brings back its day one, its words, and a
 * seeded routine's steps, source and kind, which the editor has no control
 * for and so could never put back once removed. The default is not kept: by
 * then another routine may hold it, and switching one back on should never
 * quietly take it from that one.
 */
export function parkedStartOf(start: RoutinePresetStart): RoutinePresetStart {
  return withDefault(start, false);
}

/**
 * What stops a save, in a sentence, or null. Only one thing does: a starting
 * routine with nothing on day one, because the app's reader skips it and no
 * trainer would ever be offered it.
 */
export function startPartProblem(start: RoutinePresetStart | undefined, machineIds: readonly string[]): string | null {
  if (!start) return null;
  if (cleanIds(machineIds).length === 0) return null; // "A template needs at least one machine" says it first.
  if (dayOneOf(start, machineIds).length === 0) {
    return "Mark at least one machine for day one, or switch off Offer as a starting routine.";
  }
  return null;
}

/**
 * The `start` part as it is written, or null when the template isn't a
 * starting routine (the caller removes a stored one). Day one and the steps
 * hold only the template's machines (day one in its own order, each step in
 * the template's); the words are clean and
 * listed once; an empty list is left out; `default` is written only on a
 * company routine, and only when it is on. Never carries `undefined`.
 */
export function startPartForSave(
  start: RoutinePresetStart | undefined,
  preset: { machineIds: readonly string[]; tier?: RoutinePresetTier },
): RoutinePresetStart | null {
  if (!start) return null;
  const road = cleanIds(preset.machineIds);
  const steps = (start.steps ?? [])
    .map((s) => ({ label: s.label.trim(), machineIds: road.filter((id) => s.machineIds.includes(id)) }))
    .filter((s) => s.label !== "" && s.machineIds.length > 0);
  const matchWords = cleanWords(start.matchWords);
  const source = start.source?.trim();
  const kind = KINDS.find((k) => k === start.kind);
  return withoutUndefined({
    dayOne: dayOneOf(start, road),
    steps: steps.length > 0 ? steps : undefined,
    matchWords: matchWords.length > 0 ? matchWords : undefined,
    default: preset.tier === "company" && start.default === true ? true : undefined,
    source: source || undefined,
    kind,
  });
}

/**
 * The other company routines that say they are head office's default. When
 * the one being saved is the default, each of these has its flag taken off
 * in the same batch, so there is never more than one.
 */
export function otherDefaults(presets: readonly RoutinePreset[], savingId: string | null | undefined): RoutinePreset[] {
  return presets.filter(
    (p) => p.tier === "company" && !!p.id && p.id !== savingId && isRecord(p.start) && p.start.default === true,
  );
}

/** "Day one: Leg Press · Compound Row · Lumbar Extension". */
export function dayOneLine(dayOne: readonly string[], nameOf: (id: string) => string): string {
  return dayOne.length > 0 ? `Day one: ${dayOne.map(nameOf).join(" · ")}` : "Nothing on day one yet";
}

/**
 * The line a starting routine shows in the template list: "Starting routine ·
 * day one: Leg Press · Compound Row", or what it still needs. Null for a
 * template that isn't one.
 */
export function startListLine(preset: Pick<RoutinePreset, "start" | "machineIds">, nameOf: (id: string) => string): string | null {
  const start = readStartPart(preset.start);
  if (!start) return null;
  const dayOne = dayOneOf(start, preset.machineIds ?? []);
  if (dayOne.length === 0) return "Starting routine · no day one yet, so no trainer is offered it";
  return `Starting routine · day one: ${dayOne.map(nameOf).join(" · ")}`;
}

/**
 * Where a starting routine came from, in words: a file of the Academy's is
 * "From the Academy's Exercise Selection Template"; anything else is said as
 * it was written. Null when there is no source.
 */
export function startingSourceWords(source: string | null | undefined): string | null {
  const text = source?.trim();
  if (!text) return null;
  if (/msf-academy/i.test(text)) {
    const file = (text.split(/[\\/]/).pop() ?? text).replace(/\.(?:txt|md)$/i, "").trim();
    const parts = file.split(" - ").map((p) => p.trim()).filter(Boolean);
    const title = parts.length > 1 ? parts.slice(1).join(" - ") : file;
    return `From the Academy's ${title}`;
  }
  return /^from\s/i.test(text) ? text : `From ${text}`;
}
