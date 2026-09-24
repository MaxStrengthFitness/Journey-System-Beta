import { describe, expect, it } from "vitest";
import type { ProgressReport } from "../../types";
import type { JournalEntry } from "../../types/journal";
import type { UseClientJournalResult } from "../../hooks/useClientJournal";
import { assembleThreads } from "../client-notes/threads";
import {
  PULSE_READ_LIMIT,
  codexFordStatus,
  fordCountOf,
  notesOfJournal,
  olderLifeCountOf,
  pulseFromReports,
  runningFocuses,
  sessionTotalsOf,
  storySourcesOf,
} from "./codex-data";
import { historyFromDocs } from "../subjective-report/assessment-history";
import type { FordEntry } from "../ford/types";

const TODAY = "2026-09-24";

const report = (i: number, over: Record<string, unknown> = {}): ProgressReport =>
  ({
    id: `r${i}`,
    clientId: "c1",
    status: "Finalized",
    date: `2026-0${1 + (i % 8)}-10`,
    createdAt: { seconds: 1_700_000_000 + i * 86_400 },
    subjective: { version: 2, answers: {} },
    ...over,
  }) as unknown as ProgressReport;

describe("pulseFromReports", () => {
  it("waits, and says nothing, until the reports are read for this client", () => {
    expect(pulseFromReports([], "c1", "loading")).toEqual({ status: "loading", history: null });
    expect(pulseFromReports([report(1)], "c1", "failed")).toEqual({ status: "failed", history: null });
  });

  it("reads the history from the reports the profile already holds", () => {
    const p = pulseFromReports([report(1), report(2)], "c1", "ready");
    expect(p.status).toBe("ready");
    expect(p.history?.reports.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(p.history?.complete).toBe(true);
  });

  it("keeps only finalized Pulse rounds, but judges completeness on the RAW page", () => {
    // 50 reports of mixed kinds (the listener's limit), 20 of them Pulse
    // rounds: the read did NOT reach her first report, so the history is not
    // complete — even though only 20 made it through.
    const page = Array.from({ length: PULSE_READ_LIMIT }, (_, i) =>
      i < 20 ? report(i) : report(i, { status: "Draft", subjective: undefined }),
    );
    const p = pulseFromReports(page, "c1", "ready");
    expect(p.history?.reports).toHaveLength(20);
    expect(p.history?.complete).toBe(false);
    expect(p.history?.coversSinceMs).not.toBeNull();
  });

  it("never hands one client's reports to another", () => {
    // The profile keeps the last client's list until this one's arrives.
    const stale = [report(1, { clientId: "c-previous" })];
    expect(pulseFromReports(stale, "c1", "ready")).toEqual({ status: "loading", history: null });
    expect(pulseFromReports([report(1)], null, "ready")).toEqual({ status: "loading", history: null });
  });
});

describe("codexFordStatus", () => {
  it("is off for a reader the FORD rule refuses, whatever the hook says", () => {
    expect(codexFordStatus(false, "loading")).toBe("off");
    expect(codexFordStatus(false, "ready")).toBe("off");
  });

  it("passes the hook's own state through for everyone else", () => {
    for (const s of ["loading", "ready", "failed", "denied"] as const) expect(codexFordStatus(true, s)).toBe(s);
  });
});

let seq = 0;
const entry = (over: Partial<JournalEntry>): JournalEntry => {
  seq += 1;
  return {
    id: `e${seq}`,
    clientId: "c1",
    studioId: "s1",
    kind: "coaching",
    category: "Pace",
    body: `note ${seq}`,
    importance: "standard",
    machineId: null,
    focusId: null,
    sessionId: null,
    origin: "manual",
    authorId: "uid-jane",
    authorInitials: "JC",
    authorName: "Jane Coach",
    occurredAt: new Date(2026, 8, 1, 12),
    createdAt: null,
    updatedAt: null,
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  } as JournalEntry;
};

const journalOf = (entries: JournalEntry[], loadState?: UseClientJournalResult["loadState"]) => ({
  threads: assembleThreads(entries),
  criticalEntries: entries.filter((e) => e.importance === "critical"),
  loadState,
  focuses: [],
});

describe("notesOfJournal", () => {
  const entries = [entry({ importance: "critical" }), entry({})];

  it("counts once the notes are read", () => {
    const n = notesOfJournal(journalOf(entries, { notes: "ready", focuses: "ready", sessions: "ready" }), TODAY);
    expect(n.state).toBe("ready");
    expect(n.summary?.critical).toBe(1);
    expect(n.summary?.total).toBe(2);
  });

  it("has no counts while loading, when the read failed, or when the journal does not say", () => {
    expect(notesOfJournal(journalOf(entries, { notes: "loading", focuses: "ready", sessions: "ready" }), TODAY).summary).toBeNull();
    const failed = notesOfJournal(journalOf(entries, { notes: "failed", focuses: "ready", sessions: "ready" }), TODAY);
    expect(failed.state).toBe("failed");
    expect(failed.summary).toBeNull();
    const silent = notesOfJournal(journalOf(entries, undefined), TODAY);
    expect(silent.state).toBe("loading");
    expect(silent.summary).toBeNull();
  });

  it("hands settled life notes to the FORD page: off Notes' zones and counts, a live one stays", () => {
    const ready = { notes: "ready", focuses: "ready", sessions: "ready" } as const;
    const standing = entry({ kind: "life", category: "Anniversary", body: "Anniversary is Oct 12." });
    const live = entry({ kind: "life", category: "Vacation", body: "Away in Maine", importance: "elevated" });
    const n = notesOfJournal(journalOf([...entries, standing, live], ready), TODAY);
    expect(n.record.lifeSettled.map((t) => t.id)).toEqual([standing.id]);
    expect(n.record.listed.map((t) => t.id)).not.toContain(standing.id);
    expect(n.record.listed.map((t) => t.id)).toContain(live.id);
    expect(n.summary?.total).toBe(3);
  });
});

describe("olderLifeCountOf", () => {
  const life = entry({ kind: "life", category: "Birthday", body: "Grandson's birthday is May 9." });

  it("counts the settled life notes once the journal answered", () => {
    const n = notesOfJournal(journalOf([life], { notes: "ready", focuses: "ready", sessions: "ready" }), TODAY);
    expect(olderLifeCountOf(n)).toBe(1);
  });

  it("is unknown while the journal loads, and none when it failed (the FORD page cannot show them either)", () => {
    expect(olderLifeCountOf(notesOfJournal(journalOf([life], undefined), TODAY))).toBeNull();
    expect(olderLifeCountOf(notesOfJournal(journalOf([life], { notes: "failed", focuses: "ready", sessions: "ready" }), TODAY))).toBe(0);
  });
});

describe("fordCountOf", () => {
  const life = entry({ kind: "life", category: "Birthday", body: "Grandson's birthday is May 9." });
  const fordOf = (n: number) => ({
    status: "ready" as const,
    entries: Array.from({ length: n }, () => ({ isArchived: false })),
  });

  it("is FORD's details and the older life notes together", () => {
    const n = notesOfJournal(journalOf([life], { notes: "ready", focuses: "ready", sessions: "ready" }), TODAY);
    expect(fordCountOf({ readable: true, ford: fordOf(2), client: null }, n)).toBe(3);
  });

  it("is unknown, never 0, when the journal failed and FORD holds nothing", () => {
    const failed = notesOfJournal(journalOf([life], { notes: "failed", focuses: "ready", sessions: "ready" }), TODAY);
    expect(fordCountOf({ readable: true, ford: fordOf(0), client: null }, failed)).toBeNull();
    // FORD's own details are still true when the older notes are unknown.
    expect(fordCountOf({ readable: true, ford: fordOf(2), client: null }, failed)).toBe(2);
  });

  it("is unknown while the journal loads", () => {
    expect(fordCountOf({ readable: true, ford: fordOf(2), client: null }, notesOfJournal(journalOf([life], undefined), TODAY))).toBeNull();
  });
});

describe("runningFocuses", () => {
  const focuses = [{ status: "active" }, { status: "active" }, { status: "passed" }] as UseClientJournalResult["focuses"];

  it("counts the active focuses once they are read", () => {
    expect(runningFocuses({ focuses, loadState: { notes: "ready", focuses: "ready", sessions: "ready" } })).toBe(2);
  });

  it("is unknown until then, never 0", () => {
    expect(runningFocuses({ focuses, loadState: { notes: "ready", focuses: "loading", sessions: "ready" } })).toBeNull();
    expect(runningFocuses({ focuses, loadState: undefined })).toBeNull();
  });
});

describe("sessionTotalsOf", () => {
  it("adds the prior record to Journey's count, as the header does", () => {
    const client = { priorHistory: { sessions: 412, importedCount: 0, source: "filemaker", through: "2026-03-01" } };
    expect(sessionTotalsOf(49, client)).toEqual({ total: 461, journey: 49, before: 412 });
  });

  it("knows no total until Journey's count answers", () => {
    expect(sessionTotalsOf(null, {})).toEqual({ total: null, journey: null, before: 0 });
  });
});

describe("storySourcesOf", () => {
  const journal = (notes: "loading" | "ready" | "failed", focuses: "loading" | "ready" | "failed", capped = false) => ({
    threads: assembleThreads([]),
    focuses: [] as UseClientJournalResult["focuses"],
    loadState: { notes, focuses, sessions: "ready" as const },
    capped,
  });
  const entries = [{ id: "f1" }] as FordEntry[];
  const history = historyFromDocs([], PULSE_READ_LIMIT);
  const base = {
    journal: journal("ready", "ready"),
    fordStatus: "ready" as const,
    fordEntries: entries,
    inbody: { scans: [], loading: false, error: null },
    pulse: { status: "ready" as const, history },
  };

  it("hands the Story every source that answered, with its data", () => {
    const s = storySourcesOf(base);
    expect(s.notes).toEqual({ status: "ready", data: [] });
    expect(s.focuses).toEqual({ status: "ready", data: [] });
    expect(s.ford).toEqual({ status: "ready", data: entries });
    expect(s.inbody).toEqual({ status: "ready", data: [] });
    expect(s.pulse).toEqual({ status: "ready", data: history });
    expect(s.capped).toBe(false);
  });

  it("names a read still loading or failed — never an empty list", () => {
    const s = storySourcesOf({
      ...base,
      journal: journal("loading", "failed", true),
      fordStatus: "failed",
      inbody: { scans: [], loading: true, error: null },
      pulse: { status: "failed", history: null },
    });
    expect(s.notes).toEqual({ status: "loading" });
    expect(s.focuses).toEqual({ status: "failed" });
    expect(s.ford).toEqual({ status: "failed" });
    expect(s.inbody).toEqual({ status: "loading" });
    expect(s.pulse).toEqual({ status: "failed" });
    expect(s.capped).toBe(true);
    expect(storySourcesOf({ ...base, inbody: { scans: [], loading: false, error: "Couldn't load InBody scans." } }).inbody).toEqual({
      status: "failed",
    });
    expect(storySourcesOf({ ...base, fordStatus: "loading" }).ford).toEqual({ status: "loading" });
    expect(storySourcesOf({ ...base, pulse: { status: "ready", history: null } }).pulse).toEqual({ status: "loading" });
    expect(storySourcesOf({ ...base, journal: { ...journal("ready", "ready"), loadState: undefined } }).notes).toEqual({
      status: "loading",
    });
  });

  it("is off, not failed, for FORD a reader may not open", () => {
    expect(storySourcesOf({ ...base, fordStatus: "off" }).ford).toEqual({ status: "off" });
    expect(storySourcesOf({ ...base, fordStatus: "denied" }).ford).toEqual({ status: "off" });
  });
});
