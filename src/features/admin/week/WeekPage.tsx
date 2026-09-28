/**
 * OPERATIONS → WEEK.
 *
 * The redesign's Operations room (Sep 28 2026), phase 1: the week's
 * cancellations and moves (the Overview's Changes view, moved here so the
 * week has a place of its own). It reads the week the one way Operations
 * may say things from it (changes/useStudioWeek: the server's answer, never
 * this iPad's cache alone).
 */
import type { Studio } from "../../../types";
import { studioDateKey } from "../../../lib/studio-time";
import { ChangesView } from "../changes/ChangesView";
import { useStudioWeek } from "../changes/useStudioWeek";
import { useMinuteClock } from "../shell/useMinuteClock";

export interface WeekPageProps {
  studio: Studio;
  onOpenClient?: (clientId: string) => void;
}

export function WeekPage({ studio, onOpenClient }: WeekPageProps) {
  const now = useMinuteClock();
  const tz = studio.timezone || undefined;
  const today = studioDateKey(now, tz) ?? "";
  const week = useStudioWeek(studio.id ?? null, today, tz);
  return <ChangesView studio={studio} entries={week.entries} loading={week.loading} failed={week.failed} today={today} onOpenClient={onOpenClient} />;
}
