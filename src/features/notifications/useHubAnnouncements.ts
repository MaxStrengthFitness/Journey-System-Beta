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
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import type { HubAnnouncement, Trainer } from "../../types";
import {
  announcementsInRealm,
  unreadFor,
  visibleAnnouncements,
} from "../admin/announcements/audience";

export interface UseHubAnnouncementsResult {
  /** Active, in-scope, unexpired. Newest first. */
  announcements: HubAnnouncement[];
  /** Of those, the ones this trainer has not opened yet. */
  unread: HubAnnouncement[];
  unreadCount: number;
  /**
   * The announcements this person said they'd read (Relay's third wave):
   * id → when (ms), or null while the stamp is on its way. Theirs alone,
   * from the same announcementReads/{uid} document as the read-marks.
   */
  acked: ReadonlyMap<string, number | null>;
  /**
   * Where the read stands (the speed round, Oct 5 2026): "loading" until the
   * first answer, "failed" when the stream was refused or broke. A failure
   * keeps the last list it had and says so, never an empty one: "no notices"
   * is a claim, and a failed read can't make it.
   */
  status: "loading" | "ready" | "failed";
}

/**
 * How many notices the bell reads, newest first (the speed round, Oct 5
 * 2026, R16). It read the whole company's collection, every notice ever
 * posted, on every signed-in iPad. The realm rule and the targeting still
 * run in memory over these (visibleAnnouncements, announcementsInRealm), so
 * nothing about WHO sees a notice changed. Deliberately no `isActive`
 * filter: older notices have no such field and the app treats a missing one
 * as active, and an equality filter would drop them.
 *
 * The window is a count, so it covers less time as the company posts more:
 * at about two notices a studio a week, 100 is roughly three months at four
 * studios and under a week at a hundred, while a notice may live a month.
 * Before the company outgrows it, read by audience instead (studioId plus
 * createdAt, the index the speed round adds) rather than raising the number.
 */
export const ANNOUNCEMENTS_READ_LIMIT = 100;

const NO_ACKS: ReadonlyMap<string, number | null> = new Map();

const millisOf = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = v as { toMillis?: () => number } | null | undefined;
  return t && typeof t.toMillis === "function" ? t.toMillis() : null;
};

export function useHubAnnouncements(
  trainer: Trainer | null | undefined,
  /** The studio this iPad is in: the realm rule picks the notices by it (Oct 2 2026). */
  activeStudioId: string | null = null,
): UseHubAnnouncementsResult {
  const [all, setAll] = useState<HubAnnouncement[]>([]);
  const [status, setStatus] = useState<UseHubAnnouncementsResult["status"]>("loading");

  useEffect(() => {
    if (!trainer) {
      setAll([]);
      setStatus("loading");
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(db, "hub_announcements"),
        orderBy("createdAt", "desc"),
        limit(ANNOUNCEMENTS_READ_LIMIT),
      ),
      (snap) => {
        setAll(
          snap.docs.map((d) => ({ ...(d.data() as HubAnnouncement), id: d.id })),
        );
        setStatus("ready");
      },
      (err) => {
        // Unknown, never empty: the last list stays and `status` says the
        // read broke. A failed read is never "no notices".
        console.error("Error streaming hub announcements:", err);
        setStatus("failed");
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
  // The realm rule: inside Demo Mode, Demo Mode's notices only; outside it,
  // never one addressed only to Demo Mode (announcementsInRealm).
  const announcements = useMemo(
    () => announcementsInRealm(visibleAnnouncements(all, trainer, Date.now()), activeStudioId),
    [all, trainer, activeStudioId],
  );

  /* This person's read-marks (the cost plan, Sep 26 2026, D5): one document
     of their own, so marking a notice read is not sent to every iPad in the
     company the way a stamp on the shared announcement was. */
  const uid = auth.currentUser?.uid ?? null;
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set());
  const [acked, setAcked] = useState<ReadonlyMap<string, number | null>>(NO_ACKS);
  useEffect(() => {
    setReadIds(new Set());
    setAcked(NO_ACKS);
    if (!trainer || !uid) return;
    return onSnapshot(
      doc(db, "announcementReads", uid),
      (snap) => {
        const data = snap.exists() ? snap.data() : undefined;
        const ids = (data?.ids as Record<string, unknown> | undefined) ?? {};
        setReadIds(new Set(Object.keys(ids).filter((k) => ids[k] === true)));
        const acks = (data?.acks as Record<string, unknown> | undefined) ?? {};
        setAcked(new Map(Object.keys(acks).map((k) => [k, millisOf(acks[k])])));
      },
      () => {
        setReadIds(new Set());
        setAcked(NO_ACKS);
      },
    );
  }, [trainer, uid]);

  // Either id counts, and the person's own read-marks: see unreadFor and
  // markAnnouncementsRead.
  const unread = useMemo(
    () => unreadFor(announcements, [uid, trainer?.id], readIds),
    [announcements, trainer, uid, readIds],
  );

  return { announcements, unread, unreadCount: unread.length, acked, status };
}

/**
 * "I've read it" (Relay's third wave, Sep 29 2026; Relay q7): this person
 * says they have read a notice that asked. One merge write on their own
 * announcementReads/{uid}, stamped with the server's time. A failed write
 * leaves the notice asking, the safe direction to fail. Nobody is pinged.
 *
 * Since the Atlas answers (Oct 2 2026) the answer is ALSO written to the
 * notice's own small record, `hub_announcements/{id}/acks/{uid}`, so the
 * poster and the studio's leaders can see "9 of 12 have read it"
 * (admin/announcements/read-count.ts). That write is separate and caught:
 * the person's own answer never waits on it, and a refusal (the rule not
 * deployed yet) costs only the count.
 */
export async function ackAnnouncements(announcementIds: readonly string[], readerName?: string | null): Promise<void> {
  const readerId = auth.currentUser?.uid;
  const ids = announcementIds.filter(Boolean);
  if (!readerId || ids.length === 0) return;
  const acks: Record<string, unknown> = {};
  for (const id of ids) acks[id] = serverTimestamp();
  await setDoc(doc(db, "announcementReads", readerId), { acks, updatedAt: serverTimestamp() }, { merge: true });
  try {
    const batch = writeBatch(db);
    for (const id of ids) {
      batch.set(doc(db, "hub_announcements", id, "acks", readerId), { at: serverTimestamp(), name: (readerName ?? "").trim().slice(0, 80) });
    }
    await batch.commit();
  } catch (err) {
    console.warn("[notices] the read count didn't take this answer:", err);
  }
}

export async function ackAnnouncement(announcementId: string, readerName?: string | null): Promise<void> {
  await ackAnnouncements([announcementId], readerName);
}

/**
 * Who has said "I've read it" on one notice (the Atlas answers, Oct 2 2026):
 * the uids in `hub_announcements/{id}/acks`. One listener, opened only for
 * someone allowed to see the count (`maySeeReadCount`) on a notice that
 * asks; null while it loads or after it failed (unknown, never zero).
 */
export type AnnouncementAcks = { status: "loading" } | { status: "failed" } | { status: "ready"; ids: ReadonlySet<string> };

export function useAnnouncementAcks(announcementId: string | null | undefined, enabled: boolean): AnnouncementAcks {
  const [state, setState] = useState<{ key: string; acks: AnnouncementAcks } | null>(null);
  const key = enabled && announcementId ? announcementId : null;
  useEffect(() => {
    if (!key) return;
    return onSnapshot(
      collection(db, "hub_announcements", key, "acks"),
      (snap) => setState({ key, acks: { status: "ready", ids: new Set(snap.docs.map((d) => d.id)) } }),
      (err) => {
        console.warn("[notices] couldn't read who has read it:", err);
        setState({ key, acks: { status: "failed" } });
      },
    );
  }, [key]);
  return state && state.key === key ? state.acks : { status: "loading" };
}

/**
 * Mark every announcement passed as read by this person, in their own
 * `announcementReads/{uid}` document (the cost plan, Sep 26 2026, D5).
 *
 * It used to stamp the person into each announcement's `readBy`, and every
 * iPad in the company watches every announcement, so each stamp reached all
 * of them. One merge write to a document only this person reads now does the
 * same job. Fire-and-forget: a failed write leaves the items looking new,
 * which is the safe direction to fail.
 */
export function markAnnouncementsRead(
  _trainerId: string | undefined,
  items: HubAnnouncement[],
): void {
  // The sign-in id: the rules let a person write only their own read-marks.
  const readerId = auth.currentUser?.uid;
  if (!readerId) return;
  const ids: Record<string, true> = {};
  for (const a of items) if (a.id) ids[a.id] = true;
  if (Object.keys(ids).length === 0) return;
  setDoc(
    doc(db, "announcementReads", readerId),
    { ids, updatedAt: serverTimestamp() },
    { merge: true },
  ).catch((err) => {
    console.error("Failed to mark announcements as read:", err);
  });
}
