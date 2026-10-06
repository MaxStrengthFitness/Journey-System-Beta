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
 * The calm round (Oct 3 2026, AJ: "so many words on there"): the subtitle's
 * seven facts are behind the count's (i), the nightly record's note is said
 * once (useNightlyNote), a stop says its name and count (its definition is
 * on the list's (i), with the order the list is in), and an empty list says
 * so in four words.
 *
 * Reads: useStudioJourneys (the week, the settings, the watchlist); the rest
 * is the app's. Every number here is a count of clients Operations can see,
 * and "0" is said only once the settings and the week have answered.
 */
import { useMemo, useState } from "react";
import { Route } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Client, Studio, Trainer } from "../../../types";
import { formatStudioDate, formatStudioTime, formatDateWords } from "../../../lib/studio-time";
import { AdminButton, AdminHeader, AdminNotice, AdminScreen } from "../primitives";
import { BriefSection, CountsLine, PageNote } from "../overview/brief-pieces";
import { noteCovers, useNightlyNote } from "../overview/useNightlyNote";
import { leadsHere } from "../../relay/leads";
import { markReasonWords } from "./inactive";
import { markActiveAgain } from "./inactive-store";
import { useBoundaryClock } from "../../../lib/boundary-clock";
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
    `Out of the way, never deleted: inactive after ${l.inactiveDays} days with nothing booked, or marked by a leader. The most recent first, the likeliest win-backs. A booking makes a client active again.`,
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
  // Moves when a state could change (a booking's edge, the night's record, the day), not every minute.
  const clock = useBoundaryClock();
  const now = clock.now;
  const j = useStudioJourneys({ studio, studios, clients, trainers, authTrainer, now, clock });
  const [lens, setLens] = useState<JourneyLens>("all");
  const [state, setState] = useState<JourneyState>("drifting");
  const counts = useMemo(() => stateCounts(j.entries, lens), [j.entries, lens]);
  const list = useMemo(() => listFor(j.entries, state, lens), [j.entries, state, lens]);
  const week = useMemo(() => thisWeek(j.entries, j.today), [j.entries, j.today]);
  const tooNew = useMemo(() => j.entries.filter((e) => e.journey.state === "unknown" && e.journey.unknownWhy === "too-new" && (lens === "all" || (lens === "renewal" ? e.inRenewalWindow : e.early))), [j.entries, lens]);
  const active = j.entries.length;
  const reading = !j.ready;

  const note = useNightlyNote(j.nightly, studio, j.today, clients, j.tz);
  const covered = noteCovers(note);
  const meta = [
    j.nightly.lastChangedAt ? `visits from the nightly record of ${formatStudioDate(j.nightly.lastChangedAt, { weekday: "short", month: "short", day: "numeric" }, j.tz)}` : "no nightly record yet",
    j.week.readAt ? `bookings read ${formatStudioTime(new Date(j.week.readAt), j.tz)}` : j.week.loading ? "bookings: reading…" : "bookings couldn't be read",
    "each client judged against their own rhythm",
    j.night.fresh ? `states from last night's run${j.night.at ? ` at ${formatStudioTime(j.night.at, j.tz)}` : ""}, checked against today's bookings` : null,
  ]
    .filter((m): m is string => Boolean(m));

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
    </button>
  );

  return (
    <AdminScreen>
      <AdminHeader icon={<Route className="w-5 h-5" />} title="The Journey" />
      <CountsLine pending={reading ? "Reading the studio's clients…" : null} items={[{ n: active, label: active === 1 ? "active client" : "active clients" }]} rules={meta} />
      <div className="ops-seg" role="group" aria-label="Lens">
        {LENSES.map((l) => (
          <button key={l.id} type="button" aria-pressed={lens === l.id} onClick={() => setLens(l.id)}>
            {l.label}
          </button>
        ))}
      </div>

      {note && <PageNote text={note.text} why={note.why} />}
      {j.settingsFailed && <AdminNotice tone="warn">The studio's renewal settings couldn't be read just now, so At risk uses Max Strength's 14 days.</AdminNotice>}
      {j.linesFailed && (
        <AdminNotice tone="warn">Part of the studio's settings couldn't be read just now, so a line may be Max Strength's or the app's default rather than the studio's own. Setup → Rules says which.</AdminNotice>
      )}
      {j.week.failed && <AdminNotice tone="warn">The week's bookings couldn't be read just now: anyone past a line reads Unknown, never slipping, until they are.</AdminNotice>}
      {j.marks.failed && (
        <AdminNotice tone="warn">The leaders' inactive marks couldn't be read just now, so a client a leader marked inactive reads by the rules alone until they are.</AdminNotice>
      )}
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
          </button>
        ))}
      </div>

      {!reading && !covered && (
        <p className="ops-quiet">
          <b>This week:</b> {week.startedSlipping.length} started slipping · {week.lapsedThisWeek.length} lapsed · {week.inactiveThisWeek.length} went inactive · {week.back.length} back
          {week.towardSteady === null ? "" : ` · ${week.towardSteady.length} toward steady`}
        </p>
      )}

      <BriefSection
        id="journey-list"
        title={STATE_NAMES[state]}
        count={reading ? null : list.length}
        sub={lens !== "all" ? (lens === "renewal" ? "in their renewal window" : `in their first ${j.lines.settlingMax} sessions`) : undefined}
        info={`${STATE_NAMES[state]}: ${CAPTION[state](j.breakDays, j.lines)}. ${LIST_SAYS[state](j.lines)}`}
      >
          {reading ? (
            <p className="ops-sec__empty">Reading the studio's clients…</p>
          ) : list.length === 0 ? (
            <p className="ops-sec__empty">
              No {STATE_NAMES[state].toLowerCase()} clients{lens === "renewal" ? " in their renewal window" : lens === "new" ? ` in their first ${j.lines.settlingMax} sessions` : ""}.
            </p>
          ) : state === "inactive" ? (
            <InactiveRows rows={list} studioId={studio.id as string} leads={leadsHere(authTrainer, studio.id)} onOpenClient={onOpenClient} />
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
        {!reading && state !== "unknown" && tooNew.length > 0 && (isSlipping(state) || state === "steady" || state === "lapsed") && (
          <div className="ops-toonew">
            <p className="ops-toonew__h">
              <b>Too new to judge ({tooNew.length})</b> fewer than six visits on record
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
      </BriefSection>
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
  return formatDateWords(new Date(Date.UTC(y, m - 1, d)), { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }, "en-US");
}

/**
 * THE INACTIVE LIST (the inactive round, Oct 1 2026; AJ: "view the mia list
 * and inactive list to possibly work on retention or win backs"). Each row
 * says which kind it is, since when and why; a leader's mark can be taken
 * back here (Mark active again). A win-back case is the client page's own
 * case form, one tap in: no second case system. Renewals' "lost" list is
 * its own list, untouched.
 */
export function InactiveRows({
  rows,
  studioId,
  leads,
  onOpenClient,
}: {
  rows: JourneyEntry[];
  studioId: string;
  leads: boolean;
  onOpenClient?: (clientId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const takeBack = async (id: string) => {
    setBusy(id);
    setFailed(null);
    try {
      await markActiveAgain(studioId, id);
    } catch {
      setFailed(id);
    } finally {
      setBusy(null);
    }
  };
  return (
    <ul className="ops-jr-list" aria-label="Inactive clients">
      {rows.map((e) => {
        const inactive = e.journey.inactive ?? null;
        const mark = inactive?.mark ?? null;
        const since = inactive?.since ?? e.journey.since;
        const how = inactive?.kind === "manual" ? "Marked inactive" : "Inactive past the line";
        const why = mark ? `${markReasonWords(mark)}. Marked by ${mark.markedBy.name || "a leader"}.` : e.journey.why;
        const meta = [e.usual ? `usually with ${e.usual.name.split(" ")[0]}` : null, e.case.stored ? caseLine(e) : "no win-back case yet"].filter(Boolean).join(" · ");
        return (
          <li key={e.id} className="ops-inrow">
            <button type="button" className="ops-inrow__open" onClick={() => onOpenClient?.(e.id)} disabled={!onOpenClient}>
              <span className="ops-inrow__name">{e.row.name.display}</span>
              <span className="ops-inrow__how">
                {how}
                {since ? ` · since ${shortDay(since)}` : ""}
              </span>
              <span className="ops-inrow__why">{why}</span>
              <span className="ops-inrow__why">{meta}</span>
            </button>
            {leads && mark && (
              <AdminButton size="sm" busy={busy === e.id} onClick={() => void takeBack(e.id)} aria-label={`Mark ${e.row.name.display} active again`}>
                Mark active again
              </AdminButton>
            )}
            {failed === e.id && (
              <p className="adm-hint adm-hint--error" role="alert">
                Couldn't mark {e.row.name.display} active again. Check your connection and try again.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
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
