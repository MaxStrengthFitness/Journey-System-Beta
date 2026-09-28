/**
 * THE ACTIVITY RECORD AS A LIST — a quiet row per change: when, who, the
 * sentence, and what changed from what. Used by Machinery → Activity (the
 * company) and a studio's own Activity tab.
 *
 * Quiet on purpose (AJ, q8: "I don't want there to be five markings on the
 * document"): no badges and no colour on a row, only words; the record is
 * somewhere you go to read, and nothing is ever marked on the thing changed.
 * A read that failed says so with Try again, never "nothing recorded".
 */
import { RefreshCw } from "lucide-react";
import type { Studio } from "../../../types";
import { formatStudioDate, formatStudioTime } from "../../../lib/studio-time";
import { AdminButton, AdminEmpty, AdminNotice } from "../../admin/primitives";
import { changeLine, kindWords, type ActivityEntry } from "./activity";
import type { ActivityRead } from "./useActivity";
import "../admins.css";

/** "Mon, Sep 28 · 9:14 AM" in the studio's day; "Just now" while the server's time is on its way. */
export function entryWhen(at: number | null): string {
  if (at == null) return "Just now";
  return `${formatStudioDate(at, { weekday: "short", month: "short", day: "numeric", year: "numeric" })} · ${formatStudioTime(at)}`;
}

/** The sentence after the name: "Ada Admin changed Solon's phone." A leading capital stays when the word is an acronym. */
export function afterName(what: string): string {
  if (what.length > 1 && /[a-z]/.test(what[1])) return what[0].toLowerCase() + what.slice(1);
  return what;
}

function Row({ entry, studioName }: { entry: ActivityEntry; studioName: string | null }) {
  const change = changeLine(entry.before, entry.after);
  return (
    <li className="hq-log__row">
      <time className="hq-log__when" dateTime={entry.at != null ? new Date(entry.at).toISOString() : undefined}>
        {entryWhen(entry.at)}
      </time>
      <div className="hq-log__body">
        <p className="hq-log__what">
          <b>{entry.by.name}</b> {afterName(entry.what)}
        </p>
        {change ? <p className="hq-log__change">{change}</p> : null}
        <p className="hq-log__ctx">
          {kindWords(entry.kind)}
          {studioName ? ` · ${studioName}` : ""}
        </p>
      </div>
    </li>
  );
}

export function ActivityList({
  read,
  studios,
  showStudio,
  empty,
  onRetry,
  label,
}: {
  read: ActivityRead;
  studios: readonly Studio[];
  /** Name the studio on each row (the company-wide list). */
  showStudio?: boolean;
  /** What "nothing yet" means here. */
  empty: string;
  onRetry: () => void;
  label: string;
}) {
  if (read.state === "loading") {
    return (
      <p className="hq-log__status" role="status">
        Reading the record…
      </p>
    );
  }
  if (read.state === "failed") {
    return (
      <div className="hq-log__status">
        <AdminNotice tone="warn">
          <span className="flex flex-wrap items-center gap-3">
            <span>Couldn&apos;t read the Activity record just now, so there may be entries it isn&apos;t showing.</span>
            <AdminButton size="sm" onClick={onRetry}>
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Try again
            </AdminButton>
          </span>
        </AdminNotice>
      </div>
    );
  }
  if (read.entries.length === 0) {
    return (
      <div className="hq-log__status">
        <AdminEmpty title="Nothing recorded yet">{empty}</AdminEmpty>
      </div>
    );
  }
  const nameOf = (id: string | null) => (id ? studios.find((s) => s.id === id)?.name ?? "A studio no longer listed" : null);
  return (
    <>
      <ol className="hq-log" aria-label={label}>
        {read.entries.map((e) => (
          <Row key={e.id} entry={e} studioName={showStudio ? nameOf(e.studioId) : null} />
        ))}
      </ol>
      {read.full ? <p className="hq-log__more">The newest {read.entries.length} are shown.</p> : null}
    </>
  );
}
