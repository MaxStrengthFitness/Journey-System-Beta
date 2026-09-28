/**
 * TEST HELPERS for Openings' screens (not shipped: only the render tests
 * import it). The Relay shell's two doors, held in state the way
 * MyStudioView holds them, so a time's sheet opens in a real Context Panel;
 * and a summary folded from the pure core's own fixtures (a studio with Sam
 * and Pat agreed, whose job ran Sun Nov 8 2026).
 */
import { useMemo, useState, type ReactNode } from "react";
import { RelayProvider, type PanelContent, type RelayContextValue } from "../../relay/board/RelayContext";
import { UnsavedChangesProvider } from "../../unsaved-changes";
import type { Studio, Trainer } from "../../../types";
import { addDays } from "../coverage";
import { foldSummary, type FoldInput } from "../fold";
import { MONDAYS, PAT_WEEK, SUNDAY_RUN, TRAINERS, TZ, WHOLE_WINDOW, monday, sam, standingWeek } from "../fixtures";
import { summaryForWrite, type OpeningsSummary } from "../summary-doc";

export function Shell({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<PanelContent | null>(null);
  const value = useMemo(
    () =>
      ({
        studioId: "westlake",
        studioName: "Westlake",
        authTrainer: null,
        uid: null,
        trainers: [],
        clients: [],
        schedules: [],
        sessions: [],
        machines: [],
        now: {},
        canLead: false,
        panel,
        openCapture: () => {},
        openPanel: setPanel,
        closePanel: () => setPanel(null),
      }) as unknown as RelayContextValue,
    [panel],
  );
  return (
    <UnsavedChangesProvider>
      <RelayProvider value={value}>{children}</RelayProvider>
    </UnsavedChangesProvider>
  );
}

export const WESTLAKE = { id: "westlake", name: "Westlake", timezone: TZ, mindbodySiteId: "29068" } as unknown as Studio;

export const person = (id: string, fullName: string, over: Record<string, unknown> = {}) =>
  ({
    id,
    fullName,
    initials: "",
    role: "LifeTransformer",
    primaryHomeStudioId: "westlake",
    accessibleStudioIds: ["westlake"],
    activeGuestStudioIds: [],
    ...over,
  }) as unknown as Trainer;

export const SAM = person("t-sam", "Sam Lee", { authUid: "uid-sam" });
export const PAT = person("t-pat", "Pat Moss", { authUid: "uid-pat" });
export const KIM = person("t-kim", "Kim Ray", { authUid: "uid-kim" });
export const LEE = person("t-lee", "Lee Leader", { role: "HeadTrainer", authUid: "uid-lee" });

/** Sam takes clients Monday 7:00 - 10:00 and Tuesday 10:00 - 12:00, booked every Tuesday at 10:00. */
export const SAM_TUESDAYS = standingWeek({
  hours: [
    { weekday: 1, from: "07:00", to: "10:00" },
    { weekday: 2, from: "10:00", to: "12:00" },
  ],
});

/** The summary the Sunday job would write for the core's fixture studio, as stored. */
export function foldFixture(over: Partial<FoldInput> = {}): OpeningsSummary {
  const tuesdays = MONDAYS.map((m) => sam(addDays(m, 1), "10:00"));
  return summaryForWrite(
    foldSummary({
      studioId: "westlake",
      tz: TZ,
      now: SUNDAY_RUN,
      bookings: [...MONDAYS.flatMap(monday), ...tuesdays],
      coverage: WHOLE_WINDOW,
      trainers: TRAINERS,
      weeks: [SAM_TUESDAYS, PAT_WEEK],
      previous: null,
      ...over,
    }),
  );
}

export { MONDAYS, PAT_WEEK, SUNDAY_RUN, TZ };
