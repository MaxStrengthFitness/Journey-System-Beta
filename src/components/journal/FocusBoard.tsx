/**
 * The focus board — "what is each coach working on with this client", the 4
 * P's (Posture, Pace, Path, Purpose). The HOW, where Goals are the WHY.
 *
 * A focus is owned by one trainer, carries one of the 4 P's, and accumulates
 * check-ins over time. It ends ACHIEVED (stored as status "passed", with an
 * optional reward) or RETIRED; while active it can be EXTENDED.
 *
 * GOALS & FOCUS ROUND (Sep 2026)
 *   - Several focuses can be active at once, from any trainer: "Set a focus"
 *     is always offered. It used to hide once you had one.
 *   - Each card says who set it, when, how many days it has run and how many
 *     check-ins it has.
 *   - CHECK IN is an inline box on the card that files the note with the
 *     focus id. It used to scroll to the Notes composer in a DIFFERENT mount
 *     of the journal, which never received the focus — so the note saved
 *     without it and the check-in thread stayed empty.
 *   - The history is always visible: every past focus, who set it, how long
 *     it ran, how it ended, the reward, and its notes. Filter by trainer.
 *
 * Check-ins are ordinary journal entries carrying `focusId`, so a focus's
 * thread and the client's notes are the same records — never two sources.
 * The count on a card is read from those loaded entries, not the stored
 * `checkInCount`: a check-in by a trainer who does not own the focus cannot
 * bump that counter under the rules, so the entries are the truer number.
 */
import React, { useMemo, useState } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  Dumbbell,
  MessageSquarePlus,
  PersonStanding,
  Plus,
  RotateCw,
  Route,
  Timer,
  Trophy,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import {
  FOCUS_BLURBS,
  FOCUS_CATEGORIES,
  FOCUS_VISUALS,
  toDate,
  type ClientFocus,
  type FocusCategory,
  type JournalEntry,
} from "../../types/journal";
import type { Machine } from "../../types";
import {
  FOCUS_OUTCOME_LABEL,
  canManageFocus,
  focusDaysActive,
  focusEndDate,
  focusStartDate,
  focusTrainers,
  formatSpan,
  pastFocuses,
} from "../../features/goals/focus";
import "../../features/goals/goals.css";

const ICONS: Record<string, React.ElementType> = {
  PersonStanding,
  Route,
  Timer,
  Brain,
};

const fmtDay = (d: Date | null) =>
  d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

export interface FocusBoardProps {
  focuses: ClientFocus[];
  entries: JournalEntry[];
  machines: Machine[];
  /** Every id the signed-in coach may be recorded under (Auth uid, trainer doc id). */
  viewerIds: string[];
  /** The signed-in coach's role, for the admin/owner override the rules allow. */
  viewerRole?: string | null;
  onCreate: (input: {
    category: FocusCategory;
    intent: string;
    targetMachineId: string | null;
  }) => Promise<void>;
  onAchieve: (focus: ClientFocus, rewardNote: string) => Promise<void> | void;
  onExtend: (focus: ClientFocus) => Promise<void> | void;
  onRetire: (focus: ClientFocus) => Promise<void> | void;
  /** Files a check-in against this focus. Resolves true when it saved. */
  onCheckIn: (focus: ClientFocus, body: string) => Promise<boolean>;
}

export function FocusBoard({
  focuses,
  entries,
  machines,
  viewerIds,
  viewerRole = null,
  onCreate,
  onAchieve,
  onExtend,
  onRetire,
  onCheckIn,
}: FocusBoardProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [draftCategory, setDraftCategory] = useState<FocusCategory>("Posture");
  const [draftIntent, setDraftIntent] = useState("");
  const [draftMachine, setDraftMachine] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [historyTrainer, setHistoryTrainer] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const active = focuses.filter((f) => f.status === "active");

  /** Check-ins per focus, from the entries already loaded. */
  const threads = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const e of entries) {
      if (!e.focusId) continue;
      const list = map.get(e.focusId);
      if (list) list.push(e);
      else map.set(e.focusId, [e]);
    }
    return map;
  }, [entries]);

  const past = useMemo(() => pastFocuses(focuses, historyTrainer), [focuses, historyTrainer]);
  const pastTrainers = useMemo(
    () => focusTrainers(focuses.filter((f) => f.status !== "active")),
    [focuses],
  );
  const shownPast = showAllHistory ? past : past.slice(0, 6);

  const save = async () => {
    if (!draftIntent.trim()) return;
    setIsSaving(true);
    try {
      await onCreate({
        category: draftCategory,
        intent: draftIntent.trim(),
        targetMachineId: draftMachine || null,
      });
      setDraftIntent("");
      setDraftMachine("");
      setIsCreating(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="gf-focus" data-testid="focus-board">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="gf-kicker">Active focuses · {active.length}</h3>
          <p className="gf-muted text-[12px]">
            What each coach is working on with this client. More than one can run at once.
          </p>
        </div>
        {!isCreating && (
          <button type="button" className="gf-btn gf-btn--primary" onClick={() => setIsCreating(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Set a focus
          </button>
        )}
      </div>

      {isCreating && (
        <div className="gf-card">
          <p className="gf-kicker mb-2">Pick a P</p>
          <div className="flex flex-wrap gap-1.5">
            {FOCUS_CATEGORIES.map((c) => {
              const v = FOCUS_VISUALS[c];
              const on = draftCategory === c;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDraftCategory(c)}
                  className={cn(
                    "h-10 rounded-xl border px-3.5 text-[11px] font-black uppercase tracking-wider transition-all",
                    on
                      ? v.chip
                      : "border-slate-200 bg-slate-50 text-muted-foreground hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800",
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <p className="gf-muted mt-1.5 text-[12px] italic">{FOCUS_BLURBS[draftCategory]}</p>

          <textarea
            value={draftIntent}
            onChange={(e) => setDraftIntent(e.target.value)}
            rows={2}
            aria-label="What are you chasing?"
            placeholder="What are you chasing? e.g. Constant tension through the whole set — no dumping at the ends."
            className="gf-input mt-3"
          />

          <select
            value={draftMachine}
            onChange={(e) => setDraftMachine(e.target.value)}
            aria-label="Target machine"
            className="gf-input mt-2"
          >
            <option value="">Applies everywhere</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                Target: {m.name}
              </option>
            ))}
          </select>

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="gf-btn gf-btn--quiet" onClick={() => setIsCreating(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="gf-btn gf-btn--primary"
              onClick={save}
              disabled={!draftIntent.trim() || isSaving}
            >
              {isSaving ? "Saving" : "Set focus"}
            </button>
          </div>
        </div>
      )}

      {active.length === 0 && !isCreating ? (
        <div className="gf-card text-center">
          <p className="gf-kicker">No active focus</p>
          <p className="gf-muted mt-1 text-[12px]">
            Set one so the next coach knows what you are working on.
          </p>
        </div>
      ) : (
        <div className="gf-focus-grid">
          {active.map((focus) => (
            <ActiveFocusCard
              key={focus.id}
              focus={focus}
              thread={threads.get(focus.id) ?? []}
              machines={machines}
              isMine={viewerIds.includes(focus.trainerId)}
              canManage={canManageFocus(focus, viewerIds, viewerRole)}
              onAchieve={onAchieve}
              onExtend={onExtend}
              onRetire={onRetire}
              onCheckIn={onCheckIn}
            />
          ))}
        </div>
      )}

      {/* ------------------------- history ------------------------- */}
      <div className="gf-card" data-testid="focus-history">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="gf-kicker">Focus history · {past.length}</h3>
          <span className="gf-muted text-[11px]">Who set it, how long it ran, how it ended</span>
        </div>

        {pastTrainers.length > 1 && (
          <div className="gf-chiprow mt-2" role="group" aria-label="Filter history by coach">
            <button
              type="button"
              className="gf-chip"
              aria-pressed={historyTrainer === null}
              onClick={() => setHistoryTrainer(null)}
            >
              Everyone
            </button>
            {pastTrainers.map((t) => (
              <button
                key={t.id}
                type="button"
                className="gf-chip"
                aria-pressed={historyTrainer === t.id}
                onClick={() => setHistoryTrainer(historyTrainer === t.id ? null : t.id)}
              >
                {t.name} · {t.count}
              </button>
            ))}
          </div>
        )}

        {past.length === 0 ? (
          <p className="gf-muted mt-2 text-[12px]">
            No focus has ended yet. When one is achieved or retired it is kept here.
          </p>
        ) : (
          <div className="mt-1">
            {shownPast.map((f) => (
              <PastFocusRow key={f.id} focus={f} thread={threads.get(f.id) ?? []} machines={machines} />
            ))}
          </div>
        )}

        {past.length > 6 && (
          <button
            type="button"
            className="gf-btn gf-btn--quiet mt-1"
            onClick={() => setShowAllHistory((v) => !v)}
          >
            {showAllHistory ? "Show fewer" : `See all ${past.length}`}
          </button>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* An active focus                                                     */
/* ------------------------------------------------------------------ */

function FocusChip({ focus }: { focus: ClientFocus }) {
  const visual = FOCUS_VISUALS[focus.category] || FOCUS_VISUALS.Posture;
  const Icon = ICONS[visual.icon] || PersonStanding;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-wider",
        visual.chip,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {focus.category}
    </span>
  );
}

function ActiveFocusCard({
  focus,
  thread,
  machines,
  isMine,
  canManage,
  onAchieve,
  onExtend,
  onRetire,
  onCheckIn,
}: {
  key?: React.Key;
  focus: ClientFocus;
  thread: JournalEntry[];
  machines: Machine[];
  isMine: boolean;
  canManage: boolean;
  onAchieve: FocusBoardProps["onAchieve"];
  onExtend: FocusBoardProps["onExtend"];
  onRetire: FocusBoardProps["onRetire"];
  onCheckIn: FocusBoardProps["onCheckIn"];
}) {
  const [panel, setPanel] = useState<"none" | "checkin" | "achieve" | "retire">("none");
  const [note, setNote] = useState("");
  const [reward, setReward] = useState("");
  const [busy, setBusy] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);

  const started = focusStartDate(focus);
  const days = focusDaysActive(focus);
  const reviewDue = toDate(focus.reviewDueAt);
  const overdue = !!reviewDue && reviewDue.getTime() < Date.now();
  const machine = focus.targetMachineId
    ? machines.find((m) => m.id === focus.targetMachineId)
    : null;

  const run = async (fn: () => Promise<unknown> | unknown) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const saveCheckIn = () =>
    run(async () => {
      const ok = await onCheckIn(focus, note);
      if (ok) {
        setNote("");
        setPanel("none");
        setThreadOpen(true);
      }
    });

  return (
    <article
      className={cn("gf-card", isMine && "gf-focus-card--mine")}
      data-testid="active-focus"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FocusChip focus={focus} />
        <div className="flex flex-wrap items-center gap-1">
          {isMine && <span className="gf-pill gf-pill--live">Yours</span>}
          {overdue && <span className="gf-pill gf-pill--warn">Review due</span>}
        </div>
      </div>

      <p className="mt-2 text-[15px] font-semibold leading-snug">{focus.intent}</p>

      {machine && (
        <span className="gf-pill mt-2">
          <Dumbbell className="h-3 w-3" aria-hidden />
          {machine.name}
        </span>
      )}

      <div className="gf-focus-meta mt-2.5">
        <span>
          Set by <strong>{focus.trainerName || focus.trainerInitials}</strong>
          {focus.trainerName && focus.trainerInitials ? ` (${focus.trainerInitials})` : ""}
        </span>
        <span>Started {fmtDay(started)}</span>
        <span>
          <strong>{days === null ? "—" : days}</strong> {days === 1 ? "day" : "days"} active
        </span>
        <span>
          <strong>{thread.length}</strong> {thread.length === 1 ? "check-in" : "check-ins"}
        </span>
        {focus.extensionCount > 0 && <span>Extended {focus.extensionCount}×</span>}
      </div>

      <div className="gf-actions">
        <button
          type="button"
          className="gf-btn"
          aria-expanded={panel === "checkin"}
          onClick={() => setPanel(panel === "checkin" ? "none" : "checkin")}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden /> Check in
        </button>
        {canManage && (
          <>
            {!focus.isLegacy && (
              <button type="button" className="gf-btn" disabled={busy} onClick={() => run(() => onExtend(focus))}>
                <RotateCw className="h-3.5 w-3.5" aria-hidden /> Extend
              </button>
            )}
            <button
              type="button"
              className="gf-btn gf-btn--ok"
              aria-expanded={panel === "achieve"}
              onClick={() => setPanel(panel === "achieve" ? "none" : "achieve")}
            >
              <Check className="h-3.5 w-3.5" aria-hidden /> Achieved
            </button>
            <button
              type="button"
              className="gf-btn gf-btn--quiet"
              aria-expanded={panel === "retire"}
              onClick={() => setPanel(panel === "retire" ? "none" : "retire")}
            >
              <X className="h-3.5 w-3.5" aria-hidden /> Retire
            </button>
          </>
        )}
      </div>
      {!canManage && (
        <p className="gf-muted mt-1.5 text-[11px]">
          Only {focus.trainerName || "the coach who set it"} or an owner can close this focus.
        </p>
      )}

      {panel === "checkin" && (
        <div className="gf-inline">
          <label className="gf-kicker" htmlFor={`gf-ci-${focus.id}`}>
            Check-in on this {focus.category.toLowerCase()} focus
          </label>
          <textarea
            id={`gf-ci-${focus.id}`}
            className="gf-input"
            rows={2}
            value={note}
            placeholder="How did it go today?"
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="gf-btn gf-btn--quiet" onClick={() => setPanel("none")}>
              Cancel
            </button>
            <button
              type="button"
              className="gf-btn gf-btn--primary"
              disabled={!note.trim() || busy}
              onClick={saveCheckIn}
            >
              {busy ? "Saving" : "Log check-in"}
            </button>
          </div>
        </div>
      )}

      {panel === "achieve" && (
        <div className="gf-inline">
          <label className="gf-kicker" htmlFor={`gf-rw-${focus.id}`}>
            Reward (optional)
          </label>
          <input
            id={`gf-rw-${focus.id}`}
            className="gf-input"
            value={reward}
            maxLength={200}
            placeholder="e.g. Kaizen pin"
            onChange={(e) => setReward(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="gf-btn gf-btn--quiet" onClick={() => setPanel("none")}>
              Cancel
            </button>
            <button
              type="button"
              className="gf-btn gf-btn--ok"
              disabled={busy}
              onClick={() => run(() => onAchieve(focus, reward))}
            >
              <Trophy className="h-3.5 w-3.5" aria-hidden /> Mark achieved
            </button>
          </div>
        </div>
      )}

      {panel === "retire" && (
        <div className="gf-inline">
          <p className="text-[13px]">
            Retire this focus without it being met? It stays in the history.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="gf-btn gf-btn--quiet" onClick={() => setPanel("none")}>
              Keep it
            </button>
            <button type="button" className="gf-btn" disabled={busy} onClick={() => run(() => onRetire(focus))}>
              Retire
            </button>
          </div>
        </div>
      )}

      {thread.length > 0 && (
        <FocusThread
          thread={thread}
          open={threadOpen}
          onToggle={() => setThreadOpen((v) => !v)}
        />
      )}
    </article>
  );
}

function FocusThread({
  thread,
  open,
  onToggle,
}: {
  thread: JournalEntry[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <button type="button" className="gf-rowbtn mt-1" aria-expanded={open} onClick={onToggle}>
        <span className="gf-kicker">
          {thread.length} {thread.length === 1 ? "note" : "notes"}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <ol className="gf-thread">
          {thread.map((c) => (
            <li key={c.id}>
              <span className="gf-muted text-[11px]">
                {c.authorName || c.authorInitials} · {fmtDay(toDate(c.occurredAt))}
              </span>
              <p className="whitespace-pre-line">{c.body}</p>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* A past focus                                                        */
/* ------------------------------------------------------------------ */

function PastFocusRow({
  focus,
  thread,
  machines,
}: {
  key?: React.Key;
  focus: ClientFocus;
  thread: JournalEntry[];
  machines: Machine[];
}) {
  const [open, setOpen] = useState(false);
  const start = focusStartDate(focus);
  const end = focusEndDate(focus);
  const machine = focus.targetMachineId
    ? machines.find((m) => m.id === focus.targetMachineId)
    : null;
  const achieved = focus.status === "passed";

  return (
    <div className="gf-past" data-testid="past-focus">
      <div className="flex flex-wrap items-center gap-2">
        <FocusChip focus={focus} />
        <span className={cn("gf-pill", achieved && "gf-pill--ok")}>
          {achieved && <Trophy className="h-3 w-3" aria-hidden />}
          {FOCUS_OUTCOME_LABEL[focus.status]}
        </span>
        {focus.rewardNote ? <span className="gf-pill gf-pill--ok">Reward: {focus.rewardNote}</span> : null}
      </div>
      <p className="mt-1.5 text-[14px] font-semibold leading-snug">{focus.intent}</p>
      <div className="gf-focus-meta mt-1">
        <span>
          <strong>{focus.trainerName || focus.trainerInitials}</strong>
        </span>
        <span>
          {fmtDay(start)} → {fmtDay(end)}
        </span>
        <span>{formatSpan(focusDaysActive(focus))}</span>
        {machine && <span>{machine.name}</span>}
      </div>
      {thread.length > 0 && (
        <FocusThread thread={thread} open={open} onToggle={() => setOpen((v) => !v)} />
      )}
    </div>
  );
}
