import { useMemo, useState } from "react";
import { ChevronDown, ClipboardList, Hand, Plus } from "lucide-react";
import { studioDateKey } from "../../../lib/studio-time";
import type { TaskAuthor } from "../../studio-tasks/mutations";
import { Avatars } from "../kit";
import {
  dueLabel,
  isOnJob,
  isUpForGrabs,
  jobProgress,
  jobTiming,
  peopleLine,
  sortJobs,
} from "./jobs";
import { joinJob } from "./mutations";
import type { TeamJob } from "./types";
import "../kit.css";
import "./jobs.css";

/**
 * TEAM JOBS — the lane on the Planner's Studio tab (and, filtered to "mine",
 * on My tasks).
 *
 * Round: Planner rework, Sep 2026. A card per open job: what it is, how far
 * along, who is on it and by when — and, when nobody or anyone may take it,
 * one tap to take it ("pick up floating tasks requested by leadership").
 * Finished jobs from the last fortnight fold away underneath.
 */

export interface TeamJobsLaneProps {
  jobs: TeamJob[];
  loading: boolean;
  error: string | null;
  me: TaskAuthor | null;
  /** Show only jobs the signed-in trainer is on (My tasks). */
  mineOnly?: boolean;
  canPost: boolean;
  onPost?: () => void;
  onOpen: (job: TeamJob) => void;
  onError?: (message: string) => void;
  title?: string;
  /** Hide the lane entirely when there is nothing to show (My tasks). */
  hideWhenEmpty?: boolean;
}

export function TeamJobsLane({
  jobs,
  loading,
  error,
  me,
  mineOnly = false,
  canPost,
  onPost,
  onOpen,
  onError,
  title = "Team jobs",
  hideWhenEmpty = false,
}: TeamJobsLaneProps) {
  const todayKey = studioDateKey(new Date()) ?? "";
  const [showDone, setShowDone] = useState(false);
  const [taking, setTaking] = useState<string | null>(null);

  const visible = useMemo(
    () => sortJobs(mineOnly ? jobs.filter((j) => isOnJob(j, me?.id)) : jobs, me?.id ?? null, todayKey),
    [jobs, mineOnly, me?.id, todayKey],
  );
  const open = visible.filter((j) => j.status === "open");
  const done = visible.filter((j) => j.status === "done");
  const grabs = open.filter((j) => isUpForGrabs(j) && !isOnJob(j, me?.id)).length;

  if (hideWhenEmpty && !loading && !error && open.length === 0) return null;

  const take = async (job: TeamJob) => {
    if (!me) return;
    setTaking(job.id);
    try {
      await joinJob(job, me);
    } catch (err) {
      console.warn("[jobs] take failed:", err);
      onError?.("Couldn't put you on that job. Check the connection and try again.");
    } finally {
      setTaking(null);
    }
  };

  return (
    <section className="tj-lane" aria-labelledby="tj-lane-title" id="planner-jobs">
      <header className="tj-lane__head">
        <h3 className="tj-lane__title" id="tj-lane-title">
          <ClipboardList size={15} aria-hidden />
          {title}
          {open.length > 0 && <span className="tj-lane__count tabular">{open.length}</span>}
        </h3>
        {grabs > 0 && !mineOnly && <span className="pk-tag pk-tag--hero">{grabs} up for grabs</span>}
        {canPost && onPost && (
          <button type="button" className="pl__btn tj-lane__post" onClick={onPost}>
            <Plus size={14} aria-hidden />
            Post a job
          </button>
        )}
      </header>

      {error ? (
        <p className="pk-empty">{error}</p>
      ) : loading && visible.length === 0 ? (
        <p className="pk-empty">Loading team jobs…</p>
      ) : open.length === 0 ? (
        <p className="pk-empty">
          {mineOnly
            ? "You're not on any team jobs."
            : canPost
              ? "No team jobs. Post one when something needs several hands — a deep clean, birthday cards, client outreach."
              : "No team jobs right now. When a leader posts one, it shows here."}
        </p>
      ) : (
        <ul className="tj-cards">
          {open.map((job) => (
            <li key={job.id}>
              <JobCard job={job} me={me} todayKey={todayKey} busy={taking === job.id} onOpen={onOpen} onTake={take} />
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <div className="tj-done">
          <button type="button" className="tj-done__toggle" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
            <ChevronDown size={15} aria-hidden className={showDone ? "tj-chev tj-chev--open" : "tj-chev"} />
            Finished lately <span className="tabular">({done.length})</span>
          </button>
          {showDone && (
            <ul className="tj-cards">
              {done.map((job) => (
                <li key={job.id}>
                  <JobCard job={job} me={me} todayKey={todayKey} busy={false} onOpen={onOpen} onTake={take} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function JobCard({
  job,
  me,
  todayKey,
  busy,
  onOpen,
  onTake,
}: {
  job: TeamJob;
  me: TaskAuthor | null;
  todayKey: string;
  busy: boolean;
  onOpen: (job: TeamJob) => void;
  onTake: (job: TeamJob) => void;
}) {
  const progress = jobProgress(job);
  const hasParts = Object.keys(job.parts).length > 0;
  const onIt = isOnJob(job, me?.id);
  const grabs = isUpForGrabs(job) && !onIt;
  const due = dueLabel(job, todayKey);
  const timing = jobTiming(job, todayKey);
  const isOpen = job.status === "open";
  const pct = Math.round((progress.done / Math.max(1, progress.total)) * 100);

  return (
    <article
      className={`tj-card${onIt ? " tj-card--mine" : ""}${isOpen && timing === "overdue" ? " tj-card--late" : ""}${
        isOpen ? "" : " tj-card--closed"
      }`}
    >
      <button type="button" className="tj-card__main" onClick={() => onOpen(job)}>
        <span className="tj-card__top">
          {onIt && isOpen && <span className="pk-tag pk-tag--live">You're on it</span>}
          {grabs && <span className="pk-tag pk-tag--hero">Up for grabs</span>}
          {!isOpen && <span className="pk-tag pk-tag--done">Finished</span>}
          {due && (
            <span className={`pk-tag${isOpen && timing === "overdue" ? " pk-tag--flag" : isOpen && timing === "today" ? " pk-tag--live" : ""}`}>
              {due}
            </span>
          )}
        </span>
        <span className="tj-card__title">{job.title}</span>
        {hasParts ? (
          <span className="tj-card__progress">
            <span className={`pk-bar${progress.allDone ? " pk-bar--done" : ""}`} aria-hidden>
              <span style={{ width: `${pct}%` }} />
            </span>
            <span className="tj-card__count tabular">
              {progress.done} of {progress.total}
            </span>
          </span>
        ) : null}
        <span className="tj-card__foot">
          <Avatars names={job.assignees.map((a) => a.name)} />
          <span className="tj-card__people">
            {isOpen
              ? peopleLine(job.assignees, me?.id)
              : job.completedBy
                ? `Closed by ${job.completedBy.id === me?.id ? "you" : job.completedBy.name}`
                : "Closed"}
          </span>
        </span>
      </button>
      {grabs && me && (
        <button type="button" className="pl__btn pl__btn--primary tj-card__take" disabled={busy} onClick={() => onTake(job)}>
          <Hand size={14} aria-hidden />
          {busy ? "Taking…" : job.assigneeIds.length ? "I'll help" : "I'll take it"}
        </button>
      )}
    </article>
  );
}
