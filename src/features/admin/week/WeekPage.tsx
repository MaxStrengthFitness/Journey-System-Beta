/**
 * OPERATIONS → WEEK — last week's review, this week so far, and the week
 * ahead.
 *
 * The redesign's Operations room (Sep 28 2026): phase 1 gave the week the
 * Overview's Changes view; phase 5 made it the research's Week (§6.3):
 *
 *   Last week      the Monday review, in the SITREP's order: a bottom line by
 *                  rules (review.ts), what happened day by day, the clients
 *                  who slipped and came back, the renewals decided, the team
 *                  (facts, never a ranking), and the trust line
 *   This week      so far: each day's bookings, what was logged and what is
 *                  still to come, and the week's cancellations and moves
 *                  (changes/ChangesView)
 *   Week ahead     the next seven days: the busiest day, who is due back,
 *                  the milestones, the renewal talks due and who to catch
 *
 * THE CALM ROUND (Oct 3 2026, AJ: "so many words on there"): each page's
 * written bottom line is one line of counts (its rules behind an (i)), the
 * subtitle is the dates, the trust line and the nightly record are each one
 * note at the top (said once), and a section with nothing in it folds into
 * one "All clear" line. A day cell says what was logged and what is still to
 * come; a leader's late cancel and a Mindbody cancellation less than a day
 * before are two different words ("late cancel", "cancelled late").
 *
 * READS, one studio, each an existing shape (no new index): last week's and
 * this week's bookings (`useWeekSchedule`, studioId + startTime and the moves
 * into them — the Overview's own query), the studio's sessions since last
 * Monday (`useSessionsInRange`, hostedAtStudioId + createdAt: done means
 * logged), last week's renewal outcomes (`useOutcomes`, the Outcomes panel's
 * closedOn range), one or two whole-read record documents (`useCoverageRecord`)
 * and the Journey (`useStudioJourneys`). Nothing per client.
 */
import { useMemo } from "react";
import { CalendarRange, ChevronRight } from "lucide-react";
import type { Client, Studio, Trainer } from "../../../types";
import { loggedSessions } from "../../../lib/booking-state";
import { formatStudioTime, studioDateKey, studioDayBoundsForKey } from "../../../lib/studio-time";
import { addDays } from "../../client-history/model";
import { tallyOutcomes } from "../../renewals/rates";
import { useOutcomes } from "../../renewals/useOutcomes";
import { AdminButton, AdminHeader, AdminScreen } from "../primitives";
import { useSessionsInRange } from "../sessions-range";
import { useBookingMarks } from "../attention/booking-marks";
import { ChangesView } from "../changes/ChangesView";
import { useStudioWeek } from "../changes/useStudioWeek";
import { useWeekSchedule } from "../changes/useWeekSchedule";
import { useNightlyNote } from "../overview/useNightlyNote";
import { AllClear, BriefEmpty, BriefSection, CountsLine, PageNote } from "../overview/brief-pieces";
import { moments } from "../overview/moments";
import { renewalsQuestion } from "../overview/questions";
import { useStudioJourneys } from "../journey/useStudioJourneys";
import { isSlipping } from "../journey/states";
import { useMinuteClock } from "../shell/useMinuteClock";
import type { OpsDoor } from "../shell/places";
import { busiestDay, dayFacts, dayLine, mondayOf, readInFull, teamWeek, totals, weekFrom, type DayFacts } from "./review";
import { useCoverageRecord } from "./useCoverageRecord";
import "../shell/ops.css";

export type WeekSub = "last" | "now" | "ahead";

export interface WeekPageProps {
  sub: WeekSub;
  studio: Studio;
  studios: Studio[];
  clients: Client[];
  trainers: Trainer[];
  authTrainer: Trainer;
  onOpenClient?: (clientId: string) => void;
  onOpen?: (to: OpsDoor) => void;
}

export function WeekPage(props: WeekPageProps) {
  if (props.sub === "last") return <LastWeek {...props} />;
  if (props.sub === "ahead") return <WeekAhead {...props} />;
  return <ThisWeek {...props} />;
}

const dateWords = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
};

/** "Thursday", from a day key's digits. */
function longDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

function DayCells({ days, today, logging = true }: { days: DayFacts[]; today: string; logging?: boolean }) {
  return (
    <div className="ops-days">
      {days.map((d) => (
        <div key={d.day} className="ops-day">
          <span className="ops-day__label">
            {d.day === today ? "Today" : d.label} · {dateWords(d.day).split(", ")[1]}
          </span>
          <span className="ops-day__big">{d.booked} booked</span>
          {dayLine(d, { logging }) && <span className="ops-day__fact">{dayLine(d, { logging })}</span>}
        </div>
      ))}
    </div>
  );
}

function Door({ label, to, onOpen }: { label: string; to: OpsDoor; onOpen?: (to: OpsDoor) => void }) {
  if (!onOpen) return null;
  return (
    <AdminButton size="sm" variant="quiet" onClick={() => onOpen(to)}>
      {label} <ChevronRight className="w-3.5 h-3.5" aria-hidden />
    </AdminButton>
  );
}

/* ------------------------------------------------------------------ *
 * Last week — the Monday review
 * ------------------------------------------------------------------ */

function LastWeek({ studio, studios, clients, trainers, authTrainer, onOpen }: WeekPageProps) {
  const now = useMinuteClock();
  const studioId = studio.id as string;
  const j = useStudioJourneys({ studio, studios, clients, trainers, authTrainer, now });
  const tz = j.tz;
  const thisMonday = mondayOf(j.today);
  const lastMonday = addDays(thisMonday, -7);
  const lastSunday = addDays(thisMonday, -1);
  const week = useWeekSchedule(studioId, lastMonday, tz);
  // Anchored on the Monday, so the read happens once a week, not every minute.
  const startMs = useMemo(() => studioDayBoundsForKey(lastMonday, tz).start.getTime(), [lastMonday, tz]);
  const sessions = useSessionsInRange({ studioId, startMs });
  const logged = useMemo(() => (sessions.loading || sessions.failed || sessions.truncated ? null : loggedSessions(sessions.sessions, tz)), [sessions, tz]);
  // The leaders' "didn't come" on last week's bookings (wave 2): a marked one is didn't come, never not logged.
  const marks = useBookingMarks(studioId, lastMonday, lastSunday);
  const days = useMemo(() => weekFrom(lastMonday).map((d) => dayFacts(week.entries, d, logged, now, tz, marks.marks)), [lastMonday, week.entries, logged, now, tz, marks.marks]);
  const t = totals(days);
  const coverage = useCoverageRecord(studioId, [lastMonday.slice(0, 7), lastSunday.slice(0, 7)]);
  const cov = readInFull(days, coverage);
  const outcomes = useOutcomes([studioId], lastMonday, lastSunday);
  const tally = outcomes.loading || outcomes.error ? null : tallyOutcomes(outcomes.rows, { payAsYouGoCountsAs: outcomes.paygRule[studioId] ?? "retained" });
  const crossed = j.entries.filter((e) => (isSlipping(e.journey.state) || e.journey.state === "lapsed") && e.journey.since && e.journey.since >= lastMonday && e.journey.since <= lastSunday);
  const back = j.entries.filter((e) => e.journey.state === "back");
  const reading = week.loading || sessions.loading || !j.ready;
  const note = useNightlyNote(j.nightly, studio, j.today, clients, tz);
  const noteCovers = note !== null && note.kind !== "unknown";
  const decided = outcomes.rows.filter((r) => r.outcome);

  // The team, from the week's bookings: each trainer's facts, in name order, never ranked (review.ts).
  const team = useMemo(() => teamWeek(week.entries, logged, lastMonday, lastSunday, trainers, now, tz, marks.marks), [week.entries, logged, lastMonday, lastSunday, trainers, now, tz, marks.marks]);

  // The calm round (Oct 3 2026): what has nothing in it folds into one line.
  const clear: string[] = [];
  const clientsShown = !j.ready || crossed.length > 0 || back.length > 0;
  if (!clientsShown && !noteCovers) clear.push("Clients");
  const renewalsShown = outcomes.loading || Boolean(outcomes.error) || decided.length > 0;
  if (!renewalsShown) clear.push("Renewals");

  return (
    <AdminScreen>
      <AdminHeader icon={<CalendarRange className="w-5 h-5" />} title="Last week" subtitle={`${dateWords(lastMonday)} – ${dateWords(lastSunday)}`} />
      <CountsLine
        pending={reading ? "Reading last week…" : week.failed ? "Last week's bookings couldn't be read just now, so these counts are missing, not zero." : null}
        items={[
          { n: t.booked, label: "booked" },
          { n: t.done, label: "logged" },
          ...(t.noShow > 0 ? [{ n: t.noShow, label: t.noShow === 1 ? "late cancel" : "late cancels" }] : []),
          ...(t.late > 0 ? [{ n: t.late, label: "cancelled late" }] : []),
          ...(noteCovers ? [] : [{ n: crossed.length, label: "started slipping" }, { n: back.length, label: "back" }]),
          { n: tally === null ? null : tally.total, label: tally?.total === 1 ? "renewal decided" : "renewals decided" },
        ]}
        rules={[
          "Logged: a booking counts as done when Journey logged a session for that client that day. Not logged is never \"didn't happen\".",
          "A late cancel is a mark anyone at the studio makes on a session nobody logged: the session is taken, but it is never a visit. A session logged later for that day beats it.",
          "Cancelled late: a cancellation less than a day before its session (Openings' own rule).",
          "Started slipping comes from the Journey: their last visit plus the line. Who moved toward steady needs yesterday's states, which Journey doesn't keep yet.",
        ]}
      />
      {cov !== null && cov.of > 0 && cov.read < cov.of && (
        <PageNote
          text={`Bookings were read in full on ${cov.read} of ${cov.of} days, so these counts may be short.`}
          why={`Journey counts a day only when it read that day's bookings from Mindbody in full${cov.unknown ? `; for ${cov.unknown} ${cov.unknown === 1 ? "day" : "days"} it can't be told` : ""}.${t.unstamped > 0 ? ` ${t.unstamped} ${t.unstamped === 1 ? "cancellation" : "cancellations"} arrived without a time.` : ""}`}
        />
      )}
      {cov === null && !reading && <PageNote text="Whether every day's bookings were read in full can't be told, so these counts may be short." />}
      {note && <PageNote text={note.text} why={note.why} />}

      <BriefSection id="happened" title="Day by day">
        {week.loading ? <BriefEmpty>Reading…</BriefEmpty> : <DayCells days={days} today={j.today} />}
        {logged === null && !sessions.loading && <p className="ops-sec__note">The week's sessions couldn't be read in full, so what was logged is unknown.</p>}
        {marks.failed && <p className="ops-sec__note">The late cancel marks couldn't be read just now.</p>}
      </BriefSection>

      {clientsShown && (
        <BriefSection id="clients" title="Clients" door={<Door label="Journey" to="journey" onOpen={onOpen} />}>
          {!j.ready ? (
            <BriefEmpty>Reading…</BriefEmpty>
          ) : (
            <>
              {crossed.length > 0 && (
                <p className="ops-sec__note">
                  <b>Started slipping:</b> {crossed.map((e) => e.row.name.display).join(", ")}
                </p>
              )}
              {back.length > 0 && (
                <p className="ops-sec__note">
                  <b>Back after a gap:</b> {back.map((e) => e.row.name.display).join(", ")}
                </p>
              )}
            </>
          )}
        </BriefSection>
      )}

      {renewalsShown && (
        <BriefSection id="renewals" title="Renewals" count={outcomes.loading || outcomes.error ? null : decided.length} door={<Door label="Renewals" to="renewals" onOpen={onOpen} />}>
          {outcomes.loading ? (
            <BriefEmpty>Reading…</BriefEmpty>
          ) : outcomes.error ? (
            <BriefEmpty>Last week's renewal outcomes couldn't be read just now.</BriefEmpty>
          ) : (
            <ul className="ops-jr-list">
              {decided.map((r) => (
                <li key={r.cycleKey} className="ops-sec__note">
                  <b>{r.clientName || "A client"}</b> — {r.outcome === "upgraded" ? "renewed on a longer package" : r.outcome === "downgraded" ? "renewed on a shorter package" : r.outcome === "pay-as-you-go" ? "went pay-as-you-go" : r.outcome}
                  {r.closedOn ? `, ${dateWords(r.closedOn)}` : ""}
                </li>
              ))}
            </ul>
          )}
        </BriefSection>
      )}

      <BriefSection id="team" title="Team" door={<Door label="Team" to="team" onOpen={onOpen} />}>
        {week.loading ? (
          <BriefEmpty>Reading…</BriefEmpty>
        ) : team.length === 0 ? (
          <BriefEmpty>No sessions were booked with a named trainer last week.</BriefEmpty>
        ) : (
          <ul className="ops-jr-list">
            {team.map((r) => (
              <li key={r.key} className="ops-sec__note">
                <b>{r.name}</b> · {r.booked} booked
                {r.notLogged === null ? "" : r.notLogged === 0 ? " · all logged" : ` · ${r.notLogged} not logged`}
              </li>
            ))}
          </ul>
        )}
      </BriefSection>

      <AllClear names={clear} />
    </AdminScreen>
  );
}

/* ------------------------------------------------------------------ *
 * This week so far
 * ------------------------------------------------------------------ */

function ThisWeek({ studio, onOpenClient }: WeekPageProps) {
  const now = useMinuteClock();
  const studioId = studio.id as string;
  const tz = studio.timezone || undefined;
  const todayKey = studioDateKey(now, tz) ?? "";
  const monday = mondayOf(todayKey);
  const week = useWeekSchedule(studioId, monday, tz);
  const startMs = useMemo(() => studioDayBoundsForKey(monday, tz).start.getTime(), [monday, tz]);
  const sessions = useSessionsInRange({ studioId, startMs });
  const logged = useMemo(() => (sessions.loading || sessions.failed || sessions.truncated ? null : loggedSessions(sessions.sessions, tz)), [sessions, tz]);
  const marks = useBookingMarks(studioId, monday, todayKey);
  const days = useMemo(() => weekFrom(monday).map((d) => dayFacts(week.entries, d, logged, now, tz, marks.marks)), [monday, week.entries, logged, now, tz, marks.marks]);
  const t = totals(days);
  const changes = useStudioWeek(studioId, todayKey, tz);

  return (
    <AdminScreen>
      <AdminHeader icon={<CalendarRange className="w-5 h-5" />} title="This week so far" subtitle={`${dateWords(monday)} – ${dateWords(addDays(monday, 6))}`} />
      <CountsLine
        pending={week.loading ? "Reading this week…" : week.failed ? "This week's bookings couldn't be read just now." : null}
        items={[
          { n: t.booked - t.toCome, label: "booked so far" },
          { n: t.done, label: "logged" },
          ...(t.noShow > 0 ? [{ n: t.noShow, label: t.noShow === 1 ? "late cancel" : "late cancels" }] : []),
          { n: t.toCome, label: "to come" },
        ]}
        rules={["Logged: a booking counts as done when Journey logged a session for that client that day."]}
      />
      <BriefSection id="days" title="Day by day">
        {week.loading ? <BriefEmpty>Reading…</BriefEmpty> : week.failed ? <BriefEmpty>Could not be read just now.</BriefEmpty> : <DayCells days={days} today={todayKey} />}
      </BriefSection>
      <ChangesView studio={studio} entries={changes.entries} loading={changes.loading} failed={changes.failed} today={todayKey} onOpenClient={onOpenClient} />
    </AdminScreen>
  );
}

/* ------------------------------------------------------------------ *
 * The week ahead
 * ------------------------------------------------------------------ */

function WeekAhead({ studio, studios, clients, trainers, authTrainer, onOpenClient, onOpen }: WeekPageProps) {
  const now = useMinuteClock();
  const j = useStudioJourneys({ studio, studios, clients, trainers, authTrainer, now });
  const tz = j.tz;
  const next = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(j.today, i)), [j.today]);
  const days = useMemo(() => next.map((d) => dayFacts(j.week.entries, d, null, now, tz)), [next, j.week.entries, now, tz]);
  const busiest = busiestDay(days);
  const lastDay = next[next.length - 1];
  const dueBack = j.entries.filter((e) => e.journey.state === "away" && e.client.renewal?.awayUntil && e.client.renewal.awayUntil >= j.today && e.client.renewal.awayUntil <= lastDay);
  const slipping = j.entries.filter((e) => isSlipping(e.journey.state));
  const milestones = useMemo(
    () => (j.week.read === "ready" ? moments({ delight: [], datedNotes: [], clients, weekEntries: j.week.entries, today: j.today, cutover: studio.journeyCutoverDate ?? null, tz }).rows.filter((r) => r.kind === "milestone") : []),
    [j.week.read, clients, j.week.entries, j.today, studio.journeyCutoverDate, tz],
  );
  const renewals = useMemo(() => renewalsQuestion(clients, {}, j.settings, j.today, false), [clients, j.settings, j.today]);
  const readAt = j.week.readAt ? formatStudioTime(new Date(j.week.readAt), tz) : null;
  const note = useNightlyNote(j.nightly, studio, j.today, clients, tz);
  const noteCovers = note !== null && note.kind !== "unknown";
  const renewalsDue = renewals.counts["talk-now"] + renewals.counts["before-charge"];

  const clear: string[] = [];
  const backShown = !j.ready || dueBack.length > 0;
  if (!backShown && !noteCovers) clear.push("Due back");
  const milestonesShown = j.week.read !== "ready" || milestones.length > 0;
  if (!milestonesShown) clear.push("Milestones");
  const renewalsShown = renewalsDue > 0 || renewals.counts["coming-up"] > 0;
  if (!renewalsShown && !noteCovers) clear.push("Renewals");
  const catchShown = !j.ready || slipping.length > 0;
  if (!catchShown && !noteCovers) clear.push("To catch");

  return (
    <AdminScreen>
      <AdminHeader icon={<CalendarRange className="w-5 h-5" />} title="The week ahead" subtitle={`${dateWords(j.today)} – ${dateWords(lastDay)}`} />
      <CountsLine
        pending={j.week.loading ? "Reading the week ahead…" : j.week.failed ? "The week ahead's bookings couldn't be read just now." : null}
        items={[
          { n: days.reduce((n, d) => n + d.booked, 0), label: "booked" },
          ...(busiest ? [{ n: busiest.booked, label: `on ${busiest.day === j.today ? "today" : longDay(busiest.day)}, the busiest` }] : []),
          ...(noteCovers ? [] : [{ n: j.ready ? dueBack.length : null, label: "due back" }, { n: j.ready ? slipping.length : null, label: "to catch" }]),
        ]}
        rules={[
          `The next seven days' bookings as the server answered them${readAt ? `, read ${readAt}` : ""}; nothing is said from a week this iPad's cache alone holds.`,
          "Due back comes from Mindbody's away events on last night's record.",
        ]}
      />
      {note && <PageNote text={note.text} why={note.why} />}
      <BriefSection id="ahead-days" title="Day by day">
        {j.week.loading ? <BriefEmpty>Reading…</BriefEmpty> : j.week.failed ? <BriefEmpty>Could not be read just now.</BriefEmpty> : <DayCells days={days} today={j.today} logging={false} />}
      </BriefSection>
      {backShown && !(noteCovers && j.ready) && (
        <BriefSection id="ahead-back" title="Due back" count={j.ready ? dueBack.length : null}>
          {!j.ready ? (
            <BriefEmpty>Reading…</BriefEmpty>
          ) : (
            <ul className="ops-jr-list">
              {dueBack.map((e) => (
                <li key={e.id}>
                  <button type="button" className="ops-jr-row" onClick={() => onOpenClient?.(e.id)} disabled={!onOpenClient}>
                    <span className="ops-jr-row__name">{e.row.name.display}</span>
                    <span className="ops-jr-row__why">{e.journey.why}</span>
                    <span className="ops-jr-row__meta">{e.row.next.state === "booked" ? `booked ${e.row.next.text}` : "nothing booked yet"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </BriefSection>
      )}
      {milestonesShown && (
        <BriefSection id="ahead-moments" title="Milestones" count={j.week.read === "ready" ? milestones.length : null}>
          {j.week.read !== "ready" ? (
            <BriefEmpty>{j.week.loading ? "Reading…" : "Booked milestones couldn't be read just now."}</BriefEmpty>
          ) : (
            <ul className="ops-jr-list">
              {milestones.map((m) => (
                <li key={m.key} className="ops-sec__note">
                  <b>{m.name}</b> — {m.sentence}
                </li>
              ))}
            </ul>
          )}
        </BriefSection>
      )}
      {renewalsShown && (
        <BriefSection id="ahead-renewals" title="Renewals" door={<Door label="Renewals" to="renewals" onOpen={onOpen} />}>
          <p className="ops-sec__note">
            {renewals.counts["talk-now"]} to talk to now · {renewals.counts["before-charge"]} before a charge · {renewals.counts["coming-up"]} in the next {j.settings.horizonMonths} months
          </p>
        </BriefSection>
      )}
      {catchShown && !(noteCovers && j.ready) && (
        <BriefSection id="ahead-catch" title="To catch" count={j.ready ? slipping.length : null} door={<Door label="Journey" to="journey" onOpen={onOpen} />}>
          <p className="ops-sec__note">
            {!j.ready ? "Reading…" : `${slipping.length} ${slipping.length === 1 ? "client is" : "clients are"} drifting or at risk, with nothing booked.`}
          </p>
        </BriefSection>
      )}
      <AllClear names={clear} />
    </AdminScreen>
  );
}
