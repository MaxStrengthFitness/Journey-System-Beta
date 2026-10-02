/**
 * THE FIVE DOORS — how the Board sorts every open job, and deals one.
 * Relay room, Sep 28 2026 (the redesign's phase 2, AJ's pick).
 *
 * The Floor used to stack ten blocks at one volume (the blueprint's pin 1),
 * so nothing came first. The Board keeps every one of them, behind five
 * doors named by where the work happens and who it is for — Destiny's
 * Portal, where a door says who plays and how long it takes before you read
 * a single activity:
 *
 *   Floor work        the shift's chores (wipe-downs, deep cleans, opening
 *                     and closing), the floor map, jobs about machines and
 *                     the building
 *   Desk work         client tasks (progress reports, routines, InBody),
 *                     renewals to talk about, jobs about clients
 *   Help a teammate   the asks on the board: cover, a hand, a question
 *   From leadership   the network's focus and the studio's initiatives
 *   Mine              everything with this trainer's name on it: handed to
 *                     them, assigned to them, a job they are on
 *
 * Each door deals the best fit first, by the rule Next up already used
 * (next-up.ts: your name on it, then due, then fits your gap, then nobody on
 * it yet, then from the session you just had), with two more that also fit
 * and "Deal me another" behind it. Nothing is assigned by the ranking and
 * nothing is recorded when a card is passed over.
 *
 * Pure: no React, no Firestore. Built from the rows, jobs and asks the Board
 * already holds.
 */
import type { TaskRequest } from "../../studio-tasks/requests";
import { studioDateKey } from "../../../lib/studio-time";
import { jobTopic } from "../jobs/jobs";
import type { TeamJob } from "../jobs/types";
import { nextUpItems, scoreNextUp, type NextUpInput, type NextUpItem, type NextUpScored } from "./next-up";
import { RING_LABEL, shiftRings, type RingPhase } from "./rings";
import { coverAtOf, coverIsLater, coverTimeOf, neededWords } from "./cover";

export type DoorId = "floor" | "desk" | "help" | "lead" | "mine";

export const DOOR_ORDER: readonly DoorId[] = ["floor", "desk", "help", "lead", "mine"];

export const DOOR_LABEL: Record<DoorId, string> = {
  floor: "Floor work",
  desk: "Desk work",
  help: "Help a teammate",
  lead: "From leadership",
  mine: "My work",
};

/** An initiative from leadership, dealt on its own door. */
export interface InitiativeItem {
  kind: "initiative";
  id: string;
  request: TaskRequest;
  title: string;
  estMinutes: number | null;
  origin: "floor";
}

export type BoardItem = NextUpItem | InitiativeItem;

export interface BoardScored {
  item: BoardItem;
  score: number;
  why: string[];
  fits: boolean | null;
  /**
   * A cover ask's kept time, when it is needed today and nobody has it:
   * "needed at 4:20 PM" (./cover.ts; the second wave, Sep 28 2026).
   */
  needed?: string | null;
}

export interface BoardInput extends NextUpInput {
  /** Every open request, initiatives included. */
  requests: TaskRequest[];
}

const idsOf = (input: Pick<BoardInput, "uid" | "trainerId">) => new Set([input.uid, input.trainerId].filter(Boolean) as string[]);

/** Which door an item sits behind. */
export function doorOf(item: BoardItem, input: Pick<BoardInput, "uid" | "trainerId">): DoorId {
  const me = idsOf(input);
  switch (item.kind) {
    case "initiative":
      return "lead";
    case "ask":
      return item.request.forId && me.has(item.request.forId) ? "mine" : "help";
    case "group":
      return item.group.assignedTo && me.has(item.group.assignedTo.id) ? "mine" : "floor";
    case "client":
      return item.row.instance?.assignedTo && me.has(item.row.instance.assignedTo.id) ? "mine" : "desk";
    case "job": {
      const named = item.job.assigneeIds.some((id) => me.has(id));
      if (named) return "mine";
      return jobTopic(item.job) === "clients" ? "desk" : "floor";
    }
  }
}

/** Every open job on the Board, initiatives included. */
export function boardItems(input: BoardInput): BoardItem[] {
  const items: BoardItem[] = nextUpItems(input);
  for (const r of input.requests) {
    if (r.status !== "open" || r.kind !== "initiative") continue;
    items.push({ kind: "initiative", id: `ask:${r.id}`, request: r, title: r.title, estMinutes: null, origin: "floor" });
  }
  return items;
}

const millis = (v: unknown): number => (v as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;

/** Was this posted on the studio's today? */
export function postedToday(r: Pick<TaskRequest, "createdAt">, todayKey: string): boolean {
  const ms = millis(r.createdAt);
  return ms > 0 && studioDateKey(new Date(ms)) === todayKey;
}

function scoreItem(item: BoardItem, input: BoardInput): BoardScored {
  if (item.kind === "initiative") {
    // Newest first; an initiative is everyone's, so no fit or name to weigh.
    const fresh = postedToday(item.request, input.todayKey);
    return { item, score: fresh ? 50 : 0, why: fresh ? ["posted today"] : [], fits: null };
  }
  const scored = scoreNextUp(item, input) as NextUpScored & BoardScored;
  // A cover ask that keeps its time (the second wave): needed today, it says
  // when; needed on a later day, it doesn't press on today.
  const t = item.kind === "ask" ? coverTimeOf(item.request) : null;
  if (t && item.kind === "ask") {
    if (t.day > input.todayKey) {
      if (item.request.priority === "urgent") scored.score -= 30;
      scored.why = [...scored.why.filter((w) => w !== "urgent"), neededWords(t, input.todayKey)];
    } else if (!item.request.claimedBy) {
      scored.needed = neededWords(t, input.todayKey);
    }
  }
  return scored;
}

/** Help's order: covers needed today, soonest first, before everything else. */
function helpRank(s: BoardScored, todayKey: string): number {
  const t = s.item.kind === "ask" && !s.item.request.claimedBy ? coverTimeOf(s.item.request) : null;
  return t && t.day === todayKey ? 0 : 1;
}

/**
 * A door's deck, best fit first, without what this trainer passed over this
 * shift phase (next-up.ts's snooze: module memory, nothing written). Behind
 * Help a teammate, the covers needed today come first, by the time they are
 * needed (./cover.ts).
 */
export function deckFor(door: DoorId, input: BoardInput): BoardScored[] {
  const snoozed = input.snoozed ?? new Set<string>();
  const coverAt = (s: BoardScored) => (s.item.kind === "ask" ? coverAtOf(s.item.request) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER);
  return boardItems(input)
    .filter((i) => doorOf(i, input) === door && !snoozed.has(i.id))
    .map((i) => scoreItem(i, input))
    .sort(
      (a, b) =>
        (door === "help" ? helpRank(a, input.todayKey) - helpRank(b, input.todayKey) : 0) ||
        (door === "help" && helpRank(a, input.todayKey) === 0 ? coverAt(a) - coverAt(b) : 0) ||
        b.score - a.score ||
        millis((b.item as { request?: TaskRequest }).request?.createdAt) - millis((a.item as { request?: TaskRequest }).request?.createdAt) ||
        a.item.title.localeCompare(b.item.title),
    );
}

/* ------------------------------------------------------------------ *
 * What each door says on its face
 * ------------------------------------------------------------------ */

export interface DoorFace {
  id: DoorId;
  label: string;
  /** "6 open", "1 ask", "2 initiatives", "3 with your name". */
  count: string;
  /** "3 to 25 min", "~5 min", or null when no job here says how long. */
  range: string | null;
  /** One more line: "Mid chores 9 of 14", "cover needed", "2 handed to you". */
  sub: string | null;
  /** The sub line is time pressure: orange words, never red. */
  hot: boolean;
  /** How many jobs sit behind it. */
  n: number;
}

function rangeOf(items: BoardItem[]): string | null {
  const mins = items.map((i) => i.estMinutes).filter((m): m is number => typeof m === "number" && m > 0);
  if (mins.length === 0) return null;
  const lo = Math.min(...mins);
  const hi = Math.max(...mins);
  return lo === hi ? `~${lo} min` : `${lo} to ${hi} min`;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/**
 * The five doors' faces. `phase` picks the shift ring the Floor door names
 * ("Mid chores 9 of 14"); the rings count the whole studio's chores, never a
 * person's.
 */
export function doorFaces(input: BoardInput, phase: RingPhase | "closed"): Record<DoorId, DoorFace> {
  const items = boardItems(input);
  const by: Record<DoorId, BoardItem[]> = { floor: [], desk: [], help: [], lead: [], mine: [] };
  for (const i of items) by[doorOf(i, input)].push(i);

  const ring = phase === "closed" ? null : shiftRings(input.rows).find((r) => r.phase === phase) ?? null;
  const floorSub = ring && ring.total > 0 ? `${RING_LABEL[ring.phase]} chores ${ring.done} of ${ring.total}` : null;

  // A cover needed today (or with no kept time) presses; one for a later day doesn't.
  const openCovers = by.help.filter(
    (i): i is Extract<BoardItem, { kind: "ask" }> =>
      i.kind === "ask" && i.request.kind === "cover" && !i.request.claimedBy && !coverIsLater(i.request, input.todayKey),
  );
  const coverOpen = openCovers.length > 0;
  const soonest = openCovers
    .map((i) => coverTimeOf(i.request))
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .sort((a, b) => a.at - b.at)[0];
  const clientTasks = by.desk.filter((i) => i.kind === "client").length;
  const leadToday = by.lead.some((i) => i.kind === "initiative" && postedToday(i.request, input.todayKey));
  const handed = by.mine.filter((i) => i.kind === "ask").length;

  const face = (id: DoorId, count: string, sub: string | null, hot = false): DoorFace => ({
    id,
    label: DOOR_LABEL[id],
    count,
    range: rangeOf(by[id]),
    sub,
    hot,
    n: by[id].length,
  });

  return {
    floor: face("floor", `${by.floor.length} open`, floorSub),
    desk: face("desk", `${by.desk.length} open`, clientTasks ? plural(clientTasks, "client task", "client tasks") : null),
    help: face(
      "help",
      plural(by.help.length, "ask", "asks"),
      coverOpen ? (soonest ? `cover ${neededWords(soonest, input.todayKey)}` : "cover needed") : by.help.length ? "from teammates" : null,
      coverOpen,
    ),
    lead: face("lead", plural(by.lead.length, "initiative", "initiatives"), leadToday ? "new today" : null),
    mine: face("mine", `${by.mine.length} with your name`, handed ? `${handed} handed to you` : null),
  };
}

/* ------------------------------------------------------------------ *
 * The dealt card, in words
 * ------------------------------------------------------------------ */

/** "Why now: handed to you by Beregond, due today, fits your gap." or null. */
export function whyNow(why: readonly string[]): string | null {
  if (why.length === 0) return null;
  const text = why.join(", ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** Who a card comes from: a teammate, a leader, or the studio itself (a chore). */
export function giverOf(item: BoardItem): { name: string; person: boolean } {
  switch (item.kind) {
    case "ask":
    case "initiative":
      return { name: item.request.createdBy.name, person: true };
    case "job":
      return { name: item.job.createdBy?.name ?? "The studio", person: Boolean(item.job.createdBy?.name) };
    case "group":
    case "client":
      return { name: "The studio", person: false };
  }
}

/** Where the work happens, for the card's small print. */
export function whereOf(item: BoardItem): string {
  switch (item.kind) {
    case "group":
      return "on the floor";
    case "client":
      return "at the desk";
    case "job":
      return item.job.about.kind === "client" ? "at the desk" : "on the floor";
    case "initiative":
      return "the studio's, everyone's";
    case "ask":
      return item.request.kind === "question" ? "a reply in the app" : item.request.kind === "cover" || item.request.kind === "help" ? "on the floor" : "wherever it needs";
  }
}

/**
 * Time pressure in words — orange, never red: "needed at 4:20 PM" (a cover
 * that keeps its time), "cover needed", "overdue", "due today". Null when
 * nothing presses; a cover for a later day doesn't.
 */
export function pressureOf(scored: Pick<BoardScored, "item" | "why" | "needed">): string | null {
  const { item, why } = scored;
  if (scored.needed) return scored.needed;
  if (item.kind === "ask" && item.request.kind === "cover" && !item.request.claimedBy && coverAtOf(item.request) === null) return "cover needed";
  if (why.includes("overdue")) return "overdue";
  if (why.includes("due today")) return "due today";
  return null;
}

/** Team jobs by the door they sit behind (Floor work or Desk work), for the lanes behind the doors. */
export function jobsBehind(door: "floor" | "desk", jobs: readonly TeamJob[]): TeamJob[] {
  return jobs.filter((j) => (jobTopic(j) === "clients" ? "desk" : "floor") === door);
}
