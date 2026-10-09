/**
 * THE BRIEFING'S PLAN CARD (the design round, Oct 8 2026, §4.5; AJ's "1d":
 * "the Road's one-line route wherever a glance is all there is: the
 * briefing, the session's Plan chip and the Wrap-up").
 *
 * Drawn in the briefing's "Today's routine" section in place of the A and B
 * buttons, for:
 * - a client starting out at the studio with no plan yet ("starting"): the
 *   starting routine that fits, its Road with today (its day one) under the
 *   Today bracket and the rest hollow, the next one "Next stop"; the Source
 *   tag and its why; Change today; Another start, each shown by its
 *   machines; one order-effect line when today trips one. Start keeps the
 *   plan (the briefing hands it up; the tracker writes it in the Start
 *   batch with an EMPTY Routine A: the consult is not Routine A);
 * - a plan kept (on Programming, or by Start here) while Routine A is
 *   still empty ("kept"): today is the plan's day one, the same Road and
 *   Change today.
 *
 * The host's safety line for today's machines ("Mind the limits on …")
 * sits under the Road (`limits`). While a start is still to pick, the card
 * says Start without one keeps no plan.
 *
 * Beside it, the two other doors' words: `BriefingJourneyLine` for a client
 * who trained here before Journey (one line and a door to Programming) and
 * `BriefingDoors` when Journey can't tell. None of them writes anything, and
 * none of them holds Start: a trainer can always press Start and add
 * machines as they go.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ClipboardList, DoorOpen, Info, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Machine } from "../../../types";
import { changeTodayRows, todayEffect, todayWith } from "../briefing-plan";
import { activeCantDo } from "../cant-do";
import { focusLine } from "../focus";
import { roadGroups } from "../lineup";
import { DoorButton, OrderNote, PlanSheet, SourceTag, TickRow } from "./parts";
import { floorMachinesOf } from "./host";
import { MachineChips } from "./pickers";
import { PlannedBGlance } from "./PlannedBPart";
import { RoadStrip } from "./RoadStrip";
import type { BriefingPlanState } from "./useBriefingPlan";
import "./routine-plan.css";

export interface BriefingPlanCardProps {
  state: BriefingPlanState;
  view: "starting" | "kept";
  firstName: string;
  nameOf: (id: string) => string;
  /** This studio's floor, for Change today's "any machine". */
  floor: readonly Machine[];
  todayYmd: string;
  /** Back to both doors, when the trainer picked this one. */
  onBack?: () => void;
  /**
   * The briefing's own safety line for today's machines ("Mind the limits on
   * …"), drawn under the Road: the routine line it sits in is not drawn for
   * a plan card, and these are the clients whose start was matched on the
   * same intake. The host words it, in its own caution tone.
   */
  limits?: ReactNode;
}

export function BriefingPlanCard({ state, view, firstName, nameOf, floor, todayYmd, onBack, limits }: BriefingPlanCardProps) {
  const first = firstName.trim() || "the client";
  // A title starts with a capital, "the client" included.
  const First = first.charAt(0).toUpperCase() + first.slice(1);
  const [whyOpen, setWhyOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [startsOpen, setStartsOpen] = useState(false);
  const floorList = useMemo(() => floorMachinesOf(floor), [floor]);
  const { plan, today } = state;

  const groups = useMemo(
    () => (plan ? roadGroups({ plan, today, todayYmd, firstName: first }) : []),
    [plan, today, todayYmd, first],
  );
  const effect = useMemo(() => todayEffect(today, nameOf, floorList), [today, nameOf, floorList]);
  const picking = view === "starting" && !state.reading && !plan;

  const title = view === "kept" ? "Routine A's plan" : `${First}'s starting lineup`;

  return (
    <div className="rpl-brief" data-testid="briefing-plan">
      {onBack && (
        <div>
          <Button variant="ghost" className="text-primary" onClick={onBack}>
            <ArrowLeft aria-hidden="true" />
            Both ways to start
          </Button>
        </div>
      )}
      <div className="rpl-brief__head">
        <h3 className="rpl-brief__title">{title}</h3>
        {plan && (
          <Button variant="outline" onClick={() => setChanging(true)}>
            <Pencil aria-hidden="true" />
            Change today
          </Button>
        )}
      </div>

      {state.sourceWords && (
        <div className="rpl-brief__source">
          <SourceTag>{state.sourceWords}</SourceTag>
          {state.why && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={view === "kept" ? "Who kept this plan" : "Why this start"}
              aria-expanded={whyOpen}
              onClick={() => setWhyOpen((o) => !o)}
            >
              <Info aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
      {whyOpen && state.why && state.sourceWords && <p className="rpl-well">{state.why}</p>}

      {state.reading ? (
        <p className="rpl-meta" aria-busy="true">
          Reading the starting routines…
        </p>
      ) : plan ? (
        <>
          {today.length === 0 && <p className="rpl-line">Nothing picked for today. Start and add machines as you go.</p>}
          <RoadStrip groups={groups} nameOf={nameOf} label={`${first}'s plan, today first`} />
          {limits}
          {effect && (
            <ul className="rpl-list rpl-list--flush" aria-label="Today's order">
              <OrderNote effect={effect} />
            </ul>
          )}
          <p className="rpl-meta">
            {view === "starting"
              ? "Starts Routine A's plan · nothing is saved until Start"
              : // A kept plan's weak area, so the next trainer sees it at a glance (Round 2, item 7).
                ["Day one · Routine A starts at the Wrap-up", focusLine(plan)].filter(Boolean).join(" · ")}
          </p>
          {/* B planned beside it, at a studio that starts new clients on A and B together (item 8). */}
          {view === "starting" && <PlannedBGlance state={state.b} nameOf={nameOf} floor={floorList} todayYmd={todayYmd} />}
        </>
      ) : picking ? (
        <p className="rpl-line">{state.suggestion?.why ?? "Pick which starting routine fits"}</p>
      ) : null}
      {/* Start never waits on a pick, so the card says what Start does
          without one: an empty session, and no plan kept. */}
      {(state.reading || picking) && <p className="rpl-meta">Start without a pick keeps no plan.</p>}

      {view === "starting" && !state.reading && state.starts.length > 0 && (
        <StartsList
          state={state}
          nameOf={nameOf}
          picking={picking}
          open={picking || startsOpen}
          onToggle={() => setStartsOpen((o) => !o)}
        />
      )}

      {changing && plan && (
        <ChangeTodaySheet
          plan={plan}
          today={today}
          todayYmd={todayYmd}
          floor={floorList}
          nameOf={nameOf}
          meta={
            view === "starting"
              ? "Today is the plan's day one. Its road stays as it is."
              : "Today only. The plan stays as it is."
          }
          onToday={state.setToday}
          onClose={() => setChanging(false)}
        />
      )}
    </div>
  );
}

/* ── Another start ──────────────────────────────────────────────────────── */

function StartsList({
  state,
  nameOf,
  picking,
  open,
  onToggle,
}: {
  state: BriefingPlanState;
  nameOf: (id: string) => string;
  picking: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const suggested = state.suggestion?.needsChoice ? null : (state.suggestion?.templateId ?? null);
  return (
    <div className="rpl-brief__starts">
      {picking ? (
        <p className="rpl-brief__label">Pick a start</p>
      ) : (
        <div>
          <Button variant="ghost" className="text-primary" aria-expanded={open} onClick={onToggle}>
            Another start
          </Button>
        </div>
      )}
      {open && (
        <>
          {state.fromCode && <p className="rpl-meta">The Academy's starting routines, from Journey's own copy.</p>}
          <div className="rpl-starts">
            {state.starts.map((s) => {
              const on = !picking && s.templateId === state.plan?.templateId;
              const firstThree = s.machineIds.slice(0, 3).map(nameOf).join(" · ");
              const more = s.machineIds.length > 3 ? `+${s.machineIds.length - 3} more · ` : "";
              return (
                <button key={s.templateId} type="button" className="rpl-start" aria-pressed={on} onClick={() => state.pick(s.templateId)}>
                  <span className="rpl-start__machines">{firstThree || s.label}</span>
                  <span className="rpl-start__meta">
                    {more}
                    {s.label}
                    {s.templateId === suggested && !state.pickedId ? " · suggested" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Change today ───────────────────────────────────────────────────────── */

/**
 * Take a machine out of today, put the plan's next one in, or any machine
 * on this floor. A row stays where it was until the sheet closes, so an
 * untick can be taken back. Nothing here writes: a kept plan stays as it
 * is, and a starting plan, still a draft, takes today as its day one when
 * Start keeps it (`planWithTodayAsDayOne`).
 */
function ChangeTodaySheet({
  plan,
  today,
  todayYmd,
  floor,
  nameOf,
  meta,
  onToday,
  onClose,
}: {
  plan: NonNullable<BriefingPlanState["plan"]>;
  today: readonly string[];
  todayYmd: string;
  floor: ReturnType<typeof floorMachinesOf>;
  nameOf: (id: string) => string;
  meta: string;
  onToday: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [shown, setShown] = useState<string[]>(() => [...today]);
  const rows = changeTodayRows({ plan, today, todayYmd, shown });
  const held = activeCantDo(plan, todayYmd).map((c) => c.machineId);
  const listed = rows.map((r) => r.machineId);
  return (
    <PlanSheet
      open
      title="Change today"
      meta={meta}
      onClose={onClose}
      footer={
        <Button className="hover:bg-primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="rpl-sheet__section" role="group" aria-label="Today's machines">
        {rows.map((r) => (
          <TickRow
            key={r.machineId}
            on={r.on}
            label={nameOf(r.machineId)}
            sub={r.note ?? undefined}
            onChange={(on) => onToday(todayWith(today, r.machineId, on))}
          />
        ))}
      </div>
      <MachineChips
        floor={floor}
        plan={[]}
        exclude={[...listed, ...held]}
        isOn={() => false}
        onTap={(id) => {
          setShown((s) => (s.includes(id) ? s : [...s, id]));
          onToday(todayWith(today, id, true));
        }}
        nameOf={nameOf}
        fold
      />
    </PlanSheet>
  );
}

/* ── The other doors ────────────────────────────────────────────────────── */

/**
 * Trained here before Journey (AJ, Oct 7 2026: "if it is a long-standing,
 * it's no suggestion they're going to go ahead and go on their profile, go
 * to programming, fill it in"): one line, a quiet door to Programming, and
 * Start opening an empty session.
 */
export function BriefingJourneyLine({
  line,
  onEnter,
  onBack,
}: {
  /** "Dana has a routine from before Journey". */
  line: string;
  onEnter: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="rpl-brief" data-testid="briefing-plan-journey">
      {onBack && (
        <div>
          <Button variant="ghost" className="text-primary" onClick={onBack}>
            <ArrowLeft aria-hidden="true" />
            Both ways to start
          </Button>
        </div>
      )}
      <p className="rpl-brief__lead">{line}</p>
      <div className="rpl-actions">
        <Button variant="outline" onClick={onEnter}>
          <ClipboardList aria-hidden="true" />
          Enter the routine on Programming
        </Button>
        <span className="rpl-meta">Or start and add machines as you go.</span>
      </div>
    </div>
  );
}

/** Journey can't tell (the design round, §4.1): both doors, claiming neither. Start never waits on a pick. */
export function BriefingDoors({
  firstName,
  says,
  onPick,
}: {
  firstName: string;
  says: string;
  onPick: (door: "studio" | "journey") => void;
}) {
  const first = firstName.trim() || "the client";
  return (
    <div className="rpl-brief" data-testid="briefing-plan-doors">
      <h3 className="rpl-brief__title">How does {first} start?</h3>
      <p className="rpl-meta">{says}</p>
      <div className="rpl-doors">
        <DoorButton icon={<DoorOpen size={20} aria-hidden="true" />} title="Starting out here" line="Start a plan" onClick={() => onPick("studio")} />
        <DoorButton
          icon={<ClipboardList size={20} aria-hidden="true" />}
          title="Trained here before"
          line="Enter their routine"
          onClick={() => onPick("journey")}
        />
      </div>
    </div>
  );
}
