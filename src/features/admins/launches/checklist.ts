/**
 * OPENING A STUDIO — its stage, its opening day and its setup checklist.
 * PURE: no React, no Firestore (setup-store.ts reads and writes).
 *
 * The Admins room's second wave (Sep 28 2026; AJ "all yes" to "a studio's
 * stage and setup items"). A studio carries two new fields, set by an
 * administrator on its page:
 *
 *   stage        setting-up · handed-over · running (absent: not recorded,
 *                which every studio set up before this is)
 *   openingDay   yyyy-mm-dd, the studio's own day
 *
 * and a checklist in five blocks — The studio · Mindbody · The floor · People
 * · First week — the blueprint's, AJ's default for q2. Its template lives
 * here, in code; a document under studios/{s}/setupItems/{id} records only
 * what a person did to an item (ticked it, skipped it with a reason) or an
 * item an administrator added:
 *
 *   { block, title, dueOn, doneAt, doneBy: { uid, name }, skipReason? }
 *
 * Items that can tick themselves from data do (the Mindbody link, the
 * cutover date, machines on the floor, a leader named, the team linked to
 * Mindbody staff, the details and the contact lines): nobody ticks those,
 * and a skip with a reason is the only mark a person puts on them. Due dates
 * count back from the opening day, block by block; with no opening day there
 * are none, and the screen says so rather than invent one.
 *
 * AJ's q1: "we dont need to track who set up a studio" — so no item names an
 * owner. What was done, by whom, is on the item (doneBy) and in the Activity
 * record, and nowhere else.
 *
 * The board of studios opening is Launches (AJ: yes), so it never clashes
 * with My Studio → Openings.
 */
import type { Studio, Trainer } from "../../../types";
import { DEFAULT_TIME_ZONE, isValidTimeZone, studioTodayKey } from "../../../lib/studio-time";
import { whoWorksHere } from "../../../lib/who-works-here";
import { isDemoStudio } from "../../demo-mode/is-demo";
import { mindbodyLinkState } from "../../admin/studios/registry";
import { dayLabel } from "../studios/stages";
import type { HqTone } from "../kit";
import { andList } from "../activity/activity";

/* ---- the stage and the opening day ------------------------------------------ */

export type LaunchStage = "setting-up" | "handed-over" | "running";

export const LAUNCH_STAGES: readonly LaunchStage[] = ["setting-up", "handed-over", "running"];

export const STAGE_WORDS: Record<LaunchStage, string> = {
  "setting-up": "Setting up",
  "handed-over": "Handed over",
  running: "Running",
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The recorded stage, or null when none is (or it isn't one of the three). */
export function stageOf(studio: Pick<Studio, "stage"> | null | undefined): LaunchStage | null {
  const s = studio?.stage;
  return s && (LAUNCH_STAGES as readonly string[]).includes(s) ? s : null;
}

/** The opening day, or null when none is set (or it isn't a day). */
export function openingDayOf(studio: Pick<Studio, "openingDay"> | null | undefined): string | null {
  const d = typeof studio?.openingDay === "string" ? studio.openingDay.trim() : "";
  return DAY.test(d) ? d : null;
}

/** On Launches: setting up or handed over, and never the practice studio. */
export function isLaunching(studio: Studio): boolean {
  const s = stageOf(studio);
  return (s === "setting-up" || s === "handed-over") && !isDemoStudio(studio);
}

/** The studio's today, yyyy-mm-dd, in its own time zone. */
export function todayFor(studio: Pick<Studio, "timezone">, now: Date = new Date()): string {
  return studioTodayKey(now, isValidTimeZone(studio.timezone) ? studio.timezone : DEFAULT_TIME_ZONE);
}

/** A day plus n days, as a day. Calendar arithmetic, never through a time zone. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 12) + n * 86_400_000);
  return t.toISOString().slice(0, 10);
}

/** "Tue, Oct 13" for a stored day. */
export function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Setting up · opens Tue, Jan 12, 2027", or null when no stage is recorded. */
export function stageLine(studio: Studio): string | null {
  const s = stageOf(studio);
  if (!s) return null;
  const open = openingDayOf(studio);
  if (s === "running") return STAGE_WORDS.running;
  return open ? `${STAGE_WORDS[s]} · opens ${dayLabel(open)}` : `${STAGE_WORDS[s]} · no opening day yet`;
}

/* ---- the checklist's template -------------------------------------------------- */

export type SetupBlock = "studio" | "mindbody" | "floor" | "people" | "first-week";

export const SETUP_BLOCKS: readonly SetupBlock[] = ["studio", "mindbody", "floor", "people", "first-week"];

/** Each block, and how many weeks before the opening day it is due (the first week: a week after it). */
export const BLOCKS: Record<SetupBlock, { title: string; weeksBefore: number | null }> = {
  studio: { title: "The studio", weeksBefore: 16 },
  mindbody: { title: "Mindbody", weeksBefore: 13 },
  floor: { title: "The floor", weeksBefore: 10 },
  people: { title: "People", weeksBefore: 6 },
  "first-week": { title: "First week", weeksBefore: null },
};

export type AutoCheck = "details" | "contact" | "mindbody-linked" | "cutover" | "floor-machines" | "leader" | "staff-linked";

export interface TemplateItem {
  id: string;
  block: SetupBlock;
  title: string;
  /** Ticks itself from data; null is ticked by a person. */
  auto: AutoCheck | null;
}

export const TEMPLATE: readonly TemplateItem[] = [
  { id: "details", block: "studio", title: "Name, time zone and opening day", auto: "details" },
  { id: "contact", block: "studio", title: "Business email, phone and address", auto: "contact" },
  { id: "mindbody-linked", block: "mindbody", title: "Mindbody site and location linked", auto: "mindbody-linked" },
  { id: "cutover", block: "mindbody", title: "Journey cutover date set", auto: "cutover" },
  { id: "floor-machines", block: "floor", title: "Machines on the floor", auto: "floor-machines" },
  { id: "floor-names", block: "floor", title: "Each unit's name and starting settings checked", auto: null },
  { id: "leader", block: "people", title: "A studio leader named", auto: "leader" },
  { id: "staff-linked", block: "people", title: "Everyone on the team linked to Mindbody staff", auto: "staff-linked" },
  { id: "first-session", block: "first-week", title: "First session logged", auto: null },
  { id: "limbo-clear", block: "first-week", title: "Nothing from its Mindbody site waiting in Limbo", auto: null },
  { id: "sync-healthy", block: "first-week", title: "Pulling from Mindbody a week without failing", auto: null },
];

const TEMPLATE_BY_ID = new Map(TEMPLATE.map((t) => [t.id, t]));

export function isTemplateItem(id: string): boolean {
  return TEMPLATE_BY_ID.has(id);
}

/* ---- the facts an item can tick itself from ------------------------------------ */

/** One stored item document, in any shape Firestore gives it. */
export interface SetupItemDoc {
  block?: unknown;
  title?: unknown;
  dueOn?: unknown;
  doneAt?: unknown;
  doneBy?: { uid?: unknown; name?: unknown } | null;
  skipReason?: unknown;
}

export type RosterRead = { state: "loading" } | { state: "ok"; onFloor: number } | { state: "failed" };

export interface SetupFacts {
  studio: Studio;
  studios: readonly Studio[];
  trainers: readonly Trainer[];
  roster: RosterRead;
  /** The studio's today, yyyy-mm-dd. */
  today: string;
}

const LEADER_ROLES = new Set(["StudioLeader", "HeadTrainer", "StudioOwner"]);

/** Who leads it: a leader role at home there, or owning it. Active and not replaced. */
export function leadersOf(trainers: readonly Trainer[], studioId: string): Trainer[] {
  return trainers
    .filter((t) => LEADER_ROLES.has(t.role))
    .filter((t) => t.primaryHomeStudioId === studioId || (t.ownedStudioIds ?? []).includes(studioId))
    .filter((t) => (t as Trainer & { isActive?: boolean }).isActive !== false && !t.supersededByUid)
    .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
}

function str(v: unknown): string {
  return v === undefined || v === null ? "" : String(v).trim();
}

/** Whether an item that ticks itself is done, and the one sentence that says why. */
export function autoCheck(check: AutoCheck, facts: SetupFacts): { state: "done" | "todo" | "unknown"; proof: string } {
  const { studio } = facts;
  const id = studio.id ?? "";
  switch (check) {
    case "details": {
      const open = openingDayOf(studio);
      if (!str(studio.name)) return { state: "todo", proof: "It has no name yet." };
      if (!open) return { state: "todo", proof: "No opening day yet: set one under Opening, and the due dates count back from it." };
      return { state: "done", proof: `Opens ${dayLabel(open)}.` };
    }
    case "contact": {
      const missing = [
        !str(studio.contactEmail) && "business email",
        !str(studio.phone) && "phone",
        !str(studio.address) && "address",
      ].filter(Boolean) as string[];
      return missing.length === 0
        ? { state: "done", proof: "All three are on its details." }
        : { state: "todo", proof: `Missing: ${andList(missing)}.` };
    }
    case "mindbody-linked": {
      const state = mindbodyLinkState(studio, facts.studios as Studio[]);
      const site = str(studio.mindbodySiteId);
      const loc = str(studio.mindbodyLocationId);
      if (state === "linked" || state === "linked-shared") {
        return { state: "done", proof: loc ? `Mindbody site ${site}, location ${loc}.` : `Mindbody site ${site}.` };
      }
      if (state === "offline") return { state: "todo", proof: "Runs offline for now: link it in its details once its Mindbody account exists." };
      if (state === "needs-location") return { state: "todo", proof: `Shares Mindbody site ${site} with another studio but names no location.` };
      return { state: "todo", proof: "No Mindbody Site ID yet." };
    }
    case "cutover": {
      const c = str(studio.journeyCutoverDate);
      if (!DAY.test(c)) return { state: "todo", proof: "No Journey cutover date yet." };
      return { state: "done", proof: c > facts.today ? `Moves onto Journey on ${dayLabel(c)}.` : `On Journey since ${dayLabel(c)}.` };
    }
    case "floor-machines": {
      if (facts.roster.state === "loading") return { state: "unknown", proof: "Reading its floor…" };
      if (facts.roster.state === "failed") return { state: "unknown", proof: "Couldn't read its floor just now." };
      const n = facts.roster.onFloor;
      return n > 0
        ? { state: "done", proof: `${n} ${n === 1 ? "machine" : "machines"} on its floor.` }
        : { state: "todo", proof: "No machines on its floor yet: its Floor tab adds the standard set." };
    }
    case "leader": {
      const leaders = leadersOf(facts.trainers, id);
      if (leaders.length === 0) return { state: "todo", proof: "Nobody leads it yet: a studio leader comes first." };
      const names = leaders.map((t) => t.fullName || "Someone");
      return { state: "done", proof: `${andList(names)} ${leaders.length === 1 ? "leads" : "lead"} it.` };
    }
    case "staff-linked": {
      const team = whoWorksHere(facts.trainers as Trainer[], id) as Trainer[];
      if (team.length === 0) return { state: "todo", proof: "Nobody works here yet." };
      const unlinked = team.filter((t) => !str(t.mindbodyStaffId)).map((t) => t.fullName || "Someone").sort((a, b) => a.localeCompare(b));
      if (unlinked.length === 0) return { state: "done", proof: team.length === 1 ? "The one person here is linked." : `All ${team.length} are linked.` };
      return { state: "todo", proof: `${unlinked.length} of ${team.length} aren't linked yet: ${andList(unlinked)}.` };
    }
  }
}

/* ---- the checklist -------------------------------------------------------------- */

export type ItemState = "done" | "todo" | "skipped" | "unknown" | "later";

export interface ChecklistItem {
  id: string;
  block: SetupBlock;
  title: string;
  /** Added by an administrator, not the template's. */
  custom: boolean;
  auto: AutoCheck | null;
  state: ItemState;
  /** An item that ticks itself says why; null otherwise. */
  proof: string | null;
  dueOn: string | null;
  overdue: boolean;
  doneByName: string | null;
  doneAt: number | null;
  skipReason: string | null;
}

function millis(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  const ts = v as { toMillis?: () => number; toDate?: () => Date };
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  return null;
}

/** When a template block is due: weeks before the opening day, or the week after it for the first week. */
export function blockDue(block: SetupBlock, openingDay: string | null): string | null {
  if (!openingDay) return null;
  const w = BLOCKS[block].weeksBefore;
  return w === null ? addDays(openingDay, 7) : addDays(openingDay, -7 * w);
}

function isBlock(v: unknown): v is SetupBlock {
  return typeof v === "string" && (SETUP_BLOCKS as readonly string[]).includes(v);
}

/** The whole checklist: the template in order, with what people did to it, then the items added. */
export function buildChecklist(facts: SetupFacts, stored: Record<string, SetupItemDoc>): ChecklistItem[] {
  const open = openingDayOf(facts.studio);
  const beforeOpening = Boolean(open && facts.today < open);

  const finish = (base: Omit<ChecklistItem, "state" | "overdue" | "proof" | "doneByName" | "doneAt" | "skipReason">, doc: SetupItemDoc | undefined): ChecklistItem => {
    const skipReason = str(doc?.skipReason) || null;
    const doneAt = millis(doc?.doneAt);
    const doneByName = str(doc?.doneBy?.name) || null;
    let state: ItemState;
    let proof: string | null = null;
    if (skipReason) state = "skipped";
    else if (base.auto) {
      const a = autoCheck(base.auto, facts);
      state = a.state;
      proof = a.proof;
    } else if (doc?.doneAt != null) state = "done";
    else state = base.block === "first-week" && beforeOpening ? "later" : "todo";
    const overdue = (state === "todo" || state === "unknown") && base.dueOn !== null && facts.today > base.dueOn;
    // Who ticked it or skipped it; an item that ticks itself was ticked by nobody.
    const signed = (state === "done" && !base.auto) || state === "skipped";
    return { ...base, state, proof, overdue, doneByName: signed ? doneByName : null, doneAt: state === "done" && !base.auto ? doneAt : null, skipReason };
  };

  const out: ChecklistItem[] = TEMPLATE.map((t) =>
    finish({ id: t.id, block: t.block, title: t.title, custom: false, auto: t.auto, dueOn: blockDue(t.block, open) }, stored[t.id]),
  );

  const custom = Object.entries(stored)
    .filter(([id, d]) => !TEMPLATE_BY_ID.has(id) && isBlock(d.block) && str(d.title))
    .map(([id, d]) =>
      finish(
        { id, block: d.block as SetupBlock, title: str(d.title), custom: true, auto: null, dueOn: DAY.test(str(d.dueOn)) ? str(d.dueOn) : null },
        d,
      ),
    )
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || a.title.localeCompare(b.title));

  // Custom items sit at the end of their own block.
  const result: ChecklistItem[] = [];
  for (const block of SETUP_BLOCKS) {
    result.push(...out.filter((i) => i.block === block), ...custom.filter((i) => i.block === block));
  }
  return result;
}

export interface BlockView {
  block: SetupBlock;
  title: string;
  items: ChecklistItem[];
  dueOn: string | null;
  /** The block in a word or two, for Launches' board and the block's heading. */
  word: string;
  tone: HqTone;
}

/** Still to do: not done, not skipped, and not waiting for the opening day. */
const stillOpen = (i: ChecklistItem) => i.state === "todo" || i.state === "unknown";

/** Each block, with the word the board says for it. */
export function blocksOf(items: readonly ChecklistItem[], facts: SetupFacts): BlockView[] {
  const opening = openingDayOf(facts.studio);
  return SETUP_BLOCKS.map((block) => {
    const inBlock = items.filter((i) => i.block === block);
    const dueOn = blockDue(block, opening);
    let word: string;
    let tone: HqTone;
    const overdue = inBlock.filter((i) => i.overdue).sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));
    if (inBlock.every((i) => i.state === "done" || i.state === "skipped")) {
      word = "Done";
      tone = "ok";
    } else if (overdue.length > 0) {
      word = `Overdue since ${shortDay(overdue[0].dueOn!)}`;
      tone = "watch";
    } else if (inBlock.some((i) => i.state === "unknown")) {
      word = "Couldn't check";
      tone = "unknown";
    } else if (inBlock.every((i) => i.state === "later" || i.state === "done" || i.state === "skipped")) {
      word = opening ? `After ${shortDay(opening)}` : "After opening day";
      tone = "idle";
    } else {
      const left = inBlock.filter(stillOpen).length;
      word = dueOn ? `Due ${shortDay(dueOn)}` : `${left} left`;
      tone = "idle";
    }
    return { block, title: BLOCKS[block].title, items: inBlock, dueOn, word, tone };
  });
}

export interface Readiness {
  /** Blocks one to four all done or skipped on purpose. */
  ready: boolean;
  /** What's left in blocks one to four. */
  left: number;
  /** What's left in the first week. */
  firstWeekLeft: number;
  sentence: string;
  /** The next thing due in blocks one to four. */
  next: ChecklistItem | null;
  overdue: ChecklistItem[];
}

/** Where the studio stands against its checklist, in a sentence. */
export function readiness(items: readonly ChecklistItem[], stage: LaunchStage | null): Readiness {
  const before = items.filter((i) => i.block !== "first-week");
  const leftItems = before.filter(stillOpen);
  const firstWeekLeft = items.filter((i) => i.block === "first-week" && (stillOpen(i) || i.state === "later")).length;
  const next =
    [...leftItems].sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999") || before.indexOf(a) - before.indexOf(b))[0] ?? null;
  const overdue = items.filter((i) => i.overdue);
  const things = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;
  let sentence: string;
  if (stage === "handed-over") {
    sentence = firstWeekLeft === 0 ? "Handed over, and its first week is done." : `Handed over. First week: ${things(firstWeekLeft)} left.`;
  } else if (leftItems.length === 0) {
    sentence = "Ready to hand over.";
  } else {
    sentence = `Not ready to hand over: ${things(leftItems.length)} left.`;
  }
  return { ready: leftItems.length === 0, left: leftItems.length, firstWeekLeft, sentence, next, overdue };
}

/* ---- what a change says in the Activity record ------------------------------------ */

export function checklistLine(
  action: "tick" | "untick" | "skip" | "unskip" | "add" | "remove",
  studioName: string,
  item: { title: string; block?: SetupBlock; dueOn?: string | null },
  reason?: string,
): string {
  const where = `${studioName}'s setup checklist`;
  switch (action) {
    case "tick":
      return `Ticked “${item.title}” on ${where}.`;
    case "untick":
      return `Unticked “${item.title}” on ${where}.`;
    case "skip":
      return `Skipped “${item.title}” on ${where}: “${reason ?? ""}”.`;
    case "unskip":
      return `Put “${item.title}” back on ${where}.`;
    case "add":
      return `Added “${item.title}” to ${where} (${item.block ? BLOCKS[item.block].title : "a block"}${item.dueOn ? `, due ${dayLabel(item.dueOn)}` : ""}).`;
    case "remove":
      return `Took “${item.title}” off ${where}.`;
  }
}

/** The Activity entry for a change of stage or opening day. Null when neither changed. */
export function openingRecord(
  studioName: string,
  was: { stage: LaunchStage | null; openingDay: string | null },
  now: { stage: LaunchStage | null; openingDay: string | null },
): { what: string; before: Record<string, string | null>; after: Record<string, string | null> } | null {
  const stageChanged = was.stage !== now.stage;
  const dayChanged = was.openingDay !== now.openingDay;
  if (!stageChanged && !dayChanged) return null;
  const stageWords = (s: LaunchStage | null) => (s ? STAGE_WORDS[s] : "Not recorded");
  const dayWords = (d: string | null) => (d ? dayLabel(d) : "Not set");
  const before: Record<string, string | null> = {};
  const after: Record<string, string | null> = {};
  const parts: string[] = [];
  if (stageChanged) {
    before.Stage = stageWords(was.stage);
    after.Stage = stageWords(now.stage);
    parts.push(now.stage ? `${studioName}'s stage to ${STAGE_WORDS[now.stage]}` : `${studioName}'s stage back to not recorded`);
  }
  if (dayChanged) {
    before["Opening day"] = dayWords(was.openingDay);
    after["Opening day"] = dayWords(now.openingDay);
    parts.push(
      now.openingDay
        ? `${stageChanged ? "its" : `${studioName}'s`} opening day to ${dayLabel(now.openingDay)}`
        : `${stageChanged ? "its" : `${studioName}'s`} opening day to none`,
    );
  }
  return { what: `Set ${parts.join(" and ")}.`, before, after };
}
