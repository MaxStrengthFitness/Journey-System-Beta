/**
 * AHEAD — the reads behind the page, every one of them one Operations
 * already makes. Nothing per client, nothing written, no Mindbody call and
 * no new query shape (so no new index):
 *
 *   the roster           the app's client list, each with last night's
 *                        renewal record (the dates, the pace, the ranges)
 *   the Journey          useStudioJourneys: the shared listener pair Today,
 *                        Week and Month open, the renewal settings, the
 *                        studio's lines and the leaders' inactive marks
 *   the conversations    useCyclesRead: who last talked and the plan, one
 *                        chunked read of the cycles behind the dates drawn
 *                        (the pipeline's and Month's read, by id)
 *
 * The events are worked out twice: once without the conversations, to know
 * whose to read, and again with them. A conversation only ever takes a date
 * away (a renewal recorded) or adds its words, so the first pass is enough
 * to choose the keys.
 */

import { useMemo } from "react";
import type { Client, Studio, Trainer } from "../../../types";
import { useBoundaryClock } from "../../../lib/boundary-clock";
import type { RosterStatus } from "../../../hooks/useStudioRoster";
import { useCyclesRead } from "../../renewals/usePipeline";
import { useStudioJourneys, type StudioJourneys } from "../journey/useStudioJourneys";
import { noteCovers, useNightlyNote } from "../overview/useNightlyNote";
import type { RenewalLaneContext } from "../renewals/lanes";
import { aheadClients, KIND_GROUP, shortestTier, type AheadInput, type AheadJourney } from "./events";
import { aheadSpan } from "./weeks";

export interface UseAheadArgs {
  studio: Studio;
  studios: Studio[];
  clients: Client[];
  rosterStatus?: RosterStatus;
  trainers: Trainer[];
  authTrainer: Trainer;
}

export function useAhead({ studio, studios, clients, rosterStatus = "ready", trainers, authTrainer }: UseAheadArgs) {
  // Moves when a state could change (a booking's edge, the night's record, the day), not every minute.
  const clock = useBoundaryClock();
  const j = useStudioJourneys({ studio, studios, clients, trainers, authTrainer, now: clock.now, clock });
  return useAheadFrom(j, { studio, clients, rosterStatus, trainers });
}

/**
 * Ahead's reads on a Journey a page already holds (Week ahead's Further
 * ahead passes its own), so a page never opens the Journey's listeners twice.
 */
export function useAheadFrom(
  j: StudioJourneys,
  { studio, clients, rosterStatus = "ready", trainers }: Pick<UseAheadArgs, "studio" | "clients" | "rosterStatus" | "trainers">,
) {
  const studioId = studio.id as string;
  const span = useMemo(() => aheadSpan(j.today), [j.today]);
  const laneCtx = useMemo<RenewalLaneContext>(
    () => ({ studioId, settings: j.settings, today: j.today, inactiveMarks: j.marks.marks, inactiveDays: j.lines.inactiveDays }),
    [studioId, j.settings, j.today, j.marks.marks, j.lines.inactiveDays],
  );
  // May slip waits for the Journey: before it is ready nobody's next line is said.
  const journeys = useMemo<ReadonlyMap<string, AheadJourney> | null>(
    () => (j.ready ? new Map(j.entries.map((e) => [e.id, { journey: e.journey, nextState: e.row.next.state }])) : null),
    [j.ready, j.entries],
  );
  const base = useMemo<Omit<AheadInput, "cycles" | "cyclesKnown" | "journeys">>(
    () => ({
      clients,
      studioId,
      today: j.today,
      until: span.until,
      settings: j.settings,
      laneCtx,
      breakDays: j.breakDays,
      lines: j.lines,
      cutover: studio.journeyCutoverDate ?? null,
      tz: j.tz,
    }),
    [clients, studioId, j.today, span.until, j.settings, laneCtx, j.breakDays, j.lines, studio.journeyCutoverDate, j.tz],
  );
  // Whose conversations to read: anyone with a renewal date in the weeks drawn.
  const cycleKeys = useMemo(
    () =>
      aheadClients({ ...base, cycles: {}, cyclesKnown: false, journeys: null })
        .filter((c) => c.snapshot?.cycleKey && c.events.some((e) => KIND_GROUP[e.kind] !== "moment"))
        .map((c) => c.snapshot?.cycleKey as string),
    [base],
  );
  const cyclesRead = useCyclesRead(studioId, cycleKeys);
  const cyclesKnown = !cyclesRead.loading && !cyclesRead.failed;
  const list = useMemo(
    () => aheadClients({ ...base, cycles: cyclesRead.cycles, cyclesKnown, journeys }),
    [base, cyclesRead.cycles, cyclesKnown, journeys],
  );
  const note = useNightlyNote(j.nightly, studio, j.today, clients, j.tz);
  const trial = useMemo(() => (j.settings.packages.length > 1 ? shortestTier(j.settings.packages) : null), [j.settings.packages]);
  const trainerNames = useMemo(
    () => new Map(trainers.filter((t) => t.id).map((t) => [t.id as string, (t.nickname?.trim() || t.fullName || "").trim()])),
    [trainers],
  );
  return {
    journeys: j,
    span,
    clients: list,
    cycles: cyclesRead.cycles,
    cyclesLoading: cyclesRead.loading,
    cyclesFailed: cyclesRead.failed,
    note,
    covered: noteCovers(note),
    trialLabel: trial?.label ?? null,
    trainerNames,
    /** Nothing is placed until the roster, the settings, the night's states and the inactive marks have answered. */
    ready: j.ready && rosterStatus !== "loading",
    /** The roster failed with nothing held: say "—", never a confident 0. */
    rosterUnknown: rosterStatus === "error" && clients.length === 0,
  };
}

export type AheadData = ReturnType<typeof useAhead>;
