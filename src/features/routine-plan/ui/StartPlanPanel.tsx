/**
 * START A PLAN — Programming → Routine A for a client with no routine (the
 * design round, Oct 8 2026, §4.3; AJ's "1d", the Lineup).
 *
 * AJ, Oct 7 2026: "There's definitely two types of no routine. It's people
 * new to the studio and new to Journey." So the panel follows the kind
 * (`startingKindOf`, which the profile works out):
 *
 * - New to the studio: "{First}'s starting lineup", from the starting
 *   routine that fits (`suggestFromStartingRoutines`: the intake's words,
 *   the studio's default, head office's, else the trainer picks) on THIS
 *   studio's floor. Day one solid and numbered, On deck dashed in the order
 *   they join with each step's label (the first is Next), the bench "Not for
 *   {First}", the Source tag with its why, Another start (each shown by its
 *   machines) and Build it yourself. A tap on a row opens its sheet (Move
 *   up, Move down, on or off day one, Swap for, Not for {First}, Take out),
 *   which changes the draft. Keep this lineup writes the plan (day one on
 *   it), an EMPTY Routine A and the plan's first change in one batch, never
 *   awaited: the consult is not Routine A (AJ, Oct 8 2026: "sometimes the
 *   consult machines will not be the same as their a routine"). Nothing is
 *   written before it, and a changed draft is registered with the leave
 *   warning.
 * - New to Journey: no suggestion ("if it is a long-standing, it's no
 *   suggestion"). The floor by the Academy's families on one side, "{First}'s
 *   Routine A" filling 1, 2, 3 on the other; Save Routine A writes the
 *   routine and a plan of it, not being built. The reason is not asked.
 * - Can't tell: two doors, claiming neither.
 *
 * While the profile's read of the routines hasn't answered, the panel waits;
 * when it failed, it says Journey can't tell, and offers nothing that could
 * write a second Routine A.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ClipboardList, DoorOpen, Info, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NOW_BAR_SIDE_QUERY, useMediaQuery } from "../../../hooks/useMediaQuery";
import { usePhone } from "../../phone/device";
import { UnsavedChangesScope, useLeaveScope, useUnsavedChanges } from "../../unsaved-changes";
import { healthNoteOffer, standInLine } from "../cant-do";
import {
  effectsAbove,
  healthNoteBody,
  lineupOf,
  markedCantDo,
  movedIn,
  planFromRoutine,
  reopened,
  signedChange,
  swapChoices,
  swappedIn,
  takenOut,
  withBenchCarried,
  withDayOneToggled,
  withFloorTapped,
  type Who,
} from "../lineup";
import { routineMachineName } from "../starting-choice";
import { startingSourceWords } from "../start-part";
import { startingPlanFromRoutine, suggestFromStartingRoutines, type StartingRoutine } from "../starting-routines";
import type { RoutinePlan } from "../types";
import { useStartingRoutines } from "../useStartingRoutines";
import { CantDoSheet, type CantDoSave } from "./CantDoSheet";
import { floorMachinesOf, type HealthNoteCall, type PlanHost } from "./host";
import { BenchEntry, Chip, DoorButton, GroupHead, LineupRow, NextPill, OrderNote, SaidLine, SourceTag } from "./parts";
import { FloorPicker } from "./pickers";
import { RowSheet } from "./RowSheet";
import "./routine-plan.css";

export interface StartPlanPanelProps {
  host: PlanHost;
  firstName: string;
  nameOf: (id: string) => string;
  /** The client's saved Routine A when it exists (empty), so the plan goes on it rather than a second one. */
  routineAId: string | null;
}

type Door = "studio" | "journey";

export function StartPlanPanel({ host, firstName, nameOf, routineAId }: StartPlanPanelProps) {
  const first = firstName.trim() || "the client";
  const scope = useLeaveScope();
  // A door picked stays picked, even when the kind becomes known meanwhile.
  const [door, setDoor] = useState<Door | null>(null);

  if (host.status === "loading") {
    return (
      <section className="rpl-panel" aria-busy="true">
        <p className="rpl-line">Reading {first}'s routines…</p>
      </section>
    );
  }
  if (host.status === "failed") {
    return (
      <section className="rpl-panel">
        <h3 className="rpl-panel__title">Routine A</h3>
        <p className="rpl-line">
          Couldn't read {first}'s routines just now, so Journey can't tell whether there is one. Try again in a moment.
        </p>
      </section>
    );
  }

  const kind = host.kind.kind;
  const chosen: Door | null = door ?? (kind === "new-to-studio" ? "studio" : kind === "new-to-journey" ? "journey" : null);
  if (chosen === null) {
    return (
      <section className="rpl-panel">
        <div className="rpl-panel__head">
          <h3 className="rpl-panel__title">How does {first} start?</h3>
        </div>
        <div className="rpl-panel__body">
          <p className="rpl-meta">{host.kind.says}</p>
          <div className="rpl-doors">
            <DoorButton
              icon={<DoorOpen size={20} aria-hidden="true" />}
              title="Starting out here"
              line="Start a plan"
              onClick={() => setDoor("studio")}
            />
            <DoorButton
              icon={<ClipboardList size={20} aria-hidden="true" />}
              title="Trained here before"
              line="Enter their routine"
              onClick={() => setDoor("journey")}
            />
          </div>
        </div>
      </section>
    );
  }

  const back = door ? (
    <div>
      <Button variant="ghost" className="text-primary" onClick={() => scope.guard(() => setDoor(null))}>
        <ArrowLeft aria-hidden="true" />
        Both ways to start
      </Button>
    </div>
  ) : null;

  return (
    <div className="rpl">
      {back}
      <UnsavedChangesScope scope={scope}>
        {chosen === "studio" ? (
          <StartNew host={host} first={first} nameOf={nameOf} routineAId={routineAId} />
        ) : (
          <EnterRoutine host={host} first={first} nameOf={nameOf} routineAId={routineAId} />
        )}
      </UnsavedChangesScope>
    </div>
  );
}

/* ══ New to the studio: the starting lineup ══════════════════════════════ */

type DraftSheet = { kind: "row"; id: string } | { kind: "cantdo"; id: string | null };

function StartNew({ host, first, nameOf, routineAId }: { host: PlanHost; first: string; nameOf: (id: string) => string; routineAId: string | null }) {
  const today = host.todayYmd;
  const who = host.who;
  const floor = useMemo(() => floorMachinesOf(host.floor), [host.floor]);
  const starting = useStartingRoutines(host.studioId);
  const phone = usePhone();
  const wide = useMediaQuery(NOW_BAR_SIDE_QUERY) && !phone;

  const [pickedId, setPickedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"start" | "own">("start");
  /** The trainer's lineup once they change anything; null follows the suggestion. */
  const [draft, setDraft] = useState<RoutinePlan | null>(null);
  /** Health notes a surgery or an injury asked for, written with Keep. */
  const [notes, setNotes] = useState<HealthNoteCall[]>([]);
  const [said, setSaid] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [sheet, setSheet] = useState<DraftSheet | null>(null);
  const [addTo, setAddTo] = useState<"day" | "deck">("day");

  /*
   * The starting routines and the studio's choice are read once (one read
   * each, `useStartingRoutines`). Until they answer nothing is suggested and
   * nothing can be kept: a lineup built from the Academy's copy in the code
   * would swap underneath the trainer when the studio's own list landed, and
   * Keep would write a start the studio may not offer. When the read failed
   * Journey claims nothing (no default, no match off a list it couldn't
   * read): the trainer picks.
   */
  const reading = starting.status === "loading";
  const unread = starting.status === "failed";
  const inputs = {
    routines: unread ? starting.routines.map((r) => (r.isDefault ? { ...r, isDefault: false } : r)) : starting.routines,
    choice: unread ? null : starting.choice,
    intakeText: unread ? null : host.intakeText,
    floor,
    studioName: host.studioName,
  };
  const suggested = useMemo(() => {
    const s = suggestFromStartingRoutines(inputs);
    return unread ? { ...s, why: `Couldn't read ${host.studioName ?? "this studio"}'s starting routines just now. Pick the one that fits.` } : s;
  }, [starting.routines, starting.choice, unread, host.intakeText, floor, host.studioName]); // eslint-disable-line react-hooks/exhaustive-deps
  const suggestion = useMemo(
    () => (pickedId ? suggestFromStartingRoutines({ ...inputs, pickedId }) : suggested),
    [pickedId, suggested], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const routineOf = (id: string | null): StartingRoutine | null => (id ? (starting.routines.find((r) => r.id === id) ?? null) : null);
  const signer: Who = who ?? { uid: "" };
  const planOf = (routine: StartingRoutine | null): RoutinePlan | null =>
    routine ? startingPlanFromRoutine(routine, signer, floor, today).plan : null;

  const derived = useMemo(
    () => (mode === "start" && !reading ? planOf(routineOf(suggestion.templateId)) : null),
    [mode, reading, suggestion.templateId, starting.routines, floor, today, signer.uid, signer.name], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const ownBlank = useMemo<RoutinePlan>(
    () => ({ ...planFromRoutine([], signer, today), dayOne: [], building: true }),
    [signer.uid, signer.name, today], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const plan: RoutinePlan | null = draft ?? (mode === "own" ? ownBlank : derived);
  /** Waiting for the starting routines' read: no lineup, no starts, nothing to keep. */
  const waiting = mode === "start" && plan === null && reading;
  const picking = mode === "start" && plan === null && !reading;

  const dirty = draft !== null || pickedId !== null || mode === "own";
  const reset = () => {
    setDraft(null);
    setPickedId(null);
    setMode("start");
    setNotes([]);
    setSaid(null);
  };
  const unsaved = useUnsavedChanges(dirty, `${first}'s starting lineup`, { onDiscard: reset });

  const model = useMemo(() => (plan ? lineupOf(plan, [], today, nameOf) : null), [plan, today, nameOf]);
  const effects = useMemo(() => (model ? effectsAbove(model.first, nameOf, floor) : new Map<number, never[]>()), [model, nameOf, floor]);
  const bench = model?.bench ?? [];
  const held = bench.filter((b) => b.active).map((b) => b.entry.machineId);
  const insteadOf = new Map<string, string>();
  for (const b of bench) if (b.active) for (const m of b.entry.replacedBy ?? []) insteadOf.set(m, b.entry.machineId);
  const stepOf = (id: string) => suggestion.steps.find((s) => s.machineIds.includes(id))?.label ?? null;
  const missing = mode === "start" && !reading ? suggestion.steps.flatMap((s) => s.missing) : [];

  const change = (next: RoutinePlan, words?: string | null) => {
    setDraft(next);
    setSaid(words ?? null);
    setSheet(null);
  };

  const pickStart = (id: string) => {
    const carried = plan?.cantDo ?? [];
    setPickedId(id);
    setMode("start");
    const fresh = planOf(routineOf(id));
    setDraft(fresh && carried.length > 0 ? withBenchCarried(fresh, carried, today, floor) : null);
    setSaid(null);
    setSheet(null);
  };
  const buildOwn = () => {
    const carried = plan?.cantDo ?? [];
    setMode("own");
    setDraft(carried.length > 0 ? withBenchCarried(ownBlank, carried, today, floor) : ownBlank);
    setSaid(null);
  };
  const backToStarts = () => {
    const carried = plan?.cantDo ?? [];
    setMode("start");
    const fresh = planOf(routineOf(suggestion.templateId));
    setDraft(fresh && carried.length > 0 ? withBenchCarried(fresh, carried, today, floor) : null);
    setSaid(null);
  };

  const onCantDo = (s: CantDoSave) => {
    if (!plan) return;
    const edit = markedCantDo({ plan, routine: [], machineId: s.machineId, reason: s.reason, until: s.until, todayYmd: today, who: signer, floor });
    const offer = healthNoteOffer(s.reason);
    setNotes((prev) => [
      ...prev.filter((n) => n.machineId !== s.machineId),
      ...(s.healthNote && offer ? [{ machineId: s.machineId, entry: edit.entry, flavour: offer.flavour, body: healthNoteBody(edit.entry, nameOf, today) }] : []),
    ]);
    change(edit.plan, standInLine(edit.entry, nameOf));
  };

  const keep = () => {
    if (!plan || !who || (plan.dayOne ?? []).length === 0) return;
    // The start the plan says it came from, by name: the routine whose id
    // the plan carries, never whatever the suggestion says by now.
    const from = plan.templateId ? routineOf(plan.templateId) : null;
    const value = mode === "start" && plan.templateId ? (from?.name ?? (suggestion.templateId === plan.templateId ? suggestion.label : null)) ?? undefined : undefined;
    unsaved.release();
    host.actions.start({
      routineId: routineAId,
      machineIds: [],
      plan,
      change: signedChange({ kind: "start", machineIds: plan.intended, ...(value ? { value } : null) }, who),
    });
    for (const n of notes) {
      if ((plan.cantDo ?? []).some((c) => c.machineId === n.machineId)) host.actions.healthNote(n);
    }
  };

  /* the row sheet */
  const rowSheet = (() => {
    if (sheet?.kind !== "row" || !plan || !model) return null;
    const id = sheet.id;
    const name = nameOf(id);
    const inFirst = model.first.includes(id);
    const group = inFirst ? model.first : model.deck;
    const at = group.indexOf(id);
    const onDayOne = (plan.dayOne ?? []).includes(id);
    return (
      <RowSheet
        open
        name={name}
        firstName={first}
        swap={swapChoices({ machineId: id, plan, routine: [], floor, todayYmd: today })}
        nameOf={nameOf}
        onClose={() => setSheet(null)}
        canUp={at > 0}
        canDown={at >= 0 && at < group.length - 1}
        onMove={(dir) => {
          const edit = movedIn(plan, [], id, dir, today);
          if (edit) change(edit.plan);
        }}
        dayOne={{ on: onDayOne, toggle: () => change(withDayOneToggled(plan, id, !onDayOne)) }}
        takeOut={[{ key: "plan", label: "Take out", run: () => change(takenOut(plan, [], id, "plan").plan, `${name} taken out`) }]}
        onSwap={(to) => change(swappedIn(plan, [], id, to).plan, `${to.map(nameOf).join(" + ")} instead of ${name}`)}
        onCantDo={() => setSheet({ kind: "cantdo", id })}
      />
    );
  })();

  /* the lineup */
  const items: ReactNode[] = [];
  if (model && plan) {
    const dayOne = model.dayOneRuns ? model.first : [];
    const deck = model.dayOneRuns ? model.deck : [...model.first, ...model.deck];
    items.push(<GroupHead key="h-day" label="Day one" count={dayOne.length} />);
    if (dayOne.length === 0) {
      items.push(
        <li key="e-day">
          <p className="rpl-meta">{mode === "own" ? "Tap machines on the floor to add them." : "Nothing on day one yet. Tap a machine to put it on day one."}</p>
        </li>,
      );
    }
    dayOne.forEach((id, i) => {
      for (const e of effects.get(i) ?? []) items.push(<OrderNote key={`e-${e.ruleId}-${i}`} effect={e} />);
      const instead = insteadOf.get(id);
      items.push(
        <LineupRow
          key={`d-${id}`}
          n={i + 1}
          name={nameOf(id)}
          sub={instead ? `instead of ${nameOf(instead)}` : undefined}
          onOpen={() => setSheet({ kind: "row", id })}
          openLabel={`Change ${nameOf(id)}`}
        />,
      );
    });
    items.push(<GroupHead key="h-deck" label="On deck" count={deck.length} />);
    if (deck.length === 0) {
      items.push(
        <li key="e-deck">
          <p className="rpl-meta">Nothing on deck.</p>
        </li>,
      );
    }
    deck.forEach((id, j) => {
      const instead = insteadOf.get(id);
      const sub = instead ? `instead of ${nameOf(instead)}` : mode === "own" ? "Your pick" : (stepOf(id) ?? "Your pick");
      items.push(
        <LineupRow
          key={`k-${id}`}
          n={dayOne.length + j + 1}
          tone={j === 0 ? "next" : "deck"}
          name={nameOf(id)}
          badge={j === 0 ? <NextPill /> : undefined}
          sub={sub}
          onOpen={() => setSheet({ kind: "row", id })}
          openLabel={`Change ${nameOf(id)}`}
        />,
      );
    });
  } else {
    items.push(
      <li key="e-pick" aria-busy={waiting || undefined}>
        <p className="rpl-meta">{waiting ? "Reading the starting routines…" : "Pick a start to fill the lineup."}</p>
      </li>,
    );
  }
  items.push(
    <GroupHead
      key="h-bench"
      label={`Not for ${first}`}
      count={bench.length || undefined}
      right={
        plan ? (
          <Button variant="outline" onClick={() => setSheet({ kind: "cantdo", id: null })}>
            <Plus aria-hidden="true" />
            Can't do
          </Button>
        ) : undefined
      }
    />,
  );
  for (const b of bench) {
    const id = b.entry.machineId;
    items.push(
      <BenchEntry
        key={`b-${id}`}
        row={b}
        name={nameOf(id)}
        onReopen={
          plan
            ? () => {
                setNotes((prev) => prev.filter((n) => n.machineId !== id));
                change(reopened(plan, [], id).plan, `${nameOf(id)} back in`);
              }
            : undefined
        }
      />,
    );
  }

  const sourceWords =
    suggestion.label && !reading
      ? [suggestion.label, startingSourceWords(suggestion.source) ?? (starting.fromCode ? "From the Academy" : null)].filter(Boolean).join(" · ")
      : null;
  // A starting lineup waits for the starting routines' read (`waiting` has no plan); one built by hand never does.
  const keepable = !!plan && !!who && !waiting && (plan.dayOne ?? []).length > 0;

  const lineupPanel = (
    <section className="rpl-panel" aria-label={`${first}'s starting lineup`}>
      <div className="rpl-panel__head">
        <h3 className="rpl-panel__title">{mode === "own" ? `${first}'s lineup` : `${first}'s starting lineup`}</h3>
        {mode === "start" && sourceWords && (
          <div className="rpl-panel__right">
            <SourceTag>{sourceWords}</SourceTag>
            <Button variant="ghost" size="icon" aria-label="Why this start" aria-expanded={whyOpen} onClick={() => setWhyOpen((o) => !o)}>
              <Info aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
      <div className="rpl-panel__body">
        <p className="rpl-meta">{host.kind.kind === "new-to-studio" ? host.kind.says : "Starting out at the studio: start a plan."}</p>
        {mode === "start" && whyOpen && sourceWords && <p className="rpl-well">{suggestion.why}</p>}
        {said && <SaidLine onClear={() => setSaid(null)}>{said}</SaidLine>}
        <ol className="rpl-list rpl-list--flush" aria-label="The lineup">
          {items}
        </ol>
        {missing.length > 0 && (
          <p className="rpl-meta">
            Not on {host.studioName ?? "this studio"}'s floor: {missing.map((id) => routineMachineName(id)).join(", ")}
          </p>
        )}
        <div className="rpl-foot">
          <div className="rpl-actions">
            <Button className="hover:bg-primary" disabled={!keepable} onClick={keep}>
              <Check aria-hidden="true" />
              Keep this lineup
            </Button>
            {mode === "start" ? (
              <Button variant="ghost" className="text-primary" onClick={buildOwn}>
                Build it yourself
              </Button>
            ) : (
              <Button variant="ghost" className="text-primary" onClick={backToStarts}>
                Back to the starting routines
              </Button>
            )}
          </div>
          <p className="rpl-meta">
            Nothing is saved until you keep it. Day one is the first visit's; its Wrap-up asks which machines start Routine A.
          </p>
          {!who && <p className="rpl-meta">Sign in again to keep a plan.</p>}
        </div>
      </div>
    </section>
  );

  const starts = suggestion.templateId
    ? [{ templateId: suggestion.templateId, label: suggestion.label ?? "", machineIds: derived?.intended ?? plan?.intended ?? [] }, ...suggestion.alternatives]
    : suggestion.alternatives;
  // Not drawn while the starting routines are read: nothing to pick from yet.
  const startsPanel = reading ? null : (
    <section className="rpl-panel" aria-label={picking ? "Pick a start" : "Another start"}>
      <div className="rpl-panel__head">
        <h3 className="rpl-panel__title">{picking ? "Pick a start" : "Another start"}</h3>
      </div>
      <div className="rpl-panel__body">
        {picking && <p className="rpl-line">{suggestion.why}</p>}
        {starting.fromCode && starting.status === "ready" && <p className="rpl-meta">The Academy's starting routines, until head office adds its own.</p>}
        {starting.fromCode && unread && <p className="rpl-meta">These are the Academy's, from Journey's own copy.</p>}
        <div className="rpl-starts">
          {starts.map((s) => {
            const on = mode === "start" && s.templateId === suggestion.templateId && !picking;
            const firstThree = s.machineIds.slice(0, 3).map(nameOf).join(" · ");
            const more = s.machineIds.length > 3 ? `+${s.machineIds.length - 3} more · ` : "";
            const isSuggested = s.templateId === suggested.templateId && !suggested.needsChoice;
            return (
              <button key={s.templateId} type="button" className="rpl-start" aria-pressed={on} onClick={() => pickStart(s.templateId)}>
                <span className="rpl-start__machines">{firstThree || s.label}</span>
                <span className="rpl-start__meta">
                  {more}
                  {s.label}
                  {isSuggested ? " · suggested" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );

  const floorPanel =
    mode === "own" && plan ? (
      <section className="rpl-panel" aria-label="This studio's floor">
        <div className="rpl-panel__head">
          <h3 className="rpl-panel__title">This studio's floor</h3>
          <div className="rpl-panel__right rpl-chips" role="group" aria-label="Add to">
            <Chip on={addTo === "day"} onClick={() => setAddTo("day")}>
              Day one
            </Chip>
            <Chip on={addTo === "deck"} onClick={() => setAddTo("deck")}>
              On deck
            </Chip>
          </div>
        </div>
        <FloorPicker
          floor={floor}
          picked={plan.intended}
          held={held}
          firstName={first}
          nameOf={nameOf}
          onTap={(id) => change(withFloorTapped(plan, id, addTo))}
        />
      </section>
    ) : null;

  const cantDoSheet =
    sheet?.kind === "cantdo" && plan ? (
      <CantDoSheet
        open
        firstName={first}
        machineId={sheet.id}
        floor={floor}
        plan={plan.intended}
        bench={held}
        nameOf={nameOf}
        todayYmd={today}
        onClose={() => setSheet(null)}
        onSave={onCantDo}
      />
    ) : null;

  return (
    <>
      {wide ? (
        <div className="rpl-grid">
          {lineupPanel}
          <div className="rpl-col">
            {floorPanel}
            {startsPanel}
          </div>
        </div>
      ) : (
        <div className="rpl">
          {picking && startsPanel}
          {lineupPanel}
          {floorPanel}
          {!picking && startsPanel}
        </div>
      )}
      {rowSheet}
      {cantDoSheet}
    </>
  );
}

/* ══ New to Journey: enter the routine the client already does ═══════════ */

function EnterRoutine({ host, first, nameOf, routineAId }: { host: PlanHost; first: string; nameOf: (id: string) => string; routineAId: string | null }) {
  const today = host.todayYmd;
  const who = host.who;
  const floor = useMemo(() => floorMachinesOf(host.floor), [host.floor]);
  const [picked, setPicked] = useState<string[]>([]);
  const [purpose, setPurpose] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const dirty = picked.length > 0 || purpose.trim() !== "";
  const unsaved = useUnsavedChanges(dirty, `${first}'s Routine A`, {
    onDiscard: () => {
      setPicked([]);
      setPurpose("");
      setOpen(null);
    },
  });
  const effects = useMemo(() => effectsAbove(picked, nameOf, floor), [picked, nameOf, floor]);

  const tap = (id: string) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    if (open === id) setOpen(null);
  };
  const move = (id: string, dir: -1 | 1) =>
    setPicked((p) => {
      const at = p.indexOf(id);
      const to = at + dir;
      if (at < 0 || to < 0 || to >= p.length) return p;
      const next = [...p];
      [next[at], next[to]] = [next[to], next[at]];
      return next;
    });

  const save = () => {
    if (!who || picked.length === 0) return;
    unsaved.release();
    host.actions.start({
      routineId: routineAId,
      machineIds: picked,
      plan: planFromRoutine(picked, who, today, purpose),
      change: signedChange({ kind: "start", machineIds: picked }, who),
    });
  };

  const items: ReactNode[] = [];
  if (picked.length === 0) {
    items.push(
      <li key="e">
        <p className="rpl-meta">
          Tap the machines {first} does, in the order {first} does them.
        </p>
      </li>,
    );
  }
  picked.forEach((id, i) => {
    for (const e of effects.get(i) ?? []) items.push(<OrderNote key={`e-${e.ruleId}-${i}`} effect={e} />);
    items.push(
      <LineupRow key={`r-${id}`} n={i + 1} name={nameOf(id)} onOpen={() => setOpen(open === id ? null : id)} openLabel={`Change ${nameOf(id)}`} />,
    );
    if (open === id) {
      items.push(
        <li key={`a-${id}`} className="rpl-actions">
          {i > 0 && (
            <Button variant="outline" onClick={() => move(id, -1)}>
              Move up
            </Button>
          )}
          {i < picked.length - 1 && (
            <Button variant="outline" onClick={() => move(id, 1)}>
              Move down
            </Button>
          )}
          <Button variant="outline" onClick={() => tap(id)}>
            Take out
          </Button>
        </li>,
      );
    }
  });

  return (
    <div className="rpl-grid rpl-grid--even">
      <section className="rpl-panel" aria-label="This studio's floor">
        <div className="rpl-panel__head">
          <h3 className="rpl-panel__title">This studio's floor</h3>
        </div>
        <FloorPicker floor={floor} picked={picked} firstName={first} nameOf={nameOf} onTap={tap} />
      </section>
      <section className="rpl-panel" aria-label={`${first}'s Routine A`}>
        <div className="rpl-panel__head">
          <h3 className="rpl-panel__title">{first}'s Routine A</h3>
          <span className="rpl-meta">{picked.length}</span>
        </div>
        <div className="rpl-panel__body">
          <ol className="rpl-list rpl-list--flush" aria-label={`${first}'s Routine A`}>
            {items}
          </ol>
          <label className="rpl-sheet__section">
            <span className="rpl-sheet__label">What it's for · optional</span>
            <input className="rpl-field" value={purpose} maxLength={300} onChange={(e) => setPurpose(e.target.value)} placeholder="The core: whole body" />
          </label>
          <div className="rpl-foot">
            <div className="rpl-actions">
              <Button className="hover:bg-primary" disabled={picked.length === 0 || !who} onClick={save}>
                <Check aria-hidden="true" />
                Save Routine A
              </Button>
            </div>
            {!who && <p className="rpl-meta">Sign in again to save Routine A.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
