import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { auth } from "../../firebase";
import { studioTodayKey } from "../../lib/studio-time";
import type { Client, Studio, Trainer } from "../../types";
import { AdminBadge, AdminButton, AdminNotice, AdminPanel, AdminRow, AdminRows, ConfirmDialog } from "../admin/primitives";
import { useWeekSchedule } from "../admin/changes/useWeekSchedule";
import { useUnsavedChanges } from "../unsaved-changes";
import { checkWeek, findingSentence, isFreeSlot, stateSentence } from "./check";
import { formOf, teamWeekSentence, weekChanges, weekOfForm, type WeekForm } from "./present";
import { agreeWeek, removeWeek } from "./store";
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
 *   the next seven days   the week's Mindbody bookings against every AGREED
 *                         week (check.ts): the slots that are free, the
 *                         regulars booked somewhere else, and the slots
 *                         someone else is booked in. Read only; nothing is
 *                         written to Mindbody, and an unread day is "can't
 *                         tell", never "open".
 *   each person's week    by name, never ranked: where it stands, and Review
 *                         to agree a proposal as it is or changed first.
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

export function StandingWeeksPanel({ studio, authTrainer, trainers, clients }: StandingWeeksPanelProps) {
  const studioId = studio.id;
  const tz = studio.timezone || undefined;
  const today = studioTodayKey(new Date(), tz);
  const weeks = useStandingWeeks(studioId);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const rows = useMemo(() => teamWeeks(trainers, weeks.docs, studioId), [trainers, weeks.docs, studioId]);
  // Only the weeks of people who still work here are checked: a week left
  // behind by someone who left would list their old regulars as open slots.
  const checked = useMemo(() => rows.filter((r) => r.onStaff && r.doc).map((r) => r.doc!), [rows]);
  // The week's bookings are read only when there is something to check them
  // against: an agreed week, at a studio whose Mindbody is linked.
  const needsBookings = bookingsKnown(studio) && checked.some((d) => d.final);
  const schedule = useWeekSchedule(needsBookings ? studioId : null, today, tz);
  const check = useMemo(
    () =>
      checkWeek({
        docs: checked,
        bookings: schedule.entries,
        today,
        tz,
        read: schedule.loading ? "loading" : schedule.failed ? "failed" : "ready",
        connected: bookingsKnown(studio),
      }),
    [checked, schedule.entries, schedule.loading, schedule.failed, today, tz, studio],
  );
  const waiting = waitingSentence(rows);
  const open = rows.find((r) => r.uid === reviewing) ?? null;

  return (
    <AdminPanel
      title="Standing weeks"
      icon={<CalendarClock className="w-3.5 h-3.5" />}
      subtitle="Each trainer proposes their usual week — their hours and their regulars — on My Profile, and you agree it here. The coming week's Mindbody bookings are checked against the agreed weeks. Nothing is written to Mindbody: the front desk books as always."
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
          ) : check.findings.length === 0 ? (
            <p className="stw-hint" data-testid="week-check-state">
              {stateSentence(check)}
            </p>
          ) : (
            <ul className="stw-findings" aria-label="Where the bookings differ from the agreed weeks">
              {check.findings.map((f) => (
                <li key={`${f.trainerId}-${f.dateKey}-${f.start}-${f.clientId}`} className="stw-finding">
                  <span>{findingSentence(f, tz)}</span>
                  {isFreeSlot(f) && <AdminBadge tone="live">Free slot</AdminBadge>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="stw-people">
          <h3 className="stw-team__head" id="stw-people">
            Each person's week
          </h3>
          {waiting && <AdminNotice tone="info">{waiting}</AdminNotice>}
          {!weeks.loading && !weeks.error && rows.length === 0 && <p className="stw-hint">Nobody works at {studio.name} yet.</p>}
          {!weeks.error && (
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
                      onClick={() => setReviewing(reviewing === r.uid ? null : r.uid)}
                    >
                      {actionLabel(r)}
                    </AdminButton>
                  }
                />
              ))}
            </AdminRows>
          )}
          {open && (
            <WeekReview
              key={open.uid}
              row={open}
              studio={studio}
              authTrainer={authTrainer}
              clients={clients}
              tz={tz}
              onDone={() => setReviewing(null)}
            />
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
  onDone,
}: {
  row: TeamWeekRow;
  studio: Studio;
  authTrainer: Trainer | null;
  clients: Client[];
  tz?: string;
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
      <p className="stw-status">{row.onStaff ? teamWeekSentence(doc, row.name, tz) : `${row.name} no longer works at ${studio.name}.`}</p>
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
        body={`Their proposal and the agreed week both go, and the week check stops looking for their regulars. ${row.onStaff ? `${first} can propose a week again from My Profile.` : ""}`}
        confirmLabel="Remove it"
        destructive
        busy={busy === "remove"}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
