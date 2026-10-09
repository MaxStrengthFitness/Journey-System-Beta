/**
 * ROUTINES TAB — the two prescriptions, read like the Equipment rail.
 *
 * Why it looks like this
 * ----------------------
 * Before, each routine was a rounded card with a 48px letter tile, a
 * three-line header and one padded pill per machine. Eight machines took
 * 600px; the trainer scrolled to see Routine B at all. The Equipment tab had
 * already solved the same problem with a dense list — hairline rows, one
 * bold uppercase name, the numbers on the right, the setup chips inline — so
 * this tab borrows that vocabulary wholesale (same tokens, same row anatomy)
 * and both routines now fit on one iPad screen side by side.
 *
 * What a row says, left to right: order · machine · setup chips · the load
 * and the last outcome. That is the sentence a trainer reads before walking
 * a client to a machine, and it is the same sentence the Journey grid says
 * one tab over, so nothing needs re-learning.
 *
 * The component is a pure function of profile state. Every mutation
 * (edit, use today, toggle B) is a callback back into ClientProfileView,
 * which already owns the Firestore writes and the reason dialog.
 */
import { memo, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Pencil, PlayCircle, Sparkles } from "lucide-react";
import type { Client, ClientMachineSetting, ExerciseLog, Machine, Routine, RoutineAdjustment, Trainer, WorkoutSession } from "../../types";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { aRunsLine, aRunsSince, bSwitchStep, plannedBTarget } from "../routine-plan/b-routine";
import { planFromRoutine, signedChange } from "../routine-plan/lineup";
import { bModeOf, type BSide } from "../routine-plan/ui/BColumn";
import { BPlanView } from "../routine-plan/ui/BPlanView";
import { machineNamer, type PlanHost } from "../routine-plan/ui/host";
import { PlanLineup } from "../routine-plan/ui/PlanLineup";
import { StartPlanPanel } from "../routine-plan/ui/StartPlanPanel";
import { RoutineRowItem } from "./RoutineRowItem";
import {
  relativeTime,
  shortStamp,
  templateDrift,
  type RoutineChange,
  type RoutineName,
  type RoutineRow,
} from "./routine-rows";
import { useRoutinesModel, type RoutinesModel } from "./useRoutinesModel";
// The row borrows the All Machines rail's pills and chips outright (client-
// profile audit: "unify the design language between the routine viewer and
// the all machines list"), so the two lists cannot drift apart again.
import "../equipment/equipment.css";
import "./routines.css";

export interface RoutinesTabProps {
  client: Client | null | undefined;
  clientId: string;
  routines: Routine[];
  machines: Machine[];
  clientSettings: Record<string, ClientMachineSetting>;
  allLogs: ExerciseLog[];
  sessions: WorkoutSession[];
  adjustments: RoutineAdjustment[];
  trainers: Trainer[];
  /**
   * Routine id the next session runs: the running session's own, else the
   * Active Session's alternation (features/routines/next-routine.ts).
   */
  selectedRoutineTodayId: string | null;
  isBActive: boolean;
  onEdit: (name: RoutineName) => void;
  onToggleB: (checked: boolean) => void;
  /** Tapping a machine row — the profile opens its settings sheet. */
  onSelectMachine?: (machineId: string) => void;
  disabled?: boolean;
  /**
   * Which prescription to draw. "both" (the default) is the original
   * side-by-side tab. A single routine is what the Programming tab renders
   * behind its sub-toggle: one panel at full width, and the Changes list
   * filtered to that routine, because "8 machines side by side with 8 more"
   * is exactly the density problem the sub-toggle exists to remove.
   */
  view?: RoutineName | "both";
  /**
   * Hide the summary sentence. Programming prints the same facts in its own
   * context line above the sub-toggle, where they stay put while the trainer
   * switches between A, B and the roster.
   */
  hideSummary?: boolean;
  /**
   * A model computed by the parent. Omit and the tab computes its own — which
   * is what keeps this component mountable on its own.
   */
  model?: RoutinesModel;
  /**
   * Routine A's plan (the first-session design round, Oct 8 2026): what the
   * profile hands Programming so Routine A can show Start a plan, the
   * Lineup, or "Add a plan". Omit it and Routine A draws as it always has.
   * Only the single Routine A view draws the plan; since Round 2 (B molded
   * in) the single Routine B view draws B's plan beside A too.
   */
  plan?: PlanHost | null;
}

/* ------------------------------------------------------------------ *
 * One routine panel
 * ------------------------------------------------------------------ */

interface HeadProps {
  name: RoutineName;
  routine: Routine;
  latest: RoutineChange | null;
  active: boolean;
  isToday: boolean;
  /** "Used last on Sep 22", from Journey's sessions; null says nothing. */
  usedLast: string | null;
  disabled: boolean;
  onEdit: () => void;
  onToggle?: (checked: boolean) => void;
}

/** A routine panel's head: its letter, name, the last change, B's switch, Edit. The plan's Lineup draws the same head. */
function RoutineHead({ name, routine, latest, active, isToday, usedLast, disabled, onEdit, onToggle }: HeadProps) {
  const letter = name.endsWith("B") ? "B" : "A";
  const drift = templateDrift(routine);
  const count = routine.machineIds.length;
  const subParts: string[] = [`${count} ${count === 1 ? "machine" : "machines"}`];
  if (latest) subParts.push(`changed ${relativeTime(latest.when)} by ${latest.trainerInitials}`);
  else subParts.push(routine.updatedAt || routine.createdAt ? "no changes logged" : "not created yet");
  return (
    <header className="rt-routine__head">
      <span className="rt-badge" aria-hidden="true">
        {letter}
      </span>
      <div className="rt-routine__title">
        <h3 id={`rt-title-${letter}`} className="rt-routine__name">
          {name}
          {isToday && (
            <span className="rt-today" aria-label="Chosen for today">
              <PlayCircle size={12} strokeWidth={2.6} aria-hidden="true" /> Today
            </span>
          )}
          {!active && <span className="rt-off">Off</span>}
        </h3>
        <p className="rt-routine__sub">
          {subParts.join(" · ")}
          {routine.templateName && (
            <>
              {" · "}
              <span className="rt-routine__tpl" title={drift && (drift.added || drift.removed) ? `${drift.added} added, ${drift.removed} removed since the template was applied` : "Matches the template"}>
                <Sparkles size={11} strokeWidth={2.4} aria-hidden="true" />
                {routine.templateName}
                {drift && (drift.added || drift.removed) ? ` (+${drift.added} −${drift.removed})` : ""}
              </span>
            </>
          )}
        </p>
      </div>
      <div className="rt-routine__actions">
        {onToggle && (
          <label className="rt-switch">
            <span>{active ? "B on" : "B off"}</span>
            <Switch checked={active} disabled={disabled} onCheckedChange={onToggle} aria-label={active ? "Turn Routine B off" : "Turn Routine B on"} className="scale-90" />
          </label>
        )}
        {active && (
          <>
            <button type="button" className="rt-btn" onClick={onEdit} disabled={disabled}>
              <Pencil size={13} strokeWidth={2.4} aria-hidden="true" />
              Edit
            </button>
            {/* "Use today" set a choice the session never read (AJ, Sep 26
                2026: "Used last on" instead). */}
            {usedLast && <span className="rt-used">{usedLast}</span>}
          </>
        )}
      </div>
    </header>
  );
}

interface PanelProps extends HeadProps {
  rows: RoutineRow[];
  onSelectMachine?: (id: string) => void;
  /** Under the rows: Routine A's quiet "Add a plan". */
  foot?: ReactNode;
}

const RoutinePanel = memo(function RoutinePanel({ rows, onSelectMachine, foot, ...head }: PanelProps) {
  const { name, active, isToday, disabled, onEdit } = head;
  const letter = name.endsWith("B") ? "B" : "A";
  return (
    <section
      className={["rt-routine", isToday ? "rt-routine--today" : "", !active ? "rt-routine--off" : ""].filter(Boolean).join(" ")}
      aria-labelledby={`rt-title-${letter}`}
    >
      <RoutineHead {...head} />

      {rows.length === 0 ? (
        <div className="rt-empty">
          <span className="rt-empty__title">{active ? "No machines yet" : "Routine B is off"}</span>
          <span className="rt-empty__hint">
            {active ? `Pick the machines ${name} should run, in order. The live session follows this list.` : "Turn it on to give this client a second, alternating prescription."}
          </span>
          {active && (
            <button type="button" className="rt-btn rt-btn--live" onClick={onEdit} disabled={disabled}>
              <Pencil size={13} strokeWidth={2.4} aria-hidden="true" />
              Set up {name}
            </button>
          )}
        </div>
      ) : (
        <ol className="rt-list">
          {rows.map((row) => (
            <RoutineRowItem key={`${row.machineId}-${row.order}`} row={row} onSelect={row.missing ? undefined : onSelectMachine} />
          ))}
        </ol>
      )}
      {foot}
    </section>
  );
});

/* ------------------------------------------------------------------ *
 * Changes
 * ------------------------------------------------------------------ */

function describe(c: RoutineChange): string {
  if (c.kind === "created") return `Routine ${c.routineLabel} created`;
  if (c.kind === "enabled") return `Routine ${c.routineLabel} turned on`;
  if (c.kind === "disabled") return `Routine ${c.routineLabel} turned off`;
  if (!c.added.length && !c.removed.length) return `Routine ${c.routineLabel} saved`;
  return `Routine ${c.routineLabel}`;
}

const ChangeRow = memo(function ChangeRow({ c }: { c: RoutineChange }) {
  return (
    <li className="rt-change">
      <span className="rt-change__when">
        <b>{relativeTime(c.when)}</b>
        <span>{shortStamp(c.when)}</span>
      </span>
      <span className="rt-change__what">
        <b>{describe(c)}</b>
        {c.added.length > 0 && (
          <span className="rt-change__diff rt-change__diff--add">
            <i aria-hidden="true">+</i> {c.added.join(", ")}
          </span>
        )}
        {c.removed.length > 0 && (
          <span className="rt-change__diff rt-change__diff--rm">
            <i aria-hidden="true">−</i> {c.removed.join(", ")}
          </span>
        )}
        {c.notes && <span className="rt-change__why">“{c.notes}”</span>}
      </span>
      <span className="rt-change__who" title={c.trainerName}>
        {c.trainerInitials}
      </span>
    </li>
  );
});

/* ------------------------------------------------------------------ *
 * Tab
 * ------------------------------------------------------------------ */

export function RoutinesTab({
  client,
  clientId,
  routines,
  machines,
  clientSettings,
  allLogs,
  sessions,
  adjustments,
  trainers,
  selectedRoutineTodayId,
  isBActive,
  onEdit,
  onToggleB,
  onSelectMachine,
  disabled = false,
  view = "both",
  hideSummary = false,
  model,
  plan: host = null,
}: RoutinesTabProps) {
  // Hooks are unconditional; the computed model is thrown away when the
  // parent supplied one. Cheap — every memo inside it is keyed on the same
  // inputs the parent used, so nothing recomputes on a re-render.
  const own = useRoutinesModel({
    client,
    clientId,
    routines,
    machines,
    clientSettings,
    allLogs,
    sessions,
    adjustments,
    trainers,
    selectedRoutineTodayId,
    isBActive,
  });
  const m = model ?? own;
  const { a, b, rowsA, rowsB, latestA, latestB, monthCount, todayName, usedLastA, usedLastB, setUp, total, newest } = m;
  const [changesOpen, setChangesOpen] = useState(false);

  // One prescription at a time also means one Changes list: a trainer reading
  // Routine B does not want A's edit history in the same scroll.
  const changes =
    view === "both"
      ? m.changes
      : m.changes.filter((c) => c.routineId === (view === "Routine A" ? a.id : b.id));

  const showA = view === "both" || view === "Routine A";
  const showB = view === "both" || view === "Routine B";

  /*
   * Routine A's plan (the first-session design round, Oct 8 2026), on the
   * single Routine A view only:
   *   - a plan on Routine A: the Lineup, with its own Changes (the plan's and
   *     these adjustments, one list), so the list below is not drawn;
   *   - no routine (Routine A empty, no plan) and the client isn't set up
   *     elsewhere: Start a plan, which waits for the routines' read and says
   *     "can't tell" when it failed, never "no routine";
   *   - a routine with no plan: as it has always been drawn, and a quiet
   *     "Add a plan" under it.
   */
  const nameOf = useMemo(() => machineNamer(host?.floor ?? [], machines), [host?.floor, machines]);
  const planView = !!host && view === "Routine A";
  const aSaved = !!a.id && !a.id.startsWith("temp-");
  const aPlan = aSaved && a.plan ? a.plan : null;
  const aEmpty = a.machineIds.length === 0;
  // Whether there is a routine is the routines' own read, never the kind:
  // the kind waits for the session count too, and a count that never
  // answers must not offer Start a plan over a Routine B with machines.
  const anyRoutine = !aEmpty || b.machineIds.length > 0;
  const aMode: "lineup" | "start" | "panel" = !host || !planView
    ? "panel"
    : aPlan
      ? "lineup"
      : aEmpty && (host.status !== "ready" || !anyRoutine)
        ? "start"
        : "panel";
  const firstName = client?.firstName?.trim() || "";
  const headA: HeadProps = {
    name: "Routine A",
    routine: a,
    latest: latestA,
    active: true,
    isToday: todayName === "Routine A",
    usedLast: usedLastA,
    disabled,
    onEdit: () => onEdit("Routine A"),
  };
  const who = host?.who ?? null;

  /*
   * B, molded in (Round 2, item 6; AJ's "1d"): Routine B beside Routine A.
   * Routine A's Lineup draws B's column, and Routine B's own segment draws
   * the same column with B's head (`BPlanView`), once there is a plan host.
   * Turning B on while B has no machines opens Plan B (the profile's one
   * sheet), never an EMPTY Routine B (the critic's #22). A Routine B of its
   * own from before Round 2 (machines, no plan of swaps) draws as it always
   * has.
   */
  const bSaved = !!b.id && !b.id.startsWith("temp-");
  const aRuns = useMemo(() => aRunsSince(sessions, aSaved ? a.id : null), [sessions, aSaved, a.id]);
  const bSide: BSide | null = host
    ? {
        routine: bSaved ? { ...b, id: b.id as string } : null,
        isBActive,
        aRunsLine: aRunsLine(aRuns, host.sessionsComplete !== true, host.coverage),
        nextIsB: isBActive ? (todayName === "Routine B" ? true : todayName === "Routine A" ? false : null) : null,
        onToggleB,
      }
    : null;
  // Plan B only off routines that have answered: an unread list is never
  // "no Routine B" (the profile's switch then says it can't tell).
  const toggleB = (on: boolean) => {
    if (host?.openPlanB && bSwitchStep(on, bSaved ? b : null, host.status === "ready") === "plan-b") host.openPlanB();
    else onToggleB(on);
  };
  const bMode = bModeOf(a.machineIds, bSide);
  const bPlanView = !!host && view === "Routine B" && bMode !== "none";
  const addPlan =
    host && planView && !aPlan && !aEmpty && aSaved && host.status === "ready" && who && !disabled ? (
      <div className="rt-addplan">
        <span className="rt-addplan__text">Plan the rest of Routine A's road, so every trainer follows one plan.</span>
        <Button
          variant="outline"
          onClick={() =>
            host.actions.start({
              routineId: a.id ?? null,
              machineIds: [...a.machineIds],
              plan: planFromRoutine(a.machineIds, who, host.todayYmd),
              change: signedChange({ kind: "start", machineIds: [...a.machineIds] }, who),
            })
          }
        >
          Add a plan
        </Button>
      </div>
    ) : null;

  return (
    <div className="rt" data-disabled={disabled || undefined} data-view={view === "both" ? undefined : "single"}>
      {hideSummary ? null : (
      <div className="rt-summary">
        <span className="rt-summary__count">
          <b>{total}</b> {total === 1 ? "machine" : "machines"} prescribed
          {total > 0 && setUp < total ? <span className="rt-summary__warn">{total - setUp} not set up</span> : null}
        </span>
        <span className="rt-summary__facts">
          <span>
            <b>{rowsA.length}</b> in A
          </span>
          <span className="rt-summary__dot" aria-hidden="true" />
          <span>
            <b>{isBActive ? rowsB.length : "—"}</b> in B{isBActive ? "" : " (off)"}
          </span>
          {newest && (
            <>
              <span className="rt-summary__dot" aria-hidden="true" />
              <span>
                last change <b>{relativeTime(newest.when)}</b> by {newest.trainerInitials}
              </span>
            </>
          )}
        </span>
        <div className="rt-summary__today">
          {todayName ? (
            <>
              <span className="rt-summary__chosen">
                <PlayCircle size={14} strokeWidth={2.6} aria-hidden="true" />
                {todayName} today
              </span>
            </>
          ) : (
            <span className="rt-summary__none">No routine chosen for today</span>
          )}
        </div>
      </div>
      )}

      <div className="rt-body">
        {showA && aMode === "panel" && <RoutinePanel {...headA} rows={rowsA} onSelectMachine={onSelectMachine} foot={addPlan} />}
        {showA && aMode === "start" && host && (
          <StartPlanPanel
            host={host}
            firstName={firstName}
            nameOf={nameOf}
            routineAId={aSaved ? (a.id ?? null) : null}
            // Where B planned with the lineup goes, at a studio starting new clients on A and B together:
            // never over a Routine B of the client's own.
            bTarget={plannedBTarget([b])}
          />
        )}
        {showA && aMode === "lineup" && host && aPlan && (
          <PlanLineup
            routine={{ ...a, id: a.id as string, plan: aPlan }}
            rows={rowsA}
            head={<RoutineHead {...headA} />}
            host={host}
            firstName={firstName}
            nameOf={nameOf}
            adjustments={adjustments}
            trainers={trainers}
            onSelectMachine={onSelectMachine}
            disabled={disabled}
            b={bSide}
          />
        )}
        {showB && bPlanView && host && bSide && (
          <BPlanView
            head={
              <RoutineHead
                name="Routine B"
                routine={b}
                latest={latestB}
                active={isBActive}
                isToday={todayName === "Routine B"}
                usedLast={usedLastB}
                disabled={disabled}
                onEdit={() => onEdit("Routine B")}
                onToggle={toggleB}
              />
            }
            host={host}
            aRoutine={a.machineIds}
            aPlan={aPlan}
            b={bSide}
            nameOf={nameOf}
            firstName={firstName}
            adjustments={adjustments}
            trainers={trainers}
            disabled={disabled}
          />
        )}
        {showB && !bPlanView && (
        <RoutinePanel
          name="Routine B"
          routine={b}
          rows={rowsB}
          latest={latestB}
          active={isBActive}
          isToday={todayName === "Routine B"}
          usedLast={usedLastB}
          disabled={disabled}
          onEdit={() => onEdit("Routine B")}
          onToggle={toggleB}
          onSelectMachine={onSelectMachine}
        />
        )}
      </div>

      {aMode === "lineup" || (view === "Routine B" && bPlanView) ? null : (
      <section className="rt-changes" aria-labelledby="rt-changes-title">
        <button type="button" className="rt-changes__head" onClick={() => setChangesOpen((o) => !o)} aria-expanded={changesOpen} aria-controls="rt-changes-list">
          <span id="rt-changes-title" className="rt-changes__title">
            Changes
          </span>
          <span className="rt-changes__meta">
            {view === "both" ? (
              <>
                <b>{monthCount}</b> this month · <b>{changes.length}</b> total
              </>
            ) : (
              <>
                <b>{changes.length}</b> logged for {view}
              </>
            )}
          </span>
          <ChevronDown size={16} strokeWidth={2.4} className={changesOpen ? "rt-changes__chev rt-changes__chev--open" : "rt-changes__chev"} aria-hidden="true" />
        </button>
        {changesOpen && (
          <ol id="rt-changes-list" className="rt-changes__list">
            {changes.length === 0 ? (
              <li className="rt-changes__none">
                No {view === "both" ? "routine" : view} changes have been logged for{" "}
                {client?.firstName || "this client"} yet.
              </li>
            ) : (
              changes.map((c) => <ChangeRow key={c.id} c={c} />)
            )}
          </ol>
        )}
      </section>
      )}
    </div>
  );
}
