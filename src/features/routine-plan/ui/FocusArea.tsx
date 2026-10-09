/**
 * A WEAK AREA — the focus on Programming's Lineup (Round 2 of the design
 * round, item 7; the proposal is docs/rounds/2026-10-07-first-session-and-
 * routines.md §5.4b, and AJ's yes was "yes lets apply this all").
 *
 * AJ, Oct 7 2026: "we discovered that the client has very weak delts. What
 * can we do about to adjust the routines currently?" The Academy has no
 * weak-point rule, but what it does say answers it (focus.ts): hit the area
 * in BOTH workouts, a swap within the same family before an addition, and a
 * single-joint machine when one is added. So:
 *
 * - a quiet "Weak area" control: the areas as chips, one at a time, a second
 *   tap clears. Picking one stores it on Routine A's plan (a "focus" change,
 *   `plan.focus`), so the next trainer sees "Focus: Delts" in the plan's
 *   head and on the briefing's glance line. The reason is asked, never
 *   required;
 * - the A | B lineup tints the machines that work the area: a main mover on
 *   the blue tint, a helper on a blue outline, each said in words too;
 * - the three answers, numbered, each a one-tap suggestion with its source:
 *   1 · In A and B? (each routine's line, judged as it runs today, what is
 *   only on the plan named as such); 2 · A swap in the same family, instead
 *   of an addition? ([Swap]: in Routine A, which B follows in the same batch
 *   where it follows A at that place; or on B's plan for that place, a swap
 *   already in B changed, or one added after B's others; or [Keep in B],
 *   A's own main mover back in B where B's swap took it out); 3 · Or add a
 *   single-joint machine? ([Add to the plan], on deck, never into today's
 *   routine), with what it does to the plan's count against the Academy's
 *   6 to 8; and the Academy's setting first where the area is answered by
 *   one. An addition on B alone sits on B's own deck, where B's column
 *   offers to take it off again.
 *
 * Nothing here reorders a routine to put the area first, and nothing moves a
 * weight. A machine the client can't do is never offered (Routine A's plan's
 * can't-do, read by A and B: AJ's "2a"). Every change is ONE write through
 * the profile's `actions.save`, never awaited, with its reason asked
 * (`ReasonSheet`, never required).
 */
import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeftRight, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isBPlan, type BEdit } from "../b-routine";
import { activeCantDo } from "../cant-do";
import {
  FOCUS_AREAS,
  FOCUS_B_OWN,
  FOCUS_NEVER,
  FOCUS_SOURCE,
  focusAddNotes,
  focusAddQuestion,
  focusAddToA,
  focusAddToB,
  focusAreasOf,
  focusAreaWords,
  focusChanged,
  focusCountWords,
  focusLine,
  focusLineWords,
  focusMissingWords,
  focusNoAddWords,
  focusNoSwapWords,
  focusPanelOf,
  focusSwapInB,
  focusWhichWords,
  type FocusAddRow,
  type FocusBSide,
  type FocusPanel,
  type FocusRole,
  type FocusSwapRow,
} from "../focus";
import { signedChange, swappedIn, writeOf, type PlanEdit } from "../lineup";
import type { FloorMachine } from "../starting-plan";
import type { RoutinePlan } from "../types";
import type { BSide } from "./BColumn";
import type { PlanHost } from "./host";
import { Chip, SaidLine, SourceTag } from "./parts";
import { ReasonSheet } from "./ReasonSheet";
import "./routine-plan.css";

export interface FocusAreaInput {
  /** Routine A, with its plan. */
  routineId: string;
  plan: RoutinePlan;
  /** Routine A's machines. */
  routine: readonly string[];
  /** The Lineup's two groups: Routine A (or day one while it runs), then On deck. */
  first: readonly string[];
  deck: readonly string[];
  /** Routine B, as the Lineup is handed it. */
  b: BSide | null;
  host: PlanHost;
  floor: readonly FloorMachine[];
  nameOf: (id: string) => string;
  canWrite: boolean;
  /** The answers in a panel of their own, beside the lineup (a landscape iPad), rather than under the chips. */
  beside: boolean;
  /** After a change to Routine A's plan: the Lineup reads its Changes again. */
  onChanged: () => void;
}

export interface FocusAreaParts {
  /** The area the plan holds, or null. */
  area: string | null;
  /** The tints while the area is shown (the control open), by floor id; null otherwise. */
  roles: ReadonlyMap<string, FocusRole> | null;
  /** "Focus: Delts", for the plan's head; null with none. */
  headLine: string | null;
  /** The quiet control: Weak area, its chips, the legend, and the answers unless they sit `beside`. */
  control: ReactNode;
  /** The answers in their own panel (only `beside`, and only while an area is shown). */
  panel: ReactNode;
  /** The Why sheet a change opens. */
  sheets: ReactNode;
}

type Asking = { what: string; said: string; run: (reason: string | null) => void };

/** One of the three numbered answers. */
function Answer({ n, q, children }: { n: number; q: string; children: ReactNode }) {
  return (
    <li className="rpl-focus__answer">
      <span className="rpl-focus__n" aria-hidden="true">
        {n}
      </span>
      <div className="rpl-focus__body">
        <p className="rpl-focus__q">
          <span className="sr-only">{n}. </span>
          {q}
        </p>
        {children}
      </div>
    </li>
  );
}

/** Which routine an answer is about: words, never a control. */
function Tag({ children }: { children: ReactNode }) {
  return <span className="rpl-focus__tag">{children}</span>;
}

export function useFocusArea(input: FocusAreaInput): FocusAreaParts {
  const { routineId, plan, routine, first, deck, b, host, floor, nameOf, canWrite, beside, onChanged } = input;
  const area = focusAreasOf(plan)[0] ?? null;
  const [open, setOpen] = useState(area !== null);
  // A stored focus that arrives after the Lineup mounted (the routines read
  // later, or another iPad's pick) opens the control too, so "Focus: Delts"
  // in the head never stands without its tints and answers.
  const [seenArea, setSeenArea] = useState(area);
  if (seenArea !== area) {
    setSeenArea(area);
    if (area && !seenArea) setOpen(true);
  }
  const [asking, setAsking] = useState<Asking | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const who = host.who;
  const today = host.todayYmd;

  // What the client can't do, read by A and B (AJ's "2a"): never offered.
  const held = useMemo(() => activeCantDo(plan, today).map((c) => c.machineId), [plan, today]);
  const bRoutine = b?.routine ?? null;
  const bPlanStored = bRoutine?.plan;
  const bKey = (bRoutine?.machineIds ?? []).join("|");
  // B's machines by their contents, so a new array with the same machines is no change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bIds = useMemo(() => [...(bRoutine?.machineIds ?? [])], [bKey]);
  const bSide: FocusBSide = useMemo(
    () =>
      // A B planned with the starting lineup and not started (no machines yet) is "Not started".
      bPlanStored && isBPlan(bPlanStored) && bIds.length > 0
        ? { kind: "plan", plan: bPlanStored, routine: bIds }
        : bIds.length > 0
          ? { kind: "own", routine: bIds }
          : { kind: "none" },
    [bPlanStored, bIds],
  );
  const panel: FocusPanel | null = useMemo(
    () => (area ? focusPanelOf({ area, aRoutine: routine, aFirst: first, aDeck: deck, b: bSide, floor, held }) : null),
    [area, routine, first, deck, bSide, floor, held],
  );
  const shown = open && !!panel;

  const ask = (what: string, said: string, run: (reason: string | null) => void) => {
    if (!canWrite || !who) return;
    setAsking({ what, said, run });
  };
  const saveA = (edit: PlanEdit, reason: string | null) => {
    if (!who) return;
    host.actions.save(routineId, writeOf(edit, routine, who, reason));
    onChanged();
  };
  const saveB = (edit: BEdit | null, reason: string | null) => {
    if (!who || !bRoutine || !edit) return;
    const [one, ...rest] = edit.changes.map((c) => signedChange(c, who, reason));
    if (!one) return;
    const same = edit.machineIds.length === bIds.length && edit.machineIds.every((id, i) => id === bIds[i]);
    host.actions.save(bRoutine.id, {
      plan: edit.plan,
      change: one,
      ...(rest.length > 0 ? { also: rest } : null),
      ...(same ? null : { machineIds: edit.machineIds }),
    });
  };

  /* ── Picking an area: one at a time, a second tap clears ── */
  const pick = (key: string) => {
    const label = FOCUS_AREAS[key]!.label;
    if (key === area) {
      ask(`Take the focus off ${label}`, "Took the focus off", (reason) => saveA(focusChanged(plan, routine, null), reason));
    } else {
      ask(`Focus: ${label}`, `Focus: ${label}`, (reason) => {
        saveA(focusChanged(plan, routine, key), reason);
        setOpen(true);
      });
    }
  };

  /* ── The answers' taps ── */
  const swap = (row: FocusSwapRow) => {
    const to = nameOf(row.to);
    const from = nameOf(row.from);
    const where = focusWhichWords(row.routines);
    if (row.target.routine === "A") {
      ask(`${to} for ${from} in ${where}`, `${to} instead of ${from}`, (reason) => saveA(swappedIn(plan, routine, row.from, [row.to]), reason));
      return;
    }
    const target = row.target;
    const bPlan = bSide.kind === "plan" ? bSide.plan : null;
    if (!bPlan) return;
    const words = target.keep ? `Keep ${to} in B` : `B: ${to} for ${from}`;
    ask(words, target.keep ? `B keeps ${to}` : words, (reason) =>
      saveB(focusSwapInB({ aRoutine: routine, bPlan, bRoutine: bIds, target, to: row.to }), reason),
    );
  };
  const add = (row: FocusAddRow) => {
    const name = nameOf(row.machineId);
    const where = focusWhichWords(row.routines);
    const title = row.routines.length > 1 ? `Add ${name} to the plans for A and B` : `Add ${name} to ${row.routines[0]}'s plan`;
    ask(title, `${name} on deck in ${where}`, (reason) => {
      if (row.writeOn === "A") saveA(focusAddToA(plan, routine, row.machineId), reason);
      else if (bSide.kind === "plan") saveB(focusAddToB(bSide.plan, bIds, row.machineId), reason);
    });
  };

  /* ── The answers ── */
  const addNotes = panel ? focusAddNotes(panel, nameOf) : [];
  const answers = panel ? (
    <div className="rpl-focus__answers">
      {!beside && <SourceTag>{FOCUS_SOURCE}</SourceTag>}
      {panel.settingsNote && (
        <div className="rpl-well">
          <p className="rpl-focus__q">A setting before a machine</p>
          <p className="rpl-focus__text">{panel.settingsNote}</p>
        </div>
      )}
      <ol className="rpl-focus__list" aria-label={`Weak ${panel.label.toLowerCase()}: three questions`}>
        <Answer n={1} q="In A and B?">
          {panel.lines.map((l) => (
            <div key={l.routine} className="rpl-focus__item">
              <Tag>{l.routine}</Tag>
              <span className="rpl-focus__line">{focusLineWords(l, panel.area, nameOf)}</span>
            </div>
          ))}
          <p className="rpl-meta">{focusMissingWords(panel)}</p>
          {panel.bOwn && <p className="rpl-meta">{FOCUS_B_OWN}</p>}
        </Answer>
        <Answer n={2} q="A swap in the same family, instead of an addition?">
          {panel.missingFrom.length === 0 ? (
            <p className="rpl-meta">Not needed.</p>
          ) : panel.swaps.length === 0 ? (
            <p className="rpl-meta">{focusNoSwapWords(panel)}</p>
          ) : (
            panel.swaps.map((row) => {
              const keep = row.target.routine === "B" && !!row.target.keep;
              const where = focusWhichWords(row.routines);
              return (
                <div key={row.key} className="rpl-focus__row">
                  <div className="rpl-focus__rowtext">
                    <span className="rpl-focus__top">
                      <span className="rpl-focus__what">
                        {keep ? `Keep ${nameOf(row.to)} in B` : `${nameOf(row.to)} for ${nameOf(row.from)}`}
                      </span>
                      <Tag>{where}</Tag>
                    </span>
                    <span className="rpl-focus__sub">
                      {[keep ? `instead of ${nameOf(row.from)}` : row.family, "keeps the count", row.planned ? "on B's plan, after its other swaps" : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  {canWrite && (
                    <Button
                      className="hover:bg-primary"
                      aria-label={
                        keep
                          ? `Keep ${nameOf(row.to)} in B, instead of ${nameOf(row.from)}`
                          : `Swap: ${nameOf(row.to)} for ${nameOf(row.from)} in ${where}`
                      }
                      onClick={() => swap(row)}
                    >
                      <ArrowLeftRight aria-hidden="true" />
                      {keep ? "Keep in B" : "Swap"}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </Answer>
        <Answer n={3} q={focusAddQuestion(panel)}>
          {panel.missingFrom.length === 0 ? (
            <p className="rpl-meta">Not needed.</p>
          ) : panel.adds.length === 0 && addNotes.length === 0 ? (
            <p className="rpl-meta">{focusNoAddWords(panel)}</p>
          ) : (
            panel.adds.map((row) => (
              <div key={row.key} className="rpl-focus__row">
                <div className="rpl-focus__rowtext">
                  <span className="rpl-focus__top">
                    <span className="rpl-focus__what">Add {nameOf(row.machineId)}</span>
                    <Tag>{focusWhichWords(row.routines)}</Tag>
                  </span>
                  <span className="rpl-focus__sub">
                    {row.singleJoint ? "Single-joint · " : ""}
                    {focusCountWords(row)}
                  </span>
                </div>
                {canWrite && (
                  <Button variant="outline" aria-label={`Add to the plan: ${nameOf(row.machineId)} for ${focusWhichWords(row.routines)}`} onClick={() => add(row)}>
                    <Plus aria-hidden="true" />
                    Add to the plan
                  </Button>
                )}
              </div>
            ))
          )}
          {panel.missingFrom.length > 0 &&
            addNotes.map((note) => (
              <p key={note} className="rpl-meta">
                {note}
              </p>
            ))}
        </Answer>
      </ol>
      <p className="rpl-meta">{FOCUS_NEVER} Additions go on deck.</p>
    </div>
  ) : null;

  const legend = shown ? (
    <div className="rpl-focus__legend" aria-hidden="true">
      <span className="rpl-focus__key">
        <span className="rpl-focus__swatch rpl-focus__swatch--primary" />
        Works {focusAreaWords(panel!.area)}
      </span>
      <span className="rpl-focus__key">
        <span className="rpl-focus__swatch rpl-focus__swatch--helper" />
        Helps
      </span>
    </div>
  ) : null;

  const control = (
    <div className="rpl-focus" role="group" aria-label="Weak area">
      <div className="rpl-actions">
        <Button variant="outline" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          Weak area
          <ChevronDown aria-hidden="true" className={open ? "rotate-180" : undefined} />
        </Button>
        {!open && area && <span className="rpl-meta">{FOCUS_AREAS[area]!.label}</span>}
      </div>
      {open && (
        <div className="rpl-chips" role="group" aria-label="Pick a weak area">
          {Object.entries(FOCUS_AREAS).map(([key, def]) => (
            <Chip key={key} on={key === area} disabled={!canWrite} onClick={() => pick(key)}>
              {def.label}
            </Chip>
          ))}
        </div>
      )}
      {said && <SaidLine onClear={() => setSaid(null)}>{said}</SaidLine>}
      {legend}
      {shown && !beside && answers}
    </div>
  );

  const side =
    shown && beside && panel ? (
      <section className="rpl-panel" aria-label={`Weak ${panel.label.toLowerCase()}`}>
        <div className="rpl-panel__head">
          <h3 className="rpl-panel__title">Weak {panel.label.toLowerCase()}</h3>
          <div className="rpl-panel__right">
            <SourceTag>{FOCUS_SOURCE}</SourceTag>
          </div>
        </div>
        {answers}
      </section>
    ) : null;

  const sheets: ReactNode = asking ? (
    <ReasonSheet
      open
      what={asking.what}
      onClose={() => setAsking(null)}
      onSave={(reason) => {
        asking.run(reason);
        setSaid(asking.said);
        setAsking(null);
      }}
    />
  ) : null;

  return {
    area,
    roles: shown ? panel!.roles : null,
    headLine: focusLine(plan),
    control,
    panel: side,
    sheets,
  };
}
