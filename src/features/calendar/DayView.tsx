import { useCallback, useMemo } from "react";
import type { Client, Trainer } from "../../types";
import { isStaffBlock } from "../../lib/booking-state";
import { safeToDate } from "../../lib/utils";
import { studioDateKey } from "../../lib/studio-time";
import type { DayReadState } from "../../lib/schedule-window";
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
 * A tap on a booking opens the client, as the Calendar always has (the Hub
 * opens a peek; here the card says nothing about a dialog). The card knows
 * no sessions, so a booking that is over recedes without "Not logged": the
 * Calendar can't say what happened to it, and never claims to.
 *
 * On a phone the day is the Hub's phone list (`PhoneDayList`), the same
 * cards one under the next.
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

  /* One handler for every card, so a card with nothing new skips drawing (HubCard is memoised). */
  const openCard = useCallback((clientId: string) => onOpenClient(clientId), [onOpenClient]);

  const renderCard = useCallback(
    (block: GridBlock) => {
      const booking: any = block.booking;
      const id = booking?.clientId ? String(booking.clientId).trim() : "";
      const client = isStaffBlock(booking) || !id ? null : clientsById.get(id) ?? null;
      return (
        <HubCard
          booking={booking}
          blockKey={block.key}
          client={client}
          entry={null}
          sessionNumber={null}
          usualService={usualService}
          rosterLoading={rosterLoading}
          rosterFailed={rosterFailed}
          staffName={block.columnId === UNASSIGNED_ID ? staffLabel(booking.trainerName) : null}
          now={now}
          opensPeek={false}
          onOpen={openCard}
        />
      );
    },
    [clientsById, usualService, rosterLoading, rosterFailed, now, openCard],
  );

  const chosen = onlyTrainerId ? columns.find((c) => c.id === onlyTrainerId) : null;
  const emptyWords =
    readState === "ready"
      ? chosen
        ? `Nobody is booked with ${chosen.isMe ? "you" : chosen.name} on this day.`
        : NOBODY_BOOKED
      : readState === "loading"
        ? READING
        : null;

  if (phone) {
    return (
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
    );
  }

  return (
    <HubGrid
      dayKey={dayKey}
      columns={columns}
      blocks={blocks}
      nowMin={nowMin}
      renderCard={renderCard}
      frameOf={frameOf}
      focusId={myColumnId}
      emptyWords={emptyWords}
    />
  );
}
