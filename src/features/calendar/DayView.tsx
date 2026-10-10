import { useCallback, useMemo } from "react";
import type { Client, Trainer, WorkoutSession } from "../../types";
import { bookingDay, isStaffBlock, loggedSessions } from "../../lib/booking-state";
import { sessionsByClientDay } from "../../lib/hub-card-state";
import { useCompletedSessions } from "../../lib/completed-sessions";
import { getClientAlertState } from "../../lib/client-alerts";
import { criticalNotesOn } from "../../lib/hub-critical-notes";
import { useHubCriticalNotes } from "../../hooks/useHubCriticalNotes";
import { safeToDate } from "../../lib/utils";
import { studioDateKey } from "../../lib/studio-time";
import type { DayReadState } from "../../lib/schedule-window";
import { useBookingMarks } from "../admin/attention/booking-marks";
import { readFirstMomentOf, type RunSheetEntry } from "../hub-opportunities/moments-today";
import { HubGrid, NOBODY_BOOKED, type GridBlock, type GridColumn } from "../hub-schedule/HubGrid";
import { HubCard } from "../hub-schedule/HubCard";
import { UNASSIGNED_ID, orderColumnsBySessions, planColumns, staffLabel } from "../hub-schedule/columns";
import { usualServiceOf } from "../hub-schedule/card-marks";
import { yourDay } from "../hub-schedule/your-day";
import type { Span } from "../hub-schedule/grid-model";
import type { TrainerDayFrame } from "../hub-schedule/off-hours";
import { PhoneDayList } from "../phone/PhoneDayList";
import { studioMinutes } from "./selectors";
import "./calendar.css";

/**
 * DAY — the Hub's grid (the rooms round, Oct 10 2026; AJ's answer 2a on
 * "Journey Rooms").
 *
 * The Day view was horizontal swimlanes, a 30-minute booking one slot wide,
 * so every client's name was chopped a few letters to a line ("Ma rk Na ka
 * mu ra"), it scrolled sideways upright, and it had no now line, no today,
 * no "you". It is now the Hub's own grid (`HubGrid`) and card (`HubCard`):
 *
 *   - the time rail down the left, the empty middle of the day folded;
 *   - blocks at their real length, the client's whole name, wrapping;
 *   - the orange now line on today;
 *   - your column first, under the blue "You" head, saying your day;
 *   - the hours a trainer isn't on hatched from the agreed standing week
 *     (`frameOf`; nothing hatched without an agreed week or an answer).
 *
 * The columns are the Hub's rule (`columns.ts`): a booking goes to a trainer
 * by the trainer id, or by the Mindbody staff id at this studio's site, and
 * otherwise to Unassigned, which says Mindbody's staff name whole. Never a
 * name: the Calendar's first-name and prefix matching is retired, as the
 * Hub's was on Oct 1 2026.
 *
 * WHAT A CARD SAYS HAPPENED (the review of Oct 10 2026; AJ's Sep 24 rule: "a
 * grey card with no word would read as done when it is not"). On a day the
 * sessions Journey holds cover (`cardDayReadable`, lib/hub-card-state: the
 * studio's today once the session stream's server has answered, and the
 * days ahead in the Hub's window) a card says what the Hub's says, from the
 * same reads: the app's session stream (done, Not logged, In session, Left
 * open), the day's "didn't come" marks (`useBookingMarks`, for the day on
 * screen) and the red Critical triangle (`useHubCriticalNotes`, the day's
 * booked clients). On any other day the card is "unread": it neither fades
 * nor says a word, so it never reads as done. The Hub is not mounted while
 * the Calendar is, so these are its own reads, not more.
 *
 * A tap on a booking opens the client, as the Calendar always has (the Hub
 * opens a peek; here the card says nothing about a dialog). On a phone the
 * day is the Hub's phone list (`PhoneDayList`), the same cards one under the
 * next.
 */

export interface DayViewProps {
  /** The studio day on screen, "yyyy-mm-dd". */
  dayKey: string;
  /** The day's bookings at this studio, cancellations already out. */
  bookings: ReadonlyArray<any>;
  /** The trainers the app knows, in the studio's order. */
  trainers: ReadonlyArray<Trainer>;
  studioId: string | null;
  /** Each trainer's Mindbody staff id at this studio's site (`staffIdsAt`). */
  staffIds: Readonly<Record<string, string>>;
  /** The signed-in trainer: their column first, under the blue head. */
  selfId: string | null;
  /** The team filter: one trainer's id, or null for the entire team. */
  onlyTrainerId: string | null;
  clientsById: ReadonlyMap<string, Client>;
  rosterLoading?: boolean;
  rosterFailed?: boolean;
  now: Date;
  /** What is known about the day's bookings: an empty day says so only when it was read. */
  readState: DayReadState;
  /** The app's session stream (the studio's last 24 hours) and whether its server has answered. */
  sessions: ReadonlyArray<WorkoutSession>;
  sessionsKnown: boolean;
  /** Whether the sessions held cover this day (`cardDayReadable`): else every card is "unread". */
  readable: boolean;
  /** Someone who works at the studio (`mayReadWeeks`): only they read its "didn't come" marks, as on the Hub. */
  readsStudio: boolean;
  /** When each trainer is on, from the agreed standing week. Absent: nothing hatched. */
  frameOf?: (columnId: string, range: Span) => TrainerDayFrame;
  /** A phone draws the day as one list. */
  phone: boolean;
  onOpenClient: (clientId: string) => void;
}

const READING = "Reading the day’s bookings…";

/** The name a trainer goes by on a column's head: the nickname, else the first name. */
function shortName(t: Trainer): string {
  return ((t as { nickname?: string }).nickname || "").trim() || (t.fullName || "").trim().split(" ")[0] || "Trainer";
}

export function DayView({
  dayKey,
  bookings,
  trainers,
  studioId,
  staffIds,
  selfId,
  onlyTrainerId,
  clientsById,
  rosterLoading = false,
  rosterFailed = false,
  now,
  readState,
  sessions,
  sessionsKnown,
  readable,
  readsStudio,
  frameOf,
  phone,
  onOpenClient,
}: DayViewProps) {
  const plan = useMemo(
    () => planColumns({ trainers, bookings, studioId, staffIds, selfId }),
    [trainers, bookings, studioId, staffIds, selfId],
  );

  /* Each booking in ONE column, at its own start and end in studio minutes. */
  const allBlocks = useMemo(() => {
    const out: GridBlock[] = [];
    bookings.forEach((s, i) => {
      const columnId = plan.columnOf[i];
      if (columnId === null) return;
      const start = safeToDate(s.startTime || s.StartDateTime || s.date);
      if (!start) return;
      const end = safeToDate(s.endTime || s.EndDateTime);
      const from = studioMinutes(start);
      let to = end ? studioMinutes(end) : from + 30;
      if (to <= from) to = from + 30;
      out.push({ key: String(s.id || s.mindbodyAppointmentId || `${columnId}-${from}-${i}`), columnId, span: { from, to }, booking: s });
    });
    return out;
  }, [bookings, plan]);

  /* The team filter: one trainer's column alone (their bookings, or an empty column for a quiet day). */
  const blocks = useMemo(
    () => (onlyTrainerId ? allBlocks.filter((b) => b.columnId === onlyTrainerId) : allBlocks),
    [allBlocks, onlyTrainerId],
  );
  const columnTrainers = useMemo(() => {
    if (!onlyTrainerId) return plan.trainers;
    const own = plan.trainers.find((t) => String(t.id) === onlyTrainerId) ?? trainers.find((t) => String(t.id) === onlyTrainerId);
    return own ? [own] : [];
  }, [plan.trainers, trainers, onlyTrainerId]);

  const nowMin = dayKey === studioDateKey(now) ? studioMinutes(now) : null;
  const myColumnId = selfId && columnTrainers.some((t) => String(t.id) === String(selfId)) ? String(selfId) : null;

  const columns = useMemo(() => {
    const names = columnTrainers.map(shortName);
    const planned: GridColumn[] = columnTrainers.map((t, i) => {
      const id = String(t.id);
      const own = blocks.filter((b) => b.columnId === id && !isStaffBlock(b.booking as any));
      // Two columns that would read alike say the full names (two Chrises).
      const alike = names.filter((n) => n.toLowerCase() === names[i].toLowerCase()).length > 1;
      return {
        id,
        name: alike ? (t.fullName || "").trim() || names[i] : names[i],
        initials: ((t as { initials?: string }).initials || t.fullName || "??").substring(0, 2).toUpperCase(),
        isMe: id === myColumnId,
        count: own.length,
        detail: id === myColumnId ? yourDay({ spans: own.map((b) => b.span), nowMin }) : null,
      };
    });
    if (!onlyTrainerId && plan.unassigned > 0) {
      planned.push({
        id: UNASSIGNED_ID,
        name: "Unassigned",
        initials: "?",
        isMe: false,
        count: blocks.filter((b) => b.columnId === UNASSIGNED_ID && !isStaffBlock(b.booking as any)).length,
        detail: null,
      });
    }
    return orderColumnsBySessions(planned);
  }, [columnTrainers, blocks, myColumnId, onlyTrainerId, plan.unassigned, myColumnId !== null ? nowMin : null]);

  const usualService = useMemo(() => usualServiceOf(bookings), [bookings]);

  /*
   * WHAT HAPPENED, from the Hub's own reads (see the header). The finished
   * sessions keep their list until one finishes (useCompletedSessions), so a
   * running session's heartbeat works nothing out again; the newest session
   * per client and day says In session or Left open.
   */
  const completedSessions = useCompletedSessions(sessions);
  const logged = useMemo(
    () => (readable ? loggedSessions(completedSessions, undefined, { complete: sessionsKnown }) : null),
    [readable, completedSessions, sessionsKnown],
  );
  const sessionOn = useMemo(() => sessionsByClientDay(sessions), [sessions]);
  const marksRead = useBookingMarks(readable && readsStudio ? studioId : null, dayKey, dayKey);
  const critical = useHubCriticalNotes(
    useMemo(() => bookings.filter((s) => !isStaffBlock(s)).map((s) => (s.clientId ? String(s.clientId).trim() : null)), [bookings]),
  );
  /* The Read first moment per client on this day: the engine's own (`readFirstMomentOf`), the triangle's only source. */
  const entryOf = useMemo(() => {
    const out = new Map<string, RunSheetEntry>();
    for (const b of bookings) {
      const id = b?.clientId ? String(b.clientId).trim() : "";
      const client = id ? clientsById.get(id) : undefined;
      if (!client || out.has(id)) continue;
      const notes = critical.notesFor(id);
      if (!notes) continue; // unknown: the card claims nothing either way
      const moment = readFirstMomentOf(getClientAlertState(client, criticalNotesOn(notes, dayKey)));
      // The card reads only an entry's moments; the rest of the engine isn't run here.
      if (moment) out.set(id, { moments: [moment] } as unknown as RunSheetEntry);
    }
    return out;
  }, [bookings, clientsById, critical, dayKey]);

  /* One handler for every card, so a card with nothing new skips drawing (HubCard is memoised). */
  const openCard = useCallback((clientId: string) => onOpenClient(clientId), [onOpenClient]);

  const renderCard = useCallback(
    (block: GridBlock) => {
      const booking: any = block.booking;
      const id = booking?.clientId ? String(booking.clientId).trim() : "";
      const client = isStaffBlock(booking) || !id ? null : clientsById.get(id) ?? null;
      const day = bookingDay({ startTime: booking?.startTime || booking?.StartDateTime || booking?.date, status: booking?.status });
      return (
        <HubCard
          booking={booking}
          blockKey={block.key}
          client={client}
          entry={client?.id ? entryOf.get(client.id) ?? null : null}
          sessionNumber={null}
          usualService={usualService}
          rosterLoading={rosterLoading}
          rosterFailed={rosterFailed}
          staffName={block.columnId === UNASSIGNED_ID ? staffLabel(booking.trainerName) : null}
          workoutSession={readable && client ? sessionOn(client.id, day) : null}
          logged={logged}
          noShows={readable ? marksRead.marks : null}
          now={now}
          readable={readable}
          opensPeek={false}
          onOpen={openCard}
        />
      );
    },
    [clientsById, entryOf, usualService, rosterLoading, rosterFailed, readable, sessionOn, logged, marksRead.marks, now, openCard],
  );

  const chosen = onlyTrainerId ? columns.find((c) => c.id === onlyTrainerId) ?? null : null;
  const emptyWords =
    readState === "ready"
      ? chosen
        ? `Nobody is booked with ${chosen.isMe ? "you" : chosen.name} on this day.`
        : NOBODY_BOOKED
      : readState === "loading"
        ? READING
        : null;
  /* Narrowed to one trainer, the rest of the row says so; the Hub's "Nobody else is booked" would be untrue. */
  const restWords = chosen ? `Showing ${chosen.isMe ? "your" : `${chosen.name}’s`} bookings only` : undefined;

  /* With some clients' Critical notes unread, a card without the triangle proves nothing: said once (the Hub's line). */
  const criticalNote =
    critical.status === "incomplete" ? (
      <p className="cal-note cal-note--day" role="status">
        {"Couldn’t check every client’s critical notes, so a card without the red triangle may still have one."}
      </p>
    ) : null;

  if (phone) {
    return (
      <>
      {criticalNote}
      <PhoneDayList
        blocks={blocks.map((b) => ({ ...b, staff: isStaffBlock(b.booking as any) }))}
        columnOrder={columns.map((c) => c.id)}
        mineOnly={null}
        nowMin={nowMin}
        renderCard={(b) => renderCard(b)}
        withWords={(b) => {
          // One trainer on screen, or Unassigned, whose card already says
          // "Booked with" Mindbody's staff name: nothing to add.
          if (onlyTrainerId || b.columnId === UNASSIGNED_ID) return null;
          const column = columns.find((c) => c.id === b.columnId);
          return column ? (column.isMe ? "with you" : `with ${column.name}`) : null;
        }}
        emptyWords={emptyWords}
      />
      </>
    );
  }

  return (
    <>
      {criticalNote}
      <HubGrid
        dayKey={dayKey}
        columns={columns}
        blocks={blocks}
        nowMin={nowMin}
        renderCard={renderCard}
        frameOf={frameOf}
        focusId={myColumnId}
        emptyWords={emptyWords}
        restWords={restWords}
      />
    </>
  );
}
