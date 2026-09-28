/**
 * THE NETWORK AND THE STANDARD, ONE SENTENCE EACH — Home's other two
 * questions after "what needs me?". PURE: no React, no Firestore.
 *
 * Round: the Admins room (Sep 28 2026). Sentences, not scores: no tiles, no
 * percentages, and a read that failed or hasn't answered says so.
 */
import type { FranchiseNetwork, Studio } from "../../../types";
import { isStandardSetMachine } from "../../admin/studios/registry";
import { groupStudios, studiosCount } from "../studios/stages";
import type { SyncRow } from "../machinery/sync-check";
import type { PendingOffer, ReadState } from "./useHomeSignals";

function names(list: readonly string[]): string {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** Where every studio stands, and how their pulls are going. */
export function networkSentence(studios: readonly Studio[], networks: readonly FranchiseNetwork[], sync: readonly SyncRow[], now: Date = new Date()): string {
  const groups = groupStudios(studios, networks, now).filter((g) => g.stage !== "demo");
  const total = groups.reduce((n, g) => n + g.studios.length, 0);
  if (total === 0) return "No studios yet.";
  const parts = groups.map((g) => `${g.title}: ${names(g.studios.map((s) => s.name))}.`);

  const of = (kind: SyncRow["kind"]) => sync.filter((r) => r.kind === kind).map((r) => r.name);
  const pulls: string[] = [];
  const fine = of("fine").length;
  if (fine) pulls.push(`${fine === 1 ? "1 studio" : `${fine} studios`} pulled from Mindbody in the last two days`);
  const failing = of("failing");
  if (failing.length) pulls.push(`${names(failing)} failing to pull`);
  const unknown = of("unknown");
  if (unknown.length) pulls.push(`couldn't check ${names(unknown)}`);
  if (of("checking").length) pulls.push("still reading the rest");
  const pullSentence = pulls.length ? ` ${pulls.join("; ").replace(/^./, (c) => c.toUpperCase())}.` : "";

  return `${studiosCount(total)}. ${parts.join(" ")}${pullSentence}`;
}

/** What the MSF standard holds, and what waits on corporate. */
export function standardSentence(
  catalog: { loading: boolean; failed: boolean; machines: readonly { id: string; status?: string; inStandardSet?: boolean }[] },
  offers: { state: ReadState; pending: readonly PendingOffer[] },
): string {
  if (catalog.failed) return "The machine catalog couldn't be read just now.";
  if (catalog.loading) return "Reading the machine catalog…";
  const live = catalog.machines.filter((m) => String(m.status ?? "").toLowerCase() !== "retired");
  const inSet = live.filter((m) => isStandardSetMachine(m)).length;
  let sentence = `${inSet} ${inSet === 1 ? "machine" : "machines"} in the standard set, of ${live.length} in the MSF catalog.`;
  if (offers.state === "ok" && offers.pending.length > 0) {
    const n = offers.pending.length;
    sentence += ` ${n === 1 ? "1 machine a studio offered waits" : `${n} machines studios offered wait`} for a decision.`;
  } else if (offers.state === "failed") {
    sentence += " Couldn't check the machines studios offered.";
  }
  return `${sentence} Where studios set their own house defaults shows on Machines.`;
}
