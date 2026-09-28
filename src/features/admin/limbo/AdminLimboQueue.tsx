import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Inbox,
  MapPin,
  RefreshCw,
  Undo2,
  User,
  X,
} from "lucide-react";
import { Client, LimboEntry, Studio } from "../../../types";
import {
  dismissLimboEntry,
  fetchOpenLimboEntries,
  releaseLimboBooking,
  releaseLimboClient,
} from "../../../lib/mindbody-limbo";
import {
  wallClockToInstant,
  isValidTimeZone,
  DEFAULT_TIME_ZONE,
} from "../../../lib/studio-time";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminHeader,
  AdminNotice,
  AdminPanel,
  AdminScreen,
  AdminSelect,
} from "../primitives";
import { limboGroups } from "./limbo-groups";
import { reopenLimboEntry } from "./limbo-undo";

interface Props {
  key?: any;
  studios: Studio[];
  /** No longer read: whether a client exists is asked of Firestore at release
   *  time (a roster can be missing the very document a release would clobber). */
  clients?: Client[];
  /** Something was released, dismissed or put back — the dashboard recounts. */
  onChanged?: () => void;
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
 * Round 3 put this screen on the admin kit: the studio picker is the one admin
 * select rather than the second implementation of one.
 *
 * THE ADMINS ROOM (Sep 28 2026) changed three things:
 *
 *   - The events are grouped by the Mindbody site and location they came
 *     from, and each group names the studio the registry says that pair is
 *     NOW (limbo-groups.ts). That studio is chosen in each event's picker to
 *     start with, so the time it would land at shows at once; releasing is
 *     still one deliberate tap per event, and the picker can be changed.
 *   - Dismiss is done at once and offers Undo, where it used to ask first. A
 *     dismissal only stamps the event, so Undo puts it back exactly
 *     (limbo-undo.ts). A release has no Undo and keeps its preview.
 *   - A read that failed says so and offers Try again. It used to say
 *     "Nothing in Limbo" under the error, which is exactly the unknown that
 *     must never look like none.
 */
export function AdminLimboQueue({ studios, onChanged }: Props) {
  const [entries, setEntries] = useState<LimboEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedStudio, setSelectedStudio] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState<LimboEntry[]>([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadFailed(null);
    try {
      setEntries(await fetchOpenLimboEntries());
    } catch (e: any) {
      setLoadFailed(e?.message || "Limbo couldn't be read just now.");
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

  const groups = useMemo(() => limboGroups(entries, studios), [entries, studios]);

  /** The picker's choice, or the registry's suggestion until someone picks. */
  const chosenFor = (entry: LimboEntry, suggestion: Studio | null): string =>
    selectedStudio[entry.id!] ?? suggestion?.id ?? "";

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

  const handleRelease = async (entry: LimboEntry, studioId: string) => {
    const studio = studioId ? studioById[studioId] : undefined;
    if (!studio) return;

    setBusyId(entry.id!);
    setError(null);
    try {
      if (entry.kind === "booking") {
        const result = await releaseLimboBooking(entry, studio, studios);
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
        await releaseLimboClient(entry, studio, studios);
        setDone((d) => ({ ...d, [entry.id!]: `Home studio set to ${studio.name}` }));
      }
      setEntries((rows) => rows.filter((r) => r.id !== entry.id));
      onChanged?.();
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
      setDismissed((list) => [entry, ...list.filter((d) => d.id !== entry.id)]);
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || "Could not dismiss.");
    } finally {
      setBusyId(null);
    }
  };

  const handleUndo = async (entry: LimboEntry) => {
    setBusyId(entry.id!);
    setError(null);
    try {
      await reopenLimboEntry(entry.id!);
      setDismissed((list) => list.filter((d) => d.id !== entry.id));
      setEntries((rows) => (rows.some((r) => r.id === entry.id) ? rows : [entry, ...rows]));
      onChanged?.();
    } catch (e: any) {
      setError(e?.message || "Could not put it back.");
    } finally {
      setBusyId(null);
    }
  };

  const nameOf = (entry: LimboEntry) => entry.summary?.clientName || "Unknown Client";

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Inbox className="w-5 h-5" />}
        title="Limbo"
        subtitle="Mindbody events that couldn't be matched to a studio, held here rather than dropped — usually because a studio was missing its Mindbody Site ID or location (its page under Studios, or My Studio → Studio). Choose the studio to release each one."
        actions={
          <AdminButton onClick={load} busy={isLoading}>
            {!isLoading && <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </AdminButton>
        }
      />

      {error && <AdminNotice tone="alert">{error}</AdminNotice>}

      {dismissed.map((entry) => (
        <AdminNotice key={`undo-${entry.id}`} tone="info">
          <span className="flex flex-wrap items-center gap-3">
            <span>
              Dismissed {nameOf(entry)}&apos;s {entry.kind === "booking" ? "booking" : "record"}. Mindbody still has it.
            </span>
            <AdminButton size="sm" onClick={() => void handleUndo(entry)} busy={busyId === entry.id}>
              <Undo2 className="w-3.5 h-3.5" aria-hidden="true" /> Undo
            </AdminButton>
          </span>
        </AdminNotice>
      ))}

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
      ) : loadFailed ? (
        <AdminNotice tone="warn">
          <span className="flex flex-wrap items-center gap-3">
            <span>Couldn&apos;t read Limbo just now, so it may not be empty. {loadFailed}</span>
            <AdminButton size="sm" onClick={load}>
              Try again
            </AdminButton>
          </span>
        </AdminNotice>
      ) : entries.length === 0 ? (
        <AdminEmpty title="Nothing in Limbo">
          Every Mindbody event has found its studio.
        </AdminEmpty>
      ) : (
        groups.map((group) => (
          <AdminPanel key={group.key} title={group.heading} subtitle={group.note} flush>
            <div className="adm-limbo__list">
              {group.entries.map((entry) => {
                const summary = entry.summary || {};
                const chosen = chosenFor(entry, group.suggestion);
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
                          <span className="adm-limbo__name">{nameOf(entry)}</span>
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
                        onClick={() => void handleDismiss(entry)}
                        disabled={isBusy}
                        aria-label={`Dismiss ${nameOf(entry)}'s ${entry.kind} without releasing it`}
                      >
                        <X className="w-4 h-4" aria-hidden="true" />
                        Dismiss
                      </AdminButton>
                    </div>

                    <div className="adm-limbo__act">
                      <div className="adm-limbo__pick">
                        <label className="adm-label" htmlFor={pickerId}>
                          Assign studio
                        </label>
                        <AdminSelect
                          id={pickerId}
                          value={chosen}
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
                        onClick={() => void handleRelease(entry, chosen)}
                        disabled={!chosen}
                        busy={isBusy}
                        className="adm-limbo__go"
                      >
                        {entry.kind === "booking"
                          ? `Release to ${studioById[chosen]?.name ?? "the schedule"}`
                          : `Set home studio${studioById[chosen] ? `: ${studioById[chosen].name}` : ""}`}
                      </AdminButton>
                    </div>
                  </article>
                );
              })}
            </div>
          </AdminPanel>
        ))
      )}
    </AdminScreen>
  );
}
