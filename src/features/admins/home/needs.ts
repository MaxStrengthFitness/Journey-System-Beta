/**
 * WHAT NEEDS YOU — the Admins dashboard's Home, in sentences.
 * PURE: no React, no Firestore.
 *
 * Round: the Admins room (Sep 28 2026), AJ's pick "Command Center": Home
 * answers the question an admin has when the screen opens, what needs me?
 * Every item here has ONE condition, computed from data the dashboard
 * already holds, and it CLEARS ITSELF when the condition ends — nobody ticks
 * it off, and there is nothing stored about it. That is also why there is no
 * Take it, Snooze or Dismiss: each needs a small stored record per item,
 * which waits for AJ's OK. Seven items at most, so it can't cry wolf; each
 * says what it is, one sentence of proof, and where to go.
 *
 * An item is one KIND of thing, however many studios it covers ("2 studios
 * are failing to pull"), so a bad morning at ten studios is still one line.
 *
 * Unknown is never nothing: a read that failed becomes its own item,
 * "Couldn't check", with Check again as its door.
 */
import type { FranchiseNetwork, LimboEntry, Studio } from "../../../types";
import type { ReportView } from "../../admin/bugs/reportView";
import { findOrphans, hasOrphans } from "../../admin/studios/registry";
import { limboGroups } from "../../admin/limbo/limbo-groups";
import type { SyncRow } from "../machinery/sync-check";
import type { AdminsPage } from "../nav";
import type { PendingOffer, ReadState } from "./useHomeSignals";

export type NeedTone = "watch" | "unknown" | "live";

export type NeedDoor =
  | { label: string; page: AdminsPage; studioId?: string; tab?: "setup" | "mindbody" | "floor" | "team" }
  | { label: string; action: "check-again" };

export interface NeedItem {
  id: string;
  /** What kind of thing it is, in a word or two. */
  kind: string;
  tone: NeedTone;
  /** The one sentence. */
  say: string;
  /** One sentence of proof. */
  proof: string;
  door: NeedDoor;
  /** When it goes away on its own. */
  clears: string;
}

export interface NeedInputs {
  studios: readonly Studio[];
  networks: readonly FranchiseNetwork[];
  sync: readonly SyncRow[];
  limbo: { state: ReadState; entries: readonly LimboEntry[] };
  bugs: { state: ReadState; reports: readonly ReportView[] };
  offers: { state: ReadState; pending: readonly PendingOffer[] };
  now: number;
}

/** Home shows this many at most. */
export const MAX_NEEDS = 7;

/** Pulls in a row that must fail before Home says so; one failed pull usually recovers on the next. */
export const FAILURES_FOR_HOME = 2;

function names(list: readonly string[]): string {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "offered today", "waiting 1 day", "waiting 3 days"; null when the day isn't known. */
function waitingWords(since: number | null, now: number): string | null {
  if (since == null) return null;
  const days = Math.floor((now - since) / 86_400_000);
  if (days < 1) return "offered today";
  return days === 1 ? "waiting 1 day" : `waiting ${days} days`;
}

/** Everything that needs a person right now, worst first; `more` is what didn't fit. */
export function needItems(input: NeedInputs): { items: NeedItem[]; more: NeedItem[] } {
  const out: NeedItem[] = [];

  // 1. Pulls that keep failing.
  const failing = input.sync.filter((r) => r.kind === "failing" && r.failures >= FAILURES_FOR_HOME);
  if (failing.length) {
    const one = failing[0];
    out.push({
      id: "sync-failing",
      kind: "Mindbody sync",
      tone: "watch",
      say:
        failing.length === 1
          ? `${one.name}'s last ${one.failures} pulls from Mindbody failed.`
          : `${failing.length} studios are failing to pull from Mindbody: ${names(failing.map((r) => r.name))}.`,
      proof: "Bookings made in Mindbody since then may not be in Journey yet. Operations → Mindbody, in the studio, says why.",
      door: { label: "Open Mindbody sync", page: "sync" },
      clears: "Clears itself after a pull that works.",
    });
  }

  // 2. Studios that can't pull at all.
  const setup = input.sync.filter((r) => r.kind === "no-site" || r.kind === "no-location");
  if (setup.length) {
    const one = setup[0];
    out.push({
      id: "mindbody-setup",
      kind: "Mindbody set-up",
      tone: "watch",
      say:
        setup.length === 1
          ? `${one.name} can't pull from Mindbody: ${one.kind === "no-site" ? "it has no Site ID" : "it names no location on a shared site"}.`
          : `${setup.length} studios can't pull from Mindbody until their details are filled in: ${names(setup.map((r) => r.name))}.`,
      proof: "Marked as linked to Mindbody with something missing. Mark a studio offline if that is on purpose.",
      door: setup.length === 1 ? { label: `Open ${one.name}'s setup`, page: "studio", studioId: one.studioId, tab: "setup" } : { label: "Open All studios", page: "studios" },
      clears: "Clears itself when the details are saved, or the studio is marked offline.",
    });
  }

  // 3. Franchise listings that disagree with the studios.
  const orphans = findOrphans(input.networks as FranchiseNetwork[], input.studios as Studio[]);
  if (hasOrphans(orphans)) {
    const count = orphans.danglingStudioIds.reduce((n, d) => n + d.studioIds.length, 0) + orphans.strandedStudios.length + orphans.oneSidedLinks.length;
    out.push({
      id: "registry",
      kind: "Franchises",
      tone: "watch",
      say: `The franchise listings and the studios disagree in ${plural(count, "place", "places")}.`,
      proof: "Left alone, this quietly breaks which studios a franchise owner sees. The repair puts both sides back in agreement.",
      door: { label: "Open Franchises", page: "franchises" },
      clears: "Clears itself once both sides agree.",
    });
  }

  // 4. Limbo.
  if (input.limbo.state === "ok" && input.limbo.entries.length > 0) {
    const groups = limboGroups(input.limbo.entries, input.studios);
    const known = groups.filter((g) => g.suggestion);
    const proofParts = known.map((g) => `${plural(g.entries.length, "looks", "look")} like ${g.suggestion!.name}'s`);
    const unclaimed = groups.filter((g) => !g.suggestion).reduce((n, g) => n + g.entries.length, 0);
    if (unclaimed) proofParts.push(`${plural(unclaimed, "names", "name")} no studio yet`);
    out.push({
      id: "limbo",
      kind: "Limbo",
      tone: "live",
      say: `${plural(input.limbo.entries.length, "Mindbody event", "Mindbody events")} couldn't be matched to a studio.`,
      proof: `${proofParts.join("; ")}. They're held in Limbo, never dropped.`,
      door: { label: "Open Limbo", page: "limbo" },
      clears: "Clears itself when Limbo is empty.",
    });
  }

  // 5. Machines studios offered the catalog.
  if (input.offers.state === "ok" && input.offers.pending.length > 0) {
    const pending = input.offers.pending;
    const first = pending[0];
    const waiting = waitingWords(first.submittedAt, input.now);
    out.push({
      id: "offers",
      kind: "Offered to the catalog",
      tone: "live",
      say:
        pending.length === 1
          ? `${first.studioName} offered ${first.machineName} to the MSF catalog.`
          : `${pending.length} machines offered to the MSF catalog wait for a decision.`,
      proof:
        pending.length === 1
          ? `Read it, correct it if need be, then publish or pass${waiting ? ` (${waiting})` : ""}.`
          : `The oldest is ${first.machineName}, from ${first.studioName}${waiting ? `, ${waiting}` : ""}.`,
      door: { label: "Open Machines", page: "machines" },
      clears: "Clears itself when each is published or passed.",
    });
  }

  // 6. Bug reports nobody has looked at.
  if (input.bugs.state === "ok") {
    const fresh = input.bugs.reports.filter((r) => r.status === "open");
    if (fresh.length) {
      const newest = [...fresh].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
      const text = newest.description.length > 90 ? `${newest.description.slice(0, 90).trimEnd()}…` : newest.description;
      out.push({
        id: "bugs",
        kind: "Bug reports",
        tone: "live",
        say: `${plural(fresh.length, "new bug report", "new bug reports")}.`,
        proof: `The newest, from ${newest.reporter}${newest.studioName ? ` at ${newest.studioName}` : ""}: “${text}”`,
        door: { label: "Open Bug reports", page: "bugs" },
        clears: "Clears itself when each has a status.",
      });
    }
  }

  // 7. What couldn't be read.
  const unknownSync = input.sync.filter((r) => r.kind === "unknown").map((r) => `${r.name}'s sync`);
  const unknownReads = [
    ...unknownSync,
    ...(input.limbo.state === "failed" ? ["Limbo"] : []),
    ...(input.offers.state === "failed" ? ["the machines offered to the catalog"] : []),
    ...(input.bugs.state === "failed" ? ["the bug reports"] : []),
  ];
  if (unknownReads.length) {
    out.push({
      id: "unknown",
      kind: "Couldn't check",
      tone: "unknown",
      say: `Couldn't check ${names(unknownReads)}.`,
      proof: "That is unknown, not fine and not broken: the records couldn't be read just now.",
      door: { label: "Check again", action: "check-again" },
      clears: "Clears itself when they can be read.",
    });
  }

  return { items: out.slice(0, MAX_NEEDS), more: out.slice(MAX_NEEDS) };
}

/** The headline: how many things need you. */
export function needsHeadline(count: number): string {
  if (count === 0) return "Nothing needs you right now.";
  return count === 1 ? "1 thing needs you." : `${count} things need you.`;
}
