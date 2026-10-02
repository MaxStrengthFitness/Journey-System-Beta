import { useMemo } from "react";
import { AlertTriangle, Flag, Hand } from "lucide-react";
import type { TaskRequest } from "../../studio-tasks/requests";
import type { TaskInstance } from "../../studio-tasks/types";
import { dayWords, jobTiming } from "../jobs/jobs";
import type { TeamJob } from "../jobs/types";
import { shiftListReports } from "../team/accountability";
import { useRelay } from "./RelayContext";
import { useMachineCare } from "./machine-care-store";

/**
 * OPEN LOOPS — what will embarrass the studio if nobody acts, on My Studio →
 * Team under the studio's standards.
 *
 * Round: Relay, Sep 2026, when it was one of four panels on Relay's old Team
 * tab (this file was TeamCockpit.tsx until the voice review follow-up, Sep
 * 27 2026; the class names still say `tc`). The voice-review round made
 * Team "people and standards" and took out the panels that repeated the Hub
 * and Operations: who's in today (the Hub answers it for any of seven days,
 * floaters included) and the month's client groups with "Route to team" (Operations
 * answers them: Renewals, the attendance watch on the studio's own break
 * days, the week's moments and the Delight queue; the one group with no
 * other home, Routine B off, went with them). Open loops stayed: an ask
 * nobody picked up, a machine somebody flagged and a job past its day are
 * the standard the studio holds itself to.
 *
 * ONE MAINTENANCE RECORD (AJ, Oct 2 2026). A problem reported on a machine
 * row of the shift list now flags the machine in its care record
 * (useTaskActions.closeWithNote), so every machine flag here is the Floor
 * Map's, and clearing it there clears it here and in the Catalog.
 * shiftListReports lists only duties with no machine. The history below:
 * the Floor Map's flag (machineCare) and a
 * problem reported on the shift list (a flagged task row) were two systems
 * until the one maintenance log is built (overlap 5, decided Sep 26); Team
 * used to show them under two headings, so they share this one. A shift-list
 * report is listed from Team's seven days, one row per machine, and not at
 * all for a machine the Floor Map flags (team/accountability.ts,
 * shiftListReports — voice review follow-up, Sep 27 2026: reports used to
 * drop off at midnight). A report is over once the same check on the same
 * machine is done clean on a later day, since nothing here can clear one.
 */

/* ------------------------------------------------------------------ *
 * Open loops
 * ------------------------------------------------------------------ */

const STALE_ASK_MS = 24 * 60 * 60 * 1000;

function millisOf(v: unknown): number | null {
  const t = v as { toMillis?: () => number } | Date | undefined;
  if (t instanceof Date) return t.getTime();
  return typeof (t as { toMillis?: () => number })?.toMillis === "function" ? (t as { toMillis: () => number }).toMillis() : null;
}

const NO_ROWS: TaskInstance[] = [];

export function OpenLoops({
  requests,
  jobs,
  machineNames,
  taskRows = NO_ROWS,
  taskTitle = () => "",
}: {
  requests: TaskRequest[];
  jobs: TeamJob[];
  machineNames: (id: string) => string;
  /**
   * The studio's task rows for Team's seven days, today's live rows last.
   * The flagged ones are the shift list's reports.
   */
  taskRows?: readonly (TaskInstance | null | undefined)[];
  /** A standing task's title, for a report with no machine. */
  taskTitle?: (templateId: string) => string;
}) {
  const relay = useRelay();
  const care = useMachineCare(relay.studioId);
  const now = Date.now();
  const todayKey = relay.now.todayKey;
  const unanswered = requests.filter((r) => r.status === "open" && !r.claimedBy && r.kind !== "initiative" && (millisOf(r.createdAt) ?? now) < now - STALE_ASK_MS);
  const flagged = Object.values(care.byMachineId).filter((c) => c.flag);
  const overdue = jobs.filter((j) => j.status === "open" && jobTiming(j, todayKey) === "overdue");
  // One row per machine, and none for a machine the Floor Map already flags.
  const flaggedKey = flagged.map((c) => c.machineId).sort().join(",");
  const shiftReports = useMemo(
    () => shiftListReports(taskRows, new Set(flaggedKey ? flaggedKey.split(",") : [])),
    [taskRows, flaggedKey],
  );
  const total = unanswered.length + flagged.length + shiftReports.length + overdue.length;

  return (
    <section className="tc" aria-labelledby="tc-loops">
      <header className="rl-h">
        {/* h4: under Team's "The studio's standards" (h3). */}
        <h4 className="rl-h__title" id="tc-loops">
          <AlertTriangle size={13} aria-hidden /> Open loops
        </h4>
        <span className="rl-h__sub">{total === 0 ? "nothing hanging" : `${total} to close`}</span>
      </header>
      {total === 0 ? (
        <p className="rk-empty">Every ask has a name on it, nothing is flagged, no job is overdue.</p>
      ) : (
        <ul className="tc__loops">
          {unanswered.map((r) => (
            <li key={r.id} className="tc__loop">
              <span className="tc__loop-kind">Unanswered ask</span>
              <span className="tc__loop-title">{r.title}</span>
              <span className="tc__loop-sub">from {r.createdBy.name.split(" ")[0]}</span>
              <button type="button" className="pl__btn" onClick={() => relay.openCapture({ destination: "someone", text: r.title })}>
                <Hand size={13} aria-hidden /> Hand it
              </button>
            </li>
          ))}
          {flagged.map((c) => (
            <li key={c.machineId} className="tc__loop">
              <span className="tc__loop-kind">
                <Flag size={11} aria-hidden /> Flagged machine
              </span>
              <span className="tc__loop-title">{machineNames(c.machineId) || c.machineId}</span>
              <span className="tc__loop-sub">
                {c.flag!.note} — {c.flag!.by.name.split(" ")[0]}
              </span>
              <button type="button" className="pl__btn" onClick={() => relay.openCapture({ destination: "someone", text: `${machineNames(c.machineId) || c.machineId}: ${c.flag!.note}`, machineIds: [c.machineId] })}>
                <Hand size={13} aria-hidden /> Hand it
              </button>
            </li>
          ))}
          {shiftReports.map((r) => (
            <li key={r.key} className="tc__loop">
              <span className="tc__loop-kind">
                <Flag size={11} aria-hidden /> Reported on the shift list
              </span>
              <span className="tc__loop-title">
                {/* The machine; else the duty as the row recorded it, which
                    outlives a renamed or deleted template; else today's
                    template title. */}
                {(r.machineId && machineNames(r.machineId)) || r.title || taskTitle(r.templateId) || r.machineId || "A studio task"}
              </span>
              <span className="tc__loop-sub">
                {r.note || "A trainer reported a problem."} — {r.by?.name ? `${r.by.name.split(" ")[0]}, ` : ""}
                {dayWords(r.dateKey, todayKey)}
              </span>
            </li>
          ))}
          {overdue.map((j) => (
            <li key={j.id} className="tc__loop">
              <span className="tc__loop-kind">Overdue job</span>
              <span className="tc__loop-title">{j.title}</span>
              <span className="tc__loop-sub">was due {j.dueOn}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* The studio's day and its deep-clean interval used to be edited here
   (StandardsHours). They are My Studio → Studio's now (My Studio round,
   Sep 2026, features/my-studio/StudioSection), on the same dirty-tracked save
   bar as the rest of the studio's record. */
