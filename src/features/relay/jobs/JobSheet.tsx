import { useEffect, useState } from "react";
import { Check, ClipboardCheck, Hand, LogOut, RotateCcw, Trash2, UserPlus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "../../../contexts/ToastContext";
import { studioDateKey } from "../../../lib/studio-time";
import type { TaskAuthor } from "../../studio-tasks/mutations";
import { Avatar, PeoplePicker, Toggle, type Person } from "../kit";
import {
  closeProblem,
  dueLabel,
  isOnJob,
  isUpForGrabs,
  jobErrorMessage,
  jobProgress,
  jobTiming,
  peopleLine,
  sortedParts,
} from "./jobs";
import {
  cancelJob,
  closeJob,
  deleteJob,
  joinJob,
  leaveJob,
  reopenJob,
  setJobPart,
  setJobPeople,
} from "./mutations";
import type { TeamJob } from "./types";
import "../kit.css";
import "./jobs.css";

/**
 * ONE TEAM JOB, OPEN — the parts, the people, and closing it.
 *
 * Round: Planner rework, Sep 2026. Anyone at the studio can tick a part or
 * close the job (nothing locks — see ./types.ts). Leaders additionally change
 * who is on it and can cancel or delete it.
 */

export interface JobSheetProps {
  job: TeamJob | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  me: TaskAuthor | null;
  canLead: boolean;
  people: Person[];
  onOpenClient?: (clientId: string) => void;
}

export function JobSheet({ job, open, onOpenChange, me, canLead, people, onOpenClient }: JobSheetProps) {
  const { success: toastSuccess } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState("");
  const [editingPeople, setEditingPeople] = useState(false);
  const [peopleDraft, setPeopleDraft] = useState<Person[]>([]);
  const [openDraft, setOpenDraft] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setClosing(false);
    setNote("");
    setEditingPeople(false);
    setConfirmDelete(false);
  }, [open, job?.id]);

  const todayKey = studioDateKey(new Date()) ?? "";

  const run = async (label: string, work: () => Promise<void>, done?: string) => {
    setBusy(label);
    setError(null);
    try {
      await work();
      if (done) toastSuccess(done);
    } catch (err) {
      console.warn("[jobs] write failed:", err);
      setError(jobErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const body = () => {
    if (!job) return <p className="pk-hint">This job is no longer on the board.</p>;
    const parts = sortedParts(job);
    const progress = jobProgress(job);
    const onIt = isOnJob(job, me?.id);
    const grabs = isUpForGrabs(job);
    const due = dueLabel(job, todayKey);
    const timing = jobTiming(job, todayKey);
    const isOpen = job.status === "open";
    const noteProblem = closeProblem(job, note);

    return (
      <>
        <div className="pk-body">
          {error && (
            <p className="pk-problem" role="alert">
              {error}
            </p>
          )}

          <div className="tj-sheet__tags">
            {job.status === "done" && <span className="pk-tag pk-tag--done">Finished</span>}
            {job.status === "cancelled" && <span className="pk-tag">Cancelled</span>}
            {isOpen && grabs && !onIt && <span className="pk-tag pk-tag--hero">Up for grabs</span>}
            {isOpen && grabs && onIt && <span className="pk-tag pk-tag--live">Open to anyone</span>}
            {due && (
              <span className={`pk-tag${isOpen && timing === "overdue" ? " pk-tag--flag" : isOpen && timing === "today" ? " pk-tag--live" : ""}`}>
                {due}
              </span>
            )}
            <span className="pk-tag">Posted by {job.createdBy.name}</span>
          </div>

          {job.detail && <p className="tj-sheet__detail">{job.detail}</p>}

          <section className="pk-field" aria-labelledby="tj-people">
            <span className="pk-label" id="tj-people">
              Who's on it
            </span>
            {editingPeople ? (
              <>
                <PeoplePicker
                  label="Who's on it"
                  people={people}
                  selected={peopleDraft}
                  meId={me?.id}
                  onChange={setPeopleDraft}
                />
                {peopleDraft.length > 0 && (
                  <Toggle
                    checked={openDraft}
                    onChange={setOpenDraft}
                    title="Anyone else can join"
                    body="Keeps it up for grabs as well."
                  />
                )}
                <div className="tj-row-actions">
                  <button type="button" className="pl__btn" onClick={() => setEditingPeople(false)} disabled={busy !== null}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="pl__btn pl__btn--primary"
                    disabled={busy !== null || !me}
                    onClick={() =>
                      run(
                        "people",
                        async () => {
                          await setJobPeople({ job, assignees: peopleDraft, openToAll: openDraft, author: me! });
                          setEditingPeople(false);
                        },
                        "Saved — anyone newly named has been told.",
                      )
                    }
                  >
                    Save people
                  </button>
                </div>
              </>
            ) : (
              <div className="tj-people">
                {job.assignees.length === 0 ? (
                  <p className="pk-hint">Nobody yet — it's up for grabs.</p>
                ) : (
                  <ul className="tj-people__list">
                    {job.assignees.map((a) => (
                      <li key={a.id} className="tj-person">
                        <Avatar name={a.name} />
                        <span className="tj-person__name">{a.id === me?.id ? `${a.name} (you)` : a.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="tj-row-actions">
                  {isOpen && me && !onIt && grabs && (
                    <button
                      type="button"
                      className="pl__btn pl__btn--primary"
                      disabled={busy !== null}
                      onClick={() =>
                        run("join", () => joinJob(job, me), job.assigneeIds.length ? "You're on it too." : "It's yours.")
                      }
                    >
                      <Hand size={15} aria-hidden />
                      {job.assigneeIds.length ? "I'll help" : "I'll take it"}
                    </button>
                  )}
                  {isOpen && me && onIt && (
                    <button
                      type="button"
                      className="pl__btn"
                      disabled={busy !== null}
                      onClick={() => run("leave", () => leaveJob(job, me), "You've stepped off it.")}
                    >
                      <LogOut size={15} aria-hidden />
                      Step off
                    </button>
                  )}
                  {canLead && isOpen && (
                    <button
                      type="button"
                      className="pl__btn"
                      disabled={busy !== null}
                      onClick={() => {
                        setPeopleDraft(job.assignees);
                        setOpenDraft(job.openToAll);
                        setEditingPeople(true);
                      }}
                    >
                      <UserPlus size={15} aria-hidden />
                      Change people
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          {parts.length > 0 && (
            <section className="pk-field" aria-labelledby="tj-parts">
              <span className="pk-label tj-parts__head" id="tj-parts">
                Parts
                <span className="tabular">
                  {progress.done} of {progress.total}
                </span>
              </span>
              <div className={`pk-bar${progress.allDone ? " pk-bar--done" : ""}`} aria-hidden>
                <span style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
              </div>
              <ul className="tj-parts">
                {parts.map((p) => {
                  const done = Boolean(p.doneBy);
                  const isClient = job.about.kind === "client" && p.refId;
                  return (
                    <li key={p.id} className={`tj-part${done ? " tj-part--done" : ""}`}>
                      <button
                        type="button"
                        className="pl__check"
                        aria-pressed={done}
                        aria-label={done ? `Untick ${p.label}` : `Tick ${p.label}`}
                        disabled={!isOpen || busy !== null || !me}
                        onClick={() => run(`part-${p.id}`, () => setJobPart(job, p.id, done ? null : me))}
                      >
                        {done && <Check size={16} aria-hidden />}
                      </button>
                      <span className="tj-part__main">
                        <span className="tj-part__label">{p.label}</span>
                        {p.doneBy && (
                          <span className="tj-part__by">{p.doneBy.id === me?.id ? "You did this" : `${p.doneBy.name} did this`}</span>
                        )}
                      </span>
                      {isClient && onOpenClient && (
                        <button type="button" className="tj-open" onClick={() => onOpenClient(p.refId!)}>
                          Open
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {job.status === "done" && (
            <section className="tj-closed">
              <p className="tj-closed__line">
                <ClipboardCheck size={16} aria-hidden />
                {job.completedBy ? `${job.completedBy.id === me?.id ? "You" : job.completedBy.name} closed it.` : "Closed."}
              </p>
              {job.closingNote && <p className="tj-closed__note">“{job.closingNote}”</p>}
            </section>
          )}

          {isOpen && closing && (
            <section className="pk-field" aria-labelledby="tj-close">
              <span className="pk-label" id="tj-close">
                {job.requiresNote ? "Closing message (needed)" : "Closing message (optional)"}
              </span>
              <textarea
                className="pk-textarea"
                value={note}
                autoFocus
                maxLength={1000}
                placeholder="What you found, what you did, anything the next person should know."
                onChange={(e) => setNote(e.target.value)}
              />
              {!progress.allDone && parts.length > 0 && (
                <p className="pk-hint">
                  {progress.total - progress.done} part{progress.total - progress.done === 1 ? " is" : "s are"} not ticked.
                  Closing still works — say why in the message.
                </p>
              )}
            </section>
          )}
        </div>

        <div className="pk-foot">
          {canLead && (
            <div className="pk-foot__left">
              {confirmDelete ? (
                <>
                  <button
                    type="button"
                    className="pl__btn pl__btn--danger"
                    disabled={busy !== null}
                    onClick={() =>
                      run(
                        "delete",
                        async () => {
                          await deleteJob(job);
                          onOpenChange(false);
                        },
                        "Deleted.",
                      )
                    }
                  >
                    Delete for good
                  </button>
                  <button type="button" className="pl__btn" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </button>
                </>
              ) : (
                <>
                  {isOpen && (
                    <button
                      type="button"
                      className="pl__btn"
                      disabled={busy !== null}
                      onClick={() => run("cancel", () => cancelJob(job), "Called off — it's off the board.")}
                    >
                      <X size={15} aria-hidden />
                      Call it off
                    </button>
                  )}
                  <button type="button" className="pl__btn" onClick={() => setConfirmDelete(true)} disabled={busy !== null}>
                    <Trash2 size={15} aria-hidden />
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
          {isOpen ? (
            closing ? (
              <>
                <button type="button" className="pl__btn" onClick={() => setClosing(false)} disabled={busy !== null}>
                  Back
                </button>
                <button
                  type="button"
                  className="pl__btn pl__btn--primary"
                  disabled={busy !== null || !me || Boolean(noteProblem)}
                  title={noteProblem ?? undefined}
                  onClick={() =>
                    run(
                      "close",
                      async () => {
                        await closeJob(job, me!, note);
                        onOpenChange(false);
                      },
                      job.notifyOnDone ? `Closed — ${job.createdBy.name.split(" ")[0]} has been told.` : "Closed.",
                    )
                  }
                >
                  <ClipboardCheck size={15} aria-hidden />
                  Close the job
                </button>
              </>
            ) : (
              <button
                type="button"
                className={`pl__btn${progress.allDone ? " pl__btn--primary" : ""}`}
                onClick={() => setClosing(true)}
                disabled={busy !== null || !me}
              >
                <ClipboardCheck size={15} aria-hidden />
                {progress.allDone ? "All done — close it" : "Close the job"}
              </button>
            )
          ) : (
            job.status === "done" && (
              <button type="button" className="pl__btn" disabled={busy !== null} onClick={() => run("reopen", () => reopenJob(job), "Reopened.")}>
                <RotateCcw size={15} aria-hidden />
                Reopen
              </button>
            )
          )}
        </div>
        {isOpen && closing && noteProblem && note.length > 0 && <p className="pk-problem">{noteProblem}</p>}
      </>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="pk-sheet sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="pk-title">{job?.title ?? "Team job"}</DialogTitle>
          {job && (
            <p className="pk-lede">
              {peopleLine(job.assignees, me?.id)}
              {job.assignees.length ? (job.assignees.length === 1 ? " is on it." : " are on it.") : "."}
            </p>
          )}
        </DialogHeader>
        {body()}
      </DialogContent>
    </Dialog>
  );
}
