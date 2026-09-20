/**
 * OPERATIONS → OVERVIEW → ATTENDANCE WATCH — the whole list.
 *
 * Operations overhaul, Sep 2026. AJ (Sep 19): clients who have gone
 * missing or slipped into a really irregular rhythm; the threshold is the
 * studio's own number ("if a client does not schedule for this many days,
 * warn me"), and leaders clear people off the list — snooze or dismiss —
 * with a returning-client alert when a dismissed client books again.
 *
 * Four lists: to look at (uncapped, with the actions), back again (Got it),
 * snoozed (until when; put back), dismissed (when, by whom; put back). The
 * number itself is set on My Studio → Studio → Renewals, where every
 * studio setting lives (Operations looks; My Studio runs).
 */
import { useState } from "react";
import { ArrowLeft, UserRoundX } from "lucide-react";
import type { Client, Studio } from "../../../types";
import { clientDisplayName } from "../../../lib/client-name";
import { AdminButton, AdminHeader, AdminNotice, AdminPanel, AdminScreen, AdminStatTile, AdminTiles } from "../primitives";
import { ActionRows, SnoozeChooser } from "../overview/pieces";
import type { AttendanceQuestion, OverviewRow } from "../overview/questions";
import type { BackAgainRow, WatchedSplit, WatchlistEntry } from "./attention";
import "../overview/overview.css";

export interface AttendanceWatchViewProps {
  studio: Studio;
  today: string;
  rows: AttendanceQuestion;
  watched: WatchedSplit<OverviewRow>;
  back: BackAgainRow[];
  watchlist: ReadonlyMap<string, WatchlistEntry>;
  clients: Client[];
  breakDays: number;
  busyKey: string | null;
  onSnooze: (clientId: string, untilDay: string) => void;
  onDismiss: (clientId: string) => void;
  onClear: (clientId: string) => void;
  onBack: () => void;
  onOpenClient?: (clientId: string) => void;
}

const pretty = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
};

export function AttendanceWatchView({ studio, today, rows, watched, back, watchlist, clients, breakDays, busyKey, onSnooze, onDismiss, onClear, onBack, onOpenClient }: AttendanceWatchViewProps) {
  const [snoozing, setSnoozing] = useState<string | null>(null);
  const nameOf = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? clientDisplayName(c, "A client") : "A client at this studio";
  };
  // The watchlist may hold clients who are no longer anomalies (they came
  // back quietly, or the snooze outlived the gap). List them from the
  // dispositions themselves so nothing is hidden.
  const snoozed = [...watchlist.values()].filter((e) => e.snoozedUntil && e.snoozedUntil > today);
  const dismissed = [...watchlist.values()].filter((e) => e.dismissedAt && !(e.snoozedUntil && e.snoozedUntil > today) && !back.some((b) => b.clientId === e.clientId));

  return (
    <AdminScreen>
      <AdminHeader
        icon={<UserRoundX className="w-5 h-5" />}
        title={`${studio.name} — Attendance watch`}
        subtitle={`Clients who have gone quiet or off their rhythm. ${studio.name}'s line is ${breakDays} days without a visit; a client with a measured pace is also flagged at twice their usual gap. Change the number on My Studio → Studio.`}
        actions={
          <AdminButton variant="quiet" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" /> Overview
          </AdminButton>
        }
      />

      <AdminTiles>
        <AdminStatTile label="To look at" value={watched.shown.length} tone={watched.shown.length > 0 ? "attention" : undefined} foot={`of ${rows.measured} with a measured pace`} />
        <AdminStatTile label="Back again" value={back.length} foot={back.length > 0 ? "booked or visited since being dismissed" : "nobody yet"} />
        <AdminStatTile label="Snoozed" value={snoozed.length} foot="come back on their day" />
        <AdminStatTile label="Dismissed" value={dismissed.length} foot="you know why they are out" />
      </AdminTiles>

      {back.length > 0 && (
        <AdminPanel title="Back again" subtitle="A dismissed client who has booked or visited since. Got it puts them back on normal watch." flush>
          <ActionRows
            rows={back.map((r) => ({
              key: `back:${r.clientId}`,
              clientId: r.clientId,
              name: r.name,
              sentence: r.sentence,
              proof: r.proof,
              badge: "Back",
              actions: (
                <AdminButton size="sm" variant="primary" busy={busyKey === `watch:${r.clientId}`} onClick={() => onClear(r.clientId)}>
                  Got it
                </AdminButton>
              ),
            }))}
            onOpenClient={onOpenClient}
            empty=""
          />
        </AdminPanel>
      )}

      <AdminPanel
        title={`To look at — ${watched.shown.length}`}
        subtitle={
          rows.total === 0
            ? rows.measured === 0
              ? "No client has a measured rhythm yet — the nightly job needs eight weeks of visits to say what is usual."
              : "Nobody is off their rhythm or past the quiet line."
            : `${rows.longBreaks} on a break longer than their rhythm or the ${breakDays}-day line, ${rows.missedBookings} with missed bookings. Longest gap first.`
        }
        flush
      >
        <ActionRows
          rows={watched.shown.map((r) => ({
            key: r.clientId,
            clientId: r.clientId,
            name: r.name,
            sentence: r.sentence,
            proof: r.proof,
            tone: r.tone,
            actions: (
              <>
                <AdminButton size="sm" busy={busyKey === `watch:${r.clientId}`} onClick={() => setSnoozing((v) => (v === r.clientId ? null : r.clientId))} aria-expanded={snoozing === r.clientId}>
                  Snooze
                </AdminButton>
                <AdminButton size="sm" variant="ghost" busy={busyKey === `watch:${r.clientId}`} onClick={() => onDismiss(r.clientId)}>
                  Dismiss
                </AdminButton>
              </>
            ),
            below:
              snoozing === r.clientId ? (
                <SnoozeChooser
                  today={today}
                  onPick={(day) => {
                    setSnoozing(null);
                    onSnooze(r.clientId, day);
                  }}
                  onCancel={() => setSnoozing(null)}
                />
              ) : undefined,
          }))}
          onOpenClient={onOpenClient}
          empty="Nobody to look at."
        />
      </AdminPanel>

      <AdminPanel title={`Snoozed — ${snoozed.length}`} subtitle="Out of the list until their day; then they come back if still quiet." flush>
        <ActionRows
          rows={snoozed.map((e) => ({
            key: `snoozed:${e.clientId}`,
            clientId: e.clientId,
            name: nameOf(e.clientId),
            sentence: `Snoozed until ${pretty(e.snoozedUntil as string)}.`,
            proof: watched.snoozed.some((r) => r.clientId === e.clientId) ? "Still quiet." : "Not on the list any more — the snooze simply has not run out.",
            actions: (
              <AdminButton size="sm" variant="ghost" busy={busyKey === `watch:${e.clientId}`} onClick={() => onClear(e.clientId)}>
                Put back on the list
              </AdminButton>
            ),
          }))}
          onOpenClient={onOpenClient}
          empty="Nobody is snoozed."
        />
      </AdminPanel>

      <AdminPanel title={`Dismissed — ${dismissed.length}`} subtitle="Taken off the list because someone knows why they are out. They come back here the moment they book or visit again." flush>
        <ActionRows
          rows={dismissed.map((e) => ({
            key: `dismissed:${e.clientId}`,
            clientId: e.clientId,
            name: nameOf(e.clientId),
            sentence: `Dismissed ${pretty(e.dismissedAt as string)}${e.dismissedByName ? ` by ${e.dismissedByName}` : ""}.`,
            proof: e.lastVisitAtDismissal ? `Last visit at the time: ${pretty(e.lastVisitAtDismissal)}.` : "No visit on record at the time.",
            actions: (
              <AdminButton size="sm" variant="ghost" busy={busyKey === `watch:${e.clientId}`} onClick={() => onClear(e.clientId)}>
                Put back on the list
              </AdminButton>
            ),
          }))}
          onOpenClient={onOpenClient}
          empty="Nobody is dismissed."
        />
      </AdminPanel>

      <AdminNotice tone="info">
        Nothing here contacts anyone. The rhythm comes from the nightly job (visits a week over eight weeks, from Mindbody bookings and Journey sessions);
        a client with no measured pace is judged on the studio's number alone, and the proof line says so.
      </AdminNotice>
    </AdminScreen>
  );
}
