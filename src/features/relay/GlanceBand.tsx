import type { ReactNode } from "react";
import { ClipboardList, ListChecks, MessageSquare } from "lucide-react";
import "./kit.css";

/**
 * AT A GLANCE — the top of the Planner's Studio tab.
 *
 * Round: Planner rework, Sep 2026. Three facts a trainer between two
 * sessions wants before anything else — how the shift is going, what team
 * work is waiting, and who is asking for help — each a tap from its lane.
 * Counts, never rates; the words say what is counted.
 */

export interface GlanceCounts {
  shiftDone: number;
  shiftTotal: number;
  jobsOpen: number;
  jobsForGrabs: number;
  jobsMine: number;
  requestsOpen: number;
  requestsUrgent: number;
}

function jump(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

export function GlanceBand({ counts, loading, trailing }: { counts: GlanceCounts; loading: boolean; trailing?: ReactNode }) {
  const c = counts;
  const shiftLeft = c.shiftTotal - c.shiftDone;
  return (
    <div className="gb">
      <div className="gb__tiles" role="list" aria-label="Today at a glance">
        <Tile
          target="planner-shift"
          icon={<ListChecks size={16} aria-hidden />}
          label="Today's shift"
          value={loading ? "…" : c.shiftTotal === 0 ? "Nothing due" : `${c.shiftDone} of ${c.shiftTotal} done`}
          note={
            loading || c.shiftTotal === 0 ? "" : shiftLeft === 0 ? "All done — nice work" : `${shiftLeft} still to do`
          }
          tone={!loading && c.shiftTotal > 0 && shiftLeft === 0 ? "done" : "calm"}
          progress={c.shiftTotal > 0 ? c.shiftDone / c.shiftTotal : null}
        />
        <Tile
          target="planner-jobs"
          icon={<ClipboardList size={16} aria-hidden />}
          label="Team jobs"
          value={c.jobsOpen === 0 ? "None open" : `${c.jobsOpen} open`}
          note={
            c.jobsForGrabs > 0
              ? `${c.jobsForGrabs} up for grabs`
              : c.jobsMine > 0
                ? `You're on ${c.jobsMine}`
                : c.jobsOpen > 0
                  ? "Everyone's covered"
                  : ""
          }
          tone={c.jobsForGrabs > 0 ? "hero" : "calm"}
        />
        <Tile
          target="planner-board"
          icon={<MessageSquare size={16} aria-hidden />}
          label="Asks"
          value={c.requestsOpen === 0 ? "All quiet" : `${c.requestsOpen} waiting`}
          note={c.requestsUrgent > 0 ? `${c.requestsUrgent} urgent` : c.requestsOpen > 0 ? "On the board below" : ""}
          tone={c.requestsUrgent > 0 ? "flag" : "calm"}
        />
      </div>
      {trailing && <div className="gb__trailing">{trailing}</div>}
    </div>
  );
}

function Tile({
  target,
  icon,
  label,
  value,
  note,
  tone,
  progress = null,
}: {
  target: string;
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  tone: "calm" | "hero" | "flag" | "done";
  progress?: number | null;
}) {
  return (
    <button type="button" role="listitem" className={`gb__tile gb__tile--${tone}`} onClick={() => jump(target)}>
      <span className="gb__label">
        {icon}
        {label}
      </span>
      <span className="gb__value">{value}</span>
      {progress !== null && (
        <span className={`pk-bar${progress >= 1 ? " pk-bar--done" : ""}`} aria-hidden>
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      )}
      {note && <span className="gb__note">{note}</span>}
    </button>
  );
}
