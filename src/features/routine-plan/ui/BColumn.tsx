/**
 * B'S COLUMN — B molded in, beside Routine A (Round 2 of the design round,
 * item 6; AJ's "1d": the Lineup is A and B side by side, row-aligned, each
 * row a place in the order).
 *
 * AJ, Oct 7 2026: "the B routine starts out as the A routine with just one
 * machine different. But there are times where a trainer might do two
 * machines different or three machines different in a single session", and
 * "So the B routine is now three of the A routine session machines and three
 * of the B routine machines". And why B: "B routines is definitely for
 * variety ... it also can be to allow us to still hit areas of the body
 * while allowing a recovery on certain muscle groups".
 *
 * So B's column, beside each of Routine A's places, says either "Follows A"
 * (A's machine, quiet) or B's own machine (solid, the swap glyph, "for Leg
 * Press"), with the next swap's place marked. Over it, B's head: "B · 2 of
 * 5 swaps · next: Leg Extension for Leg Press", "Swap in the next one" and
 * the quieter Two and Three, "A and B alternate · next session is B", the
 * Academy's line about 5 to 7 runs of A (said with its source, never a
 * gate), and "B is for" Variety · Recovery · Both. A tap on a B cell opens
 * that place's strip: the same family on this floor and the Academy's
 * substitutes, each with its source, to change the place's planned swap, or
 * keep A's machine in B. Every change asks why (`ReasonSheet`, never
 * required) and is issued through the profile's `actions.save` on Routine
 * B's plan (one batch, never awaited). Nothing offers a machine the client
 * can't do (Routine A's plan's can't-do, read by A and B: AJ's "2a").
 *
 * Before B is started, the column is one quiet cell, "B starts as a copy of
 * A with one machine different", and Plan B (the profile's one sheet,
 * `PlanBSheet`, through `host.openPlanB`).
 *
 * One hook, two screens: Routine A's Lineup (`PlanLineup`) and Routine B's
 * own segment (`BPlanView`) draw the same column.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeftRight, Info, Repeat, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Routine } from "../../../types";
import {
  B_ACADEMY_LINE,
  B_ACADEMY_SOURCE,
  B_BUILD_OUT_LINE,
  B_PURPOSES,
  B_PURPOSE_LABEL,
  B_PURPOSE_WORDS,
  alternateLine,
  bColumnOf,
  bProgressOf,
  bPurposeChanged,
  bPurposeOf,
  bSlotKept,
  bSlotPlanned,
  bStatusLine,
  bSwapChoices,
  bOnDeck,
  bOnDeckRemoved,
  bSwapWait,
  bSwappedIn,
  isBPlan,
  isPlannedB,
  plannedBWords,
  plannedSwapsOf,
  swapsOf,
  swapsReady,
  type BColumn,
  type BColumnRow,
  type BEdit,
  type BSwapWait,
} from "../b-routine";
import { activeCantDo } from "../cant-do";
import { focusCellWords, type FocusRole } from "../focus";
import { FAMILY_SOURCE, SUBSTITUTES_SOURCE, effectsAbove, namesOf, signedChange } from "../lineup";
import type { OrderEffect } from "../order-effects";
import { startingSourceWords } from "../start-part";
import type { FloorMachine } from "../starting-plan";
import type { PlanSwap, RoutinePlan } from "../types";
import type { PlanHost } from "./host";
import { Chip, OrderNote, PlanMeter, SaidLine, SourceTag } from "./parts";
import { ReasonSheet } from "./ReasonSheet";
import "./routine-plan.css";

/** What Routine A's screens are handed about Routine B (RoutinesTab works it out from the profile's routines). */
export interface BSide {
  /** Routine B as saved, or null when the client has none. */
  routine: (Routine & { id: string }) | null;
  isBActive: boolean;
  /** "Routine A has run 7 times in Journey.", or null when it isn't known. */
  aRunsLine: string | null;
  /** The next session runs B (the alternation, `next-routine.ts`); null when not known. */
  nextIsB: boolean | null;
  /** The B switch (Routine B with machines: the reason asked, never required). */
  onToggleB: (on: boolean) => void;
}

/**
 * Which column B draws beside Routine A:
 * - "plan": B has a plan of swaps (Plan B, kept);
 * - "start": B has no machines: one quiet cell and Plan B; also a B planned
 *   with the starting lineup (the studio's "A and B together",
 *   `isPlannedB`), even while Routine A is empty, so B's own segment says
 *   it is planned and when it starts;
 * - "none": no column: Routine A has nothing to copy yet, or Routine B is a
 *   list of its own from before Round 2 (no plan of swaps), drawn as it
 *   always was on its own segment.
 */
export type BMode = "none" | "start" | "plan";

export function bModeOf(aRoutine: readonly string[], b: BSide | null | undefined): BMode {
  if (!b) return "none";
  const r = b.routine;
  // Planned with the starting lineup, nothing in it yet: never a column of "missing" places.
  if (r && isPlannedB(r)) return "start";
  if (aRoutine.length === 0) return "none";
  if (r && isBPlan(r.plan)) return "plan";
  if (!r || (r.machineIds?.length ?? 0) === 0) return "start";
  return "none";
}

export interface BColumnInput {
  b: BSide | null | undefined;
  /** Routine A's machines, in A's order: B's places. */
  aRoutine: readonly string[];
  /** Routine A's plan: its can't-do marks are B's too. */
  aPlan: RoutinePlan | null;
  host: PlanHost;
  floor: readonly FloorMachine[];
  nameOf: (id: string) => string;
  canWrite: boolean;
  /**
   * A weak area's tints (Round 2, item 7; focus.ts): how each machine B runs
   * works the area, by floor id. A cell is tinted by the machine at its
   * place and says it in words beside the tint. Absent: no tints.
   */
  focus?: { area: string; roles: ReadonlyMap<string, FocusRole> } | null;
}

export interface BColumnParts {
  mode: BMode;
  column: BColumn | null;
  /** B's head (mode "plan"), else null. */
  head: ReactNode;
  /** The head over B's cells, in B's column. */
  colHead: ReactNode;
  /** B's order effects drawn above the place of A's machine `aId`, in B's column. */
  notesFor: (aId: string) => ReactNode[];
  /** B's cell at the place of A's machine `aId`, and its strip when open. */
  cellFor: (aId: string) => ReactNode[];
  /** What B holds beyond A's places, under the rows, in B's column. */
  extras: ReactNode[];
  /** B not started: one cell down the column, `span` rows tall from the grid row `firstRow`; pushed after A's rows. */
  startCell: (span: number, firstRow: number) => ReactNode;
  /** The Why sheet a change opens. */
  sheets: ReactNode;
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Why the next swap waits, said under B's head, with where to change it. */
export function bWaitWords(wait: BSwapWait, next: PlanSwap, nameOf: (id: string) => string): string {
  switch (wait) {
    case "cantdo":
      return `${nameOf(next.with)} is on the can't-do list, so the next swap waits. Tap ${nameOf(next.replaces)} in B's column to plan another.`;
    case "gone":
      return `${nameOf(next.replaces)} is no longer in A, so the next swap waits. Tap it under B's column to leave it out.`;
    case "in-a":
      return `${nameOf(next.with)} is in Routine A now, so the next swap waits. Tap ${nameOf(next.replaces)} in B's column to plan another.`;
    case "a-later":
      return `${nameOf(next.replaces)} isn't in Routine A yet, so the next swap waits until A takes it.`;
  }
}

/** The Academy's line with its source and its build-out behind an (i): said beside B, never a gate. */
export function BAcademyLine({ aRunsLine }: { aRunsLine: string | null }) {
  const [open, setOpen] = useState(false);
  const source = startingSourceWords(B_ACADEMY_SOURCE);
  return (
    <div className="rpl-well rpl-bacademy">
      <div className="rpl-bstrip__head">
        <p className="rpl-bacademy__text">{[aRunsLine, B_ACADEMY_LINE].filter(Boolean).join(" ")}</p>
        <Button variant="ghost" size="icon" aria-label="How B is built out" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Info aria-hidden="true" />
        </Button>
      </div>
      {open && <p className="rpl-bacademy__text">{B_BUILD_OUT_LINE} A guide, never a gate.</p>}
      {source && <SourceTag>{source}</SourceTag>}
    </div>
  );
}

export function useBColumn(input: BColumnInput): BColumnParts {
  const { b, aRoutine, aPlan, host, floor, nameOf, canWrite, focus = null } = input;
  const mode = bModeOf(aRoutine, b);
  const bRoutine = b?.routine ?? null;
  const bPlan = mode === "plan" && bRoutine && isBPlan(bRoutine.plan) ? bRoutine.plan : null;
  const bIds = bRoutine?.machineIds ?? [];
  // Routine A's road: a swap planned for a machine still on it waits for A, never "gone" (item 8).
  const aRoad = useMemo(() => (Array.isArray(aPlan?.intended) ? [...aPlan.intended] : []), [aPlan?.intended]);
  const aKey = aRoutine.join("|");
  const bKey = bIds.join("|");

  const column = useMemo(
    () => (bPlan ? bColumnOf(aRoutine, bPlan, bIds, aRoad) : null),
    // The lists by their contents, so a new array with the same machines is no change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aKey, bKey, bPlan, aRoad.join("|")],
  );
  const effects = useMemo(() => {
    const at = new Map<string, OrderEffect[]>();
    if (!column) return at;
    const list = column.rows.map((r) => r.bId ?? "");
    for (const [i, es] of effectsAbove(list, nameOf, floor)) {
      const row = column.rows[i];
      if (row) at.set(row.aId, es);
    }
    return at;
  }, [column, nameOf, floor]);

  const [picked, setPicked] = useState<string | null>(null);
  const [asking, setAsking] = useState<{ what: string; edit: BEdit; said?: string } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const who = host.who;
  // What the client can't do, read by A and B (AJ's "2a"): never swapped into B.
  const held = useMemo(() => activeCantDo(aPlan, host.todayYmd).map((c) => c.machineId), [aPlan, host.todayYmd]);

  const ask = (what: string, edit: BEdit | null, words?: string) => {
    if (!edit || !canWrite) return;
    setAsking({ what, edit, ...(words ? { said: words } : null) });
  };
  const write = (edit: BEdit, reason: string | null) => {
    if (!who || !bRoutine) return;
    const signed = edit.changes.map((c) => signedChange(c, who, reason));
    const [first, ...rest] = signed;
    if (!first) return;
    host.actions.save(bRoutine.id, {
      plan: edit.plan,
      change: first,
      ...(rest.length > 0 ? { also: rest } : null),
      ...(sameList(edit.machineIds, bIds) ? null : { machineIds: edit.machineIds }),
    });
  };

  /* ── B's head ── */
  let head: ReactNode = null;
  if (mode === "plan" && b && bPlan && column) {
    const status = column.status;
    // The swaps that can go in now: up to the first that waits (the client
    // can't do its machine, its A machine left A or isn't in A yet, or A
    // holds its machine).
    const left = swapsReady(aRoutine, swapsOf(bPlan), bIds, held);
    const wait = status.next ? bSwapWait(status.next, aRoutine, held, aRoad) : null;
    const purpose = bPurposeOf(bPlan);
    const alternate = b.isBActive ? alternateLine(b.nextIsB) : null;
    const swapIn = (n: number) => {
      const edit = bSwappedIn(aRoutine, bPlan, bIds, n, held);
      if (!edit) return;
      const coming = edit.changes.map((c) => ({ with: c.machineIds[1] ?? "", replaces: c.machineIds[0] ?? "" }));
      const what =
        coming.length === 1
          ? `Swap in ${nameOf(coming[0]!.with)} for ${nameOf(coming[0]!.replaces)}`
          : `Swap in ${namesOf(coming.map((c) => c.with), nameOf)}`;
      ask(what, edit, what.replace(/^Swap in/, "Swapped in"));
    };
    head = (
      <div className="rpl-bhead" role="group" aria-label="Routine B's plan">
        <div className="rpl-progress">
          <p className="rpl-progress__line">{bStatusLine(status, nameOf)}</p>
          {status.of > 0 && <PlanMeter progress={bProgressOf(status)} />}
        </div>
        {b.isBActive ? (
          alternate && (
            <p className="rpl-line">
              <Repeat size={16} aria-hidden="true" /> {alternate}
            </p>
          )
        ) : (
          <div className="rpl-actions">
            <p className="rpl-line">Routine B is off, so every session runs A.</p>
            {canWrite && (
              <Button variant="outline" onClick={() => b.onToggleB(true)}>
                Turn B on
              </Button>
            )}
          </div>
        )}
        <BAcademyLine aRunsLine={b.aRunsLine} />
        {wait && status.next && <p className="rpl-line">{bWaitWords(wait, status.next, nameOf)}</p>}
        {canWrite && b.isBActive && status.next && left > 0 && (
          <div className="rpl-actions">
            <Button className="hover:bg-primary" onClick={() => swapIn(1)}>
              Swap in the next one
            </Button>
            {left >= 2 && (
              <Button variant="outline" aria-label="Swap in the next two" onClick={() => swapIn(2)}>
                Two
              </Button>
            )}
            {left >= 3 && (
              <Button variant="outline" aria-label="Swap in the next three" onClick={() => swapIn(3)}>
                Three
              </Button>
            )}
          </div>
        )}
        <div className="rpl-actions" role="group" aria-label="B is for">
          <span className="rpl-bhead__label">B is for</span>
          {B_PURPOSES.map((p) => (
            <Chip
              key={p}
              on={purpose === p}
              disabled={!canWrite}
              onClick={() => {
                if (p !== purpose) ask(`B is for ${B_PURPOSE_LABEL[p].toLowerCase()}`, bPurposeChanged(bPlan, bIds, p), B_PURPOSE_WORDS[p]);
              }}
            >
              {B_PURPOSE_LABEL[p]}
            </Chip>
          ))}
        </div>
        {said && <SaidLine onClear={() => setSaid(null)}>{said}</SaidLine>}
      </div>
    );
  }

  /* ── The column's head ── */
  const colHead: ReactNode =
    mode === "none" ? null : (
      <li key="b-colhead" className="rpl-colhead rpl-bside">
        Routine B
        <span className="rpl-colhead__meta">
          {column ? (column.status.of > 0 ? `${column.status.made} of ${column.status.of} swaps in` : "no swaps planned") : "not started"}
        </span>
      </li>
    );

  /* ── A place's cell, and its strip ── */
  const cellWords = (row: BColumnRow): { name: string; sub: string } => {
    switch (row.kind) {
      case "own":
        return { name: nameOf(row.bId!), sub: `B's own · for ${nameOf(row.aId)}${held.includes(row.bId!) ? " · can't do for now" : ""}` };
      case "next": {
        const wait = bSwapWait(row.swap!, aRoutine, held);
        const why = wait === "cantdo" ? ", can't do for now" : wait === "in-a" ? ", in A now" : "";
        return { name: nameOf(row.aId), sub: `Follows A · next swap: ${nameOf(row.swap!.with)}${why}` };
      }
      case "missing":
        return { name: "Not in B", sub: `${nameOf(row.aId)} is in A only` };
      default:
        return { name: nameOf(row.aId), sub: row.swap ? `Follows A · later: ${nameOf(row.swap.with)}` : "Follows A" };
    }
  };
  const strip = (row: BColumnRow): ReactNode => {
    if (!bPlan) return null;
    const choices = bSwapChoices({
      aId: row.aId,
      aRoutine,
      aIntended: aPlan?.intended,
      bPlan,
      floor,
      cantDo: aPlan?.cantDo,
      todayYmd: host.todayYmd,
    });
    const pick = (to: string) =>
      ask(`B: ${nameOf(to)} for ${nameOf(row.aId)}`, bSlotPlanned({ aRoutine, bPlan, bRoutine: bIds, aId: row.aId, to }), `B: ${nameOf(to)} for ${nameOf(row.aId)}`);
    const chip = (id: string) => (
      <Chip key={id} on={id === choices.current} onClick={() => id !== choices.current && pick(id)}>
        {nameOf(id)}
      </Chip>
    );
    return (
      <li key={`bs-${row.aId}`} className="rpl-bstrip" role="group" aria-label={`In B, instead of ${nameOf(row.aId)}`}>
        <div className="rpl-bstrip__head">
          <p className="rpl-bstrip__title">In B, instead of {nameOf(row.aId)}</p>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setPicked(null)}>
            <X aria-hidden="true" />
          </Button>
        </div>
        {choices.same.length === 0 && choices.substitutes.length === 0 && (
          <p className="rpl-meta">Nothing else in this family on this floor.</p>
        )}
        {choices.same.length > 0 && (
          <>
            <p className="rpl-meta">
              {choices.family ? `${choices.family}, on this floor` : "Same family, on this floor"} · {FAMILY_SOURCE}
            </p>
            <div className="rpl-chips">{choices.same.map(chip)}</div>
          </>
        )}
        {choices.substitutes.length > 0 && (
          <>
            <p className="rpl-meta">The Academy's substitutes · {SUBSTITUTES_SOURCE}</p>
            <div className="rpl-chips">{choices.substitutes.map(chip)}</div>
          </>
        )}
        {row.swap && (
          <div className="rpl-actions">
            <Button
              variant="outline"
              className="h-auto min-h-10 max-w-full shrink whitespace-normal py-2 text-left"
              onClick={() =>
                ask(`Keep ${nameOf(row.aId)} in B`, bSlotKept({ aRoutine, bPlan, bRoutine: bIds, aId: row.aId }), `B keeps ${nameOf(row.aId)}`)
              }
            >
              Keep {nameOf(row.aId)} in B
            </Button>
          </div>
        )}
      </li>
    );
  };
  const cellFor = (aId: string): ReactNode[] => {
    const row = column?.rows.find((r) => r.aId === aId);
    if (!row) return [];
    const { name, sub: words } = cellWords(row);
    const role = row.bId ? focus?.roles.get(row.bId) : undefined;
    const sub = role && focus ? `${words} · ${focusCellWords(role, focus.area)}` : words;
    const pressed = picked === row.aId;
    const inner = (
      <>
        {row.kind === "own" && <ArrowLeftRight size={18} className="rpl-bcell__icon" aria-hidden="true" />}
        <span className="rpl-bcell__text">
          <span className="rpl-bcell__name">{name}</span>
          <span className="rpl-bcell__sub">{sub}</span>
        </span>
      </>
    );
    const cell = (
      <li key={`b-${row.aId}`} className="rpl-bside">
        {canWrite ? (
          <button
            type="button"
            className="rpl-bcell"
            data-kind={row.kind}
            data-focus={role}
            aria-pressed={pressed}
            aria-label={`Routine B: ${name} · ${sub}`}
            onClick={() => setPicked(pressed ? null : row.aId)}
          >
            {inner}
          </button>
        ) : (
          <span className="rpl-bcell" data-kind={row.kind} data-focus={role}>
            {inner}
          </span>
        )}
      </li>
    );
    return pressed ? [cell, strip(row)] : [cell];
  };
  const notesFor = (aId: string): ReactNode[] =>
    (effects.get(aId) ?? []).map((e) => <OrderNote key={`be-${e.ruleId}-${aId}`} effect={e} className="rpl-bside" />);

  const tinted = (id: string, words: string): { sub: string; role: FocusRole | undefined } => {
    const role = focus?.roles.get(id);
    return { sub: role && focus ? `${words} · ${focusCellWords(role, focus.area)}` : words, role };
  };
  const extras: ReactNode[] = (column?.extras ?? []).map((e) => {
    const t = tinted(e.id, e.for ? `B's own · for ${nameOf(e.for)}, no longer in A` : "In B only");
    return (
      <li key={`bx-${e.id}`} className="rpl-bside">
        <span className="rpl-bcell" data-kind="own" data-focus={t.role}>
          <ArrowLeftRight size={18} className="rpl-bcell__icon" aria-hidden="true" />
          <span className="rpl-bcell__text">
            <span className="rpl-bcell__name">{nameOf(e.id)}</span>
            <span className="rpl-bcell__sub">{t.sub}</span>
          </span>
        </span>
      </li>
    );
  });
  /* B's own on deck (a weak area's addition for B, focus.ts): on B's plan,
     not in Routine B yet; Routine B takes one only on purpose. A tap offers
     to take it off B's plan again, so nothing put there is there for good. */
  for (const id of bPlan ? bOnDeck(aRoutine, bPlan, bIds) : []) {
    const t = tinted(id, "On deck in B");
    const key = `deck:${id}`;
    const pressed = picked === key;
    const text = (
      <span className="rpl-bcell__text">
        <span className="rpl-bcell__name">{nameOf(id)}</span>
        <span className="rpl-bcell__sub">{t.sub}</span>
      </span>
    );
    extras.push(
      <li key={`bd-${id}`} className="rpl-bside">
        {canWrite ? (
          <button
            type="button"
            className="rpl-bcell"
            data-kind="deck"
            data-focus={t.role}
            aria-pressed={pressed}
            aria-label={`Routine B: ${nameOf(id)} · ${t.sub}`}
            onClick={() => setPicked(pressed ? null : key)}
          >
            {text}
          </button>
        ) : (
          <span className="rpl-bcell" data-kind="deck" data-focus={t.role}>
            {text}
          </span>
        )}
      </li>,
    );
    if (pressed && bPlan) {
      extras.push(
        <li key={`bds-${id}`} className="rpl-bstrip" role="group" aria-label={`${nameOf(id)}, on deck in B`}>
          <div className="rpl-bstrip__head">
            <p className="rpl-bstrip__title">{nameOf(id)}, on deck in B</p>
            <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setPicked(null)}>
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className="rpl-actions">
            <Button
              variant="outline"
              className="h-auto min-h-10 max-w-full shrink whitespace-normal py-2 text-left"
              onClick={() => ask(`Take ${nameOf(id)} off B's plan`, bOnDeckRemoved(aRoutine, bPlan, bIds, id), `${nameOf(id)} off B's plan`)}
            >
              Take off B's plan
            </Button>
          </div>
        </li>,
      );
    }
  }
  /* A swap still to come whose A machine has left A: no place shows it, so it
     waits under the rows, and a tap offers to leave it out of B's plan. A
     swap planned with the starting lineup for a machine still on A's road
     (item 8) waits there too, said as waiting for A, never as gone. */
  const away = [
    ...(column?.gone ?? []).map((s) => ({ s, sub: `Planned · ${nameOf(s.replaces)} is no longer in A` })),
    ...(column?.waiting ?? []).map((s) => ({ s, sub: `Planned · waits for ${nameOf(s.replaces)} in Routine A` })),
  ];
  for (const { s, sub } of away) {
    const key = `gone:${s.replaces}`;
    const pressed = picked === key;
    const name = `${nameOf(s.with)} for ${nameOf(s.replaces)}`;
    extras.push(
      <li key={`bg-${s.replaces}`} className="rpl-bside">
        {canWrite ? (
          <button
            type="button"
            className="rpl-bcell"
            data-kind="follows"
            aria-pressed={pressed}
            aria-label={`Routine B: ${name} · ${sub}`}
            onClick={() => setPicked(pressed ? null : key)}
          >
            <span className="rpl-bcell__text">
              <span className="rpl-bcell__name">{name}</span>
              <span className="rpl-bcell__sub">{sub}</span>
            </span>
          </button>
        ) : (
          <span className="rpl-bcell" data-kind="follows">
            <span className="rpl-bcell__text">
              <span className="rpl-bcell__name">{name}</span>
              <span className="rpl-bcell__sub">{sub}</span>
            </span>
          </span>
        )}
      </li>,
    );
    if (pressed && bPlan) {
      extras.push(
        <li key={`bgs-${s.replaces}`} className="rpl-bstrip" role="group" aria-label={`B's swap for ${nameOf(s.replaces)}`}>
          <div className="rpl-bstrip__head">
            <p className="rpl-bstrip__title">B's swap for {nameOf(s.replaces)}</p>
            <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setPicked(null)}>
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className="rpl-actions">
            <Button
              variant="outline"
              onClick={() =>
                ask(`Leave ${nameOf(s.with)} out of B`, bSlotKept({ aRoutine, bPlan, bRoutine: bIds, aId: s.replaces }), `${nameOf(s.with)} left out of B`)
              }
            >
              Leave this swap out
            </Button>
          </div>
        </li>,
      );
    }
  }

  /* Placed AFTER A's rows, so a phone, where the list is one column, draws
     it under them; side by side, the grid puts it beside them by its own
     row line (`firstRow`), never splitting A's rows (the review of Round 2:
     pushed after A's first row, it sat between A's first and second
     machines on a phone). */
  // A B planned with the starting lineup (the studio's "A and B together") says what it starts with.
  const plannedSwaps = plannedSwapsOf(bRoutine);
  const startCell = (span: number, firstRow: number): ReactNode =>
    mode === "start" ? (
      <li key="b-start" className="rpl-bside" style={{ gridRow: `${Math.max(1, firstRow)} / span ${Math.max(1, span)}` }}>
        <div className="rpl-bstart">
          <p className="rpl-bstart__title">
            {plannedSwaps
              ? plannedBWords({ swaps: plannedSwaps, aRoutine, aPlan, floor, todayYmd: host.todayYmd, nameOf })
              : "B starts as a copy of A with one machine different."}
          </p>
          {b?.aRunsLine && <p className="rpl-meta">{b.aRunsLine}</p>}
          {canWrite && host.openPlanB && (
            <Button variant="outline" onClick={host.openPlanB}>
              Plan B
            </Button>
          )}
        </div>
      </li>
    ) : null;

  const sheets: ReactNode = asking ? (
    <ReasonSheet
      open
      what={asking.what}
      onClose={() => setAsking(null)}
      onSave={(reason) => {
        write(asking.edit, reason);
        setSaid(asking.said ?? null);
        setAsking(null);
        setPicked(null);
      }}
    />
  ) : null;

  return { mode, column, head, colHead, notesFor, cellFor, extras, startCell, sheets };
}
