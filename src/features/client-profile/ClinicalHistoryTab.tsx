/**
 * ACTIVITY ARCHIVE — everything that has already happened.
 *
 * Renamed from "Clinical History" in the client-profile audit (Sep 2026): the
 * tab is a ledger of visits, the Deep Dive and filed reports, not a medical
 * tool.
 * The tab id, this file and the ClinicalView type keep the old name so every
 * saved location and legacy link still resolves.
 *
 * History and Clinical were two tabs over the same past. History drew the
 * visits; Clinical analysed them. A trainer asking "she has been off for
 * three weeks, has her form gone" had to read the calendar in one tab and the
 * form-breakdown heatmap in another, and neither screen mentioned the other.
 *
 * One tab, four segments, and the four are a sentence in order of zoom:
 *
 *   CALENDAR    when she came, at a glance — every month since her first
 *   SESSIONS    the same visits as a list, with what happened in each
 *   DEEP DIVE   the Kaizen Deep Dive (view id `trends`, the Trends segment
 *               until the reporting round): correlations, plateaus, form
 *               breakdown
 *   REPORTS     the filed assessments, newest first
 *
 * Four decisions:
 *
 *   1. CALENDAR AND SESSIONS ARE PROMOTED, NOT NESTED. The History tab had
 *      its own Calendar/List switch. Putting that inside a tab sub-toggle
 *      would be two decisions to reach one screen. They come up a level and
 *      join the row, so there is exactly one switch on the screen — which is
 *      why consolidating removed a hop rather than adding one.
 *
 *   2. THE CLINICAL FACTS ARE NOT A SEGMENT. A client's contraindications are
 *      not something you navigate to; they are the frame every other number on
 *      this tab has to be read inside. So they sit above the sub-toggle, on
 *      every segment, and they never scroll away.
 *
 *   3. THAT STRIP IS READ-ONLY, AND SAYS WHERE TO EDIT. The flags are edited
 *      in exactly one place — Notes & Profile → Body & Pulse, the watch-outs
 *      card (the Medical section until the client codex). A second
 *      editable copy is how two screens start disagreeing about whether a
 *      client has been cleared. It costs no read either: every fact in the
 *      strip is already on the client document the profile is streaming.
 *
 *   4. THE DEEP DIVE KEEPS ITS GATE. It still fetches nothing until the
 *      trainer picks a range and presses Build the Deep Dive, and once built it
 *      stays mounted so switching to the calendar and back does not throw the
 *      report away. Same "keep alive from first use" rule the machine roster
 *      uses in Programming.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { HeartPulse } from "lucide-react";
import type {
  Client,
  ExerciseLog,
  Machine,
  ProgressReport,
  Routine,
  Trainer,
} from "../../types";
import { selectedFlags } from "../clinical-flags/flag-search";
import { studioTodayKey } from "../../lib/studio-time";
import { progressReportDue } from "./cpr-timing";
import { isEstablishedClient } from "../../lib/history-claims";
import { earliestKnownDate } from "../../lib/client-since";
import { priorHistoryOf } from "../../lib/prior-history";
import { ClientHistoryTab } from "../client-history";
import { ClinicalReviewTab } from "../clinical-review";
import { useClientCoverage } from "../../hooks/useClientCoverage";
import { ProgressReportArchive } from "../../components/journal/ProgressReportArchive";
import { ProfileSubnav, type SubnavItem } from "./ProfileSubnav";
import type { ClinicalView } from "./profile-nav";
import { renewalOf } from "../renewals/auto-renew";
import "./profile-nav.css";

export interface ClinicalHistoryTabProps {
  clientId: string;
  client: Client | null | undefined;
  machines: Machine[];
  trainers: Trainer[];
  routines?: Routine[];
  /** Sets the profile already loaded for the Journey grid — reused, not re-read. */
  seedLogs?: ExerciseLog[];
  timeZone?: string;
  progressReports: ProgressReport[];
  onSelectReport: (id: string) => void;
  onDeleteReport: (report: ProgressReport) => void;
  onNewReport: () => void;
  /**
   * The reports above have answered for THIS client (the profile's
   * `progressReportsStatus === "ready"`). Until then the due cue says nothing:
   * unknown is never "no report".
   */
  reportsReady?: boolean;
  /**
   * "No progress reports" for her (Atlas answers, Oct 2 2026): sets or clears
   * `client.noProgressReports`. Absent for someone who may not edit her.
   */
  onSetNoProgressReports?: (off: boolean) => Promise<void> | void;
  /** Jump to Notes & Profile → Body & Pulse, the watch-outs card, where the flags are edited. */
  onEditMedical?: () => void;
  view: ClinicalView;
  onViewChange: (view: ClinicalView) => void;
  disabled?: boolean;
}

/** A flag id resolved to what a trainer needs to read off it in one glance. */
interface FlagChip {
  id: string;
  name: string;
  full: string;
  tone: "alert" | "caution" | "modify";
}

export function ClinicalHistoryTab({
  clientId,
  client,
  machines,
  trainers,
  routines,
  seedLogs,
  timeZone,
  progressReports,
  onSelectReport,
  onDeleteReport,
  onNewReport,
  reportsReady = true,
  onSetNoProgressReports,
  onEditMedical,
  view,
  onViewChange,
  disabled = false,
}: ClinicalHistoryTabProps) {
  // The Deep Dive (view id "trends") is mounted on first visit and kept. See decision 4.
  const [trendsSeen, setTrendsSeen] = useState(view === "trends");
  // "All time" only when Journey holds her whole story (lib/history-claims.ts).
  const { coverage } = useClientCoverage(client);
  useEffect(() => {
    if (view === "trends") setTrendsSeen(true);
  }, [view]);
  const lastClient = useRef(clientId);
  if (lastClient.current !== clientId) {
    lastClient.current = clientId;
    if (trendsSeen && view !== "trends") setTrendsSeen(false);
  }

  // Resolved and ordered by the same code as the Body section's picker, so
  // the common constraints show here too and the most serious comes first.
  const flags = useMemo<FlagChip[]>(
    () =>
      selectedFlags(client?.clinicalFlags)
        .filter((f) => f.category !== "Unknown")
        .map((f) => ({ id: f.id, name: f.name, full: f.full, tone: f.tone })),
    [client?.clinicalFlags],
  );

  // The ONE rule the profile's quiet line uses too (cpr-timing.ts,
  // progressReportDue; Atlas answers, Oct 2 2026): three months after the
  // last full report, off for her with "No progress reports", stronger when
  // her renewal is close (her auto-renewal mark applied, auto-renew.ts).
  const optedOut = client?.noProgressReports === true;
  const cprCue = useMemo(() => {
    if (!client || !reportsReady || progressReports.some((r) => r.clientId !== clientId)) return null;
    return progressReportDue({
      reports: progressReports,
      optedOut,
      renewal: renewalOf(client),
      established: isEstablishedClient({ earliest: earliestKnownDate(client), prior: priorHistoryOf(client) }, new Date()),
      today: studioTodayKey(),
    });
  }, [client, clientId, progressReports, reportsReady, optedOut]);
  const [switching, setSwitching] = useState(false);
  const flipReports = async () => {
    if (!onSetNoProgressReports) return;
    setSwitching(true);
    try {
      await onSetNoProgressReports(!optedOut);
    } finally {
      setSwitching(false);
    }
  };

  const hasMedicalText = Boolean(
    (client?.medicalHistory || "").trim() || (client?.clinicalNotes || "").trim(),
  );

  const strip = (
    <div className="ptab-strip">
      <span className="ptab-strip__title">
        <HeartPulse size={12} strokeWidth={2.6} aria-hidden="true" /> Clinical
      </span>
      {flags.length === 0 && !hasMedicalText ? (
        <span className="ptab-strip__none">
          No clinical flags or medical notes on file.
        </span>
      ) : (
        <>
          {flags.map((f) => (
            <span
              key={f.id}
              className="ptab-strip__chip"
              data-tone={f.tone}
              title={f.full}
            >
              {f.name}
            </span>
          ))}
          {hasMedicalText && (
            <span className="ptab-strip__chip">Medical notes on file</span>
          )}
        </>
      )}
      {onEditMedical && (
        <button type="button" className="ptab-strip__edit" onClick={onEditMedical}>
          Edit in Body & Pulse
        </button>
      )}
    </div>
  );

  const items = useMemo<SubnavItem<ClinicalView>[]>(
    () => [
      { id: "calendar", label: "Calendar", meta: "every month" },
      { id: "sessions", label: "Sessions", meta: "with detail" },
      // The Kaizen Deep Dive (reporting round). The view id stays "trends".
      { id: "trends", label: "Deep Dive", meta: trendsSeen ? "built" : "on request" },
      {
        id: "reports",
        label: "Reports",
        meta:
          progressReports.length === 0
            ? "none yet"
            : `${progressReports.length} on file`,
        flag: progressReports.some((r) => r.status === "Draft"),
      },
    ],
    [progressReports, trendsSeen],
  );

  const onHistory = view === "calendar" || view === "sessions";

  return (
    <div className="ptab">
      <ProfileSubnav
        label="Activity archive views"
        items={items}
        value={view}
        onChange={onViewChange}
        context={strip}
      />

      {/* Calendar and Sessions are ONE mount. They read the same session
          history, and unmounting between them would re-run the listener every
          time a trainer flipped between the shape of the year and the detail
          of a week. */}
      <div className="ptab-pane" hidden={!onHistory}>
        <ClientHistoryTab
          clientId={clientId}
          client={client}
          machines={machines}
          trainers={trainers}
          routines={routines}
          seedLogs={seedLogs}
          timeZone={timeZone}
          disabled={disabled}
          hideHeader
          view={view === "sessions" ? "list" : "calendar"}
          onViewChange={(v) => onViewChange(v === "list" ? "sessions" : "calendar")}
        />
      </div>

      {trendsSeen && client && (
        <div className="ptab-pane" hidden={view !== "trends"}>
          <ClinicalReviewTab
            client={client}
            coverage={coverage}
            machines={machines}
            trainers={trainers}
            timeZone={timeZone}
            disabled={disabled}
          />
        </div>
      )}

      {view === "reports" && (
        <div className="ptab-reports">
          {cprCue && (
            <div className="ptab-cue" role="note" data-level={cprCue.level}>
              <p>{cprCue.text}</p>
              <button type="button" className="ptab-cue__btn" onClick={onNewReport} disabled={disabled}>
                Start a progress report
              </button>
            </div>
          )}
          {/* "Not every single client will want a progress report" (AJ, Oct 2 2026). */}
          {(onSetNoProgressReports || optedOut) && (
            <div className="ptab-reports-switch">
              <span>{optedOut ? "Progress reports are off for this client: nothing reminds you." : "Progress reports are reminded every three months."}</span>
              {onSetNoProgressReports && (
                <button
                  type="button"
                  className="ptab-cue__btn"
                  data-action="no-progress-reports"
                  aria-pressed={optedOut}
                  onClick={() => void flipReports()}
                  disabled={disabled || switching}
                >
                  {optedOut ? "Turn reminders back on" : "No progress reports"}
                </button>
              )}
            </div>
          )}
          <ProgressReportArchive
            reports={progressReports}
            onSelect={onSelectReport}
            onDelete={onDeleteReport}
            onNew={onNewReport}
          />
        </div>
      )}
    </div>
  );
}
