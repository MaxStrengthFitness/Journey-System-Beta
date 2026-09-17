/**
 * The Pulse snapshot on the Kaizen blueprint step (reporting round, Sep
 * 2026 — audit action item A: the Assessment is out of the report).
 *
 * The Pulse is the living record on the client's profile. The report no
 * longer asks its questions; it shows the most recent FINALIZED Pulse,
 * read-only, so the trainer has the whole picture while writing the goal.
 * Nothing here writes anything, and nothing here navigates — "Update Pulse
 * in the client's record" is a sentence, not a button, because the report
 * is written in admin time and the Pulse is updated on the floor.
 *
 * Three states, honestly: still reading; couldn't read (unknown, never
 * "none"); read — with a Pulse or without one.
 */
import { HeartPulse } from "lucide-react";
import {
  SubjectiveDashboard,
  type HistoryPoint,
  type PreviousAssessmentRef,
} from "../subjective-report";
import "./progress-report.css";

export type PulseSnapshotState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      /** The most recent finalized Pulse, or null when the client has none. */
      pulse: PreviousAssessmentRef | null;
      /** The one before it, for the dashboard's "since last time". */
      previous: PreviousAssessmentRef | null;
      /** Older ones still, oldest first, for the trend line. */
      history: HistoryPoint[];
    };

const longDate = (iso: string): string => {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

export function PulseSnapshot({
  state,
  machines,
}: {
  state: PulseSnapshotState;
  machines?: { id?: string; name: string }[];
}) {
  const pulse = state.status === "ready" ? state.pulse : null;
  return (
    <section className="pr-pulse" data-testid="pulse-snapshot" data-status={state.status}>
      <div className="pr-pulse__head">
        <h3 className="pr-pulse__title">
          <HeartPulse className="h-4 w-4" />
          {pulse ? (
            <span>
              Pulse · as of {longDate(pulse.date)}
              {pulse.trainerName ? ` · by ${pulse.trainerName}` : ""}
              {pulse.enteredBy === "client" ? " · in their own words" : ""}
            </span>
          ) : (
            <span>Pulse</span>
          )}
        </h3>
        <p className="pr-pulse__hint">Read-only here. Update Pulse in the client's record.</p>
      </div>

      {state.status === "loading" && <p className="pr-pulse__empty">Reading their Pulse…</p>}
      {state.status === "error" && (
        <p className="pr-pulse__empty">Couldn't read their Pulse just now. The report still works; come back to this step.</p>
      )}
      {state.status === "ready" && !pulse && (
        <p className="pr-pulse__empty">No Pulse on file yet — nothing is printed.</p>
      )}
      {state.status === "ready" && pulse && (
        <div className="pr-pulse__body">
          <SubjectiveDashboard
            assessment={pulse.assessment}
            previous={state.previous}
            history={state.history}
            machines={machines}
          />
        </div>
      )}
    </section>
  );
}
