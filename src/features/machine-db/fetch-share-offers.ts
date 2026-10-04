import { collectionGroup, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import type { OfferKind } from "./mutations";
import { byOldestOffer, offerFrom, type ShareOffer } from "./offers";

/**
 * WHAT IS WAITING FOR REVIEW — every note, tip and machine a studio has
 * offered to every MSF studio, oldest first.
 *
 * One read, two readers (Oct 2 2026): the Admins dashboard's Waiting for
 * review page (ShareReviewPanel) and its Home and sidebar count
 * (admins/home/useHomeSignals), so the count and the page can never
 * disagree about what is waiting.
 *
 * Four collection-group reads across every studio (the floor's notes since
 * Oct 3 2026). They carry no index of
 * their own (the database is the Enterprise edition, which builds none
 * automatically), so each scans that collection group; the four are small
 * (a studio's notes, tips, floor notes and own machines), and only
 * administrators may run them.
 */
export const SHARE_GROUPS: { kind: OfferKind; group: "roster" | "wiki" | "playbook" | "floorNotes" }[] = [
  { kind: "machine", group: "roster" },
  { kind: "note", group: "wiki" },
  { kind: "tip", group: "playbook" },
  { kind: "floor", group: "floorNotes" },
];

export async function fetchShareOffers(): Promise<ShareOffer[]> {
  const snaps = await Promise.all(
    SHARE_GROUPS.map(({ group }) => getDocs(query(collectionGroup(db, group), where("shareStatus", "==", "pending")))),
  );
  return snaps
    .flatMap((snap, i) =>
      snap.docs.map((d) => offerFrom(SHARE_GROUPS[i].kind, d.ref.path, d.id, d.data() as Record<string, unknown>)),
    )
    .filter((o): o is ShareOffer => o !== null)
    .sort(byOldestOffer);
}
