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
 *   - The history: every past focus, who set it, how long it ran, how it
 *     ended, the reward, and its notes. Filter by trainer.
 *
 * CLIENT CODEX (Sep 2026, phase 14). The board is the Coach focuses card on
 * Goals & Focus, drawn with the codex kit — one panel, the kit's buttons,
 * chips and fields, text on the 11 / 12 / 14 / 17 / 30 scale — and its P is a
 * neutral chip (an identity, never a hue). Its props, handlers, testids and
 * button words are unchanged. `historyCollapsed` folds the history behind a
 * 44px summary (the Goals page passes it: Reached already lists what was
 * achieved); left out, the history shows as it always has. The card's head
 * says "Coach focuses · 2 running" and a review date that is still ahead
 * joins a card's line ("review Mar 23").
 *
 * Check-ins are ordinary journal entries carrying `focusId`, so a focus's
 * thread and the client's notes are the same records — never two sources.
 * The count on a card is read from those loaded entries, not the stored
 * `checkInCount`: a check-in by a trainer who does not own the focus cannot
 * bump that counter under the rules, so the entries are the truer number.
 */
import { auth } from "../../firebase";
import React, { useMemo, useState } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  MessageSquarePlus,
  PersonStanding,
  Plus,
  RotateCw,
  Route,
  Target,
  Timer,
  Trophy,
  X,
} from "lucide-react";
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
import type { RecordAnchor } from "../../features/client-profile/profile-nav";
import {
  Btn,
  CardHead,
  Chip,
  ChipButton,
  EmptyLine,
  Eyebrow,
  Meta,
  Picks,
  SelectInput,
  TextArea,
  TextInput,
  anchorProps,
  cls,
  joinDots,
} from "../../features/client-codex/kit";
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
  d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const fmtShort = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const CATEGORY_OPTIONS = FOCUS_CATEGORIES.map((c) => ({ value: c, label: c }));

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
  /** Fold the history behind its summary (Goals & Focus). Default: shown. */
  historyCollapsed?: boolean;
  /** The card a door may land on (Goals & Focus: "goals-focus"). */
  anchor?: RecordAnchor;
  className?: string;
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
  historyCollapsed = false,
  anchor,
  className,
}: FocusBoardProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [draftCategory, setDraftCategory] = useState<FocusCategory>("Posture");
  const [draftIntent, setDraftIntent] = useState("");
  const [draftMachine, setDraftMachine] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [historyTrainer, setHistoryTrainer] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const active = focuses.filter((f) => f.status === "active");
  const ended = useMemo(() => focuses.filter((f) => f.status !== "active"), [focuses]);

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
  const pastTrainers = useMemo(() => focusTrainers(ended), [ended]);
  const shownPast = showAllHistory ? past : past.slice(0, 6);

  const machineOptions = useMemo(() => machines.map((m) => ({ value: m.id, label: m.name })), [machines]);

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

  const history = (
    <div className="gf-history__body">
      {pastTrainers.length > 1 && (
        <div className="cx-chips" role="group" aria-label="Filter history by coach">
          <ChipButton pressed={historyTrainer === null} onClick={() => setHistoryTrainer(null)}>
            Everyone
          </ChipButton>
          {pastTrainers.map((t) => (
            <ChipButton
              key={t.id}
              pressed={historyTrainer === t.id}
              onClick={() => setHistoryTrainer(historyTrainer === t.id ? null : t.id)}
            >
              {t.name} · {t.count}
            </ChipButton>
          ))}
        </div>
      )}

      {past.length === 0 ? (
        <Meta>No focus has ended yet. When one is achieved or retired it is kept here.</Meta>
      ) : (
        <div>
          {shownPast.map((f) => (
            <PastFocusRow key={f.id} focus={f} thread={threads.get(f.id) ?? []} machines={machines} />
          ))}
        </div>
      )}

      {past.length > 6 && (
        <div className="gf-buttons">
          <Btn variant="quiet" onClick={() => setShowAllHistory((v) => !v)}>
            {showAllHistory ? "Show fewer" : `See all ${past.length}`}
          </Btn>
        </div>
      )}
    </div>
  );

  return (
    <section
      className={cls("cx-card gf-focus", className)}
      data-testid="focus-board"
      {...anchorProps(anchor)}
    >
      <CardHead
        eyebrow={`Coach focuses · ${active.length} running`}
        icon={Target}
        actions={
          isCreating ? null : (
            <Btn variant="live" icon={Plus} onClick={() => setIsCreating(true)}>
              Set a focus
            </Btn>
          )
        }
      />

      {isCreating && (
        <div className="gf-inline">
          <Picks label="Pick a P" options={CATEGORY_OPTIONS} value={draftCategory} onChange={(c) => setDraftCategory(c as FocusCategory)} />
          <p className="gf-focus-blurb">{FOCUS_BLURBS[draftCategory]}</p>

          <TextArea
            label="What are you chasing?"
            value={draftIntent}
            onChange={setDraftIntent}
            rows={2}
            placeholder="e.g. Constant tension through the whole set — no dumping at the ends."
          />

          <SelectInput
            label="Target machine"
            value={draftMachine}
            onChange={setDraftMachine}
            options={machineOptions}
            placeholder="Applies everywhere"
          />

          <div className="gf-buttons gf-buttons--end">
            <Btn variant="quiet" onClick={() => setIsCreating(false)}>
              Cancel
            </Btn>
            <Btn variant="solid" onClick={save} disabled={!draftIntent.trim() || isSaving}>
              {isSaving ? "Saving" : "Set focus"}
            </Btn>
          </div>
        </div>
      )}

      {active.length === 0 && !isCreating ? (
        <EmptyLine>No focus running. Set one so the next coach knows what you are working on.</EmptyLine>
      ) : active.length > 0 ? (
        <div className="gf-focus-list">
          {active.map((focus) => (
            <ActiveFocusCard
              key={focus.id}
              focus={focus}
              thread={threads.get(focus.id) ?? []}
              machines={machines}
              isMine={viewerIds.includes(focus.trainerId)}
              canManage={canManageFocus(focus, viewerIds, viewerRole, auth.currentUser?.uid ?? null)}
              onAchieve={onAchieve}
              onExtend={onExtend}
              onRetire={onRetire}
              onCheckIn={onCheckIn}
            />
          ))}
        </div>
      ) : null}

      {/* ------------------------- history ------------------------- */}
      {historyCollapsed ? (
        <details className="gf-history" data-testid="focus-history">
          <summary className="gf-history__summary">
            <ChevronRight className="gf-history__chevron" size={16} aria-hidden="true" />
            <span>
              Focus history · {ended.length}{" "}
              <span className="gf-history__aside">— who set it, how long it ran, how it ended</span>
            </span>
          </summary>
          {history}
        </details>
      ) : (
        <div className="gf-history" data-testid="focus-history">
          <Eyebrow as="h4">Focus history · {ended.length}</Eyebrow>
          <Meta>Who set it, how long it ran, how it ended</Meta>
          {history}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* An active focus                                                     */
/* ------------------------------------------------------------------ */

/** Which of the 4 P's: a neutral chip with its glyph — an identity, never a status. */
function FocusChip({ focus }: { focus: ClientFocus }) {
  const visual = FOCUS_VISUALS[focus.category] || FOCUS_VISUALS.Posture;
  const Icon = ICONS[visual.icon] || PersonStanding;
  return (
    <span className="gf-pchip">
      <Icon size={13} aria-hidden="true" />
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

  const setBy = `Set by ${focus.trainerName || focus.trainerInitials}${
    focus.trainerName && focus.trainerInitials ? ` (${focus.trainerInitials})` : ""
  }`;

  return (
    <article className="gf-focus-card" data-mine={isMine ? "" : undefined} data-testid="active-focus">
      <div className="gf-focus-card__top">
        <FocusChip focus={focus} />
        {machine ? <Chip>{machine.name}</Chip> : null}
        <span className="cx-grow" />
        {isMine && <Chip tone="live">Yours</Chip>}
        {overdue && <Chip tone="warn">Review due</Chip>}
      </div>

      <p className="gf-focus-card__intent">{focus.intent}</p>

      <Meta>
        {joinDots([
          setBy,
          started ? `started ${fmtDay(started)}` : null,
          days === null ? null : `${days} ${days === 1 ? "day" : "days"} active`,
          `${thread.length} ${thread.length === 1 ? "check-in" : "check-ins"}`,
          focus.extensionCount > 0 ? `extended ${focus.extensionCount}×` : null,
          reviewDue && !overdue ? `review ${fmtShort(reviewDue)}` : null,
        ])}
      </Meta>

      <div className="gf-buttons">
        <Btn
          icon={MessageSquarePlus}
          aria-expanded={panel === "checkin"}
          onClick={() => setPanel(panel === "checkin" ? "none" : "checkin")}
        >
          Check in
        </Btn>
        {canManage && (
          <>
            {!focus.isLegacy && (
              <Btn icon={RotateCw} disabled={busy} onClick={() => run(() => onExtend(focus))}>
                Extend
              </Btn>
            )}
            <Btn
              icon={Check}
              aria-expanded={panel === "achieve"}
              onClick={() => setPanel(panel === "achieve" ? "none" : "achieve")}
            >
              Achieved
            </Btn>
            <Btn
              variant="quiet"
              icon={X}
              aria-expanded={panel === "retire"}
              onClick={() => setPanel(panel === "retire" ? "none" : "retire")}
            >
              Retire
            </Btn>
          </>
        )}
      </div>
      {!canManage && <Meta>Only {focus.trainerName || "the coach who set it"} or an owner can close this focus.</Meta>}

      {panel === "checkin" && (
        <div className="gf-inline">
          <TextArea
            label={`Check-in on this ${focus.category.toLowerCase()} focus`}
            value={note}
            onChange={setNote}
            rows={2}
            placeholder="How did it go today?"
          />
          <div className="gf-buttons gf-buttons--end">
            <Btn variant="quiet" onClick={() => setPanel("none")}>
              Cancel
            </Btn>
            <Btn variant="solid" disabled={!note.trim() || busy} onClick={saveCheckIn}>
              {busy ? "Saving" : "Log check-in"}
            </Btn>
          </div>
        </div>
      )}

      {panel === "achieve" && (
        <div className="gf-inline">
          <TextInput
            label="Reward (optional)"
            value={reward}
            maxLength={200}
            placeholder="e.g. Kaizen pin"
            onChange={setReward}
          />
          <div className="gf-buttons gf-buttons--end">
            <Btn variant="quiet" onClick={() => setPanel("none")}>
              Cancel
            </Btn>
            <Btn variant="solid" icon={Trophy} disabled={busy} onClick={() => run(() => onAchieve(focus, reward))}>
              Mark achieved
            </Btn>
          </div>
        </div>
      )}

      {panel === "retire" && (
        <div className="gf-inline">
          <p className="gf-inline__prompt">Retire this focus without it being met? It stays in the history.</p>
          <div className="gf-buttons gf-buttons--end">
            <Btn variant="quiet" onClick={() => setPanel("none")}>
              Keep it
            </Btn>
            <Btn disabled={busy} onClick={() => run(() => onRetire(focus))}>
              Retire
            </Btn>
          </div>
        </div>
      )}

      {thread.length > 0 && (
        <FocusThread thread={thread} open={threadOpen} onToggle={() => setThreadOpen((v) => !v)} />
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
      <button type="button" className="gf-rowbtn" aria-expanded={open} onClick={onToggle}>
        <span>
          {thread.length} {thread.length === 1 ? "note" : "notes"}
        </span>
        <ChevronDown className="gf-rowbtn__chevron" size={16} aria-hidden="true" />
      </button>
      {open && (
        <ol className="gf-thread">
          {thread.map((c) => (
            <li key={c.id}>
              <Meta>
                {c.authorName || c.authorInitials} · {fmtDay(toDate(c.occurredAt))}
              </Meta>
              <p className="gf-thread__body">{c.body}</p>
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
      <div className="gf-focus-card__top">
        <FocusChip focus={focus} />
        <Chip tone={achieved ? "ok" : "neutral"} icon={achieved ? Trophy : undefined}>
          {FOCUS_OUTCOME_LABEL[focus.status]}
        </Chip>
        {focus.rewardNote ? <Chip tone="ok">Reward: {focus.rewardNote}</Chip> : null}
      </div>
      <p className="gf-past__intent">{focus.intent}</p>
      <Meta>
        {joinDots([
          focus.trainerName || focus.trainerInitials,
          `${fmtDay(start)} → ${fmtDay(end)}`,
          formatSpan(focusDaysActive(focus)),
          machine ? machine.name : null,
        ])}
      </Meta>
      {thread.length > 0 && <FocusThread thread={thread} open={open} onToggle={() => setOpen((v) => !v)} />}
    </div>
  );
}
