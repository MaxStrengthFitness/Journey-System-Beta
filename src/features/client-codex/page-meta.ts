/**
 * THE SUB-TOGGLE'S LINES — what each of the seven segments says under its
 * name ("3 open · 1 critical", "2 watch-outs", "home studio only").
 *
 * Client codex, Sep 2026. A segment is found by position, and its small line
 * says whether it is worth the tap. Each page AREA owns its own line (Notes'
 * is `notesTabMeta`, in record-selectors.ts); this file only puts them
 * together and adds the states the shell knows about:
 *
 *   loading          "loading"         — the read has not answered yet
 *   failed           "couldn't load"   — unknown, never "none yet"
 *   FORD refused     "home studio only" — a cross-train reader; FORD is the
 *                                        home studio's to read, so no count
 *
 * FORD's line is the FORD area's own (`fordSubnavLine`, phase 10): the
 * soonest date within a month ("birthday in 17 days"), else what waits to be
 * filed, else how much is on file. The lines for Body & Pulse, Goals & Focus
 * and Account are INTERIM (the shell phase): each area replaces its own with
 * the line its page writes. Story says nothing yet: "since 2019" is a claim
 * about the whole story, and the Story page is where it is worked out
 * honestly for a client who trained here long before Journey.
 *
 * Rules: short (the bar wraps at portrait widths, so a long line grows it);
 * words and counts, never a score, a percentage or a traffic light; FORD's
 * line is never coloured by a pillar.
 *
 * Pure: page-meta.test.ts.
 */
import type { Client } from "../../types";
import type { SubnavItem } from "../client-profile/ProfileSubnav";
import { RECORD_PAGES, type RecordPage } from "../client-profile/profile-nav";
import type { JournalLoad } from "../../hooks/useClientJournal";
import { notesTabMeta, type NotesSummary } from "../client-notes/record-selectors";
import { selectedFlags } from "../clinical-flags/flag-search";
import { fordSubnavLine } from "../ford/page-model";
import type { ComingUpRow } from "../ford/coming-up";
import { plural } from "./kit/text";
import type { CodexFordStatus } from "./codex-data";

export interface PageMetaInput {
  client: Pick<Client, "clinicalFlags" | "smartGoal" | "renewal">;
  notes: { state: JournalLoad; summary: NotesSummary | null };
  /** Running focuses, and whether the focuses were read. */
  focuses: { state: JournalLoad; running: number | null };
  /**
   * FORD: its read state, and how many things it holds — `fordCountOf`,
   * which is the client document's counts while FORD loads (no read) and
   * null when it cannot be known — plus, once FORD has answered, what is
   * coming up (`comingUp`) and how many captures wait to be filed.
   */
  ford: {
    status: CodexFordStatus;
    count: number | null;
    comingUp?: readonly ComingUpRow[];
    untagged?: number;
  };
}

const LOADING = "loading";
const FAILED = "couldn't load";

function notesItem(input: PageMetaInput): Pick<SubnavItem<RecordPage>, "meta" | "flag" | "flagTone"> {
  const { state, summary } = input.notes;
  const { meta, flag } = notesTabMeta(summary, { isLoading: state === "loading", readFailed: state === "failed" });
  return { meta: meta ?? LOADING, flag, flagTone: "alert" };
}

function fordMeta(input: PageMetaInput): string {
  const { status, count, comingUp = [], untagged = 0 } = input.ford;
  if (status === "off" || status === "denied") return "home studio only";
  if (status === "failed") return FAILED;
  // The count is null while the older life notes are unknown: loading, or —
  // when the journal failed and FORD holds nothing — couldn't load.
  if (status === "ready") {
    return fordSubnavLine({ comingUp, untagged, count }) ?? (input.notes.state === "failed" ? FAILED : LOADING);
  }
  // Still loading: the client document's counts (no read), never "nothing".
  if (count !== null && count > 0) return plural(count, "detail");
  return LOADING;
}

function bodyItem(input: PageMetaInput): Pick<SubnavItem<RecordPage>, "meta" | "flag" | "flagTone"> {
  const flags = selectedFlags(input.client.clinicalFlags);
  if (flags.length === 0) return { meta: "none on file", flag: false };
  // Plum for a caution; crimson only when an absolute contraindication is on file.
  const alert = flags.some((f) => f.tone === "alert");
  return { meta: plural(flags.length, "watch-out"), flag: true, flagTone: alert ? "alert" : "warn" };
}

function goalsMeta(input: PageMetaInput): string {
  const { state, running } = input.focuses;
  if (state === "failed") return FAILED;
  if (state !== "ready" || running === null) return LOADING;
  if (running > 0) return `${plural(running, "focus", "focuses")} running`;
  return (input.client.smartGoal ?? "").trim() ? "a goal set" : "nothing set";
}

function accountMeta(input: PageMetaInput): string | null {
  const r = input.client.renewal;
  if (!r) return null;
  if (r.situation === "ended" || r.situation === "lapsed") return "package ended";
  // Only Mindbody's own count: an estimate is not a number to print here.
  if (typeof r.sessionsLeft === "number" && r.sessionsLeftSource === "mindbody") {
    return `${plural(r.sessionsLeft, "session")} left`;
  }
  return null;
}

/** The seven segments, in AJ's order, with their lines and dots. */
export function subnavItems(input: PageMetaInput): SubnavItem<RecordPage>[] {
  return RECORD_PAGES.map(({ id, label }): SubnavItem<RecordPage> => {
    switch (id) {
      case "overview":
        return { id, label, meta: "everything" };
      case "notes":
        return { id, label, ...notesItem(input) };
      case "ford":
        return { id, label, meta: fordMeta(input) };
      case "body":
        return { id, label, ...bodyItem(input) };
      case "goals":
        return { id, label, meta: goalsMeta(input) };
      case "story":
        return { id, label, meta: null };
      case "account":
        return { id, label, meta: accountMeta(input) };
    }
  });
}
