/**
 * FROM THE TEAM'S NOTES — what a leader can't afford to miss, on
 * Operations → Today (notes round, Oct 3 2026).
 *
 * AJ's hand-off: Health and Incident "are separate categories but both must
 * notify leadership — the at-risk things a leader can't afford to miss";
 * and, in his own words that day, studio leaders should have "the full story
 * and full picture and almost feel like they are the ones taking the
 * clients". Retention joined them on his answer 1A: the team's retention
 * conversations are notes the whole team reads, and a leader most of all.
 *
 * So every Health, Incident and Retention note a trainer writes reaches the
 * studio's leaders here, whatever its loudness — the category routes it, not
 * the volume. Nothing is sent to anyone (nothing contacts anyone): it is a
 * row a leader finds when they open Today.
 *
 * THE RULES
 *   • A thread's ROOT, written in the last TEAM_NOTES_WINDOW_DAYS, not closed
 *     and not archived. An update hangs off its root and is read there.
 *   • Not a Critical note: those are already the pain row's ("Critical
 *     note: …"), and one note is never two rows.
 *   • SEEN is the existing acknowledgement (studios/{s}/acknowledgements,
 *     key `note:team:{id}` — attention.ts), which lives beside the studio,
 *     never on the client's record. Its own key, not the Critical row's
 *     `note:{id}`: a note a leader has Seen and a trainer later raises to
 *     Critical comes up again, as Critical. It takes the row off this list and nothing
 *     else: the note stays on her record and on the next trainers' briefing,
 *     because a knee is not healed because a leader read about it.
 *
 * Pure: no React, no Firebase. The read is useOverviewReads' `teamNotes`.
 */
import type { Client } from "../../../types";
import type { JournalEntry } from "../../../types/journal";
import { clientDisplayName } from "../../../lib/client-name";
import { firstSentences } from "../../../lib/first-sentences";
import { studioDateKey, toDate } from "../../../lib/studio-time";
import { addDays } from "../../client-history/model";
import { bodyMarksLine } from "../../client-notes/body-parts";
import { isForLeaders, noteCardLabel, noteCategoryOf } from "../../client-notes/note-catalog";
import { ackKey } from "../attention/attention";
import type { PainRow } from "./questions";

/** How far back the list looks: a leader away for a week still finds last week's. */
export const TEAM_NOTES_WINDOW_DAYS = 14;
/** How many rows Today draws; the rest are counted, and every one is on the client's Notes. */
export const TEAM_NOTES_ROWS_SHOWN = 8;

/** The journal kinds whose notes reach the leaders (Health is stored as `injury`). */
export const TEAM_NOTE_KINDS = ["injury", "incident", "retention"] as const;

export interface TeamNoteRow extends PainRow {
  /** The thread's root, so the row can open it. */
  entryId: string;
  /** When it was written, for the order: newest first. */
  writtenMs: number;
}

export interface TeamNotesQuestion {
  rows: TeamNoteRow[];
  total: number;
}

const writtenOf = (e: Pick<JournalEntry, "createdAt" | "occurredAt">): Date | null =>
  toDate(e.createdAt as Parameters<typeof toDate>[0]) ?? toDate(e.occurredAt as Parameters<typeof toDate>[0]);

const firstName = (full: string | null | undefined) => (full ?? "").trim().split(/\s+/)[0] || "Someone";

export function teamNotesQuestion(input: {
  entries: readonly JournalEntry[];
  clients: readonly Client[];
  today: string;
  tz?: string;
}): TeamNotesQuestion {
  const { today, tz } = input;
  const since = addDays(today, -TEAM_NOTES_WINDOW_DAYS);
  const names = new Map(input.clients.filter((c) => c.id).map((c) => [c.id as string, clientDisplayName(c, "A client")]));
  const rows: TeamNoteRow[] = [];
  for (const e of input.entries) {
    if (!e.id || !e.clientId || e.threadId || e.isArchived || e.resolvedAt || e.isLegacy) continue;
    if (e.importance === "critical") continue;
    if (!isForLeaders(noteCategoryOf(e))) continue;
    const written = writtenOf(e);
    const day = written ? studioDateKey(written, tz) : null;
    if (!written || !day || day < since || day > today) continue;
    const label = noteCardLabel(e);
    const body = firstSentences(e.body, 140) || (e.body ?? "").trim();
    const where = bodyMarksLine(e.bodyParts);
    const loud = e.importance === "elevated" ? "A Heads up: the next trainers hear it at her next four sessions." : "Filed at Note: on her record, not her briefing.";
    rows.push({
      clientId: e.clientId,
      name: names.get(e.clientId) ?? "A client at this studio",
      sentence: `${label} from ${firstName(e.authorName)}, ${day === today ? "today" : day}: ${body}`,
      proof: [where ? `${where}.` : null, loud, "Seen takes it off this list; the note stays on her record."]
        .filter(Boolean)
        .join(" "),
      tone: noteCategoryOf(e) === "incident" ? "alert" : "warn",
      badge: noteCategoryOf(e) === "retention" ? "Retention" : noteCategoryOf(e) === "incident" ? "Incident" : "Health",
      ackKeys: [ackKey("note", `team:${e.id}`)],
      entryId: e.id,
      writtenMs: written.getTime(),
    });
  }
  rows.sort((a, b) => b.writtenMs - a.writtenMs);
  return { rows, total: rows.length };
}
