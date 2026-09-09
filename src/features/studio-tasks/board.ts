/**
 * THE STUDIO HUB — deciding what a trainer sees first.
 *
 * ============================================================================
 * WHY THE OLD SCREEN FELT LIKE A CHORE DUMP
 * ============================================================================
 * It was not that the list was long. It was that everything on it was a peer
 * of everything else. On a 19-machine floor, "wipe down every machine" expands
 * to 19 rows, so a screen showing 21 items is 90% one chore — and a trainer
 * asking for help with a client's shoulder is the 21st row down.
 *
 * The instinct is to add topic categories. That does not fix it: a trainer
 * between two 20-minute sessions does not think "let me check the Cleaning
 * bucket", they think "what dies today if I don't touch it". Topic buckets
 * make you visit four places to answer that.
 *
 * SO THE LAYOUT IS BY LIFESPAN, AND THE FILTER IS BY TOPIC.
 *
 *   SHIFT     expires tonight     the recurring ops. Volume, no reading.
 *                                 Belongs in a strip, not a list.
 *   BOARD     lives until answered  the human content. Needs names and faces.
 *   PLAYBOOK  never expires       what we learned. The only thing here that
 *                                 gets MORE valuable with age, which is
 *                                 exactly why it must not sit under cleaning.
 *
 * Lifespan is the right axis because it maps to what you do about a thing:
 * dispatch it, answer it, or remember it. Topic still exists — as chips that
 * narrow the board — because "show me only equipment" is a real request. It
 * just is not the skeleton.
 *
 * This module is PURE. No Firestore, no React. The lane rules are the part
 * most likely to be argued with, so they are the part that gets tested.
 */
import type { TaskRow, TaskShift, StudioTaskCategory } from "./types";
import { upkeepRoleOf } from "./types";
import type { TaskRequest, RequestKind } from "./requests";

/* ------------------------------------------------------------------ *
 * Lanes
 * ------------------------------------------------------------------ */

export type HubLane = "shift" | "board" | "playbook";

/**
 * The topic chips over the BOARD.
 *
 * Four, deliberately — the studio's own categories are Cleaning, Maintenance,
 * Operations and Client service, and a trainer can hold four in their head at
 * a glance. These are not those four: the board carries requests, not chores,
 * so it groups by what the post is ABOUT rather than which job it is.
 */
export type BoardTopic = "all" | "clients" | "equipment" | "initiatives" | "help";

export const BOARD_TOPIC_LABEL: Record<BoardTopic, string> = {
  all: "All",
  clients: "Clients",
  equipment: "Equipment",
  initiatives: "Initiatives",
  help: "Help",
};

/**
 * Which chip a request answers to.
 *
 * Order matters and is not alphabetical. A request that names a client AND a
 * machine is a client question first — the person is the reason it was posted
 * and the machine is a detail of it. Getting this backwards buries client
 * questions under equipment, which is the failure this whole round is undoing.
 */
export function topicOf(r: TaskRequest): Exclude<BoardTopic, "all"> {
  if (r.kind === "initiative") return "initiatives";
  if (r.clientId) return "clients";
  if (r.machineId) return "equipment";
  if (r.kind === "cover" || r.kind === "help") return "help";
  // A question with no entity attached is still someone asking for a read.
  if (r.kind === "question") return "help";
  return "initiatives";
}

export function matchesTopic(r: TaskRequest, topic: BoardTopic): boolean {
  return topic === "all" || topicOf(r) === topic;
}

/* ------------------------------------------------------------------ *
 * The shift strip
 * ------------------------------------------------------------------ */

/**
 * One collapsed group of recurring work.
 *
 * `total` counts ROWS, not templates: "wipe down every machine" on a
 * 19-machine floor is 19 rows and the trainer wants to know 12 of 19, not
 * 1 of 1. But the group renders as ONE line until they ask to see inside.
 */
export interface ShiftGroup {
  templateId: string;
  title: string;
  shift: TaskShift;
  category: string;
  /** "cleaning" | "maintenance" | undefined — drives the Catalog's badge. */
  upkeep?: "cleaning" | "maintenance";
  rows: TaskRow[];
  done: number;
  total: number;
  /** Every row closed. The group collapses to a tick and stops asking. */
  complete: boolean;
  /** True when this is a per-machine group, i.e. worth expanding at all. */
  expandable: boolean;
}

/**
 * Group today's rows by template, then order them the way a shift runs.
 *
 * AM before ANY before PM, because a trainer opening the app at 6am should not
 * scroll past closing duties to reach the opening walk-through. Within a
 * shift, incomplete groups first — a finished group has nothing left to say.
 */
export function shiftGroups(
  rows: TaskRow[],
  studioCategories?: StudioTaskCategory[],
): ShiftGroup[] {
  const byTemplate = new Map<string, TaskRow[]>();
  for (const row of rows) {
    // Key on template AND shift: am and pm are separate obligations against
    // the same template, and merging them would let "opened" satisfy "closed".
    const key = `${row.templateId}__${row.shift}`;
    const list = byTemplate.get(key);
    if (list) list.push(row);
    else byTemplate.set(key, [row]);
  }

  const groups: ShiftGroup[] = [];
  for (const list of byTemplate.values()) {
    const first = list[0];
    const done = list.filter((r) => r.status === "done").length;
    // A skipped row is deliberately NOT done. It is also not outstanding —
    // somebody looked at it and said no. It counts toward neither, so a
    // studio that skips the broken leg press does not sit at 18/19 forever.
    const skipped = list.filter((r) => r.status === "skipped").length;
    const total = list.length;
    groups.push({
      templateId: first.templateId,
      title: first.title,
      shift: first.shift,
      category: first.category,
      upkeep: upkeepRoleOf(first.category, studioCategories),
      rows: list,
      done,
      total,
      complete: done + skipped >= total,
      expandable: total > 1,
    });
  }

  const shiftRank: Record<TaskShift, number> = { am: 0, any: 1, pm: 2 };
  return groups.sort(
    (a, b) =>
      shiftRank[a.shift] - shiftRank[b.shift] ||
      Number(a.complete) - Number(b.complete) ||
      a.title.localeCompare(b.title),
  );
}

/** Headline numbers for the strip. Rows, not groups. */
export function shiftTotals(groups: ShiftGroup[]): {
  done: number;
  total: number;
  outstanding: number;
} {
  let done = 0;
  let total = 0;
  for (const g of groups) {
    done += g.done;
    total += g.total;
  }
  return { done, total, outstanding: Math.max(0, total - done) };
}

/* ------------------------------------------------------------------ *
 * Board ordering
 * ------------------------------------------------------------------ */

/**
 * How loudly a card should read.
 *
 * Not the same as `priority`, which is what the author claimed. This is what
 * the board decides, and it deliberately lets time override intent: a normal
 * request expiring tonight outranks an urgent one with a week left, because
 * the first one is about to become impossible and the second is not.
 */
export type BoardHeat = "critical" | "warm" | "calm" | "settled";

export interface BoardCardView {
  request: TaskRequest;
  topic: Exclude<BoardTopic, "all">;
  heat: BoardHeat;
  /** Whole days until expiry. Null when it never expires. */
  daysLeft: number | null;
  /** The signed-in trainer authored, claimed or is targeted by this. */
  mine: boolean;
}

const KIND_RANK: Record<RequestKind | "initiative", number> = {
  cover: 0,
  help: 1,
  initiative: 2,
  question: 3,
  "heads-up": 4,
  other: 5,
};

/**
 * `cover` outranks everything because it is the only kind with a hard
 * deadline attached to a human being: a client is arriving and nobody is
 * booked to meet them. Everything else can slip by an hour.
 */
export function heatOf(r: TaskRequest, daysLeft: number | null): BoardHeat {
  if (r.status !== "open") return "settled";
  if (r.kind === "cover") return "critical";
  if (daysLeft !== null && daysLeft <= 0) return "critical";
  if (r.priority === "urgent") return "critical";
  if (daysLeft !== null && daysLeft <= 1) return "warm";
  if (r.claimedBy) return "calm";
  return "warm";
}

/** Whole days from `todayKey` to `expiresOn`, both YYYY-MM-DD, studio-local. */
export function daysUntil(
  expiresOn: string | undefined,
  todayKey: string,
): number | null {
  if (!expiresOn) return null;
  // String dates, subtracted as dates — not parsed through the device clock,
  // which is what makes a task appear to expire a day early west of UTC.
  const a = Date.UTC(
    Number(expiresOn.slice(0, 4)),
    Number(expiresOn.slice(5, 7)) - 1,
    Number(expiresOn.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(todayKey.slice(0, 4)),
    Number(todayKey.slice(5, 7)) - 1,
    Number(todayKey.slice(8, 10)),
  );
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

const HEAT_RANK: Record<BoardHeat, number> = {
  critical: 0,
  warm: 1,
  calm: 2,
  settled: 3,
};

/**
 * Build the board.
 *
 * Resolved requests are kept rather than hidden, ranked last as "settled".
 * A studio that answered six questions this week should be able to see that it
 * did — and a resolved request is the raw material the playbook is made from,
 * so hiding it hides the thing we most want someone to promote.
 */
export function buildBoard(
  requests: TaskRequest[],
  opts: {
    todayKey: string;
    trainerId?: string | null;
    topic?: BoardTopic;
    mineOnly?: boolean;
    /** Keep resolved/cancelled cards. Default false. */
    includeSettled?: boolean;
  },
): BoardCardView[] {
  const { todayKey, trainerId, topic = "all", mineOnly, includeSettled } = opts;

  const cards: BoardCardView[] = [];
  for (const r of requests) {
    if (!includeSettled && r.status !== "open") continue;
    if (!matchesTopic(r, topic)) continue;

    const mine =
      !!trainerId &&
      (r.createdBy?.id === trainerId || r.claimedBy?.id === trainerId);
    if (mineOnly && !mine) continue;

    const daysLeft = daysUntil(r.expiresOn, todayKey);
    cards.push({ request: r, topic: topicOf(r), heat: heatOf(r, daysLeft), daysLeft, mine });
  }

  return cards.sort((a, b) => {
    const h = HEAT_RANK[a.heat] - HEAT_RANK[b.heat];
    if (h !== 0) return h;
    const k =
      KIND_RANK[a.request.kind as RequestKind] -
      KIND_RANK[b.request.kind as RequestKind];
    if (k !== 0) return k;
    // Unclaimed before claimed at the same heat: an unclaimed ask is the only
    // thing on this screen that needs a person, and it is what the board is for.
    const c = Number(!!a.request.claimedBy) - Number(!!b.request.claimedBy);
    if (c !== 0) return c;
    return millis(b.request.createdAt) - millis(a.request.createdAt);
  });
}

/** Counts for the chips, so a chip can say how much is behind it. */
export function topicCounts(
  requests: TaskRequest[],
  opts: { trainerId?: string | null; mineOnly?: boolean } = {},
): Record<BoardTopic, number> {
  const counts: Record<BoardTopic, number> = {
    all: 0,
    clients: 0,
    equipment: 0,
    initiatives: 0,
    help: 0,
  };
  for (const r of requests) {
    if (r.status !== "open") continue;
    if (opts.mineOnly) {
      const mine =
        !!opts.trainerId &&
        (r.createdBy?.id === opts.trainerId ||
          r.claimedBy?.id === opts.trainerId);
      if (!mine) continue;
    }
    counts.all += 1;
    counts[topicOf(r)] += 1;
  }
  return counts;
}

/** Firestore timestamps arrive in three shapes across this codebase's history. */
function millis(v: unknown): number {
  if (!v) return 0;
  const t = v as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.toDate === "function") return t.toDate().getTime();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  if (typeof v === "number") return v;
  return 0;
}
