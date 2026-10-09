/**
 * B PLANNED WITH THE STARTING LINEUP (the first-session design round, Round
 * 2, item 8): at a studio whose setting says new clients start on "A and B
 * together" (`newClientsStart`, studio-settings/registry.ts), Start a plan
 * on Programming and the briefing's walk-in card plan Routine B beside the
 * starting lineup.
 *
 * AJ, Oct 7 2026: "Some studios may start building an A and B routine
 * immediately for a client. So we need to be able to have that
 * customization." And on B: "the B routine starts out as the A routine with
 * just one machine different."
 *
 * So B's part is B's suggested swaps against A's PLANNED road
 * (`suggestPlannedBSwaps`: the starting plan's `intended`, can't-do
 * respected, this floor only), each editable (`BSwapsEditor`), what B is
 * for, and "Leave B for later" (B is then planned from Routine A as at any
 * studio). Kept in the SAME batch as the starting plan (Keep this lineup,
 * or Start on the briefing) as Routine B with its plan and NO machines: the
 * consult is not Routine A (AJ, Oct 8 2026), and B is a copy of A. The
 * Wrap-up that starts Routine A starts B too (`plannedBStart`), and a swap
 * for a machine A takes later waits for it. Nothing here writes; the caller
 * hands `planned` to the one writer.
 *
 * Until the studio's setting answers, the part says it is reading and
 * nothing about B is kept; when the read failed, B is offered, left for
 * later until the trainer plans it: a failed read is unknown, never "A
 * alone" (the review of item 8).
 *
 * - `usePlannedB`: the draft (the trainer's swaps once they change one,
 *   else the suggestion as the lineup moves), what B is for, left for later
 *   or not, and what a keep writes (`planned`: B's plan and its first
 *   change, signed), registered by the caller as unsaved work (`changed`).
 * - `PlannedBPart`: the part itself, on Programming's starting lineup and
 *   in the briefing's sheet.
 * - `PlannedBGlance`: the briefing's one line ("B · planned with A: Leg
 *   Extension for Leg Press first") and Change B, the Road's glance.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  B_PURPOSES,
  B_PURPOSE_LABEL,
  B_SWAPS_SOURCE,
  plannedBOf,
  suggestPlannedBSwaps,
  usableSwaps,
  type BPurpose,
} from "../b-routine";
import { signedChange, type Who } from "../lineup";
import type { FloorMachine } from "../starting-plan";
import type { PlanChange, PlanSwap, RoutinePlan } from "../types";
import { BSwapsEditor } from "./BSwapsEditor";
import type { NewClientsStartRead } from "./host";
import { Chip, PlanSheet, SourceTag } from "./parts";
import "./routine-plan.css";

const same = (a: readonly PlanSwap[], b: readonly PlanSwap[]) =>
  a.length === b.length && a.every((s, i) => s.replaces === b[i]!.replaces && s.with === b[i]!.with);

/**
 * Where the studio's setting stands for B planned with a starting lineup:
 * - "on": the studio starts new clients on A and B together: B's part, as
 *   suggested;
 * - "offer": the setting couldn't be read: B's part is offered, left for
 *   later until the trainer plans it (a failed read is unknown, never "A
 *   alone");
 * - "reading": the setting hasn't answered yet: one line says so, and
 *   nothing about B is kept;
 * - "off": A alone, or no B can be planned here (a Routine B of the
 *   client's own).
 */
export type PlannedBRead = "on" | "offer" | "reading" | "off";

/** The host's answer (`PlanHost.aAndBTogether`) and whether a B may be planned here, as a `PlannedBRead`. */
export function plannedBReadOf(setting: NewClientsStartRead | null | undefined, plannable: boolean): PlannedBRead {
  if (!plannable) return "off";
  if (setting === true) return "on";
  if (setting === "failed") return "offer";
  if (setting === "loading") return "reading";
  return "off";
}

/** Said while the studio's setting hasn't answered. */
export const PLANNED_B_READING = "Reading how this studio starts new clients…";

export interface PlannedBState {
  /** B's part is drawn: A and B together (or the setting couldn't be read), and a lineup to plan B against. */
  on: boolean;
  /** The setting hasn't answered yet: nothing about B is kept, and the part says it is reading. */
  reading: boolean;
  /** The setting couldn't be read: B is offered, left for later until the trainer plans it. */
  unread: boolean;
  /** "Leave B for later": nothing about B is kept with the lineup. */
  dropped: boolean;
  /** The swaps, in the order they come in: the trainer's, else the suggestion. */
  swaps: PlanSwap[];
  /** The swaps a keep would keep (on the road, on this floor, never what the client can't do). */
  kept: PlanSwap[];
  purpose: BPurpose;
  setSwaps: (next: PlanSwap[]) => void;
  setPurpose: (p: BPurpose) => void;
  drop: () => void;
  restore: () => void;
  /** The trainer changed B's part: the caller counts it as unsaved work. */
  changed: boolean;
  /** Back to the suggestion (the leave gate's discard). */
  reset: () => void;
  /** What a keep writes: B's plan and its first change, signed; null with no B to keep. */
  planned: { plan: RoutinePlan; change: PlanChange } | null;
  /** A's planned road, B's places. */
  road: string[];
  /** A's plan as drafted: its can't-do marks are B's too. */
  aPlan: RoutinePlan | null;
}

export function usePlannedB(input: {
  /** Where the studio's `newClientsStart` stands here (`plannedBReadOf`). */
  read: PlannedBRead;
  /** The starting lineup's plan as it stands (the draft), or null while there is none. */
  aPlan: RoutinePlan | null;
  floor: readonly FloorMachine[];
  todayYmd: string;
  who: Who | null;
  /**
   * The trainer changed B's swaps or what B is for: the caller holds the
   * starting routine the lineup came from, so a suggestion moving under it
   * (open Health notes landing) never drops the edit (the review of item 8).
   */
  onEdit?: () => void;
}): PlannedBState {
  const { read, aPlan, floor, todayYmd, who, onEdit } = input;
  const hasRoad = !!aPlan && aPlan.intended.length > 0;
  const on = (read === "on" || read === "offer") && hasRoad;
  const reading = read === "reading" && hasRoad;
  // A setting not read leaves B for later until the trainer plans it.
  const droppedAtFirst = read === "offer";
  const road = useMemo(() => (aPlan ? [...aPlan.intended] : []), [aPlan]);
  const suggested = useMemo(
    () => (on && aPlan ? suggestPlannedBSwaps({ road, aPlan, floor, todayYmd }) : []),
    // The road by its contents, the floor by its machines.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [on, road.join("|"), aPlan?.templateId, aPlan?.cantDo, floor.map((m) => m.id).join("|"), todayYmd],
  );
  /* The trainer's swaps, for the starting routine they were changed on: a
     new start (Another start) begins again from its own suggestion. The
     caller holds the start once B is edited (`onEdit`), so only the
     trainer's own pick moves it. */
  const key = aPlan?.templateId ?? "";
  const [draft, setDraft] = useState<{ key: string; swaps: PlanSwap[] } | null>(null);
  const [purpose, setPurposeNow] = useState<BPurpose>("variety");
  const [droppedSet, setDropped] = useState<boolean | null>(null);
  const dropped = droppedSet ?? droppedAtFirst;
  const mine = draft && draft.key === key ? draft.swaps : null;
  const swaps = mine ?? suggested;
  const kept = useMemo(
    () => (on ? usableSwaps({ swaps, aRoutine: road, aIntended: road, floor, cantDo: aPlan?.cantDo, todayYmd }) : []),
    [on, swaps, road, floor, aPlan?.cantDo, todayYmd],
  );
  const planned = useMemo(() => {
    if (!on || dropped || !who?.uid || !aPlan) return null;
    const b = plannedBOf({ road, aPlan, floor, purpose, swaps, who, todayYmd });
    return b ? { plan: b.plan, change: signedChange(b.change, who) } : null;
  }, [on, dropped, who, aPlan, road, floor, purpose, swaps, todayYmd]);
  const changed = on && ((mine !== null && !same(mine, suggested)) || purpose !== "variety" || dropped !== droppedAtFirst);
  return {
    on,
    reading,
    unread: read === "offer",
    dropped,
    swaps,
    kept,
    purpose,
    setSwaps: (next) => {
      onEdit?.();
      setDraft({ key, swaps: [...next] });
    },
    setPurpose: (p) => {
      onEdit?.();
      setPurposeNow(p);
    },
    drop: () => setDropped(true),
    restore: () => setDropped(false),
    changed,
    reset: () => {
      setDraft(null);
      setPurposeNow("variety");
      setDropped(null);
    },
    planned,
    road,
    aPlan,
  };
}

export interface PlannedBPartProps {
  state: PlannedBState;
  nameOf: (id: string) => string;
  floor: readonly FloorMachine[];
  todayYmd: string;
  /** Draw the part's own head ("Routine B, planned with A"); a sheet titles it itself. */
  heading?: boolean;
}

/** B's part of a starting lineup: the swaps, what B is for, and Leave B for later. */
export function PlannedBPart({ state, nameOf, floor, todayYmd, heading = true }: PlannedBPartProps) {
  const head = heading ? <p className="rpl-sheet__label">Routine B, planned with A</p> : null;
  if (state.reading) {
    return (
      <section className="rpl-sheet__section" aria-label="Routine B" aria-busy="true">
        {head}
        <p className="rpl-meta">{PLANNED_B_READING}</p>
      </section>
    );
  }
  if (!state.on) return null;
  if (state.dropped) {
    return (
      <section className="rpl-sheet__section" aria-label="Routine B">
        {head}
        <p className="rpl-line">
          {state.unread
            ? "Couldn't read how this studio starts new clients, so B isn't planned with A. Plan it here, or from Routine A later."
            : "B is left for later. Plan it from Routine A once A has machines."}
        </p>
        <div className="rpl-actions">
          <Button variant="outline" onClick={state.restore}>
            Plan B with A
          </Button>
        </div>
      </section>
    );
  }
  return (
    <section className="rpl-sheet__section" aria-label="Routine B, planned with A">
      {head}
      <p className="rpl-meta">
        B starts at the Wrap-up that starts Routine A, as A with one machine different. Then A and B alternate, and B takes its
        next swap as you choose. A swap for a machine A takes later waits for it.
      </p>
      <SourceTag>{B_SWAPS_SOURCE}</SourceTag>
      {state.swaps.length === 0 && <p className="rpl-meta">Nothing on this floor to swap in yet. Add one for a machine of A below.</p>}
      <BSwapsEditor
        aRoutine={state.road}
        aIntended={state.road}
        cantDo={state.aPlan?.cantDo}
        floor={floor}
        todayYmd={todayYmd}
        nameOf={nameOf}
        swaps={state.swaps}
        onSwaps={state.setSwaps}
        kept={state.kept}
        leftOut={() => "Left out: the lineup or the floor changed"}
        keepsLine="B keeps these as A has them. Tap one to plan a swap for it."
      />
      <div className="rpl-actions" role="group" aria-label="B is for">
        <span className="rpl-bhead__label">B is for</span>
        {B_PURPOSES.map((p) => (
          <Chip key={p} on={state.purpose === p} onClick={() => state.setPurpose(p)}>
            {B_PURPOSE_LABEL[p]}
          </Chip>
        ))}
      </div>
      <div className="rpl-actions">
        <Button variant="ghost" className="text-primary" onClick={state.drop}>
          Leave B for later
        </Button>
      </div>
    </section>
  );
}

/**
 * The briefing's glance at B planned with the starting lineup: one line
 * (the first swap, how many in all, or that B is left for later) and Change
 * B, which opens the part in a sheet. Nothing is saved until Start, and
 * nothing holds Start: while the studio's setting is being read, the line
 * says so and Start keeps no B.
 */
export function PlannedBGlance({
  state,
  nameOf,
  floor,
  todayYmd,
}: {
  state: PlannedBState;
  nameOf: (id: string) => string;
  floor: readonly FloorMachine[];
  todayYmd: string;
}) {
  const [open, setOpen] = useState(false);
  if (state.reading) {
    return (
      <div className="rpl-brief__b" aria-busy="true">
        <p className="rpl-meta">B · {PLANNED_B_READING.toLowerCase()}</p>
      </div>
    );
  }
  if (!state.on) return null;
  const first = state.kept[0];
  const line = state.dropped
    ? state.unread
      ? "B · couldn't read how this studio starts new clients"
      : "B · left for later"
    : first
      ? `B · planned with A: ${nameOf(first.with)} for ${nameOf(first.replaces)} first${state.kept.length > 1 ? ` · ${state.kept.length} swaps` : ""}`
      : "B · nothing on this floor to swap in yet";
  return (
    <div className="rpl-brief__b">
      <p className="rpl-meta">{line}</p>
      <div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Change B
        </Button>
      </div>
      {open && (
        <PlanSheet
          open
          title="Routine B, planned with A"
          meta="Kept with the plan when you press Start."
          onClose={() => setOpen(false)}
          footer={
            <Button className="hover:bg-primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          }
        >
          <PlannedBPart state={state} nameOf={nameOf} floor={floor} todayYmd={todayYmd} heading={false} />
        </PlanSheet>
      )}
    </div>
  );
}
