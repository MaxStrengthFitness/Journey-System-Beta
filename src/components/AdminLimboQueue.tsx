import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Loader2,
  MapPin,
  RefreshCw,
  User,
  X,
} from "lucide-react";
import { Client, LimboEntry, Studio } from "../types";
import {
  dismissLimboEntry,
  fetchOpenLimboEntries,
  releaseLimboBooking,
  releaseLimboClient,
} from "../lib/mindbody-limbo";
import {
  wallClockToInstant,
  isValidTimeZone,
  DEFAULT_TIME_ZONE,
} from "../lib/studio-time";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  key?: any;
  studios: Studio[];
  clients?: Client[];
}

/**
 * Admin view over `mindbodyLimbo` — Mindbody events that could not be filed
 * against a studio and were parked instead of dropped.
 *
 * The important behaviour is in the release: a parked booking holds Mindbody's
 * RAW wall-clock time string, because at park time no studio (and therefore no
 * timezone) was known. Choosing the studio here is what finally makes the time
 * readable, so this screen previews the converted time before anything is
 * written.
 */
export function AdminLimboQueue({ studios, clients = [] }: Props) {
  const [entries, setEntries] = useState<LimboEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStudio, setSelectedStudio] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setEntries(await fetchOpenLimboEntries());
    } catch (e: any) {
      setError(e?.message || "Could not read the Limbo queue.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const studioById = useMemo(() => {
    const map: Record<string, Studio> = {};
    for (const s of studios) if (s.id) map[s.id] = s;
    return map;
  }, [studios]);

  /**
   * Previews the release using the SAME converter the write path uses, so what
   * an admin confirms here is what actually gets stored.
   *
   * The wall-clock reading does not change with the studio — 7:00 AM stays 7:00
   * AM — but the instant behind it does, and so does the zone it is anchored
   * to. Showing the zone name is the point: it is the confirmation that this
   * booking is about to be read on THIS studio's clock and not another's.
   */
  const previewTime = (entry: LimboEntry, studioId?: string): string | null => {
    const raw = entry.summary?.rawStartDateTime;
    if (!raw) return null;
    const studio = studioId ? studioById[studioId] : undefined;
    if (!studio) return null;

    const timeZone = isValidTimeZone(studio.timezone)
      ? studio.timezone
      : DEFAULT_TIME_ZONE;
    const instant = wallClockToInstant(raw, timeZone);
    if (!instant) return null;

    try {
      return instant.toLocaleString("en-US", {
        timeZone,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      });
    } catch {
      return null;
    }
  };

  const handleRelease = async (entry: LimboEntry) => {
    const studioId = selectedStudio[entry.id!];
    const studio = studioId ? studioById[studioId] : undefined;
    if (!studio) return;

    setBusyId(entry.id!);
    setError(null);
    try {
      if (entry.kind === "booking") {
        const result = await releaseLimboBooking(entry, studio, clients);
        setDone((d) => ({
          ...d,
          [entry.id!]: `Released to ${studio.name} — ${
            result.startTimeIso
              ? new Date(result.startTimeIso).toLocaleString("en-US", {
                  timeZone: studio.timezone || "America/New_York",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "scheduled"
          }`,
        }));
      } else {
        await releaseLimboClient(entry, studio);
        setDone((d) => ({ ...d, [entry.id!]: `Home studio set to ${studio.name}` }));
      }
      setEntries((rows) => rows.filter((r) => r.id !== entry.id));
    } catch (e: any) {
      setError(e?.message || "Release failed.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (entry: LimboEntry) => {
    setBusyId(entry.id!);
    try {
      await dismissLimboEntry(entry);
      setEntries((rows) => rows.filter((r) => r.id !== entry.id));
    } catch (e: any) {
      setError(e?.message || "Could not dismiss.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-black uppercase italic tracking-tight text-slate-900 dark:text-white">
            Limbo Queue
          </h2>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 max-w-2xl mt-1">
            Mindbody events that could not be matched to a studio. They are held
            here rather than discarded — usually because a studio is missing its{" "}
            <span className="font-mono">mindbodySiteId</span> or{" "}
            <span className="font-mono">mindbodyLocationId</span> in Admin →
            Studios. Assign a studio to release them.
          </p>
        </div>
        <Button
          onClick={load}
          disabled={isLoading}
          variant="outline"
          className="rounded-xl font-black uppercase text-[11px] tracking-widest shrink-0"
        >
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-2xl border-2 border-red-500/30 bg-red-500/5 p-4 text-sm font-bold text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {Object.entries(done).map(([id, message]) => (
        <div
          key={id}
          className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 p-3 text-sm font-bold text-emerald-700 dark:text-emerald-400"
        >
          {message}
        </div>
      ))}

      {isLoading ? (
        <div className="flex items-center gap-2 p-8 justify-center text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="font-bold text-sm">Reading the queue…</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
          <p className="font-black uppercase tracking-widest text-sm text-slate-500">
            Nothing in Limbo
          </p>
          <p className="text-xs font-bold text-slate-400 mt-1">
            Every Mindbody event has found its studio.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const summary = entry.summary || {};
            const chosen = selectedStudio[entry.id!];
            const preview = previewTime(entry, chosen);
            const isBusy = busyId === entry.id;

            return (
              <div
                key={entry.id}
                className="rounded-2xl border-2 border-amber-500/30 bg-white dark:bg-surface-1 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-900 dark:text-white">
                          {summary.clientName || "Unknown Client"}
                        </span>
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500">
                          {entry.kind}
                        </span>
                        {entry.source === "pull-sync" && (
                          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-600 dark:text-sky-400">
                            Refresh Schedule
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 flex-wrap mt-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                        {summary.rawStartDateTime && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="w-3.5 h-3.5" />
                            {summary.rawStartDateTime}
                            <span className="text-slate-400 font-semibold">
                              (studio local, unconverted)
                            </span>
                          </span>
                        )}
                        {summary.staffName && (
                          <span className="inline-flex items-center gap-1">
                            <User className="w-3.5 h-3.5" />
                            {summary.staffName}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          site {entry.siteId ?? "—"}
                          {entry.locationId ? ` / location ${entry.locationId}` : ""}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-2 max-w-3xl">
                        {entry.reason}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDismiss(entry)}
                    disabled={isBusy}
                    title="Dismiss without releasing"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-end gap-2 mt-4 flex-wrap">
                  <div className="min-w-[220px]">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">
                      Assign studio
                    </label>
                    <Select
                      value={chosen || ""}
                      onValueChange={(v) =>
                        setSelectedStudio((m) => ({ ...m, [entry.id!]: v }))
                      }
                    >
                      <SelectTrigger className="h-10 rounded-xl font-bold">
                        <SelectValue placeholder="Choose a studio…" />
                      </SelectTrigger>
                      <SelectContent>
                        {studios.map((s) => (
                          <SelectItem key={s.id} value={s.id!}>
                            {s.name}
                            {s.mindbodySiteId ? ` — site ${s.mindbodySiteId}` : " — no site id"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {preview && (
                    <div className="text-xs font-bold text-slate-500 dark:text-slate-400 pb-2.5">
                      Lands at{" "}
                      <span className="text-slate-900 dark:text-white">
                        {preview}
                      </span>
                    </div>
                  )}

                  <Button
                    onClick={() => handleRelease(entry)}
                    disabled={!chosen || isBusy}
                    className="h-10 rounded-xl bg-[#F06C22] hover:bg-[#d95d18] text-white font-black uppercase text-[11px] tracking-widest ml-auto"
                  >
                    {isBusy ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    {entry.kind === "booking" ? "Release to schedule" : "Set home studio"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AdminLimboQueue;
