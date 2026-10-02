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
import { AdminButton, AdminHeader, AdminNotice, AdminScreen } from "../primitives";
import { useSessionsInRange } from "../sessions-range";
import { useBookingMarks } from "../attention/booking-marks";
import { ChangesView } from "../changes/ChangesView";
import { useStudioWeek } from "../changes/useStudioWeek";
import { useWeekSchedule } from "../changes/useWeekSchedule";
import { renewalUnknownCount } from "../overview/brief";
import { BottomLineBox, BriefEmpty, BriefSection } from "../overview/brief-pieces";
import { moments } from "../overview/moments";
import { renewalsQuestion } from "../overview/questions";
import { useStudioJourneys } from "../journey/useStudioJourneys";
import { isSlipping } from "../journey/states";
import { useMinuteClock } from "../shell/useMinuteClock";
import type { OpsDoor } from "../shell/places";
import { busiestDay, dayFacts, dayLine, mondayOf, readInFull, reviewLine, teamWeek, totals, weekFrom, type DayFacts } from "./review";
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

function DayCells({ days, today }: { days: DayFacts[]; today: string }) {
  return (
    <div className="ops-days">
      {days.map((d) => (
        <div key={d.day} className="ops-day">
          <span className="ops-day__label">
            {d.day === today ? "Today" : d.label} · {dateWords(d.day).split(", ")[1]}
          </span>
          <span className="ops-day__big">{d.booked} booked</span>
          <span className="ops-day__fact">{dayLine(d)}</span>
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

function LastWeek({ studio, studios, clients, trainers, authTrainer, onOpenClient, onOpen }: WeekPageProps) {
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
  const line = reviewLine(t, { crossed: crossed.length, back: back.length, renewals: tally, coverage: cov, renewalUnknown: renewalUnknownCount(j.nightly) });

  // The team, from the week's bookings: each trainer's facts, in name order, never ranked (review.ts).
  const team = useMemo(() => teamWeek(week.entries, logged, lastMonday, lastSunday, trainers, now, tz, marks.marks), [week.entries, logged, lastMonday, lastSunday, trainers, now, tz, marks.marks]);

  return (
    <AdminScreen>
      <AdminHeader
        icon={<CalendarRange className="w-5 h-5" />}
        title="The Monday review"
        subtitle={`${studio.name}, the week of ${dateWords(lastMonday)} to ${dateWords(lastSunday)}. What happened, who moved, and how far to trust it.`}
      />
      <BottomLineBox
        sentence={reading ? "Reading last week…" : line}
        rules={[
          "Done means logged: a booking counts as done when Journey logged a session for that client that day. Not logged is never \"didn't happen\".",
          "A late cancel is a mark anyone at the studio makes on a session nobody logged: the session is taken, but it is never a visit. A session logged later for that day beats it.",
          "A cancellation less than a day before its session is late (Openings' own rule).",
          "Who crossed a line comes from the Journey: their last visit plus the line. Who moved toward steady needs yesterday's states, which Journey doesn't keep yet.",
          "Written by rules each time the page reads. Never typed by hand.",
        ]}
      />
      {week.failed && <AdminNotice tone="alert">Last week's bookings couldn't be read just now, so these counts are missing, not zero.</AdminNotice>}

      <BriefSection id="happened" title="What happened" sub="booked sessions logged as done, by day">
        {week.loading ? <BriefEmpty>Reading last week…</BriefEmpty> : <DayCells days={days} today={j.today} />}
        {logged === null && !sessions.loading && <p className="ops-sec__note">The week's sessions couldn't be read in full, so what was logged is unknown.</p>}
        {marks.failed && <p className="ops-sec__note">The late cancel marks couldn't be read just now, so a marked session may show as not logged.</p>}
      </BriefSection>

      <BriefSection id="clients" title="Clients" sub="how they moved" door={<Door label="Journey" to="journey" onOpen={onOpen} />}>
        {!j.ready ? (
          <BriefEmpty>Reading the Journey…</BriefEmpty>
        ) : (
          <>
            <p className="ops-sec__note">
              <b>Crossed a line last week:</b> {crossed.length === 0 ? "nobody." : crossed.map((e) => e.row.name.display).join(", ")}
            </p>
            <p className="ops-sec__note">
              <b>Booked again after a gap:</b> {back.length === 0 ? "nobody." : back.map((e) => e.row.name.display).join(", ")}
            </p>
          </>
        )}
      </BriefSection>

      <BriefSection id="renewals" title="Renewals" sub="decided last week" door={<Door label="Renewals" to="renewals" onOpen={onOpen} />}>
        {outcomes.loading ? (
          <BriefEmpty>Reading last week's renewals…</BriefEmpty>
        ) : outcomes.error ? (
          <BriefEmpty>Last week's renewal outcomes couldn't be read just now.</BriefEmpty>
        ) : outcomes.rows.filter((r) => r.outcome).length === 0 ? (
          <BriefEmpty>No renewals were decided last week.</BriefEmpty>
        ) : (
          <ul className="ops-jr-list">
            {outcomes.rows
              .filter((r) => r.outcome)
              .map((r) => (
                <li key={r.cycleKey} className="ops-sec__note">
                  <b>{r.clientName || "A client"}</b> — {r.outcome === "upgraded" ? "renewed on a longer package" : r.outcome === "downgraded" ? "renewed on a shorter package" : r.outcome === "pay-as-you-go" ? "went pay-as-you-go" : r.outcome}
                  {r.closedOn ? `, ${dateWords(r.closedOn)}` : ""}
                </li>
              ))}
          </ul>
        )}
      </BriefSection>

      <BriefSection id="team" title="Team" sub="facts from the week's bookings, in name order — recognition, never ranking" door={<Door label="Team" to="team" onOpen={onOpen} />}>
        {week.loading ? (
          <BriefEmpty>Reading last week…</BriefEmpty>
        ) : team.length === 0 ? (
          <BriefEmpty>No sessions were booked with a named trainer last week.</BriefEmpty>
        ) : (
          <ul className="ops-jr-list">
            {team.map((r) => (
              <li key={r.key} className="ops-sec__note">
                <b>{r.name}</b>: {r.booked} booked
                {r.notLogged === null ? "." : r.notLogged === 0 ? ", every one logged." : `, ${r.notLogged} not logged yet.`}
              </li>
            ))}
          </ul>
        )}
      </BriefSection>

      <BriefSection id="trust" title="Trust" sub="how complete this review is">
        <p className="ops-sec__note">
          {cov === null
            ? "Whether each day's bookings were read in full can't be told yet."
            : cov.of === 0
              ? "No day last week had bookings to read."
              : `Bookings were read in full on ${cov.read} of the ${cov.of} days with bookings${cov.unknown ? `; ${cov.unknown} can't be told` : ""}.`}
        </p>
        <p className="ops-sec__note">
          {t.notLogged === null ? "What was logged couldn't be read." : `${t.notLogged} ${t.notLogged === 1 ? "session still has" : "sessions still have"} no workout logged.`}{" "}
          {t.unstamped > 0 ? `${t.unstamped} ${t.unstamped === 1 ? "cancellation arrived" : "cancellations arrived"} without a time.` : ""}{" "}
          {renewalUnknownCount(j.nightly) > 0 ? `Renewal timing is unknown for ${renewalUnknownCount(j.nightly)} ${renewalUnknownCount(j.nightly) === 1 ? "client" : "clients"}.` : ""}
        </p>
      </BriefSection>
    </AdminScreen>
  );
}

/** "Thursday", from a day key's digits. */
function longDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
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
  const sentence = week.loading
    ? "Reading this week…"
    : week.failed
      ? "This week's bookings couldn't be read just now."
      : t.done === null
        ? `${t.booked} booked this week, ${t.toCome} still to come; what was logged so far couldn't be read.`
        : t.booked - t.toCome === 0
          ? `Nothing booked this week has finished yet. ${t.toCome} still to come.`
          : `${t.done} of the ${t.booked - t.toCome} booked sessions so far ${t.done === 1 ? "is" : "are"} logged as done${t.notLogged ? `, ${t.notLogged} not logged yet` : ""}${t.noShow ? `, ${t.noShow} late ${t.noShow === 1 ? "cancel" : "cancels"}` : ""}. ${t.toCome} still to come this week.`;

  return (
    <AdminScreen>
      <AdminHeader icon={<CalendarRange className="w-5 h-5" />} title="This week so far" subtitle={`${studio.name}, Monday ${dateWords(monday)} to Sunday. Each day's bookings, what was logged, and what is still to come.`} />
      <BottomLineBox sentence={sentence} rules={["Done means logged: a booking counts as done when Journey logged a session for that client that day.", "Written by rules each time the page reads."]} />
      <BriefSection id="days" title="Day by day" sub="Monday to Sunday">
        {week.loading ? <BriefEmpty>Reading this week…</BriefEmpty> : week.failed ? <BriefEmpty>Could not be read just now.</BriefEmpty> : <DayCells days={days} today={todayKey} />}
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
  const sentence = j.week.loading
    ? "Reading the week ahead…"
    : j.week.failed
      ? "The week ahead's bookings couldn't be read just now."
      : `${days.reduce((n, d) => n + d.booked, 0)} booked over the next seven days${busiest ? `; ${busiest.day === j.today ? "today" : longDay(busiest.day)} is the busiest, with ${busiest.booked}` : ""}. ${dueBack.length} due back from time away, ${slipping.length} slipping to catch.`;

  return (
    <AdminScreen>
      <AdminHeader icon={<CalendarRange className="w-5 h-5" />} title="The week ahead" subtitle={`${studio.name}, the next seven days${readAt ? ` · bookings read ${readAt}` : ""}.`} />
      <BottomLineBox sentence={sentence} rules={["The next seven days' bookings as the server answered them; nothing is said from a week this iPad's cache alone holds.", "Who is due back comes from Mindbody's away events on last night's record.", "Written by rules each time the page reads."]} />
      <BriefSection id="ahead-days" title="Day by day" sub="the next seven days">
        {j.week.loading ? <BriefEmpty>Reading the week ahead…</BriefEmpty> : j.week.failed ? <BriefEmpty>Could not be read just now.</BriefEmpty> : <DayCells days={days} today={j.today} />}
      </BriefSection>
      <BriefSection id="ahead-back" title="Due back" count={j.ready ? dueBack.length : null} sub="from time away, this week">
        {!j.ready ? (
          <BriefEmpty>Reading the Journey…</BriefEmpty>
        ) : dueBack.length === 0 ? (
          <BriefEmpty>Nobody is due back from time away this week.</BriefEmpty>
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
      <BriefSection id="ahead-moments" title="Milestones" count={j.week.read === "ready" ? milestones.length : null} sub="booked this week, only when a total may be quoted">
        {j.week.read !== "ready" ? (
          <BriefEmpty>{j.week.loading ? "Reading the week ahead…" : "Booked milestones couldn't be read just now."}</BriefEmpty>
        ) : milestones.length === 0 ? (
          <BriefEmpty>No milestones booked this week.</BriefEmpty>
        ) : (
          <ul className="ops-jr-list">
            {milestones.map((m) => (
              <li key={m.key} className="ops-sec__note">
                <b>{m.name}</b> — {m.sentence} {m.proof}
              </li>
            ))}
          </ul>
        )}
      </BriefSection>
      <BriefSection id="ahead-renewals" title="Renewals" sub="from last night's record" door={<Door label="Renewals" to="renewals" onOpen={onOpen} />}>
        <p className="ops-sec__note">
          {renewals.counts["talk-now"]} to talk to now, {renewals.counts["before-charge"]} before a charge, {renewals.counts["coming-up"]} coming up in the next {j.settings.horizonMonths} months.
        </p>
      </BriefSection>
      <BriefSection id="ahead-catch" title="To catch" count={j.ready ? slipping.length : null} sub="drifting and at risk, on the Journey" door={<Door label="Journey" to="journey" onOpen={onOpen} />}>
        <p className="ops-sec__note">
          {!j.ready ? "Reading the Journey…" : slipping.length === 0 ? "Nobody is slipping right now." : `${slipping.length} ${slipping.length === 1 ? "client is" : "clients are"} drifting or at risk, with nothing booked.`}
        </p>
      </BriefSection>
    </AdminScreen>
  );
}
