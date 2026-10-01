/**
 * OPERATIONS → CLIENTS → JOURNEY — every client in one named state, against
 * her own rhythm.
 *
 * The redesign's Operations room, phase 4 (Sep 28 2026; research-operations
 * §6.3). AJ: "Retention is everything … knowing how to get back the ones
 * that may be slipping away is necessary." The attendance watch, Renewals,
 * Strength dropped and Moments each held a piece of it; this page holds the
 * whole line:
 *
 *   the state strip   New · Settling in · Steady · Drifting · At risk ·
 *                     Lapsed, and beside the line Away · Back · Unknown, each
 *                     a count and a button (question 4: the names kept, on
 *                     leader screens only — Operations is leaders' only)
 *   the lenses        All clients · Renewal window · New (to the studio's
 *                     own Settling in line: the studio settings, wave 2)
 *   this week         who crossed a line in the last seven days, and who
 *                     booked again (who moved toward steady needs yesterday's
 *                     states, which aren't stored: not claimed)
 *   the list          the state picked, catchable first; a client opens
 *                     inside Operations with her journey and her case
 *                     (JourneyCase), and Back returns here as it was
 *   too new to judge  under the line's lists, the clients whose rhythm can't
 *                     be measured yet, by name, with why
 *
 * Reads: useStudioJourneys (the week, the settings, the watchlist); the rest
 * is the app's. Every number here is a count of clients Operations can see,
 * and "0" is said only once the settings and the week have answered.
 */
import { useMemo, useState } from "react";
import { Route } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Client, Studio, Trainer } from "../../../types";
import { formatStudioDate, formatStudioTime } from "../../../lib/studio-time";
import { AdminHeader, AdminNotice, AdminScreen } from "../primitives";
import { useMinuteClock } from "../shell/useMinuteClock";
import { LENSES, listFor, stateCounts, thisWeek, type JourneyEntry, type JourneyLens } from "./journey-list";
import { BESIDE_STATES, LINE_STATES, STATE_NAMES, isSlipping, multipleWords, type JourneyLines, type JourneyState } from "./states";
import { useStudioJourneys } from "./useStudioJourneys";
import { OUTCOME_WORDS } from "./case-store";
import "../shell/ops.css";

export interface JourneyPageProps {
  studio: Studio;
  studios: Studio[];
  clients: Client[];
  trainers: Trainer[];
  authTrainer: Trainer;
  onOpenClient?: (clientId: string) => void;
}

/** What each stop's caption says, from the studio's own lines (Setup → Rules has where each came from). */
const CAPTION: Record<JourneyState, (breakDays: number, lines: JourneyLines) => string> = {
  new: (_, l) => `sessions 1–${l.newMax}`,
  settling: (_, l) => `sessions ${l.newMax + 1}–${l.settlingMax}`,
  steady: () => "in their own rhythm",
  drifting: (_, l) => `${multipleWords(l.driftMultiple).toLowerCase()} their usual gap, nothing booked`,
  "at-risk": (d) => `past the studio's ${d}-day line`,
  lapsed: (_, l) => `${l.lapsedDays}+ days, nothing booked`,
  inactive: (_, l) => `${l.inactiveDays}+ days, or marked by a leader`,
  away: () => "a reason and a return date",
  back: () => "booked again after a gap",
  unknown: () => "can't be judged yet",
};

const LIST_SAYS: Record<JourneyState, (lines: JourneyLines) => string> = {
  drifting: () => "Catchable first: their usual trainer is in today. A client a leader already answered is last.",
  "at-risk": () => "Catchable first: their usual trainer is in today. A client a leader already answered is last.",
  lapsed: () => "Closest to the line first.",
  inactive: (l) =>
    `Out of the way, never deleted: inactive by herself after ${l.inactiveDays} days with nothing booked, or marked by a leader. The most recent first, the likeliest win-backs. A booking makes her active again.`,
  away: () => "Soonest back first. A known reason is not a risk.",
  back: () => "Booked again after crossing a line. Booking again closes the case by itself.",
  new: (l) => `Sessions 1 to ${l.newMax}, from a total that may be quoted: a client whose history is before Journey is never called new.`,
  settling: (l) => `Sessions ${l.newMax + 1} to ${l.settlingMax}.`,
  steady: () => "Nothing to do: in their own rhythm.",
  unknown: () => "Unknown is its own group, so a failed or thin read never looks steady.",
};

const UNKNOWN_GROUP: Record<string, string> = {
  "bookings-unread": "Past a line, and whether anything is booked couldn't be read",
  "no-visit": "No visit on record since the studio's bookings began syncing",
  "no-record": "No nightly record for them yet",
  "stale-record": "The nightly record has stopped changing",
  "too-new": "Too new to judge: not enough visits for a usual gap yet",
};

export function JourneyPage({ studio, studios, clients, trainers, authTrainer, onOpenClient }: JourneyPageProps) {
  const now = useMinuteClock();
  const j = useStudioJourneys({ studio, studios, clients, trainers, authTrainer, now });
  const [lens, setLens] = useState<JourneyLens>("all");
  const [state, setState] = useState<JourneyState>("drifting");
  const counts = useMemo(() => stateCounts(j.entries, lens), [j.entries, lens]);
  const list = useMemo(() => listFor(j.entries, state, lens), [j.entries, state, lens]);
  const week = useMemo(() => thisWeek(j.entries, j.today), [j.entries, j.today]);
  const tooNew = useMemo(() => j.entries.filter((e) => e.journey.state === "unknown" && e.journey.unknownWhy === "too-new" && (lens === "all" || (lens === "renewal" ? e.inRenewalWindow : e.early))), [j.entries, lens]);
  const active = j.entries.length;
  const reading = !j.ready;

  const meta = [
    reading ? "Reading the studio's clients…" : `${active} active ${active === 1 ? "client" : "clients"}`,
    j.nightly.lastChangedAt ? `visits from the nightly record of ${formatStudioDate(j.nightly.lastChangedAt, { weekday: "short", month: "short", day: "numeric" }, j.tz)}` : "no nightly record yet",
    j.week.readAt ? `bookings read ${formatStudioTime(new Date(j.week.readAt), j.tz)}` : j.week.loading ? "bookings: reading…" : "bookings couldn't be read",
    "each client judged against their own rhythm",
    j.night.fresh ? `states from last night's run${j.night.at ? ` at ${formatStudioTime(j.night.at, j.tz)}` : ""}, checked against today's bookings` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const stop = (s: JourneyState) => (
    <button
      key={s}
      type="button"
      className={cn("ops-stop", `ops-stop--${s}`, state === s && "ops-stop--on")}
      aria-pressed={state === s}
      onClick={() => setState(s)}
    >
      <span className="ops-stop__n">{reading ? "…" : counts[s]}</span>
      <span className="ops-stop__name">{STATE_NAMES[s]}</span>
      <span className="ops-stop__cap">{CAPTION[s](j.breakDays, j.lines)}</span>
    </button>
  );

  return (
    <AdminScreen>
      <AdminHeader icon={<Route className="w-5 h-5" />} title="The Journey" subtitle={meta} />
      <div className="ops-seg" role="group" aria-label="Lens">
        {LENSES.map((l) => (
          <button key={l.id} type="button" aria-pressed={lens === l.id} onClick={() => setLens(l.id)}>
            {l.label}
          </button>
        ))}
      </div>

      {j.nightly.stale && (
        <AdminNotice tone="warn">
          {j.nightly.lastChangedAt
            ? `The nightly record hasn't changed since ${formatStudioDate(j.nightly.lastChangedAt, { weekday: "short", month: "short", day: "numeric" }, j.tz)}, so nobody's rhythm is judged from it: every client reads Unknown until it runs again.`
            : "There is no nightly record for this studio yet, so every client reads Unknown."}
        </AdminNotice>
      )}
      {j.settingsFailed && <AdminNotice tone="warn">The studio's renewal settings couldn't be read just now, so At risk uses Max Strength's 14 days.</AdminNotice>}
      {j.linesFailed && (
        <AdminNotice tone="warn">Part of the studio's settings couldn't be read just now, so a line may be Max Strength's or the app's default rather than the studio's own. Setup → Rules says which.</AdminNotice>
      )}
      {j.week.failed && <AdminNotice tone="warn">The week's bookings couldn't be read just now: anyone past a line reads Unknown, never slipping, until they are.</AdminNotice>}
      {j.cases.failed && (
        <AdminNotice tone="warn">The studio's cases couldn't be read just now, so each case here is the one Journey works out, not the one the team wrote.</AdminNotice>
      )}

      <div className="ops-line-strip" role="group" aria-label="Client states">
        <div className="ops-line-strip__groups" aria-hidden="true">
          <span>Starting</span>
          <span>Settled</span>
          <span>MIA</span>
          <span>Inactive</span>
        </div>
        <div className="ops-line-strip__stops">{LINE_STATES.map(stop)}</div>
      </div>
      <div className="ops-beside" role="group" aria-label="Beside the line">
        <span className="ops-beside__lab">Beside the line</span>
        {BESIDE_STATES.map((s) => (
          <button key={s} type="button" className={cn("ops-bchip", state === s && "ops-bchip--on")} aria-pressed={state === s} onClick={() => setState(s)}>
            <b>{reading ? "…" : counts[s]}</b>
            <span>{STATE_NAMES[s]}</span>
            <em>{CAPTION[s](j.breakDays, j.lines)}</em>
          </button>
        ))}
      </div>

      {!reading && (
        <p className="ops-quiet">
          <b>This week:</b> {week.startedSlipping.length} crossed a line and started slipping, {week.lapsedThisWeek.length} lapsed, {week.back.length} booked again after a gap.{" "}
          {week.towardSteady === null
            ? "Who moved toward steady needs last night's states, which haven't reached this page."
            : `${week.towardSteady.length} moved back toward steady after slipping.`}
        </p>
      )}

      <section className="ops-sec" aria-labelledby="journey-list-t">
        <header className="ops-sec__h">
          <h2 className="ops-sec__t" id="journey-list-t">
            {STATE_NAMES[state]}
          </h2>
          <span className="ops-badge">{reading ? "…" : list.length}</span>
          {lens !== "all" && <span className="ops-sec__sub">{lens === "renewal" ? "in their renewal window" : `in their first ${j.lines.settlingMax} sessions`}</span>}
        </header>
        <p className="ops-quiet">{LIST_SAYS[state](j.lines)}</p>
        <div className="ops-sec__card">
          {reading ? (
            <p className="ops-sec__empty">Reading the studio's clients…</p>
          ) : list.length === 0 ? (
            <p className="ops-sec__empty">
              No {STATE_NAMES[state].toLowerCase()} clients{lens === "renewal" ? " in their renewal window" : lens === "new" ? ` in their first ${j.lines.settlingMax} sessions` : ""}. That's a real count, not a missing read.
            </p>
          ) : state === "unknown" ? (
            Object.entries(groupBy(list, (e) => e.journey.unknownWhy ?? "")).map(([why, rows]) => (
              <div key={why} className="ops-jr-group">
                <p className="ops-jr-group__h">
                  {UNKNOWN_GROUP[why] ?? "Can't be judged yet"} ({rows.length})
                </p>
                <JourneyRows rows={rows} onOpenClient={onOpenClient} />
              </div>
            ))
          ) : (
            <JourneyRows rows={list} onOpenClient={onOpenClient} />
          )}
        </div>
        {!reading && state !== "unknown" && tooNew.length > 0 && (isSlipping(state) || state === "steady" || state === "lapsed") && (
          <div className="ops-toonew">
            <p className="ops-toonew__h">
              <b>Too new to judge ({tooNew.length})</b> Fewer than six visits over four weeks on record, so no claim about their rhythm yet.
            </p>
            <div className="ops-toonew__names">
              {tooNew.map((e) => (
                <button key={e.id} type="button" className="ops-namechip" onClick={() => onOpenClient?.(e.id)} disabled={!onOpenClient}>
                  {e.row.name.display}
                  {e.journey.rhythmWhy && <span>{e.journey.rhythmWhy}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </AdminScreen>
  );
}

function groupBy<T>(rows: T[], keyOf: (r: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of rows) (out[keyOf(r)] ??= []).push(r);
  return out;
}

/** "Case: Beregond owns it, due Thu, Oct 1" — a stored case in a row (wave 2). */
function caseLine(e: JourneyEntry): string {
  const c = e.case;
  if (c.bookedAgainOnRead) return "case: booked again, ready to close";
  if (c.outcome && c.outcome !== "booked-again") return `case: ${OUTCOME_WORDS[c.outcome].toLowerCase()}`;
  if (c.outcome === "booked-again") return "case: closed, booked again";
  return `case: ${c.owner.name.split(" ")[0]} owns it${c.dueDay ? `, due ${shortDay(c.dueDay)}` : ""}`;
}

function shortDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function JourneyRows({ rows, onOpenClient }: { rows: JourneyEntry[]; onOpenClient?: (clientId: string) => void }) {
  return (
    <ul className="ops-jr-list">
      {rows.map((e) => (
        <li key={e.id}>
          <button type="button" className="ops-jr-row" onClick={() => onOpenClient?.(e.id)} disabled={!onOpenClient}>
            <span className="ops-jr-row__name">{e.row.name.display}</span>
            <span className="ops-jr-row__why">{e.journey.why}</span>
            <span className="ops-jr-row__meta">
              {[
                e.usual ? (e.usualInToday ? `${e.usual.name.split(" ")[0]} is in today, ${e.usualInToday}` : `usually with ${e.usual.name.split(" ")[0]}`) : null,
                e.case.stored ? caseLine(e) : null,
                e.watch === "snoozed" ? "snoozed" : e.watch === "dismissed" ? "dismissed: someone knows why" : null,
                e.case.leaders ? "the leader's now" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
