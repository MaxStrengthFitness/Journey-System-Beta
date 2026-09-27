/**
 * THE NETWORK'S TWO ACTIONS — the pure half (voice-review round, Sep 27 2026).
 *
 * AJ, Sep 27: move the Network view out of My Studio → Relay and into
 * Operations, and "drop the ranking entirely when network moves because the
 * underlying metrics are currently flawed". So what moved is what a network
 * owner DOES, and nothing that scored anyone:
 *
 *   the focus     the quarter's mastery series, machine and a line for the
 *                 floor, on networks/{id}.relayFocus; every Floor in the
 *                 network still shows it as a quiet banner (relay/board/
 *                 focus.ts is the one shape both sides read)
 *   a launch      one initiative, posted at every studio in the reader's
 *                 "All my studios", each studio's Floor seeing it as its own
 *
 * What was dropped is the studio leaderboard: "New this month" needed an
 * index that did not exist and, during the migration, counted clients new to
 * JOURNEY rather than new clients; "Loops closed" counted machine wipe ticks,
 * so a studio with more machines ranked higher, with no minimum sample. A
 * confident wrong number is worse than a missing one.
 *
 * WHY OPERATIONS MAY WRITE THESE. Operations looks and My Studio edits a
 * studio's OWN settings. Neither of these is a studio's setting: like an
 * announcement, they belong to the network, so they have no editor on My
 * Studio to duplicate.
 *
 * PURE MODULE.
 */
import type { FranchiseNetwork, Trainer } from "../../../types";
import { isEveryStudioRole } from "../../renewals/permissions";
import { isDemoStudioId } from "../../demo-mode/is-demo";
import { focusOf } from "../../relay/board/focus";
import { formatStudioDate, toDate, type DateLike } from "../../../lib/studio-time";
import type { CreateRequestInput } from "../../studio-tasks/requests";
import type { TaskAuthor } from "../../studio-tasks/mutations";
import type { ClientTaskAction } from "../../studio-tasks/types";

/**
 * Who sets a network's focus and launches across studios: franchise owners
 * and the company, the same people who saw Relay → Network. The rules let the
 * same people write a network (`networks` update).
 */
export function mayActForNetwork(trainer: Pick<Trainer, "role"> | null | undefined): boolean {
  return isEveryStudioRole(trainer as Trainer | null | undefined);
}

/**
 * The networks this reader may set a focus for: every network that holds a
 * studio in scope, for a franchise owner exactly as for the company. AJ, Sep
 * 27 2026: an owner may set the focus of every network that holds a studio in
 * their scope, as Relay allowed (Relay → Network edited the network holding
 * the studio the owner stood in, whether or not the network listed them, and
 * a network made with "Choose later" never lists an owner). The rules agree:
 * any franchise owner may update a network.
 *
 * The practice studio never counts. Inside Demo Mode the scope is Demo Mode
 * alone, so no real network's focus is offered there, even if a network were
 * ever to list the practice studio: from inside Demo Mode you see Demo Mode
 * and nothing else (demo-mode/access.ts). A studio leader gets none. By name.
 */
export function focusableNetworks(
  trainer: Pick<Trainer, "id" | "role"> | null | undefined,
  networks: FranchiseNetwork[],
  studioIds: readonly string[],
): FranchiseNetwork[] {
  if (!trainer || !mayActForNetwork(trainer)) return [];
  const inScope = new Set(studioIds.filter((id) => !isDemoStudioId(id)));
  if (inScope.size === 0) return [];
  return networks
    .filter((n) => Boolean(n.id) && (n.studioIds ?? []).some((id) => inScope.has(id)))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

/* ------------------------------------------------------------------ *
 * The focus
 * ------------------------------------------------------------------ */

export interface FocusFields {
  mastery: string;
  machine: string;
  note: string;
}

export const FOCUS_LIMITS: Readonly<Record<keyof FocusFields, number>> = { mastery: 120, machine: 120, note: 500 };

/**
 * The focus editor's idle line: who set the focus, and on which day as the
 * studio's day (lib/studio-time; the studios are Eastern). Every save writes
 * `relayFocus.setAt`, and this is what reads it, so an owner can see a focus
 * set two quarters ago for what it is. "Set by Ann Owner on Sep 27, 2026."
 * A save still on its way to the server has no time yet, so it says who only.
 */
export function focusSetLine(
  focus: { setBy?: { name?: string } | null; setAt?: unknown } | null | undefined,
  tz?: string,
): string {
  const name = focus?.setBy?.name?.trim();
  const at = toDate(focus?.setAt as DateLike);
  const day = at ? formatStudioDate(at, { month: "short", day: "numeric", year: "numeric" }, tz) : null;
  if (name && day) return `Set by ${name} on ${day}.`;
  if (name) return `Set by ${name}.`;
  if (day) return `Set on ${day}.`;
  return "Set.";
}

/** The focus form's committed value, from the network document. */
export function focusFields(network: { relayFocus?: unknown } | null | undefined): FocusFields {
  const f = focusOf(network);
  return { mastery: f?.mastery ?? "", machine: f?.machine ?? "", note: f?.note ?? "" };
}

/**
 * What a focus save writes: only the lines that changed (the admin rule —
 * only the diff), trimmed to their limits, and who set it and when. An empty
 * patch writes nothing. Dot paths, so a line nobody touched keeps the value
 * another owner saved a moment ago.
 */
export function focusWrite(
  patch: Partial<FocusFields>,
  by: { id: string; name: string },
  at: unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ["mastery", "machine", "note"] as const) {
    const value = patch[key];
    if (typeof value === "string") out[`relayFocus.${key}`] = value.trim().slice(0, FOCUS_LIMITS[key]);
  }
  if (Object.keys(out).length === 0) return {};
  out["relayFocus.setBy"] = by;
  out["relayFocus.setAt"] = at;
  return out;
}

/* ------------------------------------------------------------------ *
 * The launch
 * ------------------------------------------------------------------ */

/** The flows an initiative can ask for, in the order the form offers them. */
export const LAUNCH_FLOWS: readonly ClientTaskAction[] = ["assessment", "progress-report", "inbody", "custom"];

/** How many each trainer should log; 0 is "no number, participation only". */
export const PER_TRAINER_CHOICES: readonly number[] = [0, 3, 5, 8, 10];

export interface LaunchDraft {
  title: string;
  action: ClientTaskAction;
  perTrainer: number;
  /** YYYY-MM-DD, or null for "No date". */
  dueOn: string | null;
}

/** The request one studio receives. Built without a blank field (see targetForWrite). */
export function launchRequest(draft: LaunchDraft, studioId: string, author: TaskAuthor): CreateRequestInput {
  return {
    studioId,
    author,
    kind: "initiative",
    title: draft.title.trim().slice(0, 200),
    detail: "A network initiative for every studio.",
    target: { action: draft.action, perTrainer: draft.perTrainer, ...(draft.dueOn ? { dueOn: draft.dueOn } : {}) },
    priority: "normal",
    expiry: "none",
  };
}

/** "Solon", "Solon and Westlake", "Solon, Strongsville and Westlake": names are never cut. */
export function studioList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** What the screen says after a launch: every studio, or which it missed. */
export function launchOutcome(total: number, missed: readonly string[]): { tone: "ok" | "warn"; text: string } {
  const posted = total - missed.length;
  if (missed.length === 0) return { tone: "ok", text: `Posted at ${posted} ${posted === 1 ? "studio" : "studios"}. Each studio's Floor shows it with its requests.` };
  return {
    tone: "warn",
    text: `Posted at ${posted} of ${total} studios. Not posted at ${studioList(missed)} — Launch again posts at ${missed.length === 1 ? "that studio" : "those studios"} only.`,
  };
}
