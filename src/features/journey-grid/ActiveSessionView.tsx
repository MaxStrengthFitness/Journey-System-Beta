import { useCallback, useMemo, useState } from "react";
import { ChevronRight, Flag } from "lucide-react";
import type { Density, JourneyRow, JourneySession, LiveColumn, LiveSet } from "./types";
import { JourneyGrid, type GridSection } from "./JourneyGrid";
import { GridToolbar, QualityLegend } from "./GridToolbar";
import { formatSeconds } from "./stats";

/* ------------------------------------------------------------------ *
 * Live-session state hook
 * ------------------------------------------------------------------ */

export interface LiveSessionState {
  values: Record<string, LiveSet>;
  routine: string[];
  focusMachineId: string | null;
  change: (machineId: string, patch: Partial<LiveSet>) => void;
  addMachine: (machineId: string) => void;
  focus: (machineId: string) => void;
  advance: () => void;
}

const EMPTY: LiveSet = { weight: null, reps: null, seconds: null, isTSC: false, quality: null };

/**
 * Owns today's values. Each change replaces ONLY that machine's LiveSet
 * object, so React.memo on the row keeps every other row untouched while
 * the trainer types.
 */
export function useLiveSession(initialRoutine: string[], initial: Record<string, LiveSet> = {}): LiveSessionState {
  const [values, setValues] = useState<Record<string, LiveSet>>(initial);
  const [routine, setRoutine] = useState<string[]>(initialRoutine);
  const [focusMachineId, setFocus] = useState<string | null>(initialRoutine[0] ?? null);

  const change = useCallback((machineId: string, patch: Partial<LiveSet>) => {
    setValues((prev) => ({ ...prev, [machineId]: { ...(prev[machineId] ?? EMPTY), ...patch } }));
  }, []);

  const addMachine = useCallback((machineId: string) => {
    setRoutine((r) => (r.includes(machineId) ? r : [...r, machineId]));
    setFocus(machineId);
  }, []);

  const advance = useCallback(() => {
    setFocus((cur) => {
      const i = cur ? routine.indexOf(cur) : -1;
      return routine[i + 1] ?? cur;
    });
  }, [routine]);

  return { values, routine, focusMachineId, change, addMachine, focus: setFocus, advance };
}

/* ------------------------------------------------------------------ *
 * View
 * ------------------------------------------------------------------ */

export interface ActiveSessionViewProps {
  clientName: string;
  /** Completed sessions, oldest → newest. */
  history: JourneySession[];
  rows: JourneyRow[];
  today: JourneySession;
  live: LiveSessionState;
  /** How many prior sessions to show before "Older". */
  historyWindow?: number;
  elapsedSeconds?: number;
  onFinish?: () => void;
  onDiscard?: () => void;
  /** "fill" (default) stretches under a static header; "auto" caps at maxHeight. */
  layout?: "fill" | "auto";
  maxHeight?: string;
  weightStep?: number;
}

export function ActiveSessionView({
  clientName,
  history,
  rows,
  today,
  live,
  historyWindow = 6,
  elapsedSeconds,
  onFinish,
  onDiscard,
  layout = "fill",
  maxHeight,
  weightStep = 2,
}: ActiveSessionViewProps) {
  const [density, setDensity] = useState<Density>("comfortable");
  const [othersOpen, setOthersOpen] = useState(false);
  const [visible, setVisible] = useState(historyWindow);

  const visibleHistory = useMemo(() => history.slice(Math.max(0, history.length - visible)), [history, visible]);

  const rowById = useMemo(() => new Map(rows.map((r) => [r.machine.id, r])), [rows]);

  const sections = useMemo<GridSection[]>(() => {
    const routineRows = live.routine.map((id) => rowById.get(id)).filter(Boolean) as JourneyRow[];
    const inRoutine = new Set(live.routine);
    const others = rows.filter((r) => !inRoutine.has(r.machine.id));
    return [
      { id: "routine", label: "Today's routine", rows: routineRows, numbered: true },
      {
        id: "others",
        label: "Not in today's routine",
        rows: others,
        collapsed: !othersOpen,
        onToggle: () => setOthersOpen((o) => !o),
        inactive: true,
      },
    ];
  }, [rows, rowById, live.routine, othersOpen]);

  const liveColumn: LiveColumn = useMemo(
    () => ({
      session: today,
      routineMachineIds: live.routine,
      values: live.values,
      onChange: live.change,
      onAddMachine: live.addMachine,
      focusMachineId: live.focusMachineId,
      onFocusMachine: live.focus,
      weightStep,
    }),
    [today, live.routine, live.values, live.change, live.addMachine, live.focusMachineId, live.focus, weightStep],
  );

  const focusRow = live.focusMachineId ? rowById.get(live.focusMachineId) : undefined;
  const nextId = live.focusMachineId ? live.routine[live.routine.indexOf(live.focusMachineId) + 1] : live.routine[0];
  const nextRow = nextId ? rowById.get(nextId) : undefined;
  const done = live.routine.filter((id) => {
    const v = live.values[id];
    return v && (v.isTSC ? v.seconds : v.reps);
  }).length;

  return (
    <section className={`jg-view ${layout === "fill" ? "jg-view--fill" : ""}`} aria-label="Active session">
      <div className="jg-session-bar">
        <div className="jg-session-bar__who">
          <span className="jg-session-bar__name">{clientName}</span>
          <span className="jg-session-bar__meta">
            Session #{today.sessionNumber} · {today.trainerInitials}
            {elapsedSeconds !== undefined && <> · {formatSeconds(elapsedSeconds)}</>}
            {" · "}
            {done}/{live.routine.length} logged
          </span>
        </div>
        <div className="jg-session-bar__now">
          {focusRow && (
            <>
              <span className="jg-session-bar__label">Now</span>
              <span className="jg-session-bar__machine">{focusRow.machine.name}</span>
            </>
          )}
          <button type="button" className="jg-btn" onClick={live.advance} disabled={!nextRow}>
            {nextRow ? `Next: ${nextRow.machine.name}` : "Last machine"}
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="jg-session-bar__actions">
          {onDiscard && (
            <button type="button" className="jg-btn jg-btn--ghost" onClick={onDiscard}>
              Discard
            </button>
          )}
          <button type="button" className="jg-btn jg-btn--hero" onClick={onFinish}>
            <Flag size={15} strokeWidth={2.5} />
            Finish session
          </button>
        </div>
      </div>

      <GridToolbar title="Session log" density={density} onDensity={setDensity} />

      <JourneyGrid
        sessions={visibleHistory}
        historySessions={history}
        sections={sections}
        density={density}
        live={liveColumn}
        onLoadOlder={() => setVisible((v) => v + 5)}
        canLoadOlder={visible < history.length}
        layout={layout}
        maxHeight={maxHeight}
        title="Routine"
      />

      <div className="jg-view__legend">
        <QualityLegend />
      </div>
    </section>
  );
}
