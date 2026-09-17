/**
 * MACHINE FIT — the Setup screen: every machine for one client, on one
 * continuous list. Programming's fourth segment.
 *
 * The problem it replaces, in AJ's words: "A trainer has to individually
 * click into up to 30 different machine profiles … to set the starting
 * weight, repetitions, and highly specific machine settings."
 *
 * ONE LIST, THREE MODES
 *   Check        what she is set to, and — passively — anything worth a look.
 *   Set up       cells to fill, with what similar clients use offered under
 *                each machine. Use per row, or "Accept strong" for the lot.
 *   Quick entry  the FileMaker grid's mental model: the floor's own order top
 *                to bottom, settings then load, a docked keypad, and an "abc"
 *                box that reads a line of chart shorthand.
 *
 * THE RULES IT KEEPS
 *   · NOTHING IS A VALUE UNTIL SOMEONE TAPS IT, and nothing is WRITTEN until
 *     Save. "Accept strong" fills drafts; one Undo takes them back; one Save
 *     writes the lot in a batch (setup-save.ts). This is how a bulk accept
 *     and "suggestions never prefill" are both true.
 *   · AN ACCEPTED VALUE IS MARKED `suggested` and is not evidence for anyone
 *     else until she has trained on it (fit-index.ts). The engine cannot
 *     learn from its own guesses.
 *   · PASSIVE. The check never blocks, never pops up, never leaves this
 *     segment: no bell, no Hub marker, no badge on the tab.
 *   · NO FETCH UNTIL LOOKED AT. `active` gates every read; the component
 *     stays mounted afterwards so drafts survive a look at Routine A.
 *   · Inline panels, no dialogs: nothing for the iPad to get stuck behind.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ClipboardPaste, Keyboard, SlidersHorizontal, Sparkles, Undo2 } from "lucide-react";
import { useActiveStudio } from "../../../ActiveStudioContext";
import { LoadingMark } from "../../../components/LoadingMark";
import { useToast } from "../../../contexts/ToastContext";
import { useMachineCatalog } from "../../../hooks/useMachineCatalog";
import type { Client, ClientMachineSetting, Machine, Routine, Trainer } from "../../../types";
import { authorFromTrainer } from "../../equipment/author";
import { useScrollerPad } from "../../client-profile/use-scroller-pad";
import { comboAckKey, comboAckValue } from "../audit";
import { formatInches } from "../factors";
import { DEFAULT_MATCH_SPEC, activeFactors } from "../match-spec";
import { planSetupSave, type SetupMachineInput } from "../setup-plan";
import { acknowledgeFlag, commitSetupSave } from "../setup-save";
import { parseShorthand, type ShorthandBlockLine } from "../shorthand";
import type { FitFlag, MachineAudit, MatchSpec } from "../types";
import { isSingleKeyField, shownValue } from "./field-values";
import { MatchPanel } from "./MatchPanel";
import { PastePanel } from "./PastePanel";
import { QuickPad, type PadCell } from "./QuickPad";
import { SetupRow, WEIGHT_KEY, cellId } from "./SetupRow";
import { auditSummary } from "./sentences";
import { EMPTY_DRAFTS, countDrafts, setupDraftReducer, type SetupMode } from "./setup-draft";
import { useSetupModel, type RowFilter, type SetupRowModel } from "./useSetupModel";
import "./machine-fit.css";

export interface SetupViewProps {
  client: Client | null | undefined;
  clientId: string;
  machines: Machine[];
  clientSettings: Record<string, ClientMachineSetting>;
  routines: Routine[];
  isBActive: boolean;
  /** The studio roster the app already holds — what studio rows are joined to. */
  studioClients: readonly Client[];
  authTrainer?: Trainer | null;
  activeStudioId?: string | null;
  /** The segment is showing. Every read waits for the first time this is true. */
  active: boolean;
  /** Settings worth a look, for the segment's meta line. */
  onReviewCount?: (count: number | null) => void;
}

const SPEC_STORE = "msf_fit_match_spec";

function readStoredSpec(): MatchSpec {
  try {
    const raw = window.localStorage.getItem(SPEC_STORE);
    if (!raw) return DEFAULT_MATCH_SPEC;
    const parsed = JSON.parse(raw) as Partial<MatchSpec>;
    if (!parsed || typeof parsed !== "object" || !parsed.numeric) return DEFAULT_MATCH_SPEC;
    // Merge over the defaults so a spec saved before a factor existed still has it.
    const numeric = { ...DEFAULT_MATCH_SPEC.numeric };
    for (const k of Object.keys(numeric) as (keyof typeof numeric)[]) {
      const saved = parsed.numeric[k];
      if (saved && typeof saved.on === "boolean" && Number.isFinite(saved.maxSteps)) {
        numeric[k] = { ...numeric[k], on: saved.on, maxSteps: Math.max(0, Math.min(6, Math.round(saved.maxSteps))) };
      }
    }
    return { ...DEFAULT_MATCH_SPEC, numeric, gender: parsed.gender === true };
  } catch {
    return DEFAULT_MATCH_SPEC;
  }
}

function coarsePointer(): boolean {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

const MODES: { id: SetupMode; label: string; blurb: string }[] = [
  { id: "check", label: "Check", blurb: "What is set, and anything worth a look" },
  { id: "setup", label: "Set up", blurb: "Fill in, with what similar clients use" },
  { id: "quick", label: "Quick entry", blurb: "Copy a FileMaker chart, fast" },
];

export function SetupView({
  client,
  clientId,
  machines,
  clientSettings,
  routines,
  isBActive,
  studioClients,
  authTrainer,
  activeStudioId,
  active,
  onReviewCount,
}: SetupViewProps) {
  const { catalog } = useMachineCatalog();
  const { activeStudio } = useActiveStudio();
  const { success: toastSuccess, error: toastError } = useToast();
  const author = authorFromTrainer(authTrainer);

  const [seen, setSeen] = useState(active);
  useEffect(() => {
    if (active) setSeen(true);
  }, [active]);

  // Which mode a client opens in. Check, once everything she is PRESCRIBED is
  // set up; Set up, while any of it is not (or nothing is) — a trainer opening
  // this before a first session is here to fill in, not to read.
  const opensIn = useMemo<SetupMode>(() => {
    const has = (id: string) => {
      const saved = clientSettings[id]?.settings;
      return !!saved && Object.values(saved).some((v) => String(v ?? "").trim() !== "");
    };
    if (!Object.keys(clientSettings).some(has)) return "setup";
    const prescribed = routines
      .filter((r) => r.name === "Routine A" || (r.name === "Routine B" && isBActive))
      .flatMap((r) => r.machineIds ?? []);
    return prescribed.some((id) => !has(id)) ? "setup" : "check";
  }, [clientSettings, routines, isBActive]);
  const [mode, setMode] = useState<SetupMode>(opensIn);
  const [filter, setFilter] = useState<RowFilter>("all");
  const [spec, setSpec] = useState<MatchSpec>(readStoredSpec);
  const [drafts, dispatch] = useReducer(setupDraftReducer, EMPTY_DRAFTS);
  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [systemCell, setSystemCell] = useState<string | null>(null);
  const [padOn, setPadOn] = useState<boolean>(coarsePointer);
  const [evidenceFor, setEvidenceFor] = useState<string | null>(null);
  const [panel, setPanel] = useState<"match" | "paste" | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  /** The next pad key replaces the cell's value (a spreadsheet's rule). */
  const freshRef = useRef(true);

  // A different client is a different set-up: carry nothing over.
  const lastClient = useRef(clientId);
  useEffect(() => {
    if (lastClient.current === clientId) return;
    lastClient.current = clientId;
    dispatch({ type: "reset" });
    setActiveCell(null);
    setSystemCell(null);
    setEvidenceFor(null);
    setPanel(null);
    setReason("");
    setFilter("all");
  }, [clientId]);
  // …and it opens in the mode that client needs, once her settings have arrived.
  const modeSetFor = useRef<string | null>(null);
  useEffect(() => {
    if (modeSetFor.current === clientId) return;
    modeSetFor.current = clientId;
    setMode(opensIn);
  }, [clientId, opensIn]);

  const model = useSetupModel({
    client,
    clientId,
    machines,
    clientSettings,
    routines,
    isBActive,
    catalog,
    studioMachineSettings: activeStudio?.machineSettings,
    studioClients,
    activeStudioId,
    spec,
    drafts,
    filter,
    enabled: seen,
  });

  useEffect(() => {
    onReviewCount?.(seen && model.fit.status === "ready" ? model.toReview : null);
  }, [onReviewCount, seen, model.fit.status, model.toReview]);

  const changeSpec = useCallback((next: MatchSpec) => {
    setSpec(next);
    try {
      window.localStorage.setItem(SPEC_STORE, JSON.stringify({ numeric: next.numeric, gender: next.gender }));
    } catch {
      /* a private window: the match just is not remembered */
    }
  }, []);

  /* ---------------- cells, in reading order ---------------- */

  const editing = mode !== "check";
  const cells = useMemo(() => {
    const out: { id: string; row: SetupRowModel; key: string }[] = [];
    for (const row of model.rows) {
      if (row.fields.length === 0) continue;
      for (const f of row.fields) out.push({ id: cellId(row.machine.id, f.key), row, key: f.key });
      out.push({ id: cellId(row.machine.id, WEIGHT_KEY), row, key: WEIGHT_KEY });
    }
    return out;
  }, [model.rows]);

  const activeAt = activeCell ? cells.findIndex((c) => c.id === activeCell) : -1;
  const current = activeAt >= 0 ? cells[activeAt] : null;

  const focusCell = useCallback((id: string | null) => {
    setActiveCell(id);
    setSystemCell(null);
    freshRef.current = true;
    if (!id) return;
    // After React has drawn the cell as active.
    window.setTimeout(() => {
      const el = document.getElementById(`fit-cell-${id}`) as HTMLInputElement | null;
      if (!el) return;
      el.focus({ preventScroll: true });
      if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 0);
  }, []);

  const move = useCallback(
    (by: number) => {
      if (cells.length === 0) return;
      const at = activeAt < 0 ? (by > 0 ? -1 : cells.length) : activeAt;
      const next = cells[Math.max(0, Math.min(cells.length - 1, at + by))];
      focusCell(next.id);
    },
    [cells, activeAt, focusCell],
  );

  const source = mode === "quick" ? "legacy" : "typed";

  const weightShownOf = (row: SetupRowModel): string => {
    const d = drafts.drafts[row.machine.id];
    if (d?.weight !== undefined) return d.weight;
    return row.machine.currentWeight !== null ? String(row.machine.currentWeight) : "";
  };

  const writeCell = useCallback(
    (row: SetupRowModel, key: string, value: string) => {
      if (key === WEIGHT_KEY) {
        const saved = row.machine.currentWeight !== null ? String(row.machine.currentWeight) : "";
        dispatch({ type: "weight", machineId: row.machine.id, value, saved });
      } else {
        dispatch({
          type: "set",
          machineId: row.machine.id,
          key,
          value,
          saved: row.machine.settings[key] ?? "",
          source: source as "typed" | "legacy",
        });
      }
    },
    [source],
  );

  const currentValue = current
    ? current.key === WEIGHT_KEY
      ? weightShownOf(current.row)
      : (current.row.shown[current.key] ?? "")
    : "";

  const padKey = (k: string) => {
    if (!current) return;
    const base = freshRef.current ? "" : currentValue;
    if (k === "." && base.includes(".")) return;
    freshRef.current = false;
    writeCell(current.row, current.key, base + k);
    const field = current.row.fields.find((f) => f.key === current.key);
    if (field && k !== "." && isSingleKeyField(field)) move(1);
  };
  const padBackspace = () => {
    if (!current) return;
    writeCell(current.row, current.key, freshRef.current ? "" : currentValue.slice(0, -1));
    freshRef.current = false;
  };
  const padPick = (value: string) => {
    if (!current) return;
    if (current.key !== WEIGHT_KEY && current.row.offer[current.key]?.value === value && mode === "setup") {
      dispatch({
        type: "accept",
        rows: [{ machineId: current.row.machine.id, values: { [current.key]: value }, saved: current.row.machine.settings }],
      });
    } else {
      writeCell(current.row, current.key, value);
    }
    move(1);
  };

  /** The words and letters other clients use in this field, most used first. Numbers need no help. */
  const commonFor = (row: SetupRowModel, key: string): string[] => {
    const f = row.fields.find((x) => x.key === key);
    if (!f || (f.options && f.options.length > 0)) return [];
    const sources = model.fit.sources[row.machine.id];
    const samples = sources?.studio?.length ? sources.studio : (sources?.company ?? []);
    const counts = new Map<string, number>();
    for (const sample of samples) {
      const v = sample.settings[f.nk];
      if (v === undefined || /^-?\d+(?:_\d+)?$/.test(v)) continue;
      counts.set(v, (counts.get(v) ?? 0) + sample.n);
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([v]) => shownValue(f, v));
  };

  const padCell: PadCell | null = current
    ? (() => {
        const f = current.row.fields.find((x) => x.key === current.key);
        return {
          machineName: current.row.machine.name,
          label: current.key === WEIGHT_KEY ? "Load (lb)" : (f?.label ?? current.key),
          value: currentValue,
          options: f?.options,
          common: commonFor(current.row, current.key),
          offer: mode === "setup" && f ? (current.row.offer[f.key]?.value ?? null) : null,
          ghost: f?.ghost ?? null,
        };
      })()
    : null;

  /* ---------------- accepting ---------------- */

  const acceptRow = (row: SetupRowModel, keys?: string[]) => {
    const values: Record<string, string> = {};
    for (const [key, offer] of Object.entries(row.offer)) if (!keys || keys.includes(key)) values[key] = offer.value;
    dispatch({ type: "accept", rows: [{ machineId: row.machine.id, values, saved: row.machine.settings }] });
  };

  const acceptStrong = () => {
    dispatch({
      type: "accept",
      rows: model.strongRows.map((row) => ({
        machineId: row.machine.id,
        saved: row.machine.settings,
        values: Object.fromEntries(
          Object.entries(row.offer)
            .filter(([, o]) => o.strong)
            .map(([k, o]) => [k, o.value]),
        ),
      })),
    });
  };

  const fillShorthand = (row: SetupRowModel, text: string) => {
    const result = parseShorthand(
      text,
      row.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options })),
    );
    dispatch({
      type: "shorthand",
      machineId: row.machine.id,
      values: result.values,
      saved: row.machine.settings,
      weight: result.weight,
      note: result.leftovers.join(" ") || undefined,
    });
    if (result.notes.length > 0) toastError(result.notes.join(" "));
  };

  const fillBlock = (lines: ShorthandBlockLine[]) => {
    for (const line of lines) {
      const row = model.allRows.find((r) => r.machine.id === line.machineId);
      if (!row || !line.result) continue;
      dispatch({
        type: "shorthand",
        machineId: row.machine.id,
        values: line.result.values,
        saved: row.machine.settings,
        weight: line.result.weight,
        note: line.result.leftovers.join(" ") || undefined,
      });
    }
  };

  const acknowledge = async (row: SetupRowModel, flag: FitFlag) => {
    if (!author) return;
    try {
      await acknowledgeFlag({
        clientId,
        machineId: row.machine.id,
        ackKey: flag.kind === "value" ? flag.key : comboAckKey(flag.keys[0], flag.keys[1]),
        value: flag.kind === "value" ? flag.value : comboAckValue(flag.keys, flag.values),
        author,
      });
      toastSuccess(`${row.machine.name}: marked as reviewed.`);
    } catch (err) {
      console.error(err);
      toastError("Could not save the review.");
    }
  };

  /* ---------------- saving ---------------- */

  const counts = countDrafts(drafts);
  const plan = useMemo(() => {
    const inputs: SetupMachineInput[] = [];
    for (const [machineId, d] of Object.entries(drafts.drafts)) {
      const row = model.allRows.find((r) => r.machine.id === machineId);
      if (!row) continue;
      inputs.push({
        machineId,
        machineName: row.machine.name,
        fields: row.fields.map((f) => ({ key: f.key, label: f.label })),
        saved: row.machine.settings,
        draft: d.values,
        existingSources: row.machine.sources ?? null,
        draftSources: d.sources,
        savedStartingWeight: row.machine.startingWeight,
        savedCurrentWeight: row.machine.currentWeight,
        draftWeight: d.weight,
        note: d.note,
      });
    }
    return planSetupSave(inputs);
  }, [drafts, model.allRows]);

  const legacy = useMemo(() => {
    const all = Object.values(drafts.drafts).flatMap((d) => Object.values(d.sources));
    return all.length > 0 && all.every((s) => s === "legacy");
  }, [drafts]);
  const reasonRequired = plan.needsReason && !legacy;
  const canSave = plan.entries.length > 0 && !saving && !!author && (!reasonRequired || reason.trim().length > 0);

  const save = async () => {
    if (!author || plan.entries.length === 0) return;
    setSaving(true);
    try {
      const existingNotes: Record<string, ClientMachineSetting["machineNotes"]> = {};
      for (const e of plan.entries) existingNotes[e.machineId] = clientSettings[e.machineId]?.machineNotes;
      const result = await commitSetupSave({
        clientId,
        homeStudioId: client?.homeStudioId ?? null,
        activeStudioId: activeStudioId ?? null,
        author,
        plan,
        reason,
        legacy,
        existingNotes,
      });
      toastSuccess(`Set-up saved — ${result.machines} ${result.machines === 1 ? "machine" : "machines"}.`);
      dispatch({ type: "reset" });
      setReason("");
      setActiveCell(null);
    } catch (err) {
      console.error(err);
      toastError("Could not save the set-up. Nothing was changed.");
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- the sentences at the top ---------------- */

  const audits = useMemo(
    () => model.allRows.map((r) => r.audit).filter((a): a is MachineAudit => a !== null),
    [model.allRows],
  );
  const covered = model.allRows.filter((r) => (r.suggestion?.cohort ?? r.audit?.cohort)?.enough).length;
  const withFields = model.allRows.filter((r) => r.fields.length > 0).length;
  const t = model.target;
  const bodyLine = [
    t.heightIn !== null ? formatInches(t.heightIn) : null,
    t.gender === "f" ? "Female" : t.gender === "m" ? "Male" : null,
    t.weightLb !== null ? `${t.weightLb} lb` : null,
    t.ageYears !== null ? `${t.ageYears} yr` : null,
    t.wingspanIn !== null ? `wingspan ${formatInches(t.wingspanIn)}` : null,
    t.bodyFatPct !== null ? `${t.bodyFatPct}% body fat` : null,
  ].filter(Boolean);
  const matching = activeFactors(spec);

  const footRef = useRef<HTMLDivElement>(null);
  useScrollerPad(footRef, seen);

  const showPad = editing && padOn && padCell !== null && systemCell !== activeCell;
  const total = model.allRows.length;

  return (
    <div className="fit" data-mode={mode}>
      <header className="fit-head">
        <div className="fit-modes" role="tablist" aria-label="Set-up modes">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className="fit-modes__btn"
              data-on={mode === m.id || undefined}
              onClick={() => {
                setMode(m.id);
                setActiveCell(null);
                if (m.id !== "quick" && panel === "paste") setPanel(null);
              }}
            >
              <span className="fit-modes__label">{m.label}</span>
              <span className="fit-modes__blurb">{m.blurb}</span>
            </button>
          ))}
        </div>

        <p className="fit-summary">
          {model.fit.status !== "ready" && seen
            ? `${model.setUpCount} of ${total} machines set up.`
            : mode === "check"
              ? auditSummary(audits, model.setUpCount, total)
              : `${model.setUpCount} of ${total} machines set up.`}
        </p>

        <div className="fit-bar">
          <button
            type="button"
            className="fit-chip"
            data-on={panel === "match" || undefined}
            aria-expanded={panel === "match"}
            onClick={() => setPanel((p) => (p === "match" ? null : "match"))}
          >
            <SlidersHorizontal size={16} strokeWidth={2.4} aria-hidden />
            Similar to: {matching.length === 0 ? "everyone" : matching.join(" + ")}
          </button>
          <span className="fit-bar__body">
            {bodyLine.length > 0 ? bodyLine.join(" · ") : "No height on file — add it on the record to compare with similar clients."}
          </span>

          <span className="fit-bar__spacer" />

          <div className="fit-filter" role="group" aria-label="Which machines">
            {(
              [
                ["all", "All"],
                ["routine", "In routines"],
                ["empty", "Not set up"],
              ] as [RowFilter, string][]
            ).map(([id, label]) => (
              <button key={id} type="button" className="fit-filter__btn" data-on={filter === id || undefined} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {editing ? (
          <div className="fit-bar">
            {mode === "setup" ? (
              <>
                <button type="button" className="fit-btn fit-btn--live" disabled={model.strongRows.length === 0} onClick={acceptStrong}>
                  <Sparkles size={16} strokeWidth={2.4} aria-hidden />
                  Accept strong suggestions{model.strongRows.length > 0 ? ` (${model.strongRows.length})` : ""}
                </button>
                {drafts.lastAccept ? (
                  <button type="button" className="fit-btn fit-btn--quiet" onClick={() => dispatch({ type: "undoAccept" })}>
                    <Undo2 size={16} strokeWidth={2.4} aria-hidden /> Undo accept
                  </button>
                ) : null}
                <span className="fit-bar__hint">Fills the boxes only. Nothing is saved until you press Save.</span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="fit-btn fit-btn--quiet"
                  data-on={panel === "paste" || undefined}
                  aria-expanded={panel === "paste"}
                  onClick={() => setPanel((p) => (p === "paste" ? null : "paste"))}
                >
                  <ClipboardPaste size={16} strokeWidth={2.4} aria-hidden /> Paste a chart
                </button>
                <span className="fit-bar__hint">Same order as the FileMaker grid. Enter or Next moves to the next box.</span>
              </>
            )}
            <span className="fit-bar__spacer" />
            <label className="fit-switch">
              <input type="checkbox" checked={padOn} onChange={(e) => setPadOn(e.target.checked)} />
              <Keyboard size={16} strokeWidth={2.4} aria-hidden /> Keypad
            </label>
          </div>
        ) : null}

        {panel === "match" ? (
          <MatchPanel
            spec={spec}
            target={model.target}
            onChange={changeSpec}
            onReset={() => changeSpec(DEFAULT_MATCH_SPEC)}
            coverage={
              model.fit.status === "ready"
                ? `With this match, ${covered} of ${withFields} machines have enough similar clients to compare with.`
                : "Loading what similar clients use…"
            }
          />
        ) : null}
        {panel === "paste" && mode === "quick" ? (
          <PastePanel
            machines={model.allRows
              .filter((r) => r.fields.length > 0)
              .map((r) => ({
                id: r.machine.id,
                name: r.machine.name,
                fields: r.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options })),
              }))}
            onFill={fillBlock}
            onClose={() => setPanel(null)}
          />
        ) : null}
      </header>

      {seen && model.fit.status !== "ready" && mode !== "quick" ? (
        <div className="fit-loading">
          <LoadingMark size="sm" label="Loading what similar clients use…" />
        </div>
      ) : null}

      {model.rows.length === 0 ? (
        <p className="fit-empty">
          {filter === "routine"
            ? "No machines are in this client’s routines yet."
            : filter === "empty"
              ? "Every machine is set up."
              : "No machines on this floor."}
        </p>
      ) : (
        <ol className="fit-list">
          {model.rows.map((row) => {
            const d = drafts.drafts[row.machine.id];
            return (
              <SetupRow
                key={row.machine.id}
                row={row}
                mode={mode}
                activeCell={activeCell}
                padOn={padOn}
                systemCell={systemCell}
                weightShown={weightShownOf(row)}
                weightDirty={d?.weight !== undefined}
                note={d?.note}
                evidenceOpen={evidenceFor === row.machine.id}
                onActivate={(id) => {
                  if (id !== activeCell) {
                    setActiveCell(id);
                    setSystemCell(null);
                    freshRef.current = true;
                  }
                }}
                onChange={(key, value) => {
                  freshRef.current = false;
                  writeCell(row, key, value);
                }}
                onWeight={(value) => {
                  freshRef.current = false;
                  writeCell(row, WEIGHT_KEY, value);
                }}
                onEnter={() => move(1)}
                onUse={(keys) => acceptRow(row, keys)}
                onShorthand={(text) => fillShorthand(row, text)}
                onRevert={() => dispatch({ type: "revert", machineId: row.machine.id })}
                onToggleEvidence={() => setEvidenceFor((id) => (id === row.machine.id ? null : row.machine.id))}
                onAcknowledge={(flag) => acknowledge(row, flag)}
                onAdjust={(key) => {
                  setMode("setup");
                  focusCell(cellId(row.machine.id, key));
                }}
              />
            );
          })}
        </ol>
      )}

      <div className="fit-foot" ref={footRef}>
        {showPad && padCell ? (
          <QuickPad
            cell={padCell}
            position={`${activeAt + 1} of ${cells.length}`}
            onKey={padKey}
            onBackspace={padBackspace}
            onPick={padPick}
            onClear={() => {
              if (!current) return;
              writeCell(current.row, current.key, "");
              freshRef.current = false;
            }}
            onPrev={() => move(-1)}
            onNext={() => move(1)}
            onSystemKeyboard={() => {
              setSystemCell(activeCell);
              // Re-focus so iPadOS re-reads the cell's inputMode and raises its keyboard.
              const el = activeCell ? (document.getElementById(`fit-cell-${activeCell}`) as HTMLInputElement | null) : null;
              el?.blur();
              window.setTimeout(() => el?.focus(), 30);
            }}
          />
        ) : null}

        {counts.fields > 0 ? (
          <div className="fit-save" role="region" aria-label="Unsaved set-up changes">
            <p className="fit-save__count">
              <b>{counts.fields}</b> unsaved {counts.fields === 1 ? "change" : "changes"} on <b>{counts.machines}</b>{" "}
              {counts.machines === 1 ? "machine" : "machines"}
              {counts.suggested > 0 ? (
                <span className="fit-save__suggested"> &middot; {counts.suggested} accepted from suggestions</span>
              ) : null}
            </p>
            {reasonRequired ? (
              <input
                className="fit-save__reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for changing saved settings (required)"
                aria-label="Reason for the change"
              />
            ) : null}
            <div className="fit-save__actions">
              <button
                type="button"
                className="fit-btn fit-btn--quiet"
                disabled={saving}
                onClick={() => {
                  dispatch({ type: "reset" });
                  setReason("");
                }}
              >
                Discard
              </button>
              <button type="button" className="fit-btn fit-btn--hero" disabled={!canSave} onClick={save}>
                {saving ? "Saving\u2026" : "Save set-up"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
