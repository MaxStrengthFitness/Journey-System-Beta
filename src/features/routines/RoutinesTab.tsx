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
import { memo, useMemo, useState } from "react";
import { ChevronDown, Pencil, PlayCircle, Sparkles } from "lucide-react";
import type { Client, ClientMachineSetting, ExerciseLog, Machine, Routine, RoutineAdjustment, Trainer, WorkoutSession } from "../../types";
import { Switch } from "@/components/ui/switch";
import {
  buildRoutineChanges,
  buildRoutineRows,
  changesThisMonth,
  latestChangeFor,
  relativeTime,
  resolveRoutine,
  shortStamp,
  templateDrift,
  type RoutineChange,
  type RoutineName,
  type RoutineRow,
} from "./routine-rows";
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
  /** Routine id the client will train on today (`preferredTodayRoutineId`). */
  selectedRoutineTodayId: string | null;
  isBActive: boolean;
  onEdit: (name: RoutineName) => void;
  onUseToday: (routine: Routine) => void;
  onToggleB: (checked: boolean) => void;
  /** Tapping a machine row — the profile opens its settings sheet. */
  onSelectMachine?: (machineId: string) => void;
  /** Jump to the live session screen with today's routine loaded. */
  onOpenSession?: () => void;
  disabled?: boolean;
}

/* ------------------------------------------------------------------ *
 * Row
 * ------------------------------------------------------------------ */

const Row = memo(function Row({ row, onSelect }: { row: RoutineRow; onSelect?: (id: string) => void }) {
  const outcome =
    row.outcome === null ? null : row.isHold ? `${row.outcome}s hold` : `${row.outcome} ${row.outcome === 1 ? "rep" : "reps"}`;
  const showStart = row.startingWeight !== null && row.weight !== null && row.startingWeight !== row.weight;
  const Tag: "button" | "div" = onSelect ? "button" : "div";
  return (
    <li className={["rt-row", row.missing ? "rt-row--missing" : ""].filter(Boolean).join(" ")}>
      <Tag
        type={onSelect ? "button" : undefined}
        className="rt-row__hit"
        onClick={onSelect ? () => onSelect(row.machineId) : undefined}
        aria-label={onSelect ? `${row.name} settings` : undefined}
      >
        <span className="rt-row__n" aria-hidden="true">
          {row.order}
        </span>
        <span className="rt-row__main">
          <span className="rt-row__top">
            <span className="rt-row__name">{row.name}</span>
            {row.settings.length > 0 && (
              <span className="rt-row__chips" aria-label="Setup">
                {row.settings.map(([k, v], i) => (
                  <span key={`${k}${i}`} className="rt-row__chip">
                    {k} {v}
                  </span>
                ))}
              </span>
            )}
          </span>
          <span className="rt-row__sub">
            {row.region ? <span className="rt-row__region">{row.region}</span> : null}
            {row.note ? <span className="rt-row__note">“{row.note}”</span> : null}
            {row.missing ? <span className="rt-row__region">Not on this studio's roster</span> : null}
          </span>
        </span>
        <span className="rt-row__nums">
          {row.weight === null ? (
            <span className="rt-row__empty">not set up</span>
          ) : (
            <span className="rt-row__load">
              {showStart && (
                <span className="rt-row__start">
                  {row.startingWeight} <span aria-hidden="true">→</span>{" "}
                </span>
              )}
              <b>{row.weight}</b> <small>lb</small>
            </span>
          )}
          <span className="rt-row__outcome">{outcome ?? (row.weight === null ? "" : "no set logged")}</span>
        </span>
      </Tag>
    </li>
  );
});

/* ------------------------------------------------------------------ *
 * One routine panel
 * ------------------------------------------------------------------ */

interface PanelProps {
  name: RoutineName;
  routine: Routine;
  rows: RoutineRow[];
  latest: RoutineChange | null;
  active: boolean;
  isToday: boolean;
  disabled: boolean;
  onEdit: () => void;
  onUseToday: () => void;
  onToggle?: (checked: boolean) => void;
  onSelectMachine?: (id: string) => void;
}

const RoutinePanel = memo(function RoutinePanel({ name, routine, rows, latest, active, isToday, disabled, onEdit, onUseToday, onToggle, onSelectMachine }: PanelProps) {
  const letter = name.endsWith("B") ? "B" : "A";
  const drift = templateDrift(routine);
  const count = routine.machineIds.length;
  const subParts: string[] = [`${count} ${count === 1 ? "machine" : "machines"}`];
  if (latest) subParts.push(`changed ${relativeTime(latest.when)} by ${latest.trainerInitials}`);
  else subParts.push(routine.updatedAt || routine.createdAt ? "no changes logged" : "not created yet");

  return (
    <section
      className={["rt-routine", isToday ? "rt-routine--today" : "", !active ? "rt-routine--off" : ""].filter(Boolean).join(" ")}
      aria-labelledby={`rt-title-${letter}`}
    >
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
              <button type="button" className={isToday ? "rt-btn rt-btn--hero" : "rt-btn rt-btn--live"} onClick={onUseToday} disabled={disabled || isToday} aria-pressed={isToday}>
                {isToday ? "Active today" : "Use today"}
              </button>
            </>
          )}
        </div>
      </header>

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
            <Row key={`${row.machineId}-${row.order}`} row={row} onSelect={row.missing ? undefined : onSelectMachine} />
          ))}
        </ol>
      )}
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
  onUseToday,
  onToggleB,
  onSelectMachine,
  onOpenSession,
  disabled = false,
}: RoutinesTabProps) {
  const studioId = client?.homeStudioId || "";
  const a = useMemo(() => resolveRoutine(routines, "Routine A", clientId, studioId), [routines, clientId, studioId]);
  const b = useMemo(() => resolveRoutine(routines, "Routine B", clientId, studioId), [routines, clientId, studioId]);
  const rowsA = useMemo(() => buildRoutineRows(a, machines, client, clientSettings, allLogs, sessions), [a, machines, client, clientSettings, allLogs, sessions]);
  const rowsB = useMemo(() => buildRoutineRows(b, machines, client, clientSettings, allLogs, sessions), [b, machines, client, clientSettings, allLogs, sessions]);
  const changes = useMemo(() => buildRoutineChanges(adjustments, routines, machines, trainers), [adjustments, routines, machines, trainers]);
  const latestA = useMemo(() => latestChangeFor(changes, a.id || ""), [changes, a.id]);
  const latestB = useMemo(() => latestChangeFor(changes, b.id || ""), [changes, b.id]);
  const monthCount = useMemo(() => changesThisMonth(changes), [changes]);
  const [changesOpen, setChangesOpen] = useState(false);

  const todayName: RoutineName | null = selectedRoutineTodayId === a.id ? "Routine A" : selectedRoutineTodayId === b.id ? "Routine B" : null;
  const setUp = rowsA.filter((r) => r.weight !== null).length + (isBActive ? rowsB.filter((r) => r.weight !== null).length : 0);
  const total = rowsA.length + (isBActive ? rowsB.length : 0);
  const newest = changes[0] ?? null;

  return (
    <div className="rt" data-disabled={disabled || undefined}>
      <div className="rt-summary">
        <span className="rt-summary__count">
          <b>{total}</b> {total === 1 ? "machine" : "machines"} prescribed
          {total > 0 && setUp < total ? <span className="rt-summary__warn"> · {total - setUp} not set up</span> : null}
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
              {onOpenSession && (
                <button type="button" className="rt-btn rt-btn--hero" onClick={onOpenSession} disabled={disabled}>
                  Open live session
                </button>
              )}
            </>
          ) : (
            <span className="rt-summary__none">No routine chosen for today</span>
          )}
        </div>
      </div>

      <div className="rt-body">
        <RoutinePanel
          name="Routine A"
          routine={a}
          rows={rowsA}
          latest={latestA}
          active
          isToday={todayName === "Routine A"}
          disabled={disabled}
          onEdit={() => onEdit("Routine A")}
          onUseToday={() => onUseToday(a)}
          onSelectMachine={onSelectMachine}
        />
        <RoutinePanel
          name="Routine B"
          routine={b}
          rows={rowsB}
          latest={latestB}
          active={isBActive}
          isToday={todayName === "Routine B"}
          disabled={disabled}
          onEdit={() => onEdit("Routine B")}
          onUseToday={() => onUseToday(b)}
          onToggle={onToggleB}
          onSelectMachine={onSelectMachine}
        />
      </div>

      <section className="rt-changes" aria-labelledby="rt-changes-title">
        <button type="button" className="rt-changes__head" onClick={() => setChangesOpen((o) => !o)} aria-expanded={changesOpen} aria-controls="rt-changes-list">
          <span id="rt-changes-title" className="rt-changes__title">
            Changes
          </span>
          <span className="rt-changes__meta">
            <b>{monthCount}</b> this month · <b>{changes.length}</b> total
          </span>
          <ChevronDown size={16} strokeWidth={2.4} className={changesOpen ? "rt-changes__chev rt-changes__chev--open" : "rt-changes__chev"} aria-hidden="true" />
        </button>
        {changesOpen && (
          <ol id="rt-changes-list" className="rt-changes__list">
            {changes.length === 0 ? (
              <li className="rt-changes__none">No routine changes have been logged for {client?.firstName || "this client"} yet.</li>
            ) : (
              changes.map((c) => <ChangeRow key={c.id} c={c} />)
            )}
          </ol>
        )}
      </section>
    </div>
  );
}
