/**
 * HUB ANNOUNCEMENTS, read by the one bell.
 *
 * Round: Sep 6 2026 UI pass; targeting extracted Round 2 Phase 1.
 *
 * WHY THIS HOOK EXISTS AT ALL
 * ---------------------------
 * The header used to carry two bells. One was `NotificationBell` - the quiet
 * per-trainer feed added in the Task Board round - and the other was
 * `HubAnnouncementsWidget`, an older component that streamed
 * `hub_announcements` and opened its own dialog. Two bells side by side is not
 * a design, it is an archaeological layer: nobody could tell from the glyph
 * which one held the thing they were looking for, so both got ignored.
 *
 * Deleting the older bell outright would have taken announcements off the
 * trainer UI with it - Admin can still author them, and they would have gone
 * nowhere. So the STREAM moved here and the RENDERING moved into the
 * notification sheet. One bell, two sections, nothing lost.
 *
 * THE FILTERING NOW LIVES IN A PURE MODULE
 * ----------------------------------------
 * The Sep 6 pass lifted the scope check verbatim from the widget and said so,
 * on the grounds that moving code and changing behaviour in one commit makes
 * any resulting "why can't I see it" report untraceable. Round 2 came back for
 * the behaviour: the lifted check honoured `studioId === "all"` on documents
 * the franchise composer wrote for a single network, so a network notice went
 * to the whole platform. That check now lives in features/admin/announcements/
 * audience.ts, under test, shared with both composers, and its header explains
 * the leak and the migration.
 *
 * READS ARE MARKED ON OPEN, NOT ON RENDER
 * ---------------------------------------
 * `markAnnouncementsRead` is exported rather than run inside an effect. An
 * announcement that flashes past because the sheet mounted behind another
 * screen has not been read by anybody, and marking it so is how a studio-wide
 * notice silently stops being new to a trainer who never saw it.
 */

import { useEffect, useMemo, useState } from "react";
import {
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import type { HubAnnouncement, Trainer } from "../../types";
import {
  unreadFor,
  visibleAnnouncements,
} from "../admin/announcements/audience";

export interface UseHubAnnouncementsResult {
  /** Active, in-scope, unexpired. Newest first. */
  announcements: HubAnnouncement[];
  /** Of those, the ones this trainer has not opened yet. */
  unread: HubAnnouncement[];
  unreadCount: number;
}

export function useHubAnnouncements(
  trainer: Trainer | null | undefined,
): UseHubAnnouncementsResult {
  const [all, setAll] = useState<HubAnnouncement[]>([]);

  useEffect(() => {
    if (!trainer) {
      setAll([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, "hub_announcements")),
      (snap) => {
        setAll(
          snap.docs.map((d) => ({ ...(d.data() as HubAnnouncement), id: d.id })),
        );
      },
      (err) => {
        console.error("Error streaming hub announcements:", err);
        setAll([]);
      },
    );
    return () => unsub();
  }, [trainer]);

  /**
   * `Date.now()` is read inside the memo rather than held in state, so expiry
   * is evaluated whenever the stream or the trainer changes. A notice that
   * lapses while the tab sits open therefore disappears on the next snapshot,
   * not the next second - which is the right trade: a timer ticking every
   * minute to retire a 24-hour message would re-render the header forever.
   */
  const announcements = useMemo(
    () => visibleAnnouncements(all, trainer, Date.now()),
    [all, trainer],
  );

  // Either id counts: see unreadFor and markAnnouncementsRead.
  const unread = useMemo(
    () => unreadFor(announcements, [auth.currentUser?.uid, trainer?.id]),
    [announcements, trainer],
  );

  return { announcements, unread, unreadCount: unread.length };
}

/**
 * Stamp this trainer into `readBy` on every announcement passed.
 *
 * Fire-and-forget on purpose, and per-document rather than batched: a failed
 * write leaves the item looking new, which is the safe direction to fail, and
 * one rejected document must not take the rest of the set with it.
 */
export function markAnnouncementsRead(
  trainerId: string | undefined,
  items: HubAnnouncement[],
): void {
  // The sign-in id, not the profile id: since the Learning + Planner round
  // the rules let a reader add only themselves, by sign-in id. They differ
  // on older accounts, whose earlier reads unreadFor still honours.
  const readerId = auth.currentUser?.uid ?? trainerId;
  if (!readerId) return;
  for (const a of items) {
    if (!a.id) continue;
    updateDoc(doc(db, "hub_announcements", a.id), {
      readBy: arrayUnion(readerId),
    }).catch((err) => {
      console.error("Failed to mark announcement as read:", a.id, err);
    });
  }
}
