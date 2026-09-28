/**
 * ONE BOOKING ON THE HUB GRID (calm Hub round, Sep 28 2026; it replaces
 * components/schedule/ScheduleBlock).
 *
 * Mindbody's layout, calmer (AJ's screenshots, Sep 28: "I don't want it to
 * look like this but the layout is the foundation"):
 *   - the name the client goes by, WHOLE, wrapping onto a second line —
 *     never "Lobelia S…";
 *   - the time, and the service only when it isn't the usual session;
 *   - her number in words ("#264"), only when it may be quoted, or "New to
 *     Journey" when her story began before the studio's cutover;
 *   - the left edge says the booking's state; the glyphs say what is worth
 *     knowing, from the SAME moments as the Opportunities list
 *     (hub-opportunities/moments-today); crimson is the Critical triangle
 *     alone.
 *
 * What the card may say about a booking's outcome is lib/hub-card-state over
 * lib/booking-state (done means logged, AJ Sep 24): live and in-session cards
 * keep every mark; a card that is over recedes and drops them, the triangle
 * included (AJ, Sep 28: "once the session is done it should make a lot less
 * noise so trainers can focus on the rest of their day").
 *
 * The clinical-history dot is gone from the card (Hub question 3's default):
 * standing context, on most clients, and still said in the peek and the
 * briefing. The Pulse flag is plum, not rose, so red stays the triangle's.
 *
 * In YOUR column, read in words (`wordy`, the hub cherry round's focus
 * column), every glyph says its sayable word where the card has room, not
 * only the first. The words are still only ones fine to say out loud.
 */
import type { ComponentType } from "react";
import { Activity, AlertTriangle, Award, Cake, Check, CloudOff, FileSignature, RefreshCw, Sparkles, Undo2 } from "lucide-react";
import type { Client, WorkoutSession } from "../../types";
import { isStaffBlock, type LoggedSessions } from "../../lib/booking-state";
import { hubCardRecedes, hubCardState } from "../../lib/hub-card-state";
import { isDefaultService } from "../../lib/hub-markers";
import { clientDisplayName } from "../../lib/client-name";
import { safeToDate } from "../../lib/utils";
import { zonedHM } from "../../lib/studio-time";
import type { MomentKind, RunSheetEntry } from "../hub-opportunities/moments-today";
import { cardMarks } from "./card-marks";
import "./hub-card.css";

/** One shape per kind of mark (the Key's). The Next 30 minutes strip draws with the same. */
export const GLYPH: Record<MomentKind, ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>> = {
  critical: AlertTriangle,
  waiver: FileSignature,
  pulse: Activity,
  consult: Sparkles,
  "early-session": Sparkles,
  "first-with-trainer": Sparkles,
  back: Undo2,
  milestone: Award,
  birthday: Cake,
  renew: RefreshCw,
};

/**
 * "9:30", or "10:00 – 10:45 AM" when the booking isn't the usual half hour
 * (a new client consult), in STUDIO time. `span` always gives both ends.
 */
export function cardTime(start: Date | null, end: Date | null, { span = false }: { span?: boolean } = {}): string {
  const clock = (d: Date | null, suffix: boolean) => {
    const hm = d ? zonedHM(d) : null;
    if (!hm) return "";
    const h12 = hm.hour % 12 === 0 ? 12 : hm.hour % 12;
    const mm = String(hm.minute).padStart(2, "0");
    return suffix ? `${h12}:${mm} ${hm.hour >= 12 ? "PM" : "AM"}` : `${h12}:${mm}`;
  };
  if (!start) return "";
  const minutes = end ? Math.round((end.getTime() - start.getTime()) / 60_000) : 30;
  if (!end || (minutes === 30 && !span)) return clock(start, false);
  return `${clock(start, false)} – ${clock(end, true)}`;
}

export interface HubCardProps {
  /** Declared explicitly: this repo has no @types/react, so JSX does not
   *  supply `key` through IntrinsicAttributes (house convention). */
  key?: string | number;
  /** The raw schedule doc (Mindbody-sourced). */
  booking: any;
  /** Her Max Strength record, or null when the Mindbody link is missing. */
  client: Client | null;
  /** Her moments on this booking's day, from the Hub's one engine; null when there is no record. */
  entry: RunSheetEntry | null;
  /** The number THIS booking will be (`bookingSessionNumber`), or null when it may not be quoted. */
  sessionNumber: number | null;
  /** "New to Journey" in the corner's place (`isNewToJourney`). */
  newToJourney?: boolean;
  /** The day's usual service (`usualServiceOf`): a card names its own only when it differs. */
  usualService?: string | null;
  /** Her newest workout session on the booking's studio day, if one exists. */
  workoutSession?: WorkoutSession | null;
  /** `loggedSessions` over the Hub's session stream; null while unknown. */
  logged?: LoggedSessions | null;
  /** The Hub's minute clock. */
  now?: Date;
  /** The roster is still loading: a booking naming a client we don't hold YET is pending, not "Not synced". */
  rosterLoading?: boolean;
  /** The day summary's spotlight is on and this card doesn't match it. */
  dimmed?: boolean;
  /**
   * In YOUR column, read in words (the focus column, hub cherry round): every
   * glyph says its word where the card has room, not only the first, and the
   * few words that are fine in your own column ("first with you") join them.
   */
  wordy?: boolean;
  /** Its peek is open. */
  open?: boolean;
  onOpen: (clientId: string, anchor: HTMLElement) => void;
}

export function HubCard({
  booking,
  client,
  entry,
  sessionNumber,
  newToJourney = false,
  usualService = null,
  workoutSession = null,
  logged = null,
  now = new Date(),
  rosterLoading = false,
  dimmed = false,
  wordy = false,
  open = false,
  onOpen,
}: HubCardProps) {
  const start = safeToDate(booking?.startTime || booking?.StartDateTime || booking?.date);
  const end = safeToDate(booking?.endTime || booking?.EndDateTime);
  const time = cardTime(start, end);

  if (isStaffBlock(booking)) {
    // Mindbody's "Unavailable": time that isn't a session. Never a booking (isStaffBlock), never tapped.
    const span = cardTime(start, end, { span: true });
    return (
      <div className="hs-card" data-kind="staff" data-dim={dimmed ? "true" : undefined} aria-label={`Unavailable, ${span}: not a session`}>
        <div className="hs-card-top">
          <span className="hs-card-name">Unavailable</span>
        </div>
        <div className="hs-card-meta">
          <span className="hs-card-when">{span}</span>
        </div>
      </div>
    );
  }

  const cardState = hubCardState(
    {
      clientId: client?.id ?? booking?.clientId ?? null,
      startTime: booking?.startTime || booking?.StartDateTime || booking?.date,
      endTime: booking?.endTime || booking?.EndDateTime,
      status: booking?.status,
    },
    logged,
    now,
    { sessionOpen: workoutSession?.status === "In-Progress" },
  );
  const recedes = hubCardRecedes(cardState);
  const isUnlinked = !client;
  const isPending = isUnlinked && rosterLoading && Boolean(booking?.clientId);
  /* A finished slot nobody logged. Only on a linked card: one with no
     profile already says why nothing could be logged. */
  const isNotLogged = cardState === "not-logged" && !isUnlinked;
  const isDone = cardState === "done";

  const name = client ? clientDisplayName(client, booking?.clientName || "Client") : (booking?.clientName || "Reservation").trim();
  const marks = recedes || isUnlinked ? cardMarks(null) : cardMarks(entry?.moments, undefined, { yours: wordy });
  const serviceName: string = booking?.serviceName || booking?.sessionType || "";
  const consult = entry?.moments.some((m) => m.kind === "consult") ?? false;
  const service = serviceName && serviceName.trim() !== usualService && !isDefaultService(serviceName) && !consult ? serviceName : null;
  // The milestone glyph says the number ("100th"): the corner doesn't repeat it.
  const numberSaid = marks.glyphs.some((g) => g.kind === "milestone");

  const kind = isPending ? "pending" : isUnlinked ? "unlinked" : "client";
  const interactive = kind === "client";

  /* The time and her number are never cut: a clipped "#212" reads as "#2",
     a confident wrong number (hub cherry round — found when your column
     started saying more). The words after them ("Not logged", "New to
     Journey", the service) give way first, with an ellipsis. */
  const numberText = sessionNumber !== null && sessionNumber > 3 && !numberSaid ? `#${sessionNumber}` : null;
  const restParts: string[] = [];
  if (!numberText && newToJourney && !recedes) restParts.push("New to Journey");
  if (service) restParts.push(service);

  return (
    <div
      className="hs-card"
      data-kind={kind}
      data-state={cardState}
      data-recede={recedes ? "true" : "false"}
      data-dim={dimmed ? "true" : undefined}
      data-words={wordy ? "all" : undefined}
      data-open={open ? "true" : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : -1}
      aria-haspopup={interactive ? "dialog" : undefined}
      title={
        isUnlinked
          ? `${booking?.clientName || "Reservation"} — no Max Strength profile yet. It will link itself once the next Mindbody sync creates one.`
          : marks.critical || undefined
      }
      onClick={(e) => {
        if (interactive && client?.id) onOpen(client.id, e.currentTarget);
      }}
      onKeyDown={(e) => {
        if (!interactive || !client?.id) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(client.id, e.currentTarget);
        }
      }}
    >
      <div className="hs-card-top">
        <span className="hs-card-name">{name}</span>
        {/* LOUD, and the only red on the grid: read this before the session.
            The words are in the label, whole; the note itself is first on the
            client's briefing and in the peek. */}
        {marks.critical && (
          <span className="hs-tri" aria-label={marks.critical}>
            <AlertTriangle size={14} strokeWidth={2.5} aria-hidden />
          </span>
        )}
      </div>

      <div className="hs-card-meta">
        <span className="hs-card-when">
          {isPending ? (
            <span aria-label="Loading this client">{time}</span>
          ) : isUnlinked ? (
            <>
              <CloudOff size={13} aria-label="Not synced to a Max Strength profile yet" />
              {"Not synced yet"}
            </>
          ) : cardState === "in-session" ? (
            <>
              <span className="hs-live-dot" aria-label="Session in progress" />
              <strong>In session</strong>
            </>
          ) : (
            <>
              {isDone && <Check size={13} aria-label="Done" />}
              {time}
            </>
          )}
          {!isUnlinked && numberText && ` · ${numberText}`}
        </span>
        {!isUnlinked && (isNotLogged || restParts.length > 0) && (
          <span className="hs-card-rest">
            {isNotLogged && (
              <>
                {" · "}
                <strong title="No Journey session was completed for this client today">Not logged</strong>
              </>
            )}
            {restParts.length > 0 && ` · ${restParts.join(" · ")}`}
          </span>
        )}

        {(marks.glyphs.length > 0 || marks.more > 0) && (
          <span className="hs-glyphs">
            {marks.glyphs.map((g) => {
              const Icon = GLYPH[g.kind];
              return (
                <span key={g.kind} className="hs-g" data-family={g.family} aria-label={g.label}>
                  <Icon size={13} strokeWidth={2.4} aria-hidden />
                  {g.word && <span className="hs-g-word">{g.word}</span>}
                </span>
              );
            })}
            {marks.more > 0 && (
              <span className="hs-g" data-family="more" aria-label={`${marks.more} more: ${marks.moreLabel}`}>
                {`+${marks.more}`}
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

export default HubCard;
