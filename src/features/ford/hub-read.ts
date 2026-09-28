/**
 * THE HUB'S ONE FORD READ (wave 2 hub, Sep 28 2026).
 *
 * AJ said "all yes" to the hub cherry round's Needs OK: "one read of the
 * studio's FORD details for the Hub". This is that read, and the only one: it
 * feeds Get to know, the ✎ "Ask about" mark (hub-opportunities/get-to-know.ts),
 * and the Hub makes it once per studio visit (hub-opportunities/use-hub-ford.ts).
 *
 * The third FORD query shape, beside the two in useClientFord.ts (one
 * client's details; the Delight queue's sweep). Like the Delight queue's, it
 * is ONE collection group query scoped by the denormalised `studioId`, and it
 * asks for exactly the three reasons a detail can come up on the Hub's strip:
 *
 *   studioId == S AND (
 *        recurrence == "annual"                   a birthday or an anniversary, whatever year it was stored in
 *     OR datedFrom <= eventDate < datedUntil      a one-off day inside the strip's two weeks
 *     OR occurredAt >= notedFrom                  noted in the last two weeks
 *   )
 *
 * So it never reads the studio's whole FORD — a standing fact from last year
 * with no date is not asked for.
 *
 * INDEXES. Each branch has its own (firestore.indexes.json, collection group
 * `ford`): studioId + recurrence and studioId + occurredAt, added with this
 * read; studioId + eventDate, which was there. The database is the
 * Enterprise edition, which builds no index by itself.
 *
 * RULES. No change. The ford block already lets the people who work at the
 * studio (and franchise owners and administrators) read a detail stamped
 * with it, and every branch names the studio, so the whole query is provably
 * inside it (tests/firestore.rules.test.ts, "wave 2 hub"). A client's FORD is
 * stamped with her HOME studio (`fordStudioIdOf`), so a client visiting from
 * another studio is not in it: her FORD is her home studio's to read.
 *
 * Nothing here writes, and no listener is opened: one `getDocs`.
 */
import { and, collectionGroup, getDocs, limit, or, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import type { FordEntry } from "./types";
import { fordReadStatusOfError } from "./read-status";

/**
 * The most details the read may return. A studio's annual days, two weeks of
 * news and a fortnight of dated moments come to a few hundred; hitting this
 * makes the answer partial — every detail read is still real, but a client
 * with none in it is unknown rather than clear.
 */
export const HUB_FORD_GUARD = 1000;

/** The instants the read asks between (the studio's midnights of `askReadWindow`'s days). */
export interface HubFordWindow {
  datedFrom: Date;
  /** Left out. */
  datedUntil: Date;
  notedFrom: Date;
}

export type HubFordRead =
  /** The query answered: `partial` when it came back at the guard rail. */
  | { status: "ready" | "partial"; details: FordEntry[]; fromCache: boolean }
  /** It failed (`failed`), or the rules said no (`denied`): nothing is known. */
  | { status: "failed" | "denied"; details: FordEntry[]; fromCache: false };

/** The query, exactly (the rules test and the indexes are written against it). */
export function hubFordQuery(studioId: string, window: HubFordWindow) {
  return query(
    collectionGroup(db, "ford"),
    and(
      where("studioId", "==", studioId),
      or(
        where("recurrence", "==", "annual"),
        and(where("eventDate", ">=", window.datedFrom), where("eventDate", "<", window.datedUntil)),
        where("occurredAt", ">=", window.notedFrom),
      ),
    ),
    limit(HUB_FORD_GUARD),
  );
}

/** Read it once. Never throws: a failure is an answer ("failed" or "denied"), never an empty list. */
export async function fetchHubFord(studioId: string, window: HubFordWindow): Promise<HubFordRead> {
  try {
    const snap = await getDocs(hubFordQuery(studioId, window));
    const details = snap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as FordEntry);
    return {
      status: details.length >= HUB_FORD_GUARD ? "partial" : "ready",
      details,
      fromCache: snap.metadata?.fromCache === true,
    };
  } catch (err) {
    const status = fordReadStatusOfError(err);
    console.warn(`[hub] the studio's FORD couldn't be read (${status}):`, (err as { code?: string })?.code ?? err);
    return { status, details: [], fromCache: false };
  }
}
