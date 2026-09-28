/**
 * THE SCHEDULE'S REFRESH: the round button in the header, and the calendar's
 * Refresh.
 *
 * Moved out of AppContent as it was (the whole-read record, Sep 27 2026), so
 * the one thing it gained could be tested where it happens: after a pull
 * Mindbody answered in full, it writes down the days it read in full
 * (features/openings/coverage-record.ts). What it asks Mindbody, and when,
 * is unchanged.
 *
 * Asks Mindbody for part of the schedule and re-reads it on this iPad.
 *
 * Two buttons press it. The round one in the header pulls the week ahead.
 * The calendar's Refresh passes the days on screen, so a trainer looking at
 * next month brings it up to date there and then instead of waiting for the
 * morning's whole-month pull (AJ, Sep 26 2026). Resolves when the pull is
 * done, so the calendar re-reads its range on top of a finished write.
 */

import { useState } from "react";
import { useToast } from "../../contexts/ToastContext";
import type { Client, Studio, Trainer } from "../../types";
import { recordCoverage } from "../openings/coverage-record";

export function useScheduleRefresh({
  studios,
  activeStudioId,
  trainers,
  clients,
  refreshSchedules,
}: {
  studios: Studio[];
  activeStudioId: string | null;
  trainers: Trainer[];
  clients: Client[];
  /** Re-reads the week ahead on this iPad (useLiveSchedule's refresh). */
  refreshSchedules: () => void;
}): {
  isRefreshing: boolean;
  pull: (range?: { from: Date; to: Date }) => Promise<void>;
} {
  const { success: toastSuccess, error: toastError } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const pull = async (range?: { from: Date; to: Date }) => {
    const activeStudio = studios.find((s) => s.id === activeStudioId);

    if (!activeStudio?.mindbodySiteId) {
      toastError(
        `${activeStudio?.name || "This studio"} has no Mindbody Site ID. A studio leader sets it on My Studio → Studio before syncing.`,
      );
      return;
    }

    const sharesSite = studios.some(
      (s) =>
        s.id !== activeStudio.id &&
        s.mindbodySiteId &&
        String(s.mindbodySiteId).trim() ===
          String(activeStudio.mindbodySiteId).trim(),
    );
    if (sharesSite && !activeStudio.mindbodyLocationId) {
      toastError(
        `${activeStudio.name} shares MindBody Site ${activeStudio.mindbodySiteId} with another studio but has no Location ID. A studio leader sets it on My Studio → Studio to keep schedules separate.`,
      );
      return;
    }

    setIsRefreshing(true);
    try {
      const siteId = String(activeStudio.mindbodySiteId);

      const { syncMindbodySchedules, syncWindow, screenSyncWindow, settleWindowFor } =
        await import("../../lib/mindbody-api-sync");
      /*
       * The header's button pulls the week, not the month.
       *
       * Left to the default this asks Mindbody for 30 days, which on a shared
       * site is thousands of appointments across every studio on it, fetched
       * before the spinner stops -- to redraw eight days of one studio, which
       * is all the Hub, the upcoming list and the Operations week can show.
       * The background auto-sync still covers 30 days for the calendar, and
       * the calendar's own Refresh pulls the days it is showing.
       */
      const win = range
        ? screenSyncWindow(range.from, range.to, activeStudio?.timezone)
        : syncWindow(activeStudio?.timezone);
      // Every day on screen is already past: nothing to ask Mindbody about.
      // The calendar still re-reads what Journey holds.
      if (!win) return;
      const startedAt = Date.now();
      const res = await syncMindbodySchedules(
        siteId,
        trainers,
        clients,
        studios,
        null,
        win.start,
        win.end,
        activeStudioId,
        activeStudio?.mindbodyLocationId,
        // Clients this iPad already names are not looked up again: a press
        // costs a page or two instead of ~7 calls (the lean pull, Sep 25 2026).
        // And a booking that left the window is checked against the month
        // (or further, to the calendar's last day) before it is called
        // cancelled: it may only have moved further out.
        {
          skipKnownClientLookups: true,
          settleSweepWith: settleWindowFor(win, activeStudio?.timezone),
        },
      );
      // A whole answer: write down today and tomorrow as read in full. Asks
      // Mindbody nothing, waits for nothing, says nothing if it fails.
      void recordCoverage({
        studioId: activeStudio.id,
        window: win,
        answer: res,
        startedAt,
        timeZone: activeStudio.timezone,
      });
      // Today and tomorrow reach every iPad through the live listener. The rest
      // of the week is a fetched cache, so re-read it here, or the iPad that
      // pressed Refresh keeps showing days 2-8 as they were until its next
      // timed re-read (up to an hour). The calendar re-reads the week and its
      // own range itself once this resolves.
      if (!range) refreshSchedules();

      // "Sep 26 – Oct 10": which days the calendar's press reached.
      const dayLabel = (key: string) =>
        new Date(`${key}T12:00:00`).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
      const reached = range
        ? win.start === win.end
          ? ` for ${dayLabel(win.start)}`
          : ` for ${dayLabel(win.start)} – ${dayLabel(win.end)}`
        : "";
      if (res.errors && res.errors.length > 0) {
        toastError(`Sync completed with issues: ${res.errors[0]}`);
      } else {
        toastSuccess(
          `Schedule refreshed${reached}: ${res.added} added, ${res.updated} updated.`,
        );
      }
      console.log("Schedule refresh result:", res);
    } catch (error: any) {
      console.error("Failed to refresh schedule:", error);
      toastError("Failed to refresh schedule: " + error.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  return { isRefreshing, pull };
}
