/**
 * WHAT THE TRACKED JOB LOOKS LIKE NOW — the Board's live word for the
 * header's Tracking chip (tracked.ts). Relay room, Sep 28 2026.
 *
 * A tracked job is named by the Board's item id (next-up.ts):
 *
 *   group:{templateId}:{shift}   a shift chore: its machines done of all of them
 *   row:{rowId}                  one client task
 *   ask:{requestId}              an ask on the board
 *   job:{jobId}                  a team job: its parts done of all of them
 *
 * The answer is its title and count, or `null` once it is no longer open
 * work (every machine ticked, the ask closed, the job finished, or gone from
 * today's list), which tells the chip to let go.
 *
 * Only ever asked with data that has LOADED. A list still loading, or one
 * that failed, would read as "gone" and drop a job the trainer is still on;
 * the caller holds back until every read has answered (a failed read is
 * unknown, never empty).
 *
 * Pure: no React, no Firestore.
 */
import type { TaskRequest } from "../../studio-tasks/requests";
import type { TaskRow } from "../../studio-tasks/types";
import { jobProgress } from "../jobs/jobs";
import type { TeamJob } from "../jobs/types";
import type { TrackedItem } from "./tracked";

export function trackedLive(
  id: string,
  data: { rows: readonly TaskRow[]; jobs: readonly TeamJob[]; requests: readonly TaskRequest[] },
): Omit<TrackedItem, "id"> | null {
  const [kind, ...rest] = id.split(":");
  const key = rest.join(":");
  if (!key) return null;

  if (kind === "group") {
    // "{templateId}:{shift}": the shift is the last segment, the template id is the rest.
    const cut = key.lastIndexOf(":");
    if (cut <= 0) return null;
    const templateId = key.slice(0, cut);
    const shift = key.slice(cut + 1);
    const rows = data.rows.filter((r) => r.kind !== "client" && r.templateId === templateId && r.shift === shift);
    if (rows.length === 0) return null;
    const done = rows.filter((r) => r.status !== "open").length;
    if (done === rows.length) return null;
    return { title: rows[0].title, done, total: rows.length };
  }

  if (kind === "row") {
    const row = data.rows.find((r) => r.id === key);
    if (!row || row.status !== "open") return null;
    return { title: row.title, done: null, total: null };
  }

  if (kind === "ask") {
    const r = data.requests.find((x) => x.id === key);
    if (!r || r.status !== "open") return null;
    return { title: r.title, done: null, total: null };
  }

  if (kind === "job") {
    const j = data.jobs.find((x) => x.id === key);
    if (!j || j.status !== "open") return null;
    const p = jobProgress(j);
    return Object.keys(j.parts).length > 0 ? { title: j.title, done: p.done, total: p.total } : { title: j.title, done: null, total: null };
  }

  return null;
}
