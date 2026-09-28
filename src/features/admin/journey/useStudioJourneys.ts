/**
 * THE STUDIO'S JOURNEY, worked out once for a page — every home client's
 * state and case, from reads Operations already makes.
 *
 * The redesign's Operations room, phase 4 (Sep 28 2026). Reads: the week's
 * bookings as the server answered them (changes/useStudioWeek — the same
 * listener shape Today uses), the studio's renewal settings (one small
 * document: `breakDays` is the At-risk line), the studio settings (the five
 * lines: Drifting's multiple and least, Lapsed, New and Settling in — the
 * studio's own, else Max Strength's default, else the app's; wave 2, Sep 28
 * 2026), the watchlist (what a leader already answered) and the stored cases
 * (wave 2, case-store.ts: one small collection, the leaders' read). The
 * roster, the trainers and the studios are the app's. Nothing is read per
 * client.
 *
 * While either settings read is still out the states are not worked out at
 * all (`ready` is false): a line would otherwise be the default for a moment
 * and a client could flicker between states. A settings read that failed
 * falls through to the layer beneath, and the page says so.
 */
import { useMemo } from "react";
import type { Client, Studio, Trainer } from "../../../types";
import { auth } from "../../../firebase";
import { myTrainerIds } from "../../../lib/live-session";
import { studioDateKey } from "../../../lib/studio-time";
import { buildPackageNameIndex } from "../../renewals/settings";
import type { RenewalSettings } from "../../renewals/types";
import { useRenewalSettings } from "../../renewals/useRenewalSettings";
import { useStudioSettings, type StudioSettings } from "../../studio-settings/useStudioSettings";
import { useStudioWeek, type StudioWeek } from "../changes/useStudioWeek";
import { useWatchlist, type StreamState } from "../attention/useAttention";
import type { WatchlistEntry } from "../attention/attention";
import { nightlyRead, type NightlyRead } from "../overview/brief";
import { useStudioCases, type CasesRead } from "./case-store";
import { studioJourneys, type JourneyEntry } from "./journey-list";
import { linesOf, type JourneyLines } from "./states";

export interface StudioJourneys {
  ready: boolean;
  entries: JourneyEntry[];
  today: string;
  tz?: string;
  week: StudioWeek;
  nightly: NightlyRead;
  watchlist: StreamState<Map<string, WatchlistEntry>>;
  breakDays: number;
  /** The studio's renewal settings (the defaults until read). */
  settings: RenewalSettings;
  /** The settings couldn't be read: the defaults stand, and the page says so. */
  settingsFailed: boolean;
  /** The five lines the states were worked out with. */
  lines: JourneyLines;
  /** The studio settings behind them: each value and where it came from. */
  studioSettings: StudioSettings;
  /** A settings layer couldn't be read: the lines fell through to the layer beneath. */
  linesFailed: boolean;
  /** The studio's stored cases (wave 2). A failed read leaves every case worked out, and the page says so. */
  cases: CasesRead;
}

export function useStudioJourneys({
  studio,
  studios,
  clients,
  trainers,
  authTrainer,
  now,
  only,
}: {
  studio: Studio;
  studios: Studio[];
  clients: Client[];
  trainers: Trainer[];
  authTrainer: Trainer;
  now: Date;
  /** Work out one client only (the client page); the nightly record is still judged across the roster. */
  only?: string | null;
}): StudioJourneys {
  const studioId = studio.id as string;
  const tz = studio.timezone || undefined;
  const today = studioDateKey(now, tz) ?? "";
  const week = useStudioWeek(studioId, today, tz);
  const settingsState = useRenewalSettings(studioId);
  const studioSettings = useStudioSettings(studioId, studio);
  const lines = useMemo(() => linesOf(studioSettings.all), [studioSettings.all]);
  const watchlist = useWatchlist(studioId);
  const cases = useStudioCases(studioId);
  const nightly = useMemo(() => nightlyRead(clients, studioId, now), [clients, studioId, now]);
  const packageIndex = useMemo(() => {
    if (settingsState.loading || settingsState.error || settingsState.forStudioId !== studioId) return null;
    return buildPackageNameIndex(settingsState.settings);
  }, [settingsState.loading, settingsState.error, settingsState.forStudioId, settingsState.settings, studioId]);
  const uid = auth.currentUser?.uid ?? null;
  const ready = !settingsState.loading && !studioSettings.loading;
  const entries = useMemo(() => {
    if (!ready) return [];
    const scope = only ? clients.filter((c) => c.id === only) : clients;
    return studioJourneys({
      clients: scope,
      studioId,
      today,
      now,
      tz,
      studios,
      weekEntries: week.entries,
      weekReady: week.read === "ready",
      packageIndex,
      trainers,
      myIds: myTrainerIds(authTrainer, uid),
      myName: authTrainer.fullName ?? null,
      settings: settingsState.settings,
      nightlyStale: nightly.stale,
      lines,
      watchlist: watchlist.value,
      cases: cases.cases,
    });
    // `now` is read once per render on purpose: the page re-renders every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, only, clients, studioId, today, tz, studios, week.entries, week.read, packageIndex, trainers, authTrainer, uid, settingsState.settings, nightly.stale, lines, watchlist.value, cases.cases]);
  return {
    ready,
    entries,
    today,
    tz,
    week,
    nightly,
    watchlist,
    breakDays: settingsState.settings.breakDays,
    settings: settingsState.settings,
    settingsFailed: Boolean(settingsState.error),
    lines,
    studioSettings,
    linesFailed: studioSettings.failed,
    cases,
  };
}
