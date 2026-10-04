/**
 * THE PAGE'S ONE NOTE ABOUT THE NIGHTLY RECORD, for any Operations page
 * (the calm round, Oct 3 2026): brief.ts `nightlyNote` with the clients'
 * names filled in. Today, Week, Month, Clients → Journey and Team say it once
 * at the top with PageNote, and the sections it covers stay quiet.
 */
import { useMemo } from "react";
import type { Client, Studio } from "../../../types";
import { clientDisplayName } from "../../../lib/client-name";
import { nightlyNote, type NightlyNote, type NightlyRead } from "./brief";

export function useNightlyNote(nightly: NightlyRead, studio: Studio, today: string, clients: readonly Client[], tz?: string): NightlyNote | null {
  return useMemo(
    () =>
      nightlyNote(
        nightly,
        studio,
        today,
        (ids) =>
          ids
            .map((id) => {
              const c = clients.find((x) => x.id === id);
              return c ? clientDisplayName(c, "A client") : "A client";
            })
            .join(", "),
        tz,
      ),
    [nightly, studio, today, clients, tz],
  );
}

/** The note covers what the record would judge (rhythm, MIA, renewals): those sections stay quiet, never "clear". */
export const noteCovers = (note: NightlyNote | null): boolean => note !== null && note.kind !== "unknown";
