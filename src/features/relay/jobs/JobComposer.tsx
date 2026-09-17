import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, ClipboardList, Dumbbell, UsersRound } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "../../../contexts/ToastContext";
import { useStudioMachines } from "../../../hooks/useStudioMachines";
import { studioDateKey } from "../../../lib/studio-time";
import type { Client, Trainer } from "../../../types";
import type { TaskAuthor } from "../../studio-tasks/mutations";
import { categoryLabel, type StudioTaskCategory } from "../../studio-tasks/types";
import { ClientPicker, type PickedClient } from "../ClientPicker";
import { PeoplePicker, Seg, Toggle, type Person } from "../kit";
import { blankJobDraft, dayWords, dueChoices, jobErrorMessage, jobSummary, validateJobDraft, type JobProblem } from "./jobs";
import { postTeamJob } from "./mutations";
import type { JobAboutKind, JobDraft } from "./types";
import "../kit.css";
import "./jobs.css";

/**
 * POST A TEAM JOB — the leader's composer.
 *
 * Round: Planner rework, Sep 2026. Four questions, in the order a head
 * trainer thinks them: what is it, what is it about (the parts), who is on it,
 * and by when. The sentence at the bottom says what posting will do before
 * anything is written, the same "review line" the task wizard ends on.
 *
 * Always mounted with `open` controlled — see StudioHubView on why a Base UI
 * dialog is never conditionally rendered.
 */

export interface JobComposerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studioId: string | null;
  author: TaskAuthor | null;
  authTrainer: Trainer | null;
  /** The studio's team, for naming people. */
  people: Person[];
  /** Today's clients, offered before a search. */
  clients: Client[];
  categories: StudioTaskCategory[];
  onPosted?: (jobId: string) => void;
  /** Start from these values — "Post a job for Marcus" names Marcus. */
  preset?: Partial<JobDraft> | null;
}

const ABOUT: { value: JobAboutKind; label: string; icon: ReactNode }[] = [
  { value: "facility", label: "The studio", icon: <Building2 size={15} aria-hidden /> },
  { value: "machine", label: "Machines", icon: <Dumbbell size={15} aria-hidden /> },
  { value: "client", label: "Clients", icon: <UsersRound size={15} aria-hidden /> },
];

/** A sensible category for each subject; the leader can change it. */
const DEFAULT_CATEGORY: Record<JobAboutKind, string> = {
  facility: "ops",
  machine: "cleaning",
  client: "client-service",
};

export function JobComposer({
  open,
  onOpenChange,
  studioId,
  author,
  authTrainer,
  people,
  clients,
  categories,
  onPosted,
  preset = null,
}: JobComposerProps) {
  const { success: toastSuccess } = useToast();
  const { machines } = useStudioMachines(open ? studioId : null, { bridgeWhenRosterEmpty: true });
  const todayKey = studioDateKey(new Date()) ?? "";
  const [draft, setDraft] = useState<JobDraft>(blankJobDraft);
  const [partsText, setPartsText] = useState("");
  const [pickedClients, setPickedClients] = useState<PickedClient[]>([]);
  const [problems, setProblems] = useState<JobProblem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [customDate, setCustomDate] = useState(false);

  // A fresh form each time it opens.
  useEffect(() => {
    if (!open) return;
    setDraft({ ...blankJobDraft(), ...(preset ?? {}) });
    setPartsText("");
    setPickedClients([]);
    setProblems([]);
    setError(null);
    setCustomDate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const edit = (patch: Partial<JobDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setProblems([]);
    setError(null);
  };

  const setAboutKind = (kind: JobAboutKind) =>
    edit({
      about:
        kind === "client"
          ? {
              kind,
              clientIds: pickedClients.map((c) => c.id),
              clientNames: Object.fromEntries(pickedClients.map((c) => [c.id, c.name])),
            }
          : kind === "machine"
            ? { kind, machineIds: draft.about.kind === "machine" ? draft.about.machineIds : [] }
            : { kind },
      category: DEFAULT_CATEGORY[kind],
    });

  const machineName = useMemo(() => {
    const m = new Map(machines.map((x) => [x.machineId, x.name]));
    return (id: string) => m.get(id) ?? "";
  }, [machines]);

  // The draft as it would be posted — parts typed one per line.
  const posted: JobDraft = useMemo(
    () => ({ ...draft, partLabels: draft.about.kind === "facility" ? partsText.split("\n") : [] }),
    [draft, partsText],
  );
  const summary = jobSummary(posted, todayKey, { meId: author?.id });
  const problemFor = (f: JobProblem["field"]) => problems.find((p) => p.field === f)?.message;

  const submit = async () => {
    if (!studioId || !author) return;
    const issues = validateJobDraft(posted, todayKey);
    if (issues.length) {
      setProblems(issues);
      return;
    }
    setBusy(true);
    try {
      const id = await postTeamJob({ studioId, draft: posted, author, machineName });
      toastSuccess(posted.assignees.length ? "Posted — they've been told." : "Posted — it's up for grabs.");
      onOpenChange(false);
      onPosted?.(id);
    } catch (err) {
      console.warn("[jobs] post failed:", err);
      setError(jobErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const choices = dueChoices(todayKey);
  const machineIds = draft.about.kind === "machine" ? draft.about.machineIds : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="pk-sheet sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pk-title">
            <ClipboardList size={18} aria-hidden />
            Post a team job
          </DialogTitle>
          <p className="pk-lede">
            One piece of work the team shares — a deep clean, next month's birthday cards, calls to clients who have gone
            quiet. Name people, or leave it up for grabs.
          </p>
        </DialogHeader>

        <div className="pk-body">
          {error && (
            <p className="pk-problem" role="alert">
              {error}
            </p>
          )}

          <label className="pk-field">
            <span className="pk-label">The job</span>
            <input
              className="pk-input"
              value={draft.title}
              autoFocus
              maxLength={160}
              placeholder="Deep clean before the open house"
              onChange={(e) => edit({ title: e.target.value })}
              aria-invalid={Boolean(problemFor("title"))}
            />
            {problemFor("title") && <p className="pk-problem">{problemFor("title")}</p>}
          </label>

          <label className="pk-field">
            <span className="pk-label">Instructions (optional)</span>
            <textarea
              className="pk-textarea"
              value={draft.detail}
              maxLength={2000}
              placeholder="What good looks like, where the supplies are, who to ask."
              onChange={(e) => edit({ detail: e.target.value })}
            />
          </label>

          <div className="pk-field">
            <span className="pk-label">What is it about</span>
            <Seg label="What is it about" value={draft.about.kind} options={ABOUT} onChange={setAboutKind} />
          </div>

          {draft.about.kind === "facility" && (
            <label className="pk-field">
              <span className="pk-label">Parts to tick off (optional, one per line)</span>
              <textarea
                className="pk-textarea"
                value={partsText}
                placeholder={"Mirrors\nBathrooms\nFront desk\nWater station"}
                onChange={(e) => {
                  setPartsText(e.target.value);
                  setProblems([]);
                }}
              />
              <p className="pk-hint">
                Parts let several people chip away at it — each ticks what they did. Leave it empty for one piece of
                work.
              </p>
              {problemFor("parts") && <p className="pk-problem">{problemFor("parts")}</p>}
            </label>
          )}

          {draft.about.kind === "machine" && (
            <div className="pk-field">
              <span className="pk-label">Which machines — one part each</span>
              <div className="pk-chips">
                <button
                  type="button"
                  className="pk-chip"
                  onClick={() =>
                    edit({
                      about: {
                        kind: "machine",
                        machineIds: machineIds.length === machines.length ? [] : machines.map((m) => m.machineId),
                      },
                    })
                  }
                >
                  {machineIds.length === machines.length && machines.length > 0 ? "Clear all" : "Every machine"}
                </button>
              </div>
              <div className="pk-chips pk-chips--scroll" role="group" aria-label="Machines">
                {machines.map((m) => {
                  const on = machineIds.includes(m.machineId);
                  return (
                    <button
                      key={m.machineId}
                      type="button"
                      className="pk-chip"
                      aria-pressed={on}
                      onClick={() =>
                        edit({
                          about: {
                            kind: "machine",
                            machineIds: on ? machineIds.filter((x) => x !== m.machineId) : [...machineIds, m.machineId],
                          },
                        })
                      }
                    >
                      {m.name}
                    </button>
                  );
                })}
                {machines.length === 0 && <p className="pk-hint">No equipment is set up for this studio yet.</p>}
              </div>
              {problemFor("about") && <p className="pk-problem">{problemFor("about")}</p>}
            </div>
          )}

          {draft.about.kind === "client" && (
            <div className="pk-field">
              <span className="pk-label">Which clients — one part each</span>
              <ClientPicker
                roster={clients}
                picked={pickedClients}
                authTrainer={authTrainer}
                activeStudioId={studioId}
                onChange={(next) => {
                  setPickedClients(next);
                  edit({
                    about: {
                      kind: "client",
                      clientIds: next.map((c) => c.id),
                      clientNames: Object.fromEntries(next.map((c) => [c.id, c.name])),
                    },
                  });
                }}
              />
              <p className="pk-hint">
                The app never contacts clients — this is the team's list of who to reach, and who reached them.
              </p>
              {problemFor("about") && <p className="pk-problem">{problemFor("about")}</p>}
            </div>
          )}

          <div className="pk-field">
            <span className="pk-label">Who's on it</span>
            <PeoplePicker
              label="Who's on it"
              people={people}
              selected={draft.assignees}
              meId={author?.id}
              onChange={(assignees) => edit({ assignees })}
            />
            {draft.assignees.length > 0 ? (
              <Toggle
                checked={draft.openToAll}
                onChange={(openToAll) => edit({ openToAll })}
                title="Anyone else can join"
                body="Shows as up for grabs too, so a trainer with a gap can help."
              />
            ) : (
              <p className="pk-hint">Nobody named: it shows as up for grabs until someone takes it.</p>
            )}
          </div>

          <div className="pk-field">
            <span className="pk-label">By when</span>
            <div className="pk-chips" role="group" aria-label="By when">
              <button
                type="button"
                className="pk-chip"
                aria-pressed={!draft.dueOn && !customDate}
                onClick={() => {
                  setCustomDate(false);
                  edit({ dueOn: null });
                }}
              >
                No date
              </button>
              {choices.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  className="pk-chip"
                  aria-pressed={!customDate && draft.dueOn === c.dateKey}
                  onClick={() => {
                    setCustomDate(false);
                    edit({ dueOn: c.dateKey });
                  }}
                >
                  {c.label}
                </button>
              ))}
              <button type="button" className="pk-chip" aria-pressed={customDate} onClick={() => setCustomDate(true)}>
                Pick a date
              </button>
            </div>
            {customDate && (
              <input
                type="date"
                className="pk-input"
                min={todayKey}
                value={draft.dueOn ?? ""}
                onChange={(e) => edit({ dueOn: e.target.value || null })}
                aria-label="Due date"
              />
            )}
            {draft.dueOn && !customDate && <p className="pk-hint">Due {dayWords(draft.dueOn, todayKey)}.</p>}
            {problemFor("dueOn") && <p className="pk-problem">{problemFor("dueOn")}</p>}
          </div>

          <label className="pk-field">
            <span className="pk-label">Category</span>
            <select className="pk-select" value={draft.category} onChange={(e) => edit({ category: e.target.value })}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryLabel(c.id, categories)}
                </option>
              ))}
            </select>
          </label>

          <Toggle
            checked={draft.requiresNote}
            onChange={(requiresNote) => edit({ requiresNote })}
            title="Ask for a closing message"
            body="Whoever closes it says what they found or did — for inspections and outreach."
          />
          <Toggle
            checked={draft.notifyOnDone}
            onChange={(notifyOnDone) => edit({ notifyOnDone })}
            title="Tell me when it's finished"
            body="In your bell only. Nothing is emailed or texted."
          />

          <p className="pk-summary" aria-live="polite">
            {summary}
          </p>
        </div>

        <div className="pk-foot">
          <button type="button" className="pl__btn" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="pl__btn pl__btn--primary" onClick={submit} disabled={busy || !studioId || !author}>
            {busy ? "Posting…" : "Post the job"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
