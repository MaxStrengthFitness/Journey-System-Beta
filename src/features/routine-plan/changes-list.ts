/**
 * A routine's Changes: ONE list, newest first (the design round, §4.3: "One
 * list holds the plan's changes and the old `routineAdjustments`, newest
 * first. Each says who, when, what and the reason if one was given").
 *
 * AJ, Oct 7 2026: "It's nice to be able to communicate like, hey, I'm
 * changing this plan because of this reason", so three different trainers
 * can "still effectively follow one plan". A routine's story began before
 * its plan did: the Edit routine drawer and the B switch have written
 * `routineAdjustments` since long before this round, and a routine with a
 * plan has both. They are merged here so the profile shows one list.
 *
 * Who: a plan change is signed with the signed-in person's Auth uid
 * (`byUid`), an adjustment with the trainer document's id (`trainerId`). The
 * two differ on older accounts (CLAUDE.md, "use the Auth uid"), so a plan
 * change finds its trainer by `authUid ?? id`, then by the name it was
 * signed with, and an adjustment by its id.
 *
 * One save, said once: the drawer's save on a routine with a plan writes
 * both an adjustment and the matching plan change in one batch (§4.3, "The
 * drawer keeps the plan"). The two carry the same server time and the same
 * person, so the adjustment is left out and the plan change, which says it
 * better, keeps the adjustment's reason when it has none of its own.
 *
 * Pure: the caller reads the changes (`readPlanChanges`) and the
 * adjustments, and passes the floor's names (never truncated).
 */
import type { RoutineAdjustment, Trainer } from "../../types";
import { B_PLANNED, B_START, B_SWAP_KEPT, B_SWAP_MADE, B_SWAP_PLANNED } from "./b-routine";
import { cantDoLine, listWords, parseCantDoValue } from "./cant-do";
import { FOCUS_AREAS } from "./focus";
import { DAY_ONE, ROUTINE_ONLY, isStartingColumnChoice } from "./plan";
import { STARTING_COLUMN_LEVEL } from "./starting-weights";
import type { StoredPlanChange } from "./store";
import type { PlanChangeKind } from "./types";

type AdjustmentKind = "created" | "machines" | "enabled" | "disabled";

export interface ChangeRow {
  id: string;
  /** A plan change (`routines/{id}/planChanges`) or an old adjustment (`routineAdjustments`). */
  source: "plan" | "adjustment";
  /** Milliseconds, or null while the server's time is pending: drawn first, as just now. */
  at: number | null;
  /** The trainer's name, or the name the change was signed with; "A trainer" when neither is known. */
  who: string;
  initials: string;
  /** What changed, in a sentence. */
  what: string;
  /** The reason, when one was given (asked, never required). */
  reason: string | null;
  kind: PlanChangeKind | AdjustmentKind;
  /** A Re-plan: drawn as a divider ("Re-planned · {day} · {reason}"); nothing before it is erased. */
  isDivider: boolean;
}

type TrainerLike = Pick<Trainer, "id" | "fullName"> & Partial<Pick<Trainer, "authUid" | "initials">>;

export interface ChangesListInput {
  /** This routine's plan changes, as `readPlanChanges` gives them. */
  planChanges: readonly StoredPlanChange[];
  /** The client's adjustments; only this routine's are kept. */
  adjustments: readonly RoutineAdjustment[];
  routineId: string;
  trainers: readonly TrainerLike[];
  /** The floor's name for a machine. */
  nameOf: (machineId: string) => string;
  /** "Routine A": "Turned on: Routine A is being built". */
  routineName?: string;
  /** The client's first name: "Not for Dana: Seated Dip". Without it, "Can't do: Seated Dip". */
  firstName?: string;
  /** The studio's day, so a can't-do's day leaves this year's year off. */
  todayYmd?: string;
}

/** Plan changes that move machines: an adjustment written in the same batch says the same thing. */
const MOVES_MACHINES: ReadonlySet<PlanChangeKind> = new Set<PlanChangeKind>([
  "start",
  "add",
  "remove",
  "swap",
  "reorder",
  "cantdo",
  "cando",
  "replan",
]);

/** One batch's writes carry one server time; this allows for a clock that reports them a moment apart. */
const SAME_SAVE_MS = 5_000;

const UNKNOWN_WHO = "A trainer";

function millisOf(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  const t = v as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.toDate === "function") return t.toDate().getTime();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  return null;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function trainerByUid(trainers: readonly TrainerLike[], uid: string): TrainerLike | undefined {
  return trainers.find((t) => (t.authUid || t.id) === uid) ?? trainers.find((t) => t.id === uid);
}

function trainerById(trainers: readonly TrainerLike[], id: string): TrainerLike | undefined {
  return trainers.find((t) => t.id === id) ?? trainers.find((t) => t.authUid === id);
}

function person(t: TrainerLike | undefined, signedAs: string | undefined): { who: string; initials: string; key: string | null } {
  const name = t?.fullName?.trim() || signedAs?.trim() || "";
  if (!name) return { who: UNKNOWN_WHO, initials: "?", key: null };
  return { who: name, initials: t?.initials?.trim() || initialsOf(name), key: t ? t.id : `name:${name}` };
}

function columnWords(value: string | undefined): string {
  if (value === "none") return "Academy's starting ranges: not shown";
  // The level alone, never the sheet's sex word: this list is read by every trainer.
  if (isStartingColumnChoice(value)) return `Academy's starting ranges: the ${STARTING_COLUMN_LEVEL[value]} column`;
  return value ? `Academy's starting ranges: ${value}` : "Academy's starting ranges";
}

function focusWords(value: string | undefined): string {
  const areas = (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((key) => FOCUS_AREAS[key]?.label ?? key);
  return areas.length > 0 ? `Focus: ${listWords(areas)}` : "Took the focus off";
}

/** What a plan change did, in a sentence. */
export function planChangeWhat(
  change: Pick<StoredPlanChange, "kind" | "machineIds" | "value">,
  input: Pick<ChangesListInput, "nameOf" | "routineName" | "firstName" | "todayYmd">,
): string {
  const ids = change.machineIds ?? [];
  const names = ids.map(input.nameOf);
  const value = change.value?.trim() || undefined;
  const routine = input.routineName?.trim() || "the routine";
  switch (change.kind) {
    case "start":
      // Routine B's plan starts as A with one machine different (b-routine.ts, `B_START`).
      if (value === B_START) return names.length >= 2 ? `Started B: ${names[1]} for ${names[0]}` : "Started B";
      // B planned with the starting lineup (the studio's "A and B together"): its swaps' pairs.
      if (value === B_PLANNED) {
        const pairs = Math.floor(names.length / 2);
        if (pairs === 0) return "Planned B";
        return `Planned B: ${names[1]} for ${names[0]} first${pairs > 1 ? `, ${pairs} swaps in all` : ""}`;
      }
      return value ? `Started the plan from ${value}` : "Started the plan";
    case "add":
      if (names.length === 0) return "Changed the plan";
      if (value === DAY_ONE) return `Put ${listWords(names)} on day one`;
      return value === ROUTINE_ONLY ? `Added ${listWords(names)} to ${routine}` : `Added ${listWords(names)}`;
    case "remove":
      if (names.length === 0) return "Changed the plan";
      if (value === DAY_ONE) return `Took ${listWords(names)} off day one`;
      return value === ROUTINE_ONLY ? `Took ${listWords(names)} out of ${routine}` : `Took ${listWords(names)} out of the plan`;
    case "swap":
      // Routine B's swaps against A (b-routine.ts): one made, one planned, one kept as A has it.
      if (value === B_SWAP_MADE && names.length >= 2) return `Swapped ${names[1]} in for ${names[0]}`;
      if (value === B_SWAP_PLANNED && names.length >= 2) return `B's swap for ${names[0]}: ${names[1]}`;
      if (value === B_SWAP_KEPT && names.length >= 1) return `B keeps ${names[0]}`;
      return names.length >= 2 ? `${listWords(names.slice(1))} instead of ${names[0]}` : "Changed the plan";
    case "reorder":
      return names.length > 0 ? `New order: ${names.join(", ")}` : "Changed the order";
    case "purpose":
      return value ? `Purpose: ${value}` : "Cleared the purpose";
    case "building":
      return value === "on" ? `Turned on: ${routine} is being built` : `Turned off: ${routine} is being built`;
    case "focus":
      return focusWords(value);
    case "cantdo": {
      if (!ids[0]) return "Changed what the client can't do";
      const lead = input.firstName?.trim() ? `Not for ${input.firstName.trim()}` : "Can't do";
      return `${lead}: ${cantDoLine({ machineId: ids[0], ...parseCantDoValue(value) }, input.nameOf, input.todayYmd)}`;
    }
    case "cando":
      return names.length > 0 ? `Can do ${listWords(names)} again` : "Changed what the client can't do";
    case "replan":
      return "Re-planned";
    case "column":
      return columnWords(value);
    default:
      // A kind this build doesn't know (written by a newer one): said plainly, never dropped.
      return "Changed the plan";
  }
}

/** What an old adjustment did, in a sentence. */
export function adjustmentWhat(adj: RoutineAdjustment, input: Pick<ChangesListInput, "nameOf" | "routineName">): string {
  const prev = adj.previousMachineIds ?? [];
  const next = adj.newMachineIds ?? [];
  const routine = input.routineName?.trim() || "the routine";
  switch (adj.changeType) {
    case "enabled":
      return `Turned ${input.routineName?.trim() || "Routine B"} on`;
    case "disabled":
      return `Turned ${input.routineName?.trim() || "Routine B"} off`;
    case "created": {
      const names = next.map(input.nameOf);
      return names.length > 0 ? `Made ${routine}: ${listWords(names)}` : `Made ${routine}`;
    }
    default: {
      const added = next.filter((id) => !prev.includes(id)).map(input.nameOf);
      const removed = prev.filter((id) => !next.includes(id)).map(input.nameOf);
      const parts = [
        added.length > 0 ? `Added ${listWords(added)}` : null,
        removed.length > 0 ? `Took ${listWords(removed)} out` : null,
      ].filter((p): p is string => p !== null);
      return parts.length > 0 ? parts.join(" · ") : "Changed the order";
    }
  }
}

function adjustmentKind(adj: RoutineAdjustment): AdjustmentKind {
  return adj.changeType === "created" || adj.changeType === "enabled" || adj.changeType === "disabled"
    ? adj.changeType
    : "machines";
}

function sameMoment(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= SAME_SAVE_MS;
}

/**
 * The plan's changes and the routine's old adjustments as one list, newest
 * first; a change whose server time is still pending comes first, as just
 * now. Equal times keep their order (a batch's plan change before an
 * adjustment it didn't pair with).
 */
export function planChangesAndAdjustments(input: ChangesListInput): ChangeRow[] {
  const rows: ChangeRow[] = [];
  const planPeople = input.planChanges.map((c) => person(trainerByUid(input.trainers, c.byUid), c.byName));

  input.planChanges.forEach((c, i) => {
    const reasonParts = c.kind === "replan" ? [c.value, c.reason] : [c.reason];
    const reason =
      reasonParts
        .map((r) => r?.trim())
        .filter((r, j, all): r is string => !!r && all.indexOf(r) === j)
        .join(" · ") || null;
    const p = planPeople[i]!;
    rows.push({
      id: `plan:${c.id}`,
      source: "plan",
      at: c.atMs,
      who: p.who,
      initials: p.initials,
      what: planChangeWhat(c, input),
      reason,
      kind: c.kind,
      isDivider: c.kind === "replan",
    });
  });

  const paired = new Set<number>();
  input.adjustments
    .filter((a) => a.routineId === input.routineId)
    .forEach((adj, i) => {
      const at = millisOf(adj.createdAt);
      const p = person(trainerById(input.trainers, adj.trainerId), undefined);
      const kind = adjustmentKind(adj);
      const notes = adj.notes?.trim() || null;
      if (kind === "machines" || kind === "created") {
        // The drawer's one save, written twice: keep the plan change, with this reason if it had none.
        const twin = rows.findIndex(
          (r, j) =>
            r.source === "plan" &&
            !paired.has(j) &&
            MOVES_MACHINES.has(r.kind as PlanChangeKind) &&
            p.key !== null &&
            planPeople[j]?.key === p.key &&
            sameMoment(r.at, at),
        );
        if (twin !== -1) {
          paired.add(twin);
          if (!rows[twin]!.reason && notes) rows[twin] = { ...rows[twin]!, reason: notes };
          return;
        }
      }
      rows.push({
        id: `adjustment:${adj.id ?? `${adj.routineId}-${i}`}`,
        source: "adjustment",
        at,
        who: p.who,
        initials: p.initials,
        what: adjustmentWhat(adj, input),
        reason: notes,
        kind,
        isDivider: false,
      });
    });

  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (b.r.at ?? Number.MAX_SAFE_INTEGER) - (a.r.at ?? Number.MAX_SAFE_INTEGER) || a.i - b.i)
    .map((e) => e.r);
}
