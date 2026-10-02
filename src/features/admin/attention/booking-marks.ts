/**
 * "LATE CANCEL · SESSION TAKEN" (Atlas answers, Oct 2 2026; until then a
 * leader's "didn't come") — a mark on a booking nobody logged. The Firestore
 * half; what a mark MEANS is lib/booking-state.ts (`bookingMarks`, rule 3),
 * and the words and who may take one back are lib/late-cancels.ts.
 *
 * Since Oct 2 2026 ANYONE who works at the studio marks one, from the Hub's
 * peek as well as Operations → Today (AJ: "it needs to be easy to mark a late
 * cancel in the app"); a leader changes or undoes one, and the person who
 * made it may take back their own. The document is unchanged (`noShow:
 * true`), so every earlier mark reads the same. The history below is the
 * wave 2 story.
 *
 * Wave 2 of the Operations room (Sep 28 2026; AJ: "all yes"). A booking whose
 * slot is over with no Journey session for her that day is "never logged":
 * trained and not logged, a no-show, or it never happened, and someone on the
 * floor knows which. Until now a leader could only chase it; the row stayed
 * on Today all day. Now, once a leader has asked and learned she didn't come,
 * they mark it, and from then on the booking is a no-show wherever the marks
 * are read: off Needs you, counted as didn't come on the Week pages, and — the
 * nightly renewals job reads them too — no longer a visit in her rhythm and
 * pace. If she did train, her trainer logs the session on her profile and the
 * row goes by itself; a session logged for that day always beats a mark.
 *
 *   studios/{studioId}/bookingMarks/{bookingId}
 *     { noShow: true, clientId, day: 'yyyy-mm-dd',
 *       markedBy: { id: <Auth uid>, name }, markedAt }
 *
 * Written by the studio's leaders (firestore.rules, "WAVE 2 OPERATIONS: a
 * leader's 'didn't come'"), read by the people who work there. "Take back"
 * deletes the mark. The id is the booking's own (Mindbody's appointment id),
 * so a mark can't be written twice or land on another booking.
 *
 * READS: one listener on the marks for the days a page shows (`day` between
 * two dates), on the (day, clientId) index. A read that fails is `null`
 * marks — nothing taken as marked, never "none marked" — and `failed` says so.
 */
import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import { bookingMarks, type BookingMarks } from "../../../lib/booking-state";

export const BOOKING_MARKS = "bookingMarks";

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export interface BookingMarkRow {
  /** The booking's id: the document's own. */
  id: string;
  noShow: boolean;
  clientId: string | null;
  day: string | null;
  markedBy: { id: string; name: string } | null;
  markedAt: Date | null;
}

const toDateOrNull = (v: unknown): Date | null => {
  if (v instanceof Date) return v;
  if (v && typeof (v as { toDate?: unknown }).toDate === "function") {
    const d = (v as { toDate: () => Date }).toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }
  return null;
};

/** One mark as stored, read defensively: a field that isn't what it should be reads as absent. */
export function parseMark(id: string, data: Record<string, unknown> | undefined | null): BookingMarkRow {
  const d = data ?? {};
  const by = d.markedBy as { id?: unknown; name?: unknown } | undefined;
  return {
    id,
    noShow: d.noShow === true,
    clientId: typeof d.clientId === "string" && d.clientId ? d.clientId : null,
    day: typeof d.day === "string" && DAY_KEY.test(d.day) ? d.day : null,
    markedBy: by && typeof by.id === "string" ? { id: by.id, name: typeof by.name === "string" ? by.name : "" } : null,
    markedAt: toDateOrNull(d.markedAt),
  };
}

/** What a mark writes: exactly the fields the rules allow, signed with the Auth uid. */
export function markDoc(booking: { clientId: string; day: string }, me: { id: string; name: string }, at: unknown) {
  return {
    noShow: true as const,
    clientId: booking.clientId,
    day: booking.day,
    markedBy: { id: me.id, name: (me.name ?? "").trim().slice(0, 120) },
    markedAt: at,
  };
}

export interface MarksRead {
  rows: BookingMarkRow[];
  /** `bookingMarks(...)` over the rows; null while loading or after a failed read. */
  marks: BookingMarks | null;
  loading: boolean;
  failed: boolean;
}

const NONE: BookingMarkRow[] = [];

/** The marks on the studio days `from`..`to` (inclusive). A null studio reads nothing. */
export function useBookingMarks(studioId: string | null, from: string, to: string): MarksRead {
  const [state, setState] = useState<{ rows: BookingMarkRow[]; loading: boolean; failed: boolean }>({ rows: NONE, loading: true, failed: false });
  useEffect(() => {
    if (!studioId) {
      setState({ rows: NONE, loading: false, failed: false });
      return;
    }
    // No studio day yet: nothing is read, and nothing is taken as marked.
    if (!DAY_KEY.test(from) || !DAY_KEY.test(to)) {
      setState({ rows: NONE, loading: true, failed: false });
      return;
    }
    setState({ rows: NONE, loading: true, failed: false });
    return onSnapshot(
      query(collection(db, "studios", studioId, BOOKING_MARKS), where("day", ">=", from), where("day", "<=", to)),
      (snap) => setState({ rows: snap.docs.map((d) => parseMark(d.id, d.data() as Record<string, unknown>)), loading: false, failed: false }),
      (err) => {
        handleFirestoreError(err, OperationType.LIST, BOOKING_MARKS);
        setState({ rows: NONE, loading: false, failed: true });
      },
    );
  }, [studioId, from, to]);
  const marks = useMemo(() => (state.loading || state.failed ? null : bookingMarks(state.rows)), [state]);
  return { rows: state.rows, marks, loading: state.loading, failed: state.failed };
}

/**
 * ONE CLIENT'S LATE CANCELS at a studio (Atlas answers, Oct 2 2026), for the
 * profile's "40 sessions · 2 late cancels". One listener on her marks
 * (`clientId`, ordered by `day`: the (clientId, day) index in
 * firestore.indexes.json). `rows` is null while loading and after a failed
 * read — unknown, never "none". A null studio or client reads nothing.
 */
export function useClientLateCancels(studioId: string | null | undefined, clientId: string | null | undefined): { rows: BookingMarkRow[] | null; failed: boolean } {
  const [state, setState] = useState<{ key: string; rows: BookingMarkRow[] | null; failed: boolean }>({ key: "", rows: null, failed: false });
  const key = studioId && clientId ? `${studioId}|${clientId}` : "";
  useEffect(() => {
    if (!studioId || !clientId) return;
    const k = `${studioId}|${clientId}`;
    return onSnapshot(
      query(collection(db, "studios", studioId, BOOKING_MARKS), where("clientId", "==", clientId), orderBy("day", "asc")),
      (snap) => setState({ key: k, rows: snap.docs.map((d) => parseMark(d.id, d.data() as Record<string, unknown>)).filter((r) => r.noShow), failed: false }),
      (err) => {
        handleFirestoreError(err, OperationType.LIST, BOOKING_MARKS);
        setState({ key: k, rows: null, failed: true });
      },
    );
  }, [studioId, clientId]);
  // Another client's answer never stands for this one.
  return state.key === key && key ? { rows: state.rows, failed: state.failed } : { rows: null, failed: false };
}

/**
 * "Late cancel · session taken" (Oct 2 2026; it was a leader's "didn't
 * come"): the booking becomes a no-show — a session taken, not a visit.
 * Anyone who works at the studio may mark one (firestore.rules). The mark is
 * signed with the Auth uid (the rules pin it); `me.name` is who the page
 * says marked it.
 */
export async function markNoShow(
  studioId: string,
  booking: { id: string; clientId: string; day: string },
  me: { name: string },
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in again to mark it: the app can't tell who is marking it.");
  try {
    await setDoc(doc(db, "studios", studioId, BOOKING_MARKS, booking.id), markDoc(booking, { id: uid, name: me.name }, serverTimestamp()));
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, BOOKING_MARKS);
    throw err;
  }
}

/** "Take back": the mark goes, and the booking reads as it did before it. */
export async function takeBackNoShow(studioId: string, bookingId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "studios", studioId, BOOKING_MARKS, bookingId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, BOOKING_MARKS);
    throw err;
  }
}
