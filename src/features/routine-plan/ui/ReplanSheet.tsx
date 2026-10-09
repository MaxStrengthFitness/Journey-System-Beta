/**
 * RE-PLAN ROUTINE A (the design round, §4.3; AJ, Oct 8 2026: "we might have a
 * plan for a routine but find something out in those first few sessions that
 * drastically changes it or we could have a client who is getting surgery").
 *
 * What changed? (Surgery coming up · Found something in the first sessions ·
 * Client asked · Training at another studio, or the trainer's own words, all
 * optional), which machines are out for now and until when, and then either
 * "Start again from {a starting routine} with what we know" or "Edit the
 * lineup by hand". The starting routine is the plan's own by default, or
 * Another start (AJ's Oct 8 note puts it on every surface: "we might have a
 * plan for a routine but find something out in those first few sessions
 * that drastically changes it"; the whole-branch review, Oct 9 2026: once
 * kept, a different start had no path, and a plan built by hand none at
 * all): the studio's starting routines, each shown by its first machines,
 * with what this floor lacks said, never dropped. The history gets a
 * divider; nothing before it is erased. "Surgery coming up" with machines
 * out puts them on the bench as a surgery, and offers the one-tap Health
 * note a surgery offers (AJ's "2a"), one note for them all, unticked until
 * the trainer ticks it.
 *
 * Mounted only while open, so the one read of the starting routines and the
 * studio's choice happens only when someone re-plans.
 */
import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUnsavedChanges } from "../../unsaved-changes";
import { healthNoteOffer, untilDayFrom } from "../cant-do";
import { replanCantDoReason, type Who } from "../lineup";
import { REPLAN_REASONS } from "../plan";
import { notOnFloorLine } from "../starting-choice";
import { startingPlanFromRoutine, suggestFromStartingRoutines } from "../starting-routines";
import type { FloorMachine } from "../starting-plan";
import type { CantDo, RoutinePlan } from "../types";
import { useStartingRoutines } from "../useStartingRoutines";
import { Chip, PlanSheet, TickRow } from "./parts";
import { MachineChips } from "./pickers";

const UNTIL = [
  { id: "cleared", label: "Until cleared" },
  { id: "date", label: "Until a date" },
  { id: "always", label: "Always" },
] as const;

export interface ReplanDone {
  /**
   * The starting routine's road and day one on this floor, with its id,
   * name and source (the plan's own or Another start), or null for "Edit
   * the lineup by hand".
   */
  fresh: { intended: string[]; dayOne: string[]; templateId: string; templateName?: string; templateSource?: string } | null;
  why: string | null;
  out: string[];
  until: CantDo["until"];
  /** The can't-do reason what changed gives the machines out for now ("Surgery coming up" is a surgery), or null. */
  outReason: string | null;
  /** The trainer ticked "Also add a Health note" (a surgery only). */
  healthNote: boolean;
}

/** A button whose words carry a name: they wrap inside the sheet, never run off its edge. */
const WRAPS = "h-auto min-h-10 max-w-full shrink whitespace-normal py-2 text-left";

export interface ReplanSheetProps {
  firstName: string;
  plan: RoutinePlan;
  /** The lineup's machines, offered first. */
  lineup: readonly string[];
  /** Already on the bench. */
  bench: readonly string[];
  floor: readonly FloorMachine[];
  nameOf: (id: string) => string;
  studioId: string | null;
  /** For "Not on Westlake's floor: …"; "this studio" without it. */
  studioName?: string | null;
  who: Who;
  todayYmd: string;
  onClose: () => void;
  onDone: (done: ReplanDone) => void;
}

export function ReplanSheet({ firstName, plan, lineup, bench, floor, nameOf, studioId, studioName = null, who, todayYmd, onClose, onDone }: ReplanSheetProps) {
  const [pick, setPick] = useState<string | null>(null);
  /** Another start, picked here; null: the plan's own. */
  const [fromId, setFromId] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [out, setOut] = useState<string[]>([]);
  const [until, setUntil] = useState<(typeof UNTIL)[number]["id"]>("cleared");
  const [date, setDate] = useState("");
  const [note, setNote] = useState(false);
  const unsaved = useUnsavedChanges(typed.trim() !== "", "the re-plan of Routine A", { onDiscard: () => setTyped("") });

  const starting = useStartingRoutines(studioId);
  /* The starts this studio offers (its choice, on this floor), each by its
     first machines, the plan's own first. */
  const offered = useMemo(() => {
    if (starting.status === "loading") return [];
    const s = suggestFromStartingRoutines({ routines: starting.routines, choice: starting.choice, floor, pickedId: plan.templateId ?? null, studioName });
    const all = s.templateId
      ? [{ templateId: s.templateId, label: s.label ?? "", machineIds: s.steps.flatMap((x) => x.machineIds) }, ...s.alternatives]
      : s.alternatives;
    const own = plan.templateId ? all.find((a) => a.templateId === plan.templateId) : undefined;
    return own ? [own, ...all.filter((a) => a !== own)] : all;
  }, [starting.status, starting.routines, starting.choice, floor, plan.templateId, studioName]);
  const pickedId = fromId ?? (plan.templateId && offered.some((o) => o.templateId === plan.templateId) ? plan.templateId : null);
  const routine = pickedId ? (starting.routines.find((r) => r.id === pickedId) ?? null) : null;
  const fresh = useMemo(() => {
    if (!routine) return null;
    const made = startingPlanFromRoutine(routine, who, floor, todayYmd);
    return {
      intended: made.plan.intended,
      dayOne: made.startWith,
      templateId: routine.id,
      ...(made.plan.templateName ? { templateName: made.plan.templateName } : null),
      ...(made.plan.templateSource ? { templateSource: made.plan.templateSource } : null),
    };
  }, [routine, who, floor, todayYmd]);
  // This floor only: what the picked start's road lacks here, said.
  const missingLine = useMemo(
    () =>
      routine
        ? notOnFloorLine(
            suggestFromStartingRoutines({ routines: [routine], choice: null, floor, pickedId: routine.id }).steps.flatMap((s) => s.missing),
            studioName,
          )
        : null,
    [routine, floor, studioName],
  );

  const why = [pick, typed.trim()].filter(Boolean).join(" · ") || null;
  const untilValue: CantDo["until"] | null = until === "date" ? untilDayFrom(date, todayYmd) : until;
  const ready = out.length === 0 || untilValue !== null;
  // A surgery coming up benches what is out as a surgery, and offers the
  // one-tap Health note a surgery offers (AJ's "2a"): asked, never automatic.
  const outReason = replanCantDoReason(pick);
  const offer = out.length > 0 ? healthNoteOffer(outReason) : null;
  const done = (how: "fresh" | "hand") => {
    if (!ready) return;
    unsaved.release();
    onDone({
      fresh: how === "fresh" ? fresh : null,
      why,
      out,
      until: untilValue ?? "cleared",
      outReason: out.length > 0 ? outReason : null,
      healthNote: !!offer && note,
    });
  };

  return (
    <PlanSheet
      open
      title="Re-plan Routine A"
      meta="Everything so far stays in the changes."
      onClose={() => unsaved.guard(onClose)}
      footer={
        <>
          <Button variant="outline" disabled={!ready} onClick={() => done("hand")}>
            Edit the lineup by hand
          </Button>
          {routine && (
            <Button className={`hover:bg-primary ${WRAPS}`} disabled={!ready || !fresh} onClick={() => done("fresh")}>
              <RotateCcw aria-hidden="true" />
              Start again from {routine.name} with what we know
            </Button>
          )}
        </>
      }
    >
      <section className="rpl-sheet__section">
        <p className="rpl-sheet__label">What changed?</p>
        <div className="rpl-chips" role="group" aria-label="What changed">
          {REPLAN_REASONS.map((r) => (
            <Chip key={r} on={pick === r} onClick={() => setPick(pick === r ? null : r)}>
              {r}
            </Chip>
          ))}
        </div>
        <input
          className="rpl-field"
          value={typed}
          maxLength={400}
          onChange={(e) => setTyped(e.target.value)}
          aria-label="In your own words"
          placeholder="In your own words, optional"
        />
      </section>
      <section className="rpl-sheet__section">
        <p className="rpl-sheet__label">Not for {firstName} for now · optional</p>
        <MachineChips
          floor={floor}
          plan={lineup}
          exclude={bench}
          isOn={(id) => out.includes(id)}
          onTap={(id) => setOut(out.includes(id) ? out.filter((x) => x !== id) : [...out, id])}
          nameOf={nameOf}
          fold
        />
        {out.length > 0 && (
          <div className="rpl-sheet__section">
            <div className="rpl-chips" role="group" aria-label="For how long">
              {UNTIL.map((u) => (
                <Chip key={u.id} on={until === u.id} onClick={() => setUntil(u.id)}>
                  {u.label}
                </Chip>
              ))}
            </div>
            {until === "date" && (
              <input className="rpl-field" type="date" min={todayYmd} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Until" />
            )}
            {until === "date" && date !== "" && untilValue === null && <p className="rpl-meta">Pick today or a later day.</p>}
          </div>
        )}
      </section>
      {offer && (
        <TickRow
          on={note}
          onChange={setNote}
          label="Also add a Health note"
          sub={`Filed under ${offer.label}, so the studio's leaders see it on Operations → Today.`}
        />
      )}
      {starting.status === "loading" && <p className="rpl-meta">Reading the starting routines…</p>}
      {offered.length > 0 && (
        <section className="rpl-sheet__section">
          <p className="rpl-sheet__label">Start again from</p>
          <div className="rpl-starts">
            {offered.map((s) => {
              const firstThree = s.machineIds.slice(0, 3).map(nameOf).join(" · ");
              const more = s.machineIds.length > 3 ? `+${s.machineIds.length - 3} more · ` : "";
              return (
                <button
                  key={s.templateId}
                  type="button"
                  className="rpl-start"
                  aria-pressed={s.templateId === pickedId}
                  onClick={() => setFromId(s.templateId)}
                >
                  <span className="rpl-start__machines">{firstThree || s.label}</span>
                  <span className="rpl-start__meta">
                    {more}
                    {s.label}
                    {s.templateId === plan.templateId ? " · this plan's" : ""}
                  </span>
                </button>
              );
            })}
          </div>
          {missingLine && <p className="rpl-meta">{missingLine}</p>}
        </section>
      )}
      {plan.templateId && !pickedId && starting.status !== "loading" && (
        <p className="rpl-meta">The starting routine this plan came from isn't offered any more. Pick another start, or edit the lineup by hand.</p>
      )}
    </PlanSheet>
  );
}
