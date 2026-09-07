import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Inbox,
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
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminHeader,
  AdminNotice,
  AdminScreen,
  AdminSelect,
  ConfirmDialog,
} from "../features/admin/primitives";

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
 *
 * Round 3 put this screen on the admin kit. Two things changed with it, both
 * house rules the kit exists to hold: the studio picker is now the one admin
 * select rather than the second implementation of one, and Dismiss routes
 * through <ConfirmDialog>. Dismiss is the only control here that throws a
 * booking away, and it used to commit on a single tap with a tooltip as its
 * only warning.
 */
export function AdminLimboQueue({ studios, clients = [] }: Props) {
  const [entries, setEntries] = useState<LimboEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStudio, setSelectedStudio] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [pendingDismiss, setPendingDismiss] = useState<LimboEntry | null>(null);

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
    setError(null);
    try {
      await dismissLimboEntry(entry);
      setEntries((rows) => rows.filter((r) => r.id !== entry.id));
    } catch (e: any) {
      setError(e?.message || "Could not dismiss.");
    } finally {
      // The dialog closes either way. A failure message rendered behind the
      // scrim is a failure nobody reads.
      setPendingDismiss(null);
      setBusyId(null);
    }
  };

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Inbox className="w-5 h-5" />}
        title="Limbo Queue"
        subtitle="Mindbody events that could not be matched to a studio. They are held here rather than discarded — usually because a studio is missing its Mindbody site or location id in Admin → Studios. Assign a studio to release them."
        actions={
          <AdminButton onClick={load} busy={isLoading}>
            {!isLoading && <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </AdminButton>
        }
      />

      {error && <AdminNotice tone="alert">{error}</AdminNotice>}

      {Object.entries(done).map(([id, message]) => (
        <AdminNotice key={id} tone="ok">
          {message}
        </AdminNotice>
      ))}

      {isLoading ? (
        <div className="adm-limbo__loading">
          {[0, 1, 2].map((i) => (
            <span key={i} className="adm-skeleton" style={{ height: 132 }} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <AdminEmpty title="Nothing in Limbo">
          Every Mindbody event has found its studio.
        </AdminEmpty>
      ) : (
        <div className="adm-limbo__list">
          {entries.map((entry) => {
            const summary = entry.summary || {};
            const chosen = selectedStudio[entry.id!];
            const preview = previewTime(entry, chosen);
            const isBusy = busyId === entry.id;
            const pickerId = `limbo-studio-${entry.id}`;

            return (
              <article key={entry.id} className="adm-limbo">
                <div className="adm-limbo__head">
                  <div className="adm-limbo__icon">
                    <AlertTriangle className="w-4 h-4" />
                  </div>

                  <div className="adm-limbo__id">
                    <div className="adm-limbo__titles">
                      <span className="adm-limbo__name">
                        {summary.clientName || "Unknown Client"}
                      </span>
                      <AdminBadge>{entry.kind}</AdminBadge>
                      {entry.source === "pull-sync" && (
                        <AdminBadge tone="live">Refresh Schedule</AdminBadge>
                      )}
                    </div>

                    <div className="adm-limbo__facts">
                      {summary.rawStartDateTime && (
                        <span className="adm-limbo__fact">
                          <CalendarClock className="w-3.5 h-3.5" />
                          {summary.rawStartDateTime}
                          <span className="adm-limbo__dim">
                            (studio local, unconverted)
                          </span>
                        </span>
                      )}
                      {summary.staffName && (
                        <span className="adm-limbo__fact">
                          <User className="w-3.5 h-3.5" />
                          {summary.staffName}
                        </span>
                      )}
                      <span className="adm-limbo__fact">
                        <MapPin className="w-3.5 h-3.5" />
                        site {entry.siteId ?? "—"}
                        {entry.locationId ? ` / location ${entry.locationId}` : ""}
                      </span>
                    </div>

                    <p className="adm-limbo__reason">{entry.reason}</p>
                  </div>

                  <AdminButton
                    variant="ghost"
                    size="sm"
                    iconOnly
                    onClick={() => setPendingDismiss(entry)}
                    disabled={isBusy}
                    title="Dismiss without releasing"
                    aria-label="Dismiss without releasing"
                  >
                    <X className="w-4 h-4" />
                  </AdminButton>
                </div>

                <div className="adm-limbo__act">
                  <div className="adm-limbo__pick">
                    <label className="adm-label" htmlFor={pickerId}>
                      Assign studio
                    </label>
                    <AdminSelect
                      id={pickerId}
                      value={chosen || ""}
                      onChange={(e) =>
                        setSelectedStudio((m) => ({
                          ...m,
                          [entry.id!]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Choose a studio…</option>
                      {studios.map((s) => (
                        <option key={s.id} value={s.id!}>
                          {s.name}
                          {s.mindbodySiteId
                            ? ` — site ${s.mindbodySiteId}`
                            : " — no site id"}
                        </option>
                      ))}
                    </AdminSelect>
                  </div>

                  {preview && (
                    <p className="adm-limbo__lands">
                      Lands at <strong>{preview}</strong>
                    </p>
                  )}

                  <AdminButton
                    variant="hero"
                    onClick={() => handleRelease(entry)}
                    disabled={!chosen}
                    busy={isBusy}
                    className="adm-limbo__go"
                  >
                    {entry.kind === "booking"
                      ? "Release to schedule"
                      : "Set home studio"}
                  </AdminButton>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pendingDismiss !== null}
        title="Dismiss this event?"
        body={
          pendingDismiss?.kind === "booking"
            ? "The booking stays in Mindbody, but this app stops asking about it. It will not appear on anybody's schedule unless the next sync parks it here again."
            : "This client keeps their Mindbody record, but this app stops asking which studio they belong to. They will have no home studio until one is set by hand."
        }
        confirmLabel="Dismiss"
        destructive
        busy={busyId !== null}
        onConfirm={() => pendingDismiss && void handleDismiss(pendingDismiss)}
        onCancel={() => setPendingDismiss(null)}
      />
    </AdminScreen>
  );
}

export default AdminLimboQueue;
