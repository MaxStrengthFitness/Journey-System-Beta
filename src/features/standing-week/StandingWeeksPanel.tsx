import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { auth } from "../../firebase";
import { DEFAULT_TIME_ZONE, isValidTimeZone, studioTodayKey } from "../../lib/studio-time";
import type { Client, Studio, Trainer } from "../../types";
import { AdminButton, AdminNotice, AdminPanel, AdminRow, AdminRows, ConfirmDialog } from "../admin/primitives";
import { useWeekSchedule } from "../admin/changes/useWeekSchedule";
import { openMyStudioSection } from "../my-studio/section-memory";
import { nextDays } from "../openings/next-days";
import { teamLine } from "../openings/present";
import { showOpenings } from "../openings/ui";
import { trainerRefs } from "../openings/whose";
import { UnsavedChangesScope, useLeaveScope, useUnsavedChanges } from "../unsaved-changes";
import { AwayEditor } from "./AwayEditor";
import { awaySentence, awayThisWeek, checkWeek, staffIdsAt, stateSentence } from "./check";
import { serverRead, type ServerRead } from "./server-read";
import { useServerWait } from "./useServerWait";
import { formOf, reviewSentence, teamWeekSentence, weekChanges, weekOfForm, type WeekForm } from "./present";
import { agreeWeek, removeWeek, setAway } from "./store";
import { bookingsKnown, teamWeeks, waitingSentence, type TeamWeekRow } from "./team";
import { useStandingWeeks } from "./useStandingWeeks";
import { sameWeek, weekSummary } from "./week";
import { WeekEditor } from "./WeekEditor";
import "./standing-week.css";

/**
 * MY STUDIO → TEAM → STANDING WEEKS (voice-review round, Sep 27 2026).
 *
 * AJ: "leaders review and finalize those standings with newly focused team
 * section", and "if one of their eight o'clocks on Monday is going out on
 * vacation for a couple of weeks, that's going to let the studio leader or
 * head trainers know ... this person's going to have an open slot."
 *
 * Two parts:
 *
 *   the next seven days   who is away this week, said once each, and ONE
 *                         line with a door to Openings: "3 free slots in the
 *                         next 7 days · See them on Openings." (Openings
 *                         round, Sep 27 2026, phase 7; AJ: "perfect"). The
 *                         free slots themselves are listed on My Studio →
 *                         Openings → Next 7 days, so one rule feeds one list
 *                         and Team stays people and standards. The count is
 *                         Openings' own (`teamLine(nextDays(...))`, built
 *                         with the same who-works-here and Mindbody staff ids
 *                         Openings uses), never the raw check, which also
 *                         holds slots earlier today and on Sundays. The door
 *                         opens Openings on Next 7 days and "Anyone", since
 *                         the count is the studio's. Nothing is written to
 *                         Mindbody, and an unread day is "can't tell", never
 *                         "open": until the server answers there is no line.
 *   each person's         by name, never ranked: where it stands, and Review
 *   standing week
 *                         to agree a proposal as it is or changed first.
 *                         Opening another person's week while one holds a
 *                         leader's changes asks first (a leave scope), and
 *                         so does every way the Review closes: Cancel, and
 *                         Agree or Remove with dates away still being typed
 *                         below them.
 *
 * Team is the studio tier's section; the rules are the boundary
 * (firestore.rules, standingWeeks: a leader agrees, a trainer proposes).
 */

export interface StandingWeeksPanelProps {
  studio: Studio;
  authTrainer: Trainer | null;
  trainers: Trainer[];
  clients: Client[];
}

/** A clock for "still ahead": a free slot at 8:00 has passed by 8:30, with the panel left open. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** The door on Team's line: Openings, on Next 7 days, for anyone (the count is the studio's). */
function openOpeningsNextDays() {
  showOpenings("next", { kind: "anyone" });
  openMyStudioSection("openings");
}

export function StandingWeeksPanel({ studio, authTrainer, trainers, clients }: StandingWeeksPanelProps) {
  const studioId = studio.id;
  const tz = studio.timezone || undefined;
  const now = useMinuteClock();
  const today = studioTodayKey(now, tz);
  const weeks = useStandingWeeks(studioId);
  const [reviewing, setReviewing] = useState<string | null>(null);
  // Opening another person's week, or closing this one from its row, would
  // take a leader's half-changed week away: it asks first (unsaved-changes).
  const reviewScope = useLeaveScope();

  const rows = useMemo(() => teamWeeks(trainers, weeks.docs, studioId), [trainers, weeks.docs, studioId]);
  // Only the weeks of people who still work here are checked: a week left
  // behind by someone who left would list their old regulars as open slots.
  const checked = useMemo(() => rows.filter((r) => r.onStaff && r.doc).map((r) => r.doc!), [rows]);
  // The week's bookings are read only when there is something to check them
  // against: an agreed week, at a studio whose Mindbody is linked.
  const needsBookings = bookingsKnown(studio) && checked.some((d) => d.final);
  // Only the server's answer is a read: a cache-only snapshot (offline, or
  // before the server answers) would call every slot the cache lacks open.
  const schedule = useWeekSchedule(needsBookings ? studioId : null, today, tz, { confirmed: true });
  const wait = useServerWait(needsBookings && (schedule.loading || schedule.fromCache));
  const read = serverRead({ loading: schedule.loading, failed: schedule.failed, fromCache: schedule.fromCache, ...wait });
  // A booking the sync couldn't link to a trainer, carrying their Mindbody
  // staff id, is theirs: only ids from this studio's site (staff ids are per site).
  const staffIds = useMemo(() => staffIdsAt(trainers, studio.mindbodySiteId), [trainers, studio.mindbodySiteId]);
  const check = useMemo(
    () =>
      checkWeek({
        docs: checked,
        bookings: schedule.entries,
        today,
        tz,
        read,
        connected: bookingsKnown(studio),
        staffIds,
      }),
    [checked, schedule.entries, read, today, tz, studio, staffIds],
  );
  /*
   * TEAM'S LINE (Openings round, Sep 27 2026, phase 7): how many free slots
   * Openings' Next 7 days lists, counted by `teamLine` from `nextDays` built
   * exactly as Openings builds it (openings/ui/useOpeningsData.ts): the
   * studio's standing weeks, who works here (the standing weeks' own
   * `teamWeeks`, on staff), every trainer placed with their Mindbody staff id
   * at this studio's site, and this read. The usual week and the marks only
   * add "usually full" lines, never a regular, so Team reads neither: the
   * count is the same without them. With no agreed week to check, no
   * bookings are read, and an unread week is never "nothing booked".
   */
  const onStaff = useMemo(() => new Set(rows.filter((r) => r.onStaff).map((r) => r.trainerId)), [rows]);
  const worksHere = useMemo(() => (trainerId: string) => onStaff.has(trainerId), [onStaff]);
  const refs = useMemo(() => trainerRefs(trainers.map((t) => ({ id: t.id, name: t.fullName })), staffIds), [trainers, staffIds]);
  const zone = isValidTimeZone(studio.timezone) ? (studio.timezone as string) : DEFAULT_TIME_ZONE;
  const nextRead: ServerRead = needsBookings ? read : "loading";
  const next = useMemo(
    () =>
      nextDays({
        today,
        now,
        tz: zone,
        read: nextRead,
        connected: bookingsKnown(studio),
        bookings: schedule.entries,
        docs: weeks.docs,
        trainers: refs,
        staffIds,
        worksHere,
      }),
    [today, now, zone, nextRead, studio, schedule.entries, weeks.docs, refs, staffIds, worksHere],
  );
  const line = teamLine(next);
  // Who is away this week, said once each; their slots aren't checked.
  const away = useMemo(() => awayThisWeek(checked, today), [checked, today]);
  const waiting = waitingSentence(rows);
  const open = rows.find((r) => r.uid === reviewing) ?? null;

  return (
    <AdminPanel
      title="Standing weeks"
      icon={<CalendarClock className="w-3.5 h-3.5" />}
      subtitle="Each trainer proposes their usual week — when they take clients, and their regulars — on My Profile, and you agree it here. The coming week's Mindbody bookings are checked against the agreed weeks. Nothing is written to Mindbody: the front desk books as always."
    >
      <div className="stw-team">
        <section aria-labelledby="stw-next-seven">
          <h3 className="stw-team__head" id="stw-next-seven">
            The next seven days
          </h3>
          {weeks.error ? (
            <p className="stw-hint">{weeks.error}</p>
          ) : weeks.loading ? (
            <p className="stw-hint">Reading the standing weeks…</p>
          ) : null}
          {!weeks.error && !weeks.loading && away.length > 0 && (
            <ul className="stw-away-lines" aria-label="Away this week">
              {away.map((n) => (
                <li key={`${n.trainerId}-${n.from}-${n.to}`} className="stw-away-line">
                  {awaySentence(n, today, tz)}
                </li>
              ))}
            </ul>
          )}
          {/* One line and a door when Openings lists a free slot. Otherwise
              the check's own sentence while it can't tell (reading, offline,
              failed, not linked, nothing agreed), or when it found nothing
              at all; a slot someone else is booked in, or one earlier today
              or on a Sunday, is nothing Openings lists, so it says nothing. */}
          {weeks.error || weeks.loading ? null : line ? (
            <button type="button" className="stw-btn stw-btn--quiet" data-testid="week-openings-door" onClick={openOpeningsNextDays}>
              {line}
            </button>
          ) : check.state !== "ready" || check.findings.length === 0 ? (
            <p className="stw-hint" data-testid="week-check-state">
              {stateSentence(check)}
            </p>
          ) : null}
        </section>

        <section aria-labelledby="stw-each-week">
          <h3 className="stw-team__head" id="stw-each-week">
            Each person's standing week
          </h3>
          {waiting && <AdminNotice tone="info">{waiting}</AdminNotice>}
          {/* Unread, the list would call everyone "hasn't proposed" and offer
              "Set a week" over a proposal nobody has seen: it waits. Why is
              said once, under the next seven days. */}
          {(weeks.error || weeks.loading) && <p className="stw-hint">Listed here once the standing weeks are read.</p>}
          {!weeks.loading && !weeks.error && rows.length === 0 && <p className="stw-hint">Nobody works at {studio.name} yet.</p>}
          {!weeks.loading && !weeks.error && (
            <AdminRows>
              {rows.map((r) => (
                <AdminRow
                  key={r.uid}
                  name={r.name}
                  meta={rowMeta(r, studio.name, tz)}
                  trailing={
                    <AdminButton
                      variant={r.status === "proposed" || r.status === "changed" ? "primary" : "quiet"}
                      aria-expanded={reviewing === r.uid}
                      aria-label={`${actionLabel(r)}: ${r.name}`}
                      onClick={() => reviewScope.guard(() => setReviewing(reviewing === r.uid ? null : r.uid))}
                    >
                      {actionLabel(r)}
                    </AdminButton>
                  }
                />
              ))}
            </AdminRows>
          )}
          {open && (
            <UnsavedChangesScope scope={reviewScope}>
              <WeekReview
                key={open.uid}
                row={open}
                studio={studio}
                authTrainer={authTrainer}
                clients={clients}
                tz={tz}
                today={today}
                // Every close asks the scope: Cancel with a changed week, or
                // Agree / Remove with dates away still typed below them.
                onDone={() => reviewScope.guard(() => setReviewing(null))}
              />
            </UnsavedChangesScope>
          )}
        </section>
      </div>
    </AdminPanel>
  );
}

/** "Agreed by Pat Doe on Sep 28. 4 days · 9 regulars." */
function rowMeta(r: TeamWeekRow, studioName: string, tz?: string): string {
  const week = r.doc?.final ?? r.doc?.proposed ?? null;
  const summary = week ? ` ${weekSummary(week)}.` : "";
  return r.onStaff ? `${teamWeekSentence(r.doc, r.name, tz)}${summary}` : `No longer on ${studioName}'s staff.${summary}`;
}

function actionLabel(r: TeamWeekRow): string {
  if (!r.onStaff) return "Remove";
  if (r.status === "proposed" || r.status === "changed") return "Review";
  if (r.status === "agreed") return "Change";
  return "Set a week";
}

/** One person's week, open for a leader: the proposal as it stands, changed if need be, then agreed. */
function WeekReview({
  row,
  studio,
  authTrainer,
  clients,
  tz,
  today,
  onDone,
}: {
  row: TeamWeekRow;
  studio: Studio;
  authTrainer: Trainer | null;
  clients: Client[];
  tz?: string;
  today: string;
  onDone: () => void;
}) {
  const doc = row.doc;
  // A leader reviews the proposal when there is one; otherwise the agreed week.
  const initial = useMemo(() => formOf(doc?.proposed ?? doc?.final ?? null), [doc]);
  const [form, setForm] = useState<WeekForm>(initial);
  // The trainer may propose again while this is open. Untouched, the editor
  // follows them, so a leader never agrees a proposal that has since changed;
  // once the leader has changed something, their changes stay.
  const [base, setBase] = useState<WeekForm>(initial);
  if (base !== initial) {
    if (sameWeek(weekOfForm(form), weekOfForm(base))) setForm(initial);
    setBase(initial);
  }
  const [busy, setBusy] = useState<"agree" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const edited = !sameWeek(weekOfForm(form), weekOfForm(initial));
  const first = row.name.trim().split(/\s+/)[0] || row.name;
  useUnsavedChanges(edited && busy === null, `${first}'s standing week`, { onDiscard: () => setForm(initial) });

  const uid = auth.currentUser?.uid ?? null;
  const signer = uid ? { uid, name: authTrainer?.fullName ?? "" } : null;
  const changes = doc?.final && doc.proposed ? weekChanges(doc.final, doc.proposed) : [];
  const alreadyAgreed = !edited && doc?.final != null && sameWeek(doc.final, weekOfForm(form));

  const agree = async () => {
    if (!signer) return;
    setBusy("agree");
    setError(null);
    try {
      await agreeWeek({ studioId: studio.id, trainerUid: row.uid, trainerId: row.trainerId, trainerName: row.name }, weekOfForm(form), signer);
      // Not busy before the close asks: if dates away are still being typed
      // and the leader keeps editing, the Review must be usable again.
      setBusy(null);
      onDone();
    } catch (err) {
      console.warn("[standing-week] agree failed:", err);
      setError("Couldn't agree it just now. Check the connection and try again.");
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("remove");
    setError(null);
    try {
      await removeWeek(studio.id, row.uid);
      setConfirmRemove(false);
      setBusy(null);
      onDone();
    } catch (err) {
      console.warn("[standing-week] remove failed:", err);
      setError("Couldn't remove it just now. Check the connection and try again.");
      setConfirmRemove(false);
      setBusy(null);
    }
  };

  return (
    <div className="stw-review" role="region" aria-label={`${row.name}'s week`}>
      <h4 className="stw-review__title">{row.name}'s week</h4>
      <p className="stw-status" data-testid="review-status">
        {row.onStaff ? reviewSentence(doc, row.name, tz) : `${row.name} no longer works at ${studio.name}.`}
      </p>
      {changes.length > 0 && (
        <ul className="stw-changes" aria-label="What the change does">
          {changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}
      {row.onStaff && (
        <>
          <p className="stw-lede">
            {doc?.proposed
              ? `This is ${first}'s proposal. Agree it as it is, or change it first — what you agree becomes ${first}'s agreed week.`
              : `${first} hasn't proposed a week here. Set one out, and agree it, if you already know it.`}
          </p>
          <WeekEditor value={form} onChange={setForm} clients={clients} noteLabel="Note" disabled={busy !== null} />
        </>
      )}
      {error && (
        <p className="stw-actions__msg stw-actions__msg--error" role="alert">
          {error}
        </p>
      )}
      <div className="stw-actions">
        {doc && (
          <AdminButton variant="ghost" disabled={busy !== null} onClick={() => setConfirmRemove(true)}>
            Remove this week
          </AdminButton>
        )}
        <AdminButton variant="ghost" disabled={busy !== null} onClick={onDone}>
          Cancel
        </AdminButton>
        {row.onStaff && (
          <AdminButton variant="primary" disabled={!signer || busy !== null || alreadyAgreed} busy={busy === "agree"} onClick={() => void agree()}>
            {edited ? "Agree it as changed" : "Agree this week"}
          </AdminButton>
        )}
      </div>
      <ConfirmDialog
        open={confirmRemove}
        title={`Remove ${first}'s standing week?`}
        body={`Their proposal and the agreed week both go${(doc?.away ?? []).length > 0 ? ", with their dates away," : ""} and the week check stops looking for their regulars. ${row.onStaff ? `${first} can propose a week again from My Profile.` : ""}`}
        confirmLabel="Remove it"
        destructive
        busy={busy === "remove"}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
      {row.onStaff && (
        <AwayEditor
          away={doc?.away}
          today={today}
          tz={tz}
          whose={`${first}'s`}
          disabled={busy !== null}
          onSave={(next) => setAway({ studioId: studio.id, trainerUid: row.uid, trainerId: row.trainerId, trainerName: row.name }, next, today)}
        />
      )}
    </div>
  );
}
