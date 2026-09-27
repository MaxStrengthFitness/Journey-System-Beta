/**
 * The manager's view of the same data.
 *
 * Round: Settings tiers & Task Board, Sep 2026.
 *
 * The brief called out studio managers "who manage administration without
 * actively training clients". For them, a board filtered to "today at this
 * studio" is the wrong default: they think in weeks and in people, not in
 * shifts. But they do not need a second feature — they need the same
 * documents answering a different question.
 *
 * So: no new data model, no second board. Panels that ask things the daily
 * list cannot answer.
 *
 *   Compliance    is closing actually getting done on Sundays?
 *   Initiatives   how is each of the leader's asks going?
 *   Aged out      which asks ran out of time with nobody on them?
 *
 * Compliance is sorted worst-first: the value of a review panel is finding
 * what slipped, and a manager should not have to scan a wall of green to
 * find it. That ranks DUTIES, never people. The unanswered asks and the
 * flagged machines were two more panels here; since the voice-review round
 * (Sep 27 2026) they are Team's Open loops (relay/board/OpenLoops.tsx), one
 * list with one rule, beside this one.
 *
 * THE SEVEN-DAY GRID READS WITHOUT A MOUSE (voice review follow-up, Sep 27
 * 2026). Each square is a coloured dot, and its count lived only in a hover
 * title — which an iPad has no way to show. Every square now carries its
 * day and count for a screen reader, a one-line legend says what the
 * colours mean, and tapping a duty opens the count for each day beneath it.
 * The headings are h4, under Team's "The studio's standards" (h3).
 */

import { Fragment, useState } from "react";
import {
  CalendarCheck,
  ClipboardList,
  Clock,
  Plus,
  Target,
} from "lucide-react";
import { formatStudioDate } from "../../lib/studio-time";
import { useToast } from "../../contexts/ToastContext";
import { useTaskCompliance, type ComplianceCell } from "./useTaskCompliance";
import { useStudioRequests } from "./useStudioRequests";
import { createRequest } from "./requests";
import { PostInitiativeDialog } from "./PostInitiativeDialog";
import { InitiativeRollup } from "./InitiativeRollup";
import { studioRoster } from "./initiatives";
import type { InitiativeTarget } from "./initiatives";
import type { Trainer } from "../../types";
import { newTemplateId, saveTaskTemplate, type TaskAuthor } from "./mutations";
import { categoryLabel } from "./types";
import type { StudioTaskCategory, TaskTemplate } from "./types";

/**
 * STARTER LISTS.
 *
 * Round: Sep 6 2026.
 *
 * The empty-list problem is not that authoring one task is hard - it is that
 * the first one requires a manager to answer six questions (kind, category,
 * recurrence, shift, target, note-required) before anything exists to look
 * at. So the four shapes a studio actually runs are one tap each, and land as
 * ordinary editable templates. Nothing here is a special kind of task; each
 * preset is just a filled-in draft of the same document the full form writes.
 *
 * They are DAILY and Anytime by default. A studio that wants closing-only
 * trash duty edits one field afterwards, which is a smaller ask than getting
 * the shift right before seeing the list exist at all.
 */
const STARTERS: {
  id: string;
  label: string;
  build: (studioId: string) => Omit<TaskTemplate, "id">;
}[] = [
  {
    id: "wipe-machines",
    label: "Wipe down every machine",
    build: (studioId) => ({
      studioId,
      scope: "studio",
      title: "Wipe down every machine",
      detail: "Pads, handles and any contact surface.",
      kind: "machine",
      category: "cleaning",
      target: { kind: "machine", machineIds: "all" },
      recurrence: { type: "daily", shifts: ["pm"] },
      active: true,
    }),
  },
  {
    id: "open-close",
    label: "Opening & closing duties",
    build: (studioId) => ({
      studioId,
      scope: "studio",
      title: "Opening and closing walk-through",
      detail: "Lights, music, front desk, restrooms, water.",
      kind: "facility",
      category: "ops",
      target: { kind: "facility" },
      // Both shifts, which generates a SEPARATE instance for each - closing is
      // not satisfied by having opened. See TaskShift in types.ts.
      recurrence: { type: "daily", shifts: ["am", "pm"] },
      active: true,
    }),
  },
  {
    id: "machine-check",
    label: "Weekly machine check",
    build: (studioId) => ({
      studioId,
      scope: "studio",
      title: "Weekly machine check",
      detail: "Cables, pins, pads, unusual noise. Flag anything off.",
      kind: "machine",
      category: "maintenance",
      target: { kind: "machine", machineIds: "all" },
      recurrence: { type: "weekly", daysOfWeek: [1], shifts: ["any"] },
      // Maintenance without a note is a tick box that proves nothing.
      requiresNote: true,
      active: true,
    }),
  },
  {
    id: "client-followups",
    label: "Client follow-ups",
    build: (studioId) => ({
      studioId,
      scope: "studio",
      title: "Client follow-ups",
      detail: "Anyone who missed last week, and any outstanding InBody scans.",
      kind: "client",
      category: "client-service",
      target: { kind: "client" },
      recurrence: { type: "weekly", daysOfWeek: [1], shifts: ["any"] },
      active: true,
    }),
  },
];

function ago(v: unknown): string {
  const ms = (v as { toMillis?: () => number } | undefined)?.toMillis?.();
  if (!ms) return "just now";
  const hrs = Math.round((Date.now() - ms) / 3600000);
  if (hrs < 1) return "under an hour";
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(dateKey: string): string {
  return formatStudioDate(`${dateKey}T12:00:00`, { weekday: "narrow" });
}

/** "Mon" — the day line under a duty. */
function shortDayName(dateKey: string): string {
  return formatStudioDate(`${dateKey}T12:00:00`, { weekday: "short" });
}

/** "Monday, Sep 14" — what a screen reader says for a day. */
function longDay(dateKey: string): string {
  return formatStudioDate(`${dateKey}T12:00:00`, { weekday: "long", month: "short", day: "numeric" });
}

type CellState = "none" | "flag" | "done" | "miss" | "part";

/** A square's colour: not due, a problem reported, all done, none done, or some. */
function cellState(c: ComplianceCell): CellState {
  if (c.planned === 0) return "none";
  if (c.flagged > 0) return "flag";
  if (c.done === c.planned) return "done";
  if (c.done === 0) return "miss";
  return "part";
}

/** A square in words: "2 of 3 done, 1 with a problem reported", or "not due". */
function cellWords(c: ComplianceCell): string {
  if (c.planned === 0) return "not due";
  const problem = c.flagged ? `, ${c.flagged} with a problem reported` : "";
  return `${c.done} of ${c.planned} done${problem}`;
}

/** A legend square: the grid's own square, beside its words. */
function Swatch({ state }: { state: CellState }) {
  return <span className="stm__cell" data-state={state} aria-hidden style={SWATCH} />;
}

/* Layout only — the look is the grid's own (studio-tasks.css). */
const SWATCH = { verticalAlign: "-2px", marginRight: 2 } as const;
const ROW_BUTTON = { display: "block", width: "100%", minHeight: 40 } as const;
const DAYS_CELL = { textAlign: "left", padding: 0 } as const;
const DAYS_LINE = { paddingTop: "0.25rem" } as const;

export interface ManagePanelProps {
  studioId: string | null;
  templates: TaskTemplate[];
  categories?: StudioTaskCategory[];
  author?: TaskAuthor | null;
  /** Opens the full form on a blank studio template. */
  onNewTask?: () => void;
  /** Opens the full form on an existing one. */
  onEditTask?: (template: TaskTemplate) => void;
  /**
   * Everyone on the app. Filtered here to this studio's own team so an
   * initiative can be measured, and so the composer can say out loud how many
   * pieces of work the ask actually adds up to before it is posted.
   */
  trainers?: Trainer[];
  /**
   * The seven-day read, when the caller already has it (My Studio → Team
   * reads the same week for its people cards). Without it the panel reads
   * for itself.
   */
  compliance?: ReturnType<typeof useTaskCompliance>;
}

export function ManagePanel({
  studioId,
  templates,
  categories,
  author,
  onNewTask,
  onEditTask,
  trainers,
  compliance,
}: ManagePanelProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  // Hooks can't be skipped, so an injected read turns this one off (no studio
  // means no query) rather than running a second copy of it.
  const own = useTaskCompliance(compliance ? null : studioId, templates, 7);
  const { rows, dateKeys, loading, error: complianceError } = compliance ?? own;
  const { open: openRequests, expired } = useStudioRequests(studioId);
  const [busy, setBusy] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [postingBusy, setPostingBusy] = useState(false);
  // The duty whose day-by-day count is open under its row.
  const [openRow, setOpenRow] = useState<string | null>(null);

  const roster = studioRoster(trainers ?? [], studioId);

  /*
   * The initiatives already on the board, in a panel of their own: an
   * initiative is the leader's own ask of the whole team, while the asks
   * nobody has picked up are other people's, and Team lists those in Open
   * loops — different question, different list.
   */
  const initiatives = openRequests.filter((r) => r.kind === "initiative");

  const postInitiative = async (args: {
    title: string;
    detail?: string;
    target: InitiativeTarget;
  }) => {
    if (!studioId || !author) {
      toastError("No active studio.");
      return;
    }
    setPostingBusy(true);
    try {
      await createRequest({
        studioId,
        author,
        kind: "initiative",
        title: args.title,
        detail: args.detail,
        target: args.target,
        // Normal, not low: unlike the floating lane's default, an initiative
        // IS meant to sit near the top until people have done it.
        priority: "normal",
        // Never auto-expires. A deadline lives in target.dueOn and is a
        // statement to the team, not a rule that deletes the ask.
        expiry: "none",
      });
      toastSuccess("Posted. The team will see it on the board.");
      setPosting(false);
    } catch (err) {
      console.error("Initiative post failed:", err);
      toastError("Could not post that. Check your connection and try again.");
    } finally {
      setPostingBusy(false);
    }
  };

  const studioTemplates = [...templates]
    .filter((t) => (t.scope ?? "studio") === "studio")
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        (a.order ?? 999) - (b.order ?? 999) ||
        a.title.localeCompare(b.title),
    );

  const addStarter = async (starter: (typeof STARTERS)[number]) => {
    if (!studioId) return;
    setBusy(starter.id);
    try {
      const body = starter.build(studioId);
      await saveTaskTemplate({
        location: { scope: "studio", studioId },
        template: { ...body, id: newTemplateId(body.title) },
        author: author ?? null,
        isNew: true,
      });
      toastSuccess(`Added "${body.title}".`);
    } catch (err) {
      console.error("Starter task failed:", err);
      toastError("Could not add that. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="stm">
      {posting && (
        <PostInitiativeDialog
          open
          onOpenChange={setPosting}
          saving={postingBusy}
          rosterSize={roster.length}
          onPost={postInitiative}
        />
      )}
      {/* FIRST, because this is the thing a manager came here to do. The
          authoring surface used to live only behind a dialog opened from the
          board's own header - the screen built for the opposite job, closing
          things off on the floor. Same documents, same dialog for the detail;
          it is simply reachable from where the decision is made. */}
      <section className="stm__panel">
        <header className="stm__head">
          <ClipboardList size={14} aria-hidden />
          <h4 className="stm__title">Studio task list</h4>
          <span className="stm__hint">
            {studioTemplates.length === 0
              ? "Nothing yet"
              : `${studioTemplates.filter((t) => t.active).length} active`}
          </span>
        </header>

        {studioTemplates.length === 0 ? (
          <p className="stm__empty">
            Nothing standing yet. These are the duties this studio is held to -
            cleaning, opening and closing, equipment checks, client follow-ups.
            Trainers see them on Relay's Floor on the days they fall due, and
            tick them off there.
          </p>
        ) : (
          <ul className="stm__templates">
            {studioTemplates.map((t) => (
              <li
                key={t.id}
                className="stm__template"
                data-retired={!t.active || undefined}
              >
                <button
                  type="button"
                  className="stm__template-open"
                  onClick={() => onEditTask?.(t)}
                >
                  <span className="stm__item-title">{t.title}</span>
                  <span className="stm__item-sub">
                    {categoryLabel(t.category, categories)} ·{" "}
                    {t.recurrence.type === "weekly"
                      ? (t.recurrence.daysOfWeek ?? []).length === 0
                        ? "Every day"
                        : (t.recurrence.daysOfWeek ?? [])
                            .map((d) => DAY_NAMES[d])
                            .join(", ")
                      : t.recurrence.type === "monthly"
                        ? `Day ${t.recurrence.dayOfMonth} each month`
                        : t.recurrence.type === "once"
                          ? t.recurrence.onDate
                          : "Every day"}
                    {(t.recurrence.shifts ?? ["any"]).includes("am") &&
                      " · opening"}
                    {(t.recurrence.shifts ?? ["any"]).includes("pm") &&
                      " · closing"}
                    {!t.active && " · retired"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="stm__actions">
          <button
            type="button"
            className="stm__preset"
            onClick={() => onNewTask?.()}
            disabled={!studioId}
          >
            <Plus size={13} aria-hidden /> New studio task
          </button>
          {/* One tap each. Six questions before anything exists to look at is
              why an empty list stays empty. */}
          {STARTERS.filter(
            (st) => !studioTemplates.some((t) => t.id === st.id),
          ).map((st) => (
            <button
              key={st.id}
              type="button"
              className="stm__preset"
              onClick={() => void addStarter(st)}
              disabled={!studioId || busy !== null}
            >
              <Plus size={13} aria-hidden /> {st.label}
            </button>
          ))}
        </div>
      </section>

      <section className="stm__panel">
        <header className="stm__head">
          <CalendarCheck size={14} aria-hidden />
          <h4 className="stm__title">Last 7 days</h4>
          <span className="stm__hint">Worst first</span>
        </header>

        {complianceError ? (
          <p className="stm__empty">{complianceError}</p>
        ) : loading && rows.length === 0 ? (
          <p className="stm__empty">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="stm__empty">
            No standing tasks yet. Add some above to start tracking whether
            they get done.
          </p>
        ) : (
          <>
          {/* One line saying what the squares mean. */}
          <p className="stm__empty" data-testid="stm-legend">
            <Swatch state="done" /> all done · <Swatch state="part" /> some
            done · <Swatch state="miss" /> none done · <Swatch state="flag" /> a
            problem reported · <Swatch state="none" /> not due. Tap a duty for
            each day's count.
          </p>
          <div className="stm__scroll">
            <table className="stm__grid">
              <thead>
                <tr>
                  <th scope="col" className="stm__grid-name">
                    Task
                  </th>
                  {dateKeys.map((d) => (
                    <th key={d} scope="col" title={d} aria-label={longDay(d)}>
                      {dayLabel(d)}
                    </th>
                  ))}
                  <th scope="col">Days done</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const open = openRow === r.template.id;
                  const daysId = `stm-days-${r.template.id}`;
                  return (
                    <Fragment key={r.template.id}>
                      <tr>
                        <th scope="row" className="stm__grid-name">
                          {/* The duty is the tap: each day's count, one
                              tap away rather than behind a hover. */}
                          <button
                            type="button"
                            className="stm__template-open"
                            style={ROW_BUTTON}
                            aria-expanded={open}
                            aria-controls={open ? daysId : undefined}
                            onClick={() => setOpenRow(open ? null : r.template.id)}
                          >
                            <span className="stm__grid-title">{r.template.title}</span>
                            <span className="stm__grid-sub">
                              {categoryLabel(r.template.category, categories)}
                            </span>
                          </button>
                        </th>
                        {r.cells.map((c) => (
                          <td key={c.dateKey}>
                            <span
                              className="stm__cell"
                              data-state={cellState(c)}
                              role="img"
                              aria-label={`${longDay(c.dateKey)}: ${cellWords(c)}`}
                              title={cellWords(c)}
                            />
                          </td>
                        ))}
                        <td className="stm__rate">
                          {/* A count, not a rate: "2 of 3" says how little it
                              rests on; "67%" does not (Planner rework). */}
                          {r.dueDays === 0 ? "—" : `${r.doneDays} of ${r.dueDays}`}
                        </td>
                      </tr>
                      {open && (
                        <tr id={daysId}>
                          <td colSpan={dateKeys.length + 2} style={DAYS_CELL}>
                            <p className="stm__empty" style={DAYS_LINE}>
                              {r.cells.map((c) => `${shortDayName(c.dateKey)}: ${cellWords(c)}`).join(" · ")}
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      {/*
        THE MANAGER'S OWN ASKS, above everyone else's.
        This is the panel that makes `kind: "initiative"` reachable at all --
        the board's quick composer excludes the kind on purpose, so before
        this existed an initiative could only be created in Firestore by hand.
      */}
      <section className="stm__panel">
        <header className="stm__head">
          <Target size={14} aria-hidden />
          <h4 className="stm__title">Team initiatives</h4>
          <span className="stm__hint">
            {roster.length > 0
              ? `${roster.length} trainer${roster.length === 1 ? "" : "s"}`
              : "No roster"}
          </span>
        </header>

        {initiatives.length === 0 ? (
          <p className="stm__empty">
            Nothing asked of the team right now.
          </p>
        ) : (
          <ul className="stm__list">
            {initiatives.map((r) => (
              <li key={r.id} className="stm__item">
                <span className="stm__item-title">{r.title}</span>
                <span className="stm__item-sub">
                  {r.target?.perTrainer
                    ? `${r.target.perTrainer} each`
                    : "No number"}
                  {r.target?.dueOn ? ` · by ${r.target.dueOn}` : ""}
                  {` · posted ${ago(r.createdAt)} ago`}
                </span>
                {/*
                  The roll-up is on the card, not behind a tap. For an
                  initiative it IS the content -- an ask that hides who has
                  done it is an ask nobody follows up on.
                */}
                <InitiativeRollup
                  studioId={studioId}
                  requestId={r.id}
                  target={r.target}
                  roster={roster}
                  currentUserId={author?.id ?? null}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="stm__actions">
          <button
            type="button"
            className="stm__preset"
            onClick={() => setPosting(true)}
            disabled={!studioId || !author}
          >
            <Plus size={13} aria-hidden /> Ask the team for something
          </button>
        </div>
      </section>

      {expired.length > 0 && (
        <section className="stm__panel">
          <header className="stm__head">
            <Clock size={14} aria-hidden />
            <h4 className="stm__title">Aged out</h4>
            <span className="stm__hint">Nobody got to these</span>
          </header>
          {/* Off the board, not out of the record. The difference between an
              ask that was answered and one that simply ran out of time is the
              only interesting thing when somebody asks why nobody covered
              Thursday, and it is invisible from the floor by design. */}
          <ul className="stm__list">
            {expired.map((r) => (
              <li key={r.id} className="stm__item">
                <span className="stm__item-title">{r.title}</span>
                <span className="stm__item-sub">
                  {r.createdBy.name} · posted {ago(r.createdAt)} ago ·{" "}
                  {r.claimedBy ? `${r.claimedBy.name} had it` : "never claimed"}
                  {r.replyCount > 0
                    ? ` · ${r.replyCount} replies`
                    : " · no replies"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

    </div>
  );
}
