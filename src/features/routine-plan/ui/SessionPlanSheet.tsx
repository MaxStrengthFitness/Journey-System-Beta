/**
 * THE PLAN, FROM THE SESSION'S CORNER (the design round, Oct 8 2026, §4.6;
 * AJ's "1d": the Road's one-line route "wherever a glance is all there is").
 *
 * Opened from the grid corner's "The plan · 3 of 6": the Road strip of
 * Routine A's plan with today's machines under the Today bracket, each
 * planned machine a row (a tap: Swap in the plan, or Can't do), the bench,
 * and Re-plan.
 *
 * AJ, Oct 7 2026 (Q6): "Any trainer who trains the client can definitely
 * change the plan ... you shouldn't really be blocked. Like if I start a
 * session with a client and I already think that, oh, hey, I think they
 * would be a lot better on this machine instead. You should be able to change
 * that and make the call as a trainer because you're training them that
 * day." And: "it's nice to be able to communicate like, hey, I'm changing
 * this plan because of this reason". So every change asks why (the reason
 * sheet, never required, or the can't-do and Re-plan sheets' own optional
 * why) and is handed to `onWrite`, which issues it through `store.ts` and
 * never waits.
 *
 * A change reaches TODAY's order only for a machine with no set logged
 * today; otherwise the sheet says "Today's set stays. The plan changes from
 * next session." Nothing here changes Routine A's machines but through the
 * plan's own change (a swap or a can't-do moves them in the same batch).
 *
 * The plan's ids are the floor ids of the floor it was made on, so every
 * comparison with today goes through the catalog machine each id is
 * (`todayMatch`, the count's own rule): a studio's unit in today's session is
 * the plan's machine, and the Road's next stop is the count's next, never a
 * machine this floor lacks. In a Routine B session the plan is Routine A's:
 * the Road shows Routine A's machines under its bracket, a swap leaves B's
 * order alone, and a can't-do (read by A and B) still takes the machine out
 * of today's order when no set is logged on it.
 *
 * The Academy's starting range for this client (AJ's "3a") is changed here
 * too, the one place it can be after "Don't show ranges" hides it from the
 * Now Bar.
 */
import { useEffect, useMemo, useState } from "react";
import { Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { activeCantDo, healthNoteOffer, standInLine } from "../cant-do";
import {
  FAMILY_SOURCE,
  SUBSTITUTES_SOURCE,
  healthNoteBody,
  healthNoteBodyFor,
  lineupOf,
  markedCantDo,
  replanned,
  roadGroups,
  signedChange,
  swapChoices,
  swappedIn,
  writeOf,
  type PlanEdit,
  type PlanWrite,
  type Who,
} from "../lineup";
import { progressLine } from "../plan";
import { TODAY_SET_STAYS, sessionPlanProgress, todayAfterBench, todayAfterReplace, todayMatch, type TodayChange } from "../session-plan";
import type { FloorMachine } from "../starting-plan";
import { STARTING_COLUMN_LABEL, type StartingColumn } from "../starting-weights";
import type { RoutinePlan } from "../types";
import { CantDoSheet, type CantDoSave } from "./CantDoSheet";
import type { HealthNoteCall } from "./host";
import { BenchEntry, Chip, LineupRow, PlanSheet, SaidLine } from "./parts";
import { ReasonSheet } from "./ReasonSheet";
import { ReplanSheet, type ReplanDone } from "./ReplanSheet";
import { RoadStrip } from "./RoadStrip";
import "./routine-plan.css";

export interface SessionPlanSheetProps {
  open: boolean;
  onClose: () => void;
  firstName: string;
  /** Routine A's plan. */
  plan: RoutinePlan;
  /** Routine A's machines as they stand (empty on day one: the consult is not Routine A). */
  routine: readonly string[];
  /** Today's session, in today's order. */
  today: readonly string[];
  /**
   * The session runs Routine A (or no routine): today is the plan's. False
   * in a Routine B session: the Road shows Routine A's machines and a swap
   * leaves today's order alone. Default true.
   */
  runsA?: boolean;
  floor: readonly FloorMachine[];
  nameOf: (id: string) => string;
  /** The studio's day, `YYYY-MM-DD`. */
  todayYmd: string;
  /** For Re-plan's "Start again from the starting routine". */
  studioId: string | null;
  /** The signed-in person by Auth uid; null offers nothing that writes. */
  who: Who | null;
  /** A set is logged on this machine today: then today's set stays. */
  loggedToday: (machineId: string) => boolean;
  /** Issue the write (never awaited), and change today's order when `today` says so. */
  onWrite: (write: PlanWrite, today: TodayChange | null) => void;
  /** The Health note a surgery or an injury offers, when ticked. */
  onHealthNote?: (call: HealthNoteCall) => void;
  /** The Academy column on Routine A's plan (or this session's pick); undefined when none is picked. */
  startingColumn?: StartingColumn | "none";
  /** Opens the column picker; absent, the sheet doesn't offer it. */
  onStartingColumn?: () => void;
}

type Mode =
  | { kind: "main" }
  | { kind: "machine"; id: string }
  | { kind: "cantdo"; id: string }
  | { kind: "replan" }
  | { kind: "reason"; what: string; edit: PlanEdit; from: string; incoming: string[] };

export function SessionPlanSheet({
  open,
  onClose,
  firstName,
  plan,
  routine,
  today,
  runsA = true,
  floor,
  nameOf,
  todayYmd,
  studioId,
  who,
  loggedToday,
  onWrite,
  onHealthNote,
  startingColumn,
  onStartingColumn,
}: SessionPlanSheetProps) {
  const first = firstName.trim() || "the client";
  const [mode, setMode] = useState<Mode>({ kind: "main" });
  const [said, setSaid] = useState<string | null>(null);
  // A fresh sheet each time it opens.
  useEffect(() => {
    if (!open) {
      setMode({ kind: "main" });
      setSaid(null);
    }
  }, [open]);

  /* What the Road and the rows read as "in": today's session, or in a B
     session Routine A's own machines (B's are B's, never Routine A's). */
  const base = runsA ? today : routine;
  const progress = useMemo(() => sessionPlanProgress({ plan, today: base, floor, todayYmd }), [plan, base, floor, todayYmd]);
  const line = progressLine(progress, nameOf);
  const inBase = useMemo(() => todayMatch({ today: base, floor }), [base, floor]);
  const inToday = useMemo(() => todayMatch({ today, floor }), [today, floor]);
  const groups = useMemo(
    () =>
      roadGroups({
        plan,
        today: base,
        todayYmd,
        firstName: first,
        ...(runsA ? null : { todayLabel: "Routine A" }),
        keyOf: inBase.key,
        next: progress.next,
      }),
    [plan, base, todayYmd, first, runsA, inBase, progress.next],
  );
  const model = useMemo(() => lineupOf(plan, routine, todayYmd, nameOf), [plan, routine, todayYmd, nameOf]);
  const held = useMemo(() => activeCantDo(plan, todayYmd).map((c) => c.machineId), [plan, todayYmd]);
  const rows = useMemo(() => plan.intended.filter((id, i) => plan.intended.indexOf(id) === i && !held.includes(id)), [plan.intended, held]);
  const extras = runsA ? progress.extras : [];
  /** A plan's machine as today's session runs it (a studio's unit for the catalog machine), or null. */
  const todayIdOf = inToday.todayIdOf;
  /** A set is logged today on the machine a plan's machine is in today's session. */
  const keptToday = (planId: string) => {
    const t = todayIdOf(planId);
    return t !== null && loggedToday(t);
  };
  /** A machine standing in for one on the bench: "instead of Seated Dip". */
  const insteadOf = useMemo(() => {
    const out = new Map<string, string>();
    for (const b of model.bench) if (b.active) for (const m of b.entry.replacedBy ?? []) out.set(m, b.entry.machineId);
    return out;
  }, [model.bench]);
  const canWrite = !!who;

  const back = (words: string | null) => {
    setSaid(words);
    setMode({ kind: "main" });
  };

  /* ── A swap, after its reason ── (today's order only while today is the plan's) */
  const saveSwap = (m: Extract<Mode, { kind: "reason" }>, reason: string | null) => {
    if (!who) return;
    const from = runsA ? todayIdOf(m.from) : null;
    const change = from ? todayAfterReplace({ today, from, incoming: m.incoming, logged: loggedToday(from) }) : null;
    onWrite(writeOf(m.edit, routine, who, reason), change);
    const words = `${m.incoming.map(nameOf).join(" + ")} instead of ${nameOf(m.from)}`;
    back(from && !change ? `${words} from next session` : words);
  };

  /* ── Can't do ── */
  const saveCantDo = (s: CantDoSave) => {
    if (!who) return;
    const edit = markedCantDo({ plan, routine, machineId: s.machineId, reason: s.reason, until: s.until, todayYmd, who, floor });
    // A can't-do is read by A and B: it reaches today's order in either session.
    const from = todayIdOf(s.machineId);
    const change = from ? todayAfterReplace({ today, from, incoming: edit.entry.replacedBy ?? [], logged: loggedToday(from) }) : null;
    onWrite(writeOf(edit, routine, who, null), change);
    const offer = healthNoteOffer(s.reason);
    if (s.healthNote && offer && onHealthNote) {
      onHealthNote({ machineId: s.machineId, entry: edit.entry, flavour: offer.flavour, body: healthNoteBody(edit.entry, nameOf, todayYmd) });
    }
    const words = standInLine(edit.entry, nameOf);
    back(from && !change ? `${words} · from next session` : words);
  };

  /* ── Re-plan ── */
  const saveReplan = (done: ReplanDone) => {
    if (!who) return;
    const r = replanned({
      plan,
      routine,
      why: done.why,
      out: done.out,
      until: done.until,
      outReason: done.outReason,
      fresh: done.fresh,
      todayYmd,
      who,
      floor,
    });
    const benched = r.also.flatMap((c) => c.machineIds);
    const change = todayAfterBench({
      today,
      benched: benched.flatMap((id) => {
        const t = todayIdOf(id);
        return t ? [{ machineId: t, replacedBy: r.plan.cantDo?.find((c) => c.machineId === id)?.replacedBy }] : [];
      }),
      logged: loggedToday,
    });
    onWrite(
      {
        plan: r.plan,
        change: signedChange(r.change, who),
        also: r.also.map((c) => signedChange(c, who)),
        ...(r.routine.join("|") === routine.join("|") ? null : { machineIds: r.routine }),
      },
      change,
    );
    // A surgery coming up: ONE Health note for every machine it benched, when ticked.
    const offer = healthNoteOffer(done.outReason);
    if (done.healthNote && offer && benched.length > 0 && onHealthNote) {
      onHealthNote({
        machineId: benched.length === 1 ? benched[0] : null,
        flavour: offer.flavour,
        body: healthNoteBodyFor({ machineIds: benched, reason: done.outReason, until: done.until }, nameOf, todayYmd),
      });
    }
    const kept = benched.some(keptToday);
    back(
      [done.fresh ? "Started again from the starting routine, with what we know" : "Re-planned", kept ? TODAY_SET_STAYS : null]
        .filter(Boolean)
        .join(". "),
    );
  };

  /* ── The machine's sheet: Swap in the plan, or Can't do ── */
  const machineSheet = (() => {
    if (mode.kind !== "machine") return null;
    const id = mode.id;
    const name = nameOf(id);
    const swap = swapChoices({ machineId: id, plan, routine, floor, todayYmd });
    const nothing = swap.same.length === 0 && swap.substitutes.length === 0;
    const kept = keptToday(id);
    const pick = (to: string[]) =>
      setMode({ kind: "reason", what: `${to.map(nameOf).join(" + ")} instead of ${name}`, edit: swappedIn(plan, routine, id, to), from: id, incoming: to });
    return (
      <PlanSheet open title={name} meta={swap.family ?? undefined} onClose={() => setMode({ kind: "main" })}>
        {kept && <p className="rpl-meta">{TODAY_SET_STAYS}</p>}
        <div className="rpl-actions">
          <Button variant="outline" onClick={() => setMode({ kind: "cantdo", id })}>
            <Ban aria-hidden="true" />
            Can't do
          </Button>
        </div>
        <section className="rpl-sheet__section" aria-label="Swap in the plan">
          <p className="rpl-sheet__label">Swap in the plan</p>
          {nothing && <p className="rpl-meta">Nothing else in this family on this floor.</p>}
          {swap.same.length > 0 && (
            <div className="rpl-sheet__section">
              <p className="rpl-meta">Same family, on this floor · {FAMILY_SOURCE}</p>
              <div className="rpl-chips">
                {swap.same.map((to) => (
                  <Chip key={to} onClick={() => pick([to])}>
                    {nameOf(to)}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {swap.substitutes.length > 0 && (
            <div className="rpl-sheet__section">
              <p className="rpl-meta">The Academy's substitutes · {SUBSTITUTES_SOURCE}</p>
              <div className="rpl-chips">
                {swap.substitutes.map((set) => (
                  <Chip key={set.join("+")} onClick={() => pick(set)}>
                    {set.map(nameOf).join(" + ")}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </section>
      </PlanSheet>
    );
  })();

  return (
    <>
      <PlanSheet
        open={open && mode.kind === "main"}
        title="Routine A · the plan"
        meta={typeof plan.purpose === "string" && plan.purpose.trim() ? plan.purpose.trim() : undefined}
        onClose={onClose}
        footer={
          canWrite ? (
            <Button variant="outline" onClick={() => setMode({ kind: "replan" })}>
              <RotateCcw aria-hidden="true" />
              Re-plan
            </Button>
          ) : undefined
        }
      >
        <RoadStrip groups={groups} nameOf={nameOf} progressLine={line} progress={progress} label={`${first}'s plan, today first`} />
        {said && <SaidLine onClear={() => setSaid(null)}>{said}</SaidLine>}
        <ol className="rpl-list rpl-list--flush" aria-label="The plan's machines">
          {rows.map((id, i) => {
            const isIn = inBase.todayIdOf(id) !== null;
            const isNext = progress.next !== null && inBase.key(id) === inBase.key(progress.next);
            const instead = insteadOf.get(id);
            const sub = [
              isIn ? (runsA ? "In today" : "In Routine A") : isNext ? "Next in the plan" : null,
              instead ? `instead of ${nameOf(instead)}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <LineupRow
                key={id}
                n={i + 1}
                tone={isIn ? "solid" : isNext ? "next" : "deck"}
                name={nameOf(id)}
                sub={sub || undefined}
                onOpen={canWrite ? () => setMode({ kind: "machine", id }) : undefined}
                openLabel={`Change ${nameOf(id)} in the plan`}
              />
            );
          })}
          {model.bench.map((b) => (
            <BenchEntry key={`b-${b.entry.machineId}`} row={b} name={nameOf(b.entry.machineId)} />
          ))}
        </ol>
        {extras.length > 0 && <p className="rpl-meta">Today only: {extras.map(nameOf).join(" · ")}</p>}
        {canWrite && onStartingColumn && (
          /* The Academy's starting range for this client: the one way back
             after "Don't show ranges" (the Now Bar then shows nothing). */
          <section className="rpl-sheet__section" aria-label="Academy's starting range">
            <p className="rpl-sheet__label">Academy's starting range</p>
            <p className="rpl-meta">
              {startingColumn === "none"
                ? "Not shown"
                : startingColumn
                  ? `${STARTING_COLUMN_LABEL[startingColumn]} · shown on a first time on a machine`
                  : "No column picked yet"}
            </p>
            <div className="rpl-actions">
              <Button variant="outline" onClick={onStartingColumn}>
                {startingColumn ? "Change column" : "Pick a column"}
              </Button>
            </div>
          </section>
        )}
        {canWrite ? (
          <p className="rpl-meta">Tap a machine to change it in the plan.</p>
        ) : (
          <p className="rpl-meta">Sign in again to change the plan.</p>
        )}
      </PlanSheet>

      {machineSheet}

      {mode.kind === "cantdo" && who && (
        <CantDoSheet
          open
          firstName={first}
          machineId={mode.id}
          floor={floor}
          plan={rows}
          bench={held}
          nameOf={nameOf}
          todayYmd={todayYmd}
          aside={keptToday(mode.id) ? TODAY_SET_STAYS : null}
          onClose={() => setMode({ kind: "main" })}
          onSave={saveCantDo}
        />
      )}

      {mode.kind === "replan" && who && (
        <ReplanSheet
          firstName={first}
          plan={plan}
          lineup={rows}
          bench={held}
          floor={floor}
          nameOf={nameOf}
          studioId={studioId}
          who={who}
          todayYmd={todayYmd}
          onClose={() => setMode({ kind: "main" })}
          onDone={saveReplan}
        />
      )}

      {mode.kind === "reason" && (
        <ReasonSheet open what={mode.what} onClose={() => setMode({ kind: "machine", id: mode.from })} onSave={(reason) => saveSwap(mode, reason)} />
      )}
    </>
  );
}
