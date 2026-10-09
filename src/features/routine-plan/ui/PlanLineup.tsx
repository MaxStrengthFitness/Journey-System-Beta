/**
 * THE LINEUP — Routine A with its plan, on Programming (the design round,
 * Oct 8 2026, §4.3; AJ's "1d").
 *
 * The head: the purpose (editable), "3 of 6 · next: Hip Abduction" with the
 * segmented meter, the "Routine A is being built" switch, Re-plan, and the
 * Changes (a right-hand column on a landscape iPad, a "Changes · N" sheet in
 * portrait and on a phone). The lineup: "In Routine A" with the rows
 * Programming has always drawn (the settings chips, the load, the last
 * outcome; a tap opens the machine's card), or the plan's day one while
 * Routine A is still empty (the consult is not Routine A); On deck, where
 * only the Next row has "Add to A now", never while day one runs; the bench,
 * "Not for {First}"; and the order effects as quiet rows between the two
 * rows that trip them.
 *
 * B beside A (Round 2, item 6; AJ's "1d", the Lineup's identity): with
 * Routine B handed in (`b`) and Routine A holding machines, the lineup's
 * "In Routine A" rows gain B's column, row-aligned, each row a place in A's
 * order: B's cell "Follows A" or B's own machine, the next swap's place
 * marked, B's head over the lineup ("B · 2 of 5 swaps · next: …", Swap in
 * the next one, B is for), and before B starts one quiet cell and Plan B
 * (`BColumn.tsx`). On deck and the bench stay A's, across both columns.
 *
 * Every change: AJ, Oct 7 2026, "Any trainer who trains the client can
 * definitely change the plan ... You should be able to change that and make
 * the call as a trainer because you're training them that day", and "it's
 * nice to be able to communicate like, hey, I'm changing this plan because
 * of this reason". So each one asks why (`ReasonSheet`, never required) and
 * is issued through the profile's `actions.save` (`store.ts`'s
 * `savePlanChange`: the plan, the change and Routine A's machines when they
 * move, in one batch), never awaited. The profile patches its routines at
 * once and toasts a refusal.
 */
import { useMemo, useState, type ReactNode } from "react";
import { History, MoreHorizontal, Pencil, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { Routine, RoutineAdjustment, Trainer } from "../../../types";
import { useMediaQuery, NOW_BAR_SIDE_QUERY } from "../../../hooks/useMediaQuery";
import { usePhone } from "../../phone/device";
import { useUnsavedChanges } from "../../unsaved-changes";
import { RoutineRowItem } from "../../routines/RoutineRowItem";
import type { RoutineRow } from "../../routines/routine-rows";
import { healthNoteOffer, standInLine } from "../cant-do";
import {
  addedNow,
  buildingChanged,
  effectsAbove,
  healthNoteBody,
  healthNoteBodyFor,
  lineupOf,
  markedCantDo,
  movedIn,
  purposeChanged,
  reopened,
  replanned,
  signedChange,
  swapChoices,
  swappedIn,
  takenOut,
  writeOf,
  type PlanEdit,
} from "../lineup";
import { startingSourceWords } from "../start-part";
import { TEMPLATE_SOURCE, academyTemplateName } from "../starting-plan";
import { academyTemplateOf } from "../starting-routines";
import type { RoutinePlan } from "../types";
import { useBColumn, type BSide } from "./BColumn";
import { CantDoSheet, type CantDoSave } from "./CantDoSheet";
import { floorMachinesOf, type PlanHost } from "./host";
import { BenchEntry, GroupHead, LineupRow, NextPill, Num, OrderNote, PlanMeter, PlanSheet, SaidLine, SourceTag } from "./parts";
import { PlanChangesList } from "./PlanChangesList";
import { ReasonSheet } from "./ReasonSheet";
import { ReplanSheet, type ReplanDone } from "./ReplanSheet";
import { RowSheet } from "./RowSheet";
import "./routine-plan.css";

export interface PlanLineupProps {
  /** Routine A, saved, with its plan. */
  routine: Routine & { id: string; plan: RoutinePlan };
  /** Programming's rows for Routine A (`buildRoutineRows`), by machine. */
  rows: readonly RoutineRow[];
  /** The panel's head: the routine's letter, name, the last change and Edit. */
  head: ReactNode;
  host: PlanHost;
  firstName: string;
  nameOf: (id: string) => string;
  adjustments: readonly RoutineAdjustment[];
  trainers: readonly Trainer[];
  /** A machine's card (the machine menu). */
  onSelectMachine?: (machineId: string) => void;
  disabled?: boolean;
  /** Routine B, to draw beside Routine A (Round 2); absent, the lineup is A's alone. */
  b?: BSide | null;
}

type Sheet =
  | { kind: "row"; id: string }
  | { kind: "cantdo"; id: string | null }
  | { kind: "replan" }
  | { kind: "changes" }
  /** `purpose`: the typed purpose stays a draft, registered, until this sheet saves; closing it goes back to the words. */
  | { kind: "reason"; what: string; edit: PlanEdit; said?: string; purpose?: boolean };

export function PlanLineup({ routine, rows, head, host, firstName, nameOf, adjustments, trainers, onSelectMachine, disabled = false, b = null }: PlanLineupProps) {
  const plan = routine.plan;
  const routineIds = routine.machineIds ?? [];
  const today = host.todayYmd;
  const who = host.who;
  const canWrite = !!who && host.status === "ready" && !disabled;
  const first = firstName.trim() || "the client";
  // A plan read from the database is untyped: a missing purpose is no words, never a crash.
  const purpose = typeof plan.purpose === "string" ? plan.purpose.trim() : "";

  const phone = usePhone();
  const wide = useMediaQuery(NOW_BAR_SIDE_QUERY) && !phone;
  const floor = useMemo(() => floorMachinesOf(host.floor), [host.floor]);
  const model = useMemo(() => lineupOf(plan, routineIds, today, nameOf), [plan, routineIds, today, nameOf]);
  const effects = useMemo(() => effectsAbove(model.first, nameOf, floor), [model.first, nameOf, floor]);
  const rowOf = useMemo(() => new Map(rows.map((r) => [r.machineId, r])), [rows]);
  /** A machine standing in for one on the bench: "instead of Seated Dip". */
  /* B's column beside Routine A's rows, once Routine A has machines to copy. */
  const bParts = useBColumn({ b, aRoutine: routineIds, aPlan: plan, host, floor, nameOf, canWrite });
  const ab = bParts.mode !== "none" && !model.dayOneRuns && model.first.length > 0;
  const aside = ab ? "rpl-aside" : undefined;
  const insteadOf = useMemo(() => {
    const out = new Map<string, string>();
    for (const b of model.bench) if (b.active) for (const m of b.entry.replacedBy ?? []) out.set(m, b.entry.machineId);
    return out;
  }, [model.bench]);

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  const [purposeDraft, setPurposeDraft] = useState<string | null>(null);
  const purposeDirty = purposeDraft !== null && purposeDraft.trim() !== purpose;
  const purposeGuard = useUnsavedChanges(purposeDirty, "Routine A's purpose", { onDiscard: () => setPurposeDraft(null) });

  const routineId = routine.id;
  /** After a change made here: the Changes read again where they are shown, and a count they last gave is not said as now. */
  const changed = () => {
    setNonce((n) => n + 1);
    if (!wide) setCount(null);
  };
  const save = (edit: PlanEdit, reason: string | null, words?: string | null) => {
    if (!who) return;
    host.actions.save(routineId, writeOf(edit, routineIds, who, reason));
    changed();
    setSaid(words ?? null);
    setSheet(null);
  };
  const ask = (what: string, edit: PlanEdit | null, words?: string, purposeDraftKept = false) => {
    if (!edit || !canWrite) return;
    setSheet({ kind: "reason", what, edit, said: words, ...(purposeDraftKept ? { purpose: true } : null) });
  };

  const onCantDoSave = (s: CantDoSave) => {
    if (!who) return;
    const edit = markedCantDo({ plan, routine: routineIds, machineId: s.machineId, reason: s.reason, until: s.until, todayYmd: today, who, floor });
    save(edit, null, standInLine(edit.entry, nameOf));
    const offer = healthNoteOffer(s.reason);
    if (s.healthNote && offer) {
      host.actions.healthNote({ machineId: s.machineId, entry: edit.entry, flavour: offer.flavour, body: healthNoteBody(edit.entry, nameOf, today) });
    }
  };

  const replan = (done: ReplanDone) => {
    if (!who) return;
    const r = replanned({
      plan,
      routine: routineIds,
      why: done.why,
      out: done.out,
      until: done.until,
      outReason: done.outReason,
      fresh: done.fresh,
      todayYmd: today,
      who,
      floor,
    });
    host.actions.save(routineId, {
      plan: r.plan,
      change: signedChange(r.change, who),
      also: r.also.map((c) => signedChange(c, who)),
      ...(r.routine.join("|") === routineIds.join("|") ? null : { machineIds: r.routine }),
    });
    // A surgery coming up: ONE Health note for every machine it benched, when ticked.
    const benched = r.also.flatMap((c) => c.machineIds);
    const offer = healthNoteOffer(done.outReason);
    if (done.healthNote && offer && benched.length > 0) {
      host.actions.healthNote({
        machineId: benched.length === 1 ? benched[0] : null,
        flavour: offer.flavour,
        body: healthNoteBodyFor({ machineIds: benched, reason: done.outReason, until: done.until }, nameOf, today),
      });
    }
    changed();
    setSaid(done.fresh ? "Started again from the starting routine, with what we know" : "Re-planned. Tap any machine to change it.");
    setSheet(null);
  };

  const changeButton = (id: string) =>
    canWrite ? (
      <Button variant="outline" size="icon" aria-label={`Change ${nameOf(id)} in the plan`} onClick={() => setSheet({ kind: "row", id })}>
        <MoreHorizontal aria-hidden="true" />
      </Button>
    ) : null;
  const openCard = (id: string) => (onSelectMachine ? () => onSelectMachine(id) : undefined);

  /* ── The row sheet ── */
  const rowSheet = (() => {
    if (sheet?.kind !== "row") return null;
    const id = sheet.id;
    const name = nameOf(id);
    const inFirst = model.first.includes(id);
    const group = inFirst ? model.first : model.deck;
    const at = group.indexOf(id);
    const planned = plan.intended.includes(id);
    const takeOut: Array<{ key: string; label: string; run: () => void }> = [];
    if (inFirst && !model.dayOneRuns) {
      takeOut.push({
        key: "routine",
        label: "Take out of Routine A",
        run: () => ask(`Take ${name} out of Routine A`, takenOut(plan, routineIds, id, "routine"), planned ? `${name} is on deck` : undefined),
      });
    }
    if (planned) {
      takeOut.push({ key: "plan", label: "Take out of the plan", run: () => ask(`Take ${name} out of the plan`, takenOut(plan, routineIds, id, "plan")) });
    }
    return (
      <RowSheet
        open
        name={name}
        firstName={first}
        swap={swapChoices({ machineId: id, plan, routine: routineIds, floor, todayYmd: today })}
        nameOf={nameOf}
        onClose={() => setSheet(null)}
        canUp={at > 0}
        canDown={at >= 0 && at < group.length - 1}
        onMove={(dir) => ask(`Move ${name} ${dir < 0 ? "up" : "down"}`, movedIn(plan, routineIds, id, dir, today))}
        addNow={id === model.next && !model.dayOneRuns ? () => ask(`Add ${name} to Routine A now`, addedNow(plan, routineIds, id)) : null}
        takeOut={takeOut}
        onSwap={(to) => ask(`${to.map(nameOf).join(" + ")} instead of ${name}`, swappedIn(plan, routineIds, id, to), `${to.map(nameOf).join(" + ")} instead of ${name}`)}
        onCantDo={() => setSheet({ kind: "cantdo", id })}
        onOpenMachine={onSelectMachine ? () => { setSheet(null); onSelectMachine(id); } : null}
      />
    );
  })();

  /* ── The head ── */
  const academy = academyTemplateOf(plan.templateId);
  const startedFrom = plan.templateId
    ? academy
      ? `Started from ${academyTemplateName(academy)} · ${startingSourceWords(TEMPLATE_SOURCE)}`
      : "Started from a starting routine"
    : null;
  const planHead = (
    <div className="rpl-head">
      {purposeDraft === null ? (
        <div className="rpl-head__row">
          <p className={purpose ? "rpl-purpose" : "rpl-purpose rpl-purpose--none"}>{purpose || "No purpose written yet"}</p>
          {canWrite && (
            <Button variant="outline" size="icon" aria-label="Change the purpose" onClick={() => setPurposeDraft(purpose)}>
              <Pencil aria-hidden="true" />
            </Button>
          )}
        </div>
      ) : (
        <div className="rpl-head__edit">
          <input
            className="rpl-field"
            aria-label="Purpose"
            value={purposeDraft}
            maxLength={300}
            autoFocus
            onChange={(e) => setPurposeDraft(e.target.value)}
          />
          <div className="rpl-actions">
            <Button variant="ghost" onClick={() => purposeGuard.guard(() => setPurposeDraft(null))}>
              Cancel
            </Button>
            <Button
              className="hover:bg-primary"
              disabled={!purposeDirty}
              onClick={() => ask("Change the purpose", purposeChanged(plan, routineIds, purposeDraft ?? ""), undefined, true)}
            >
              Save
            </Button>
          </div>
        </div>
      )}
      <div className="rpl-progress">
        <p className="rpl-progress__line">{model.line}</p>
        {model.progress.of > 0 && <PlanMeter progress={model.progress} />}
      </div>
      <label className="rpl-switch">
        <span className="rpl-switch__text">
          <span className="rpl-switch__label">Routine A is being built</span>
          <span className="rpl-switch__sub">
            {model.dayOneRuns
              ? "The first visit's Wrap-up asks which machines start Routine A"
              : plan.building
                ? "The Wrap-up adds the day's new machines by default"
                : "Routine A changes only on purpose"}
          </span>
        </span>
        <Switch
          checked={plan.building}
          disabled={!canWrite}
          aria-label="Routine A is being built"
          onCheckedChange={(on) => ask(on ? "Turn on: Routine A is being built" : "Turn off: Routine A is being built", buildingChanged(plan, routineIds, on))}
        />
      </label>
      <div className="rpl-actions">
        {!wide && (
          <Button variant="outline" onClick={() => setSheet({ kind: "changes" })}>
            <History aria-hidden="true" />
            {count === null ? "Changes" : `Changes · ${count}`}
          </Button>
        )}
        {canWrite && (
          <Button variant="outline" onClick={() => setSheet({ kind: "replan" })}>
            <RotateCcw aria-hidden="true" />
            Re-plan
          </Button>
        )}
        {startedFrom && <SourceTag>{startedFrom}</SourceTag>}
      </div>
      {!who && <p className="rpl-meta">Sign in again to change the plan.</p>}
    </div>
  );

  /* ── The lineup ── */
  const items: ReactNode[] = [];
  items.push(<GroupHead key="h-first" label={model.dayOneRuns ? "Day one" : "In Routine A"} count={model.first.length} className={aside} />);
  if (ab) items.push(bParts.colHead);
  // B not started: one cell down B's column beside every row (and order effect) of Routine A.
  const aRowsTall = model.first.reduce((n, _id, i) => n + 1 + (effects.get(i)?.length ?? 0), 0);
  if (model.dayOneRuns) {
    items.push(
      <li key="n-dayone">
        <p className="rpl-meta">Routine A is empty until the first visit: its Wrap-up asks which of these start it.</p>
      </li>,
    );
  } else if (model.first.length === 0) {
    items.push(
      <li key="n-empty">
        <p className="rpl-meta">Nothing in Routine A yet. The next visit's Wrap-up asks which machines start it.</p>
      </li>,
    );
  }
  model.first.forEach((id, i) => {
    for (const e of effects.get(i) ?? []) items.push(<OrderNote key={`e-${e.ruleId}-${i}`} effect={e} className={aside} />);
    if (ab) items.push(...bParts.notesFor(id));
    const instead = insteadOf.get(id);
    const note = [instead ? `instead of ${nameOf(instead)}` : null, !model.dayOneRuns && !plan.intended.includes(id) ? "not in the plan" : null]
      .filter(Boolean)
      .join(" · ");
    const row = rowOf.get(id);
    if (!model.dayOneRuns && row) {
      items.push(
        <RoutineRowItem
          key={`r-${id}`}
          row={row}
          variant="cell"
          lead={<Num n={i + 1} />}
          note={note || null}
          onSelect={row.missing ? undefined : onSelectMachine}
          action={changeButton(id)}
          className={aside}
        />,
      );
    } else {
      items.push(
        <LineupRow
          key={`d-${id}`}
          n={i + 1}
          name={nameOf(id)}
          sub={note || undefined}
          onOpen={openCard(id)}
          openLabel={`Open ${nameOf(id)}`}
          action={changeButton(id)}
          className={aside}
        />,
      );
    }
    if (ab && bParts.mode === "plan") items.push(...bParts.cellFor(id));
  });
  // B not started: one cell beside every row of A, from grid row 2 (under
  // the group's head and B's column head); after A's rows, so a phone, one
  // column, draws it under them.
  if (ab && bParts.mode === "start") items.push(bParts.startCell(aRowsTall, 2));
  if (ab && bParts.mode === "plan") items.push(...bParts.extras);
  items.push(<GroupHead key="h-deck" label="On deck" count={model.deck.length} />);
  if (model.deck.length === 0) {
    items.push(
      <li key="n-deck">
        <p className="rpl-meta">Every planned machine is in.</p>
      </li>,
    );
  }
  model.deck.forEach((id, j) => {
    const isNext = j === 0;
    const instead = insteadOf.get(id);
    items.push(
      <LineupRow
        key={`k-${id}`}
        n={model.first.length + j + 1}
        tone={isNext ? "next" : "deck"}
        name={nameOf(id)}
        badge={isNext ? <NextPill /> : undefined}
        sub={instead ? `instead of ${nameOf(instead)}` : undefined}
        onOpen={openCard(id)}
        openLabel={`Open ${nameOf(id)}`}
        action={
          <>
            {isNext && canWrite && !model.dayOneRuns && (
              <Button variant="outline" onClick={() => ask(`Add ${nameOf(id)} to Routine A now`, addedNow(plan, routineIds, id))}>
                Add to A now
              </Button>
            )}
            {changeButton(id)}
          </>
        }
      />,
    );
  });
  items.push(
    <GroupHead
      key="h-bench"
      label={`Not for ${first}`}
      count={model.bench.length || undefined}
      right={
        canWrite ? (
          <Button variant="outline" onClick={() => setSheet({ kind: "cantdo", id: null })}>
            <Plus aria-hidden="true" />
            Can't do
          </Button>
        ) : undefined
      }
    />,
  );
  for (const b of model.bench) {
    const id = b.entry.machineId;
    items.push(
      <BenchEntry
        key={`b-${id}`}
        row={b}
        name={nameOf(id)}
        onReopen={
          canWrite
            ? () => ask(`Reopen ${nameOf(id)}`, reopened(plan, routineIds, id), `${nameOf(id)} back in the plan`)
            : undefined
        }
      />,
    );
  }

  const changes = (
    <PlanChangesList
      routineId={routineId}
      adjustments={adjustments}
      trainers={trainers}
      nameOf={nameOf}
      firstName={firstName}
      todayYmd={today}
      read={host.actions.readChanges}
      nonce={nonce}
      onCount={setCount}
    />
  );

  return (
    <div className={wide ? "rpl-grid" : "rpl"}>
      <section className="rt-routine rpl-routine" aria-label="Routine A's plan">
        {head}
        {planHead}
        {ab && bParts.head}
        {said && (
          <div className="rpl-saidwrap">
            <SaidLine onClear={() => setSaid(null)}>{said}</SaidLine>
          </div>
        )}
        <ol className={ab ? "rpl-list rpl-list--ab" : "rpl-list"} aria-label="The lineup">
          {items}
        </ol>
      </section>
      {wide && (
        <aside className="rpl-panel" aria-label="Changes">
          <div className="rpl-panel__head">
            <h3 className="rpl-panel__title">Changes</h3>
            {count !== null && <span className="rpl-meta">{count}</span>}
          </div>
          {changes}
        </aside>
      )}

      {rowSheet}
      {sheet?.kind === "cantdo" && who && (
        <CantDoSheet
          open
          firstName={first}
          machineId={sheet.id}
          floor={floor}
          plan={[...model.first, ...model.deck]}
          bench={model.bench.filter((b) => b.active).map((b) => b.entry.machineId)}
          nameOf={nameOf}
          todayYmd={today}
          onClose={() => setSheet(null)}
          onSave={onCantDoSave}
        />
      )}
      {sheet?.kind === "replan" && who && (
        <ReplanSheet
          firstName={first}
          plan={plan}
          lineup={[...model.first, ...model.deck]}
          bench={model.bench.filter((b) => b.active).map((b) => b.entry.machineId)}
          floor={floor}
          nameOf={nameOf}
          studioId={host.studioId}
          who={who}
          todayYmd={today}
          onClose={() => setSheet(null)}
          onDone={replan}
        />
      )}
      {sheet?.kind === "changes" && (
        <PlanSheet open title="Changes" meta="Newest first" onClose={() => setSheet(null)}>
          {changes}
        </PlanSheet>
      )}
      {bParts.sheets}
      {sheet?.kind === "reason" && (
        <ReasonSheet
          open
          what={sheet.what}
          onClose={() => setSheet(null)}
          onSave={(reason) => {
            // The purpose leaves its draft only now it is written; a Why
            // closed without saving leaves the typed words where they were.
            if (sheet.purpose) {
              purposeGuard.release();
              setPurposeDraft(null);
            }
            save(sheet.edit, reason, sheet.said);
          }}
        />
      )}
    </div>
  );
}
