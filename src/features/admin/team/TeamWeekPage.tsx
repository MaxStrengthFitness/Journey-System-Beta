/**
 * OPERATIONS → TEAM → THIS WEEK — each trainer's card in today's schedule
 * order, and the leaders-only renewal counts.
 *
 * The redesign's Operations room, phase 6 (Sep 28 2026; the blueprint's Team
 * page, AJ's question 8 with its default). team-week.ts says what each card
 * says; renewal-counts.ts is the leaders-only table and its chance check.
 *
 *   cards          who is on today, in the order their day starts; then Off
 *                  today, in name order (everyone who works here, lib/who-
 *                  works-here). Last week's logging, their usual clients who
 *                  are slipping, and what is worth recognising
 *   Recognise      puts that line on today's huddle (huddle-memory.ts):
 *                  nothing is sent, nothing is written, nobody is told
 *   Leaders only   this quarter's renewal points and how many were kept, by
 *                  trainer in name order: counts under 10, a rate from 10,
 *                  and a trainer called out only outside what chance gives.
 *                  Shown to whoever may see per-trainer rates
 *                  (renewals/permissions canManageRenewals: head trainers
 *                  count as leaders)
 *
 *   Your notes     (notes round, Oct 3 2026; leader-notes.ts) a leader's
 *                  own Team member notes about the person, from their
 *                  Journal, and "Note for our 1:1", which writes one more
 *                  there. Private to the leader; never shown to the person;
 *                  nothing is sent
 *
 * The calm round (Oct 3 2026, AJ: "so many words on there"): the subtitle's
 * two rules are behind the counts line's (i); each card's lines are short
 * ("41 booked · 41 not logged"), and "Their clients" is left off while the
 * nightly record can't judge (the page's one note says so, not every card).
 *
 * READS, one studio, each an existing shape: the Journey (useStudioJourneys:
 * this week's bookings as the server answered them, the renewal settings,
 * the watchlist), last week's bookings and the sessions logged since last
 * Monday (the Monday review's own two reads), the kudos (useKudosThisWeek:
 * My Studio → Team's own three), and this quarter's renewal outcomes for a
 * leader (the Outcomes panel's closedOn range). Nothing per client or per
 * trainer.
 */
import { useMemo, useState } from "react";
import { Award, Check, Lock, UsersRound } from "lucide-react";
import type { Client, Studio, Trainer } from "../../../types";
import { ROLE_LABELS } from "../../../types";
import { loggedSessions } from "../../../lib/booking-state";
import { studioDayBoundsForKey } from "../../../lib/studio-time";
import { whoWorksHere } from "../../../lib/who-works-here";
import { addDays } from "../../client-history/model";
import { canManageRenewals } from "../../renewals/permissions";
import { recentQuarters } from "../../renewals/rates";
import { useOutcomes } from "../../renewals/useOutcomes";
import { AdminButton, AdminHeader, AdminScreen } from "../primitives";
import { useSessionsInRange } from "../sessions-range";
import { useBookingMarks } from "../attention/booking-marks";
import { useWeekSchedule } from "../changes/useWeekSchedule";
import { BriefEmpty, BriefSection, CountsLine, PageNote } from "../overview/brief-pieces";
import { noteCovers, useNightlyNote } from "../overview/useNightlyNote";
import { useStudioJourneys } from "../journey/useStudioJourneys";
import { useMinuteClock } from "../shell/useMinuteClock";
import { mondayOf, teamWeek, type TrainerWeek } from "../week/review";
import { toggleHuddleLine, useHuddleLines } from "./huddle-memory";
import { checkLine, howWeCheck, renewalCounts, TRAINER_RATE_MIN } from "./renewal-counts";
import { clientsLine, didLine, offToday, onToday, recognitionLine, usualClients } from "./team-week";
import { useKudosThisWeek } from "./useKudosThisWeek";
import { LeaderNotes, useLeaderNotes } from "./LeaderNotes";
import { auth } from "../../../firebase";
import "../shell/ops.css";

export interface TeamWeekPageProps {
  studio: Studio;
  studios: Studio[];
  clients: Client[];
  trainers: Trainer[];
  authTrainer: Trainer;
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

export function TeamWeekPage({ studio, studios, clients, trainers, authTrainer }: TeamWeekPageProps) {
  const now = useMinuteClock();
  const studioId = studio.id as string;
  const j = useStudioJourneys({ studio, studios, clients, trainers, authTrainer, now });
  const { tz, today } = j;

  /* ---- who is on today, and who works here ---- */
  const on = useMemo(() => (j.week.read === "ready" ? onToday(j.week.entries, today, trainers, tz) : []), [j.week.read, j.week.entries, today, trainers, tz]);
  const team = useMemo(() => whoWorksHere(trainers, studioId), [trainers, studioId]);
  const off = useMemo(() => offToday(team, on), [team, on]);

  /* ---- last week, the Monday review's own reads ---- */
  const thisMonday = mondayOf(today);
  const lastMonday = addDays(thisMonday, -7);
  const lastSunday = addDays(thisMonday, -1);
  const lastWeek = useWeekSchedule(studioId, lastMonday, tz);
  const startMs = useMemo(() => studioDayBoundsForKey(lastMonday, tz).start.getTime(), [lastMonday, tz]);
  const sessions = useSessionsInRange({ studioId, startMs });
  const logged = useMemo(() => (sessions.loading || sessions.failed || sessions.truncated ? null : loggedSessions(sessions.sessions, tz)), [sessions, tz]);
  // A leader's "didn't come" is not a trainer's logging gap (wave 2).
  const marks = useBookingMarks(studioId, lastMonday, lastSunday);
  const weeks = useMemo(() => {
    const byKey = new Map<string, TrainerWeek>();
    for (const w of teamWeek(lastWeek.entries, logged, lastMonday, lastSunday, trainers, now, tz, marks.marks)) byKey.set(w.key, w);
    return byKey;
  }, [lastWeek.entries, logged, lastMonday, lastSunday, trainers, now, tz, marks.marks]);
  const weekRead = lastWeek.loading || sessions.loading ? "loading" : lastWeek.failed ? "failed" : "ready";

  /* ---- recognition ---- */
  const kudos = useKudosThisWeek(studioId);
  const known = j.ready && !j.nightly.stale;
  const note = useNightlyNote(j.nightly, studio, today, clients, tz);
  const covered = noteCovers(note);
  const onHuddle = useHuddleLines(studioId, today);

  /* ---- leaders only ---- */
  const leads = canManageRenewals(authTrainer, studioId);
  const [quarter] = useMemo(() => recentQuarters(today || "2026-01-01", 1), [today]);
  const outcomes = useOutcomes(leads ? [studioId] : [], quarter.from, quarter.to);
  const counts = useMemo(() => {
    const nameOf = (id: string) => trainers.find((t) => t.id === id || t.authUid === id)?.fullName ?? "A former trainer";
    return renewalCounts(outcomes.rows, { payAsYouGoCountsAs: outcomes.paygRule[studioId] ?? "retained" }, nameOf);
  }, [outcomes.rows, outcomes.paygRule, studioId, trainers]);
  const [checkOpen, setCheckOpen] = useState(false);

  /* ---- a leader's own notes about each person (Oct 3 2026) ---- */
  // The Auth uid: the Journal is the leader's by path, and the rules pin it.
  const myUid = leads ? (auth.currentUser?.uid ?? null) : null;
  const myNotes = useLeaderNotes(myUid);

  const card = (key: string, name: string, trainer: Trainer | null, meta: string, isOff: boolean) => {
    const trainerId = trainer?.id ?? null;
    const theirs = usualClients(j.entries, trainerId);
    const given = kudos && trainer ? (kudos.get(trainer.id as string) ?? (trainer.authUid ? kudos.get(trainer.authUid) : undefined) ?? 0) : null;
    const rec = known ? recognitionLine(theirs, given) : given ? recognitionLine([], given) : null;
    const line = rec ? `${name}: ${rec}` : null;
    const pressed = Boolean(line && onHuddle.includes(line));
    return (
      <article key={key} className={isOff ? "ops-tr ops-tr--off" : "ops-tr"} aria-label={name}>
        <header className="ops-tr__h">
          <span className="ops-tr__av" aria-hidden>
            {initialsOf(name)}
          </span>
          <div>
            <h3 className="ops-tr__name">{name}</h3>
            <p className="ops-tr__meta">{meta}</p>
          </div>
        </header>
        <p className="ops-tr__l">
          <span className="ops-tr__lab">Last week</span>
          {didLine(weeks.get(trainerId ?? name.toLowerCase()), weekRead, tz)}
        </p>
        {!covered && (
          <p className="ops-tr__l">
            <span className="ops-tr__lab">Their clients</span>
            {trainerId ? clientsLine(theirs, known) : "Not a trainer Journey knows."}
          </p>
        )}
        {myUid && (
          <LeaderNotes
            name={name}
            uid={myUid}
            authorName={authTrainer.fullName || "A leader"}
            read={myNotes.read}
            onSaved={myNotes.refresh}
          />
        )}
        {rec && line && (
          <>
            <p className="ops-tr__l">
              <span className="ops-tr__lab">Recognise</span>
              {rec}
            </p>
            <div className="ops-tr__acts">
              <AdminButton size="sm" variant={pressed ? "primary" : "quiet"} aria-pressed={pressed} onClick={() => toggleHuddleLine(studioId, today, line)}>
                {pressed ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Award className="w-3.5 h-3.5" aria-hidden />}
                {pressed ? "On today's huddle" : "Recognise"}
              </AdminButton>
            </div>
          </>
        )}
      </article>
    );
  };

  const roleOf = (t: Trainer | null) => (t?.role ? (ROLE_LABELS[t.role] ?? t.role) : null);
  const byId = (id: string | null) => (id ? (trainers.find((t) => t.id === id) ?? null) : null);

  return (
    <AdminScreen>
      <AdminHeader icon={<UsersRound className="w-5 h-5" />} title="This week" />
      <CountsLine
        items={[
          { n: j.week.read === "ready" ? on.length : null, label: "on today" },
          { n: j.week.read === "ready" ? off.length : null, label: "off today" },
        ]}
        rules={[
          "In today's schedule order, then the rest in name order: never a ranking.",
          "Recognise sends nothing: it puts the line on today's huddle, which you start from Today.",
          ...(myUid ? ["Your notes about a person are in your own Journal: only you can read them, never the person, and nothing is sent."] : []),
        ]}
      />
      {note && <PageNote text={note.text} why={note.why} />}

      <BriefSection id="on" title="On today" count={j.week.read === "ready" ? on.length : null}>
        {j.week.read === "loading" ? (
          <BriefEmpty>Reading today's bookings…</BriefEmpty>
        ) : j.week.read !== "ready" ? (
          <BriefEmpty>Today's bookings couldn't be read just now, so who is on today is unknown.</BriefEmpty>
        ) : on.length === 0 ? (
          <BriefEmpty>Nobody has a booking today.</BriefEmpty>
        ) : (
          <div className="ops-team p-3">
            {on.map((o) => {
              const t = byId(o.trainerId);
              return card(o.key, o.name, t, [roleOf(t), `${o.shift} · ${o.booked} booked`].filter(Boolean).join(" · "), false);
            })}
          </div>
        )}
      </BriefSection>

      {off.length > 0 && (
        <BriefSection id="off" title="Off today">
          <div className="ops-team p-3">{off.map((t) => card(t.id as string, t.fullName, t, roleOf(t) ?? "No booking today", true))}</div>
        </BriefSection>
      )}

      {leads && (
        <BriefSection
          id="leaders"
          title="Leaders only"
          sub={
            <>
              <Lock className="w-3.5 h-3.5 inline" aria-hidden /> renewals, {quarter.label}
            </>
          }
        >
          {outcomes.loading ? (
            <BriefEmpty>Reading this quarter's renewals…</BriefEmpty>
          ) : outcomes.error ? (
            <BriefEmpty>This quarter's renewal outcomes couldn't be read just now.</BriefEmpty>
          ) : counts.studio.points === 0 ? (
            <BriefEmpty>No renewal points have closed this quarter yet.</BriefEmpty>
          ) : (
            <>
              <p className="ops-sec__empty">
                Studio: <b>{counts.studio.points} renewal {counts.studio.points === 1 ? "point" : "points"}, {counts.studio.kept} kept.</b> By trainer, in name order:
              </p>
              {counts.rows.length > 0 && (
                <table className="ops-tbl">
                  <thead>
                    <tr>
                      <th scope="col">Trainer</th>
                      <th scope="col">Renewal points</th>
                      <th scope="col">Kept</th>
                    </tr>
                  </thead>
                  <tbody>
                    {counts.rows.map((r) => (
                      <tr key={r.trainerId}>
                        <th scope="row">{r.name}</th>
                        <td>{r.points}</td>
                        <td>
                          {r.kept}
                          {r.rate ? ` (${r.rate})` : ""}
                          {r.outside && r.range && (
                            <span className="ops-tbl__out">
                              Outside what chance gives for {r.points} ({r.range.low} to {r.range.high})
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {counts.unattributed > 0 && (
                <p className="ops-sec__note">
                  {counts.unattributed} renewal {counts.unattributed === 1 ? "point has" : "points have"} no trainer on record.
                </p>
              )}
              <p className="ops-sec__note">
                A rate appears at {TRAINER_RATE_MIN} renewal points. {checkLine(counts)}
              </p>
              <div className="ops-sec__foot">
                <AdminButton size="sm" variant="ghost" aria-expanded={checkOpen} onClick={() => setCheckOpen((v) => !v)}>
                  How we check
                </AdminButton>
              </div>
              {checkOpen && <p className="ops-check">{howWeCheck(counts)}</p>}
            </>
          )}
        </BriefSection>
      )}
    </AdminScreen>
  );
}
