import { describe, expect, it } from "vitest";
import {
  ABSENT,
  CONFIRM_NOTE,
  EMPTY_INPUT,
  OPTIONAL_GROUPS,
  PARTS,
  blockingOpenSessions,
  cutoverStudiosOf,
  isJourneyLastSessionDate,
  looksTyped,
  sameFordCounts,
  withoutLiveSessions,
  millisOf,
  parseAlso,
  partLine,
  planReset,
  rollupHoldsSessions,
  valueAt,
  type DocIn,
  type GroupId,
  type ResetInput,
  type ResetOptions,
  type ResetPlan,
} from "./test-reset";

const NOW = Date.parse("2026-10-10T16:00:00Z");
const DAY = 86_400_000;

const doc = (path: string, data: Record<string, unknown> = {}): DocIn => ({ path, data });
const input = (parts: Partial<ResetInput>): ResetInput => ({ ...EMPTY_INPUT, ...parts });
const opts = (groups: GroupId[] = [], extra: Partial<ResetOptions> = {}): ResetOptions => ({
  groups: new Set<GroupId>(["core", ...groups]),
  includeDemo: false,
  beforeMs: NOW,
  nowMs: NOW,
  ...extra,
});
const deleted = (plan: ResetPlan) => plan.deletes.map((d) => d.path).sort();
const changedFields = (plan: ResetPlan, path: string) =>
  plan.fieldSteps.filter((s) => s.path === path).flatMap((s) => s.changes.map((c) => c.field.join(".")));
const countOf = (plan: ResetPlan, part: string) => plan.counts.find((c) => c.part.id === part)!;

/** Applies a plan to its input: what the database holds after the run. */
function apply(before: ResetInput, plan: ResetPlan): ResetInput {
  const gone = new Set(plan.deletes.map((d) => d.path));
  const after: Record<string, DocIn[]> = {};
  for (const [key, docs] of Object.entries(before)) {
    after[key] = (docs as DocIn[])
      .filter((d) => !gone.has(d.path))
      .map((d) => {
        const steps = plan.fieldSteps.filter((s) => s.path === d.path);
        if (steps.length === 0) return d;
        const data = structuredClone(d.data);
        for (const step of steps) {
          for (const c of step.changes) {
            let at: Record<string, unknown> = data;
            for (const seg of c.field.slice(0, -1)) at = (at[seg] ??= {}) as Record<string, unknown>;
            const last = c.field[c.field.length - 1];
            if (c.after === ABSENT) delete at[last];
            else at[last] = c.after;
          }
        }
        return { path: d.path, data };
      });
  }
  return after as unknown as ResetInput;
}

describe("parseAlso", () => {
  it("always takes core, adds the groups named, and names the words that aren't one", () => {
    const r = parseAlso("routines, pulse,nonsense");
    expect([...r.groups].sort()).toEqual(["core", "pulse", "routines"]);
    expect(r.unknown).toEqual(["nonsense"]);
  });
  it("settings-all supersedes settings", () => {
    const r = parseAlso("settings,settings-all");
    expect(r.groups.has("settings")).toBe(false);
    expect(r.groups.has("settings-all")).toBe(true);
    expect(r.note).toMatch(/settings-all/);
  });
  it("every optional group has parts", () => {
    for (const g of OPTIONAL_GROUPS) expect(PARTS.some((p) => p.group === g)).toBe(true);
  });
});

describe("sessions and sets", () => {
  const sessions = [
    doc("sessions/s1", { clientId: "c1", hostedAtStudioId: "westlake", status: "Completed", createdAt: NOW - 10 * DAY, rollupCounted: true }),
    doc("sessions/open", { isUnassigned: true, hostedAtStudioId: "westlake", status: "In-Progress", createdAt: NOW - 20 * DAY }),
    doc("sessions/d1", { clientId: "demo-c", hostedAtStudioId: "demo-studio", status: "Completed", isDemo: true }),
    doc("sessions/chart", { clientId: "c1", trainerInitials: "Chart", status: "Completed", date: "2019-03-01" }),
  ];
  const base = input({
    sessions,
    sessionChildren: [doc("sessions/s1/logs/a"), doc("sessions/d1/logs/b")],
    exerciseLogs: [
      doc("exerciseLogs/l1", { sessionId: "s1", clientId: "c1" }),
      doc("exerciseLogs/orphan", { sessionId: "gone", clientId: "c1" }),
      doc("exerciseLogs/ld", { sessionId: "d1" }),
      doc("exerciseLogs/lc", { sessionId: "chart", clientId: "c1" }),
    ],
    clients: [doc("clients/c1", { homeStudioId: "westlake" }), doc("clients/demo-c", { homeStudioId: "demo-studio" })],
  });

  it("deletes every session, open ones included, and their sets, and leaves Demo Mode and imported charts", () => {
    const plan = planReset(base, opts());
    expect(deleted(plan)).toEqual(["exerciseLogs/l1", "exerciseLogs/orphan", "sessions/open", "sessions/s1", "sessions/s1/logs/a"]);
    expect(countOf(plan, "sessions").demoDocs).toBe(1);
    expect(countOf(plan, "imported-sessions").docs).toBe(1);
    expect(countOf(plan, "imported-sessions").included).toBe(false);
    expect(countOf(plan, "exercise-logs").demoDocs).toBe(1);
    expect(plan.countedSessionsDeleted).toBe(1);
  });

  it("takes the imported charts when asked, and Demo Mode with --include-demo", () => {
    const plan = planReset(base, opts(["imported-history"], { includeDemo: true }));
    expect(deleted(plan)).toContain("sessions/chart");
    expect(deleted(plan)).toContain("exerciseLogs/lc");
    expect(deleted(plan)).toContain("sessions/d1");
    expect(deleted(plan)).toContain("sessions/d1/logs/b");
    expect(deleted(plan)).toContain("exerciseLogs/ld");
  });

  it("never deletes a client, a trainer, a studio, a booking or a machine", () => {
    const plan = planReset(base, opts([...OPTIONAL_GROUPS], { includeDemo: true }));
    for (const p of deleted(plan)) {
      expect(p).not.toMatch(/^(clients|trainers|studios|schedules|machines|routinePresets|networks)\/[^/]+$/);
    }
  });

  it("never deletes on a retry a session that shows life now, whatever the first read said", () => {
    // Read the first time: open, quiet for two days. Read again after its delete was refused: an iPad's heartbeat just now.
    const first = input({ sessions: [doc("sessions/open", { status: "In-Progress", createdAt: NOW - 2 * DAY }), doc("sessions/done", { status: "Completed" })] });
    const firstPlan = planReset(first, opts());
    expect(deleted(firstPlan)).toEqual(["sessions/done", "sessions/open"]);
    const again = planReset(
      input({ sessions: [doc("sessions/open", { status: "In-Progress", createdAt: NOW - 2 * DAY, lastHeartbeatAt: NOW - 60_000 }), doc("sessions/done", { status: "Completed" })] }),
      opts([], { includeDemo: true }),
    );
    const { deletes, live } = withoutLiveSessions(again, again.deletes);
    expect(deletes.map((d) => d.path)).toEqual(["sessions/done"]);
    expect(live.map((s) => s.path)).toEqual(["sessions/open"]);
    // A live Demo Mode session is held back too.
    const demo = planReset(input({ sessions: [doc("sessions/d", { status: "In-Progress", hostedAtStudioId: "demo-studio", lastHeartbeatAt: NOW - 1000 })] }), opts([], { includeDemo: true }));
    expect(withoutLiveSessions(demo, demo.deletes).deletes).toEqual([]);
  });

  it("says which open sessions block a commit: a sign of life in the last 12 hours, outside Demo Mode", () => {
    const live = input({
      sessions: [
        doc("sessions/now", { status: "In-Progress", lastHeartbeatAt: NOW - 3600_000 }),
        doc("sessions/old", { status: "In-Progress", createdAt: NOW - 2 * DAY }),
        doc("sessions/demo", { status: "In-Progress", hostedAtStudioId: "demo-studio", createdAt: NOW - 60_000 }),
      ],
    });
    const plan = planReset(live, opts());
    expect(blockingOpenSessions(plan, false).map((s) => s.path)).toEqual(["sessions/now"]);
    expect(blockingOpenSessions(plan, true).map((s) => s.path).sort()).toEqual(["sessions/demo", "sessions/now"]);
  });
});

describe("notes", () => {
  const base = input({
    sessions: [doc("sessions/s1", { clientId: "c1", status: "Completed" }), doc("sessions/d1", { clientId: "dc", hostedAtStudioId: "demo-studio" })],
    clients: [doc("clients/c1", { homeStudioId: "westlake" }), doc("clients/dc", { homeStudioId: "demo-studio" })],
    journalEntries: [
      doc("journalEntries/inSession", { clientId: "c1", sessionId: "s1", origin: "in_session" }),
      doc("journalEntries/orphan", { clientId: "c1", sessionId: "discarded", origin: "post_session" }),
      doc("journalEntries/menuNoId", { clientId: "c1", sessionId: null, origin: "in_session" }),
      doc("journalEntries/profile", { clientId: "c1", sessionId: null, origin: "manual" }),
      doc("journalEntries/u1", { clientId: "c1", sessionId: null, origin: "profile", threadId: "inSession" }),
      doc("journalEntries/u2", { clientId: "c1", sessionId: null, origin: "manual", threadId: "u1" }),
      doc("journalEntries/onProfileRoot", { clientId: "c1", sessionId: "s1", origin: "in_session", threadId: "profile" }),
      doc("journalEntries/keptUpdate", { clientId: "c1", sessionId: null, origin: "manual", threadId: "profile" }),
      doc("journalEntries/demoNote", { clientId: "dc", sessionId: "d1", origin: "in_session" }),
      doc("journalEntries/demoUpdate", { clientId: "dc", origin: "manual", threadId: "demoNote" }),
    ],
    sessionNotes: [
      doc("sessionNotes/n1", { sessionId: "s1" }),
      doc("sessionNotes/nd", { sessionId: "d1" }),
      // No session on it: the client's notes show it as a manual profile note.
      doc("sessionNotes/manual", { clientId: "c1", content: "x" }),
    ],
  });

  it("takes notes of a session going or already gone, session-time notes, and every update below them", () => {
    const plan = planReset(base, opts());
    const gone = deleted(plan).filter((p) => p.startsWith("journalEntries/"));
    expect(gone).toEqual([
      "journalEntries/inSession",
      "journalEntries/menuNoId",
      "journalEntries/onProfileRoot",
      "journalEntries/orphan",
      "journalEntries/u1",
      "journalEntries/u2",
    ]);
    // A deleted update never takes its root, and the root's other updates stay.
    expect(gone).not.toContain("journalEntries/profile");
    expect(gone).not.toContain("journalEntries/keptUpdate");
    // Demo Mode's note and its update are left, and counted.
    expect(countOf(plan, "journal-session").demoDocs).toBe(1);
    expect(countOf(plan, "journal-thread-updates").demoDocs).toBe(1);
    expect(deleted(plan)).toContain("sessionNotes/n1");
    expect(deleted(plan)).not.toContain("sessionNotes/nd");
    expect(deleted(plan)).not.toContain("sessionNotes/manual");
  });

  it("takes the Seen marks and the reminders of what goes, and leaves the rest to the operations group", () => {
    const withMarks = input({
      ...base,
      acknowledgements: [
        doc("studios/westlake/acknowledgements/note:inSession"),
        doc("studios/westlake/acknowledgements/note:team:menuNoId"),
        doc("studios/westlake/acknowledgements/note:profile"),
        doc("studios/westlake/acknowledgements/pain:c1:2026-10-01"),
        doc("studios/westlake/acknowledgements/incident:i9"),
      ],
      noteDismissals: [doc("noteDismissals/uid1", { threads: { inSession: 1, profile: 2 } })],
    });
    const plan = planReset(withMarks, opts());
    expect(deleted(plan).filter((p) => p.includes("acknowledgements"))).toEqual([
      "studios/westlake/acknowledgements/note:inSession",
      "studios/westlake/acknowledgements/note:team:menuNoId",
      "studios/westlake/acknowledgements/pain:c1:2026-10-01",
    ]);
    expect(countOf(plan, "acks-other").docs).toBe(2);
    expect(changedFields(plan, "noteDismissals/uid1")).toEqual(["threads.inSession"]);
  });
});

describe("FORD", () => {
  const ford = [
    doc("clients/c1/ford/a", { studioId: "westlake", origin: "in_session", sessionId: "s1", pillar: "family", body: "x", isArchived: false }),
    doc("clients/c1/ford/b", { studioId: "westlake", origin: "briefing", sessionId: null, pillar: "recreation", body: "y", isArchived: false }),
    doc("clients/c1/ford/c", { studioId: "westlake", origin: "profile", sessionId: null, pillar: "dreams", body: "z", isArchived: false }),
    doc("clients/c1/ford/one-line", { studioId: "westlake", origin: "profile", sessionId: null, isArchived: true, body: "w" }),
  ];
  const base = input({
    sessions: [doc("sessions/s1", { clientId: "c1" })],
    clients: [doc("clients/c1", { homeStudioId: "westlake", fordSummary: { counts: { family: 1, recreation: 1, dreams: 1, occupation: 0 } } })],
    ford,
  });

  it("takes session details, keeps the briefing's unless asked, and works the summary out again from what is left", () => {
    const plan = planReset(base, opts());
    expect(deleted(plan)).toEqual(["clients/c1/ford/a", "sessions/s1"]);
    const step = plan.fieldSteps.find((s) => s.path === "clients/c1")!;
    const summary = step.changes.find((c) => c.field[0] === "fordSummary")!.after as { counts: Record<string, number> };
    expect(summary.counts).toEqual({ family: 0, occupation: 0, recreation: 1, dreams: 1 });

    const withBriefing = planReset(base, opts(["ford-briefing"]));
    expect(deleted(withBriefing)).toContain("clients/c1/ford/b");
    const s2 = withBriefing.fieldSteps.find((s) => s.path === "clients/c1")!;
    expect((s2.changes.find((c) => c.field[0] === "fordSummary")!.after as { counts: Record<string, number> }).counts.recreation).toBe(0);
  });
});

describe("client fields", () => {
  const sessions = [doc("sessions/s1", { clientId: "c1", createdAt: Date.parse("2026-06-01T15:00:00Z") })];
  const client = (id: string, data: Record<string, unknown>) => doc(`clients/${id}`, { homeStudioId: "westlake", ...data });

  it("puts the counters a Finish moves back to a new client's, and touches nothing else", () => {
    const plan = planReset(
      input({
        sessions,
        clients: [
          client("c1", {
            completedSessions: 4,
            sessionCount: 4,
            lifetimeReps: 300,
            trainerTally: { t1: 4 },
            topTrainerId: "t1",
            renewal: { situation: "x", cycleKey: "k", lastVisitDate: "2026-10-01", primaryTrainerId: "t1" },
            currentMachineMetrics: { m: {} },
            firstName: "kept",
            mindbodyContracts: { a: 1 },
          }),
        ],
      }),
      opts(),
    );
    expect(changedFields(plan, "clients/c1").sort()).toEqual(
      [
        "completedSessions",
        "currentMachineMetrics",
        "lifetimeReps",
        "renewal.lastVisitDate",
        "renewal.primaryTrainerId",
        "sessionCount",
        "topTrainerId",
        "trainerTally",
      ].sort(),
    );
    const after = Object.fromEntries(plan.fieldSteps[0].changes.map((c) => [c.field.join("."), c.after]));
    // What Add Client and every Mindbody door write; the rest a new client doesn't have.
    expect(after.completedSessions).toBe(0);
    expect(after.sessionCount).toBe(0);
    expect(after.lifetimeReps).toBe(ABSENT);
    expect(after.trainerTally).toBe(ABSENT);
  });

  it("leaves the count a prior record that stays gives, and 0 when the record goes with the run", () => {
    const base = input({
      sessions: [...sessions, doc("sessions/s2", { clientId: "c2" })],
      clients: [
        client("c1", { completedSessions: 4, sessionCount: 304, priorHistory: { source: "filemaker", sessions: 300, through: "2026-05-31" } }),
        client("c2", { completedSessions: 2, sessionCount: 302, priorHistory: { source: "paper", sessions: 300, importedCount: 0, through: "2026-05-31" } }),
      ],
    });
    const keep = planReset(base, opts());
    const countOf1 = (p: ResetPlan, path: string) => p.fieldSteps.find((s) => s.path === path)!.changes.find((c) => c.field[0] === "sessionCount")!.after;
    expect(countOf1(keep, "clients/c1")).toBe(300);
    const drop = planReset(base, opts(["prior-history"]));
    expect(countOf1(drop, "clients/c2")).toBe(0);
  });

  it("leaves a client the sessions never touched: the intake's 0s, a count that is all prior history, the snapshot", () => {
    const plan = planReset(
      input({
        sessions,
        clients: [
          client("intake", { completedSessions: 0, sessionCount: 0, trainerTally: {}, topTrainerId: null, renewal: { lastVisitDate: "2026-03-01" } }),
          client("priorOnly", { sessionCount: 300, renewal: { lastVisitDate: "2026-03-01" } }),
          client("c1", { completedSessions: 0, sessionCount: 1, renewal: { lastVisitDate: "2026-10-01" } }),
        ],
        // Opening Programming writes an empty totals document for anyone: it doesn't make a client touched.
        machineTotals: [doc("clients/intake/machineTotals/current", { machineStats: {}, machineStatsBackfilledAt: 1 })],
      }),
      opts(),
    );
    expect(changedFields(plan, "clients/intake")).toEqual([]);
    expect(deleted(plan)).toContain("clients/intake/machineTotals/current");
    expect(changedFields(plan, "clients/priorOnly")).toEqual([]);
    // c1 had a session going: the count back to 0 (the 0 already there stays as it is), and the snapshot's last visit.
    expect(changedFields(plan, "clients/c1").sort()).toEqual(["renewal.lastVisitDate", "sessionCount"]);
  });

  it("clears Journey's last session day and keeps Mindbody's (it carries a time)", () => {
    expect(isJourneyLastSessionDate("2026-09-30")).toBe(true);
    expect(isJourneyLastSessionDate("2026-09-30T10:00:00")).toBe(false);
    const plan = planReset(
      input({ clients: [client("a", { lastSessionDate: "2026-09-30" }), client("b", { lastSessionDate: "2026-09-30T10:00:00" })] }),
      opts(),
    );
    expect(changedFields(plan, "clients/a")).toEqual(["lastSessionDate"]);
    expect(changedFields(plan, "clients/b")).toEqual([]);
    expect(plan.leftAlone.some((l) => /Mindbody/.test(l.label) && l.count === 1)).toBe(true);
  });

  it("clears a first-session date Start wrote, and keeps one from before the sessions or typed on the old form", () => {
    // Start's serverTimestamp carries the server's fraction of a second; the old form wrote an Eastern midnight.
    const ts = (iso: string, nanoseconds: number) => ({ seconds: Date.parse(iso) / 1000, nanoseconds });
    const plan = planReset(
      input({
        sessions,
        clients: [
          client("new", { firstSessionDate: ts("2026-07-01T15:00:07Z", 482_000_000) }),
          client("old", { firstSessionDate: ts("2014-03-02T05:00:00Z", 0) }),
          // Typed after Journey began, on the retired form: midnight in Ohio (EDT, UTC-4), no fraction.
          client("typed", { firstSessionDate: ts("2026-07-14T04:00:00Z", 0) }),
        ],
      }),
      opts(),
    );
    expect(looksTyped(ts("2026-07-14T04:00:00Z", 0))).toBe(true);
    expect(looksTyped(ts("2026-07-14T04:00:00Z", 1000))).toBe(false);
    expect(looksTyped(ts("2026-07-14T05:00:00Z", 0))).toBe(false);
    expect(changedFields(plan, "clients/new")).toEqual(["firstSessionDate"]);
    expect(plan.firstSessionClearIds).toEqual(["new"]);
    expect(changedFields(plan, "clients/old")).toEqual([]);
    expect(changedFields(plan, "clients/typed")).toEqual([]);
    expect(plan.leftAlone.find((l) => /First session/.test(l.label))?.count).toBe(2);
  });

  it("clears a first visit only where it was backfilled from Journey's sessions and still has their date", () => {
    const inEra = Date.parse("2026-07-01T15:00:00Z");
    const plan = planReset(
      input({
        sessions,
        clients: [
          client("a", { firstAppointmentDate: inEra, firstAppointmentDateSource: "backfill:firstSessionDate" }),
          client("b", { firstAppointmentDate: inEra, firstAppointmentDateSource: "backfill:earliest-session" }),
          // The webhook wrote Mindbody's real date over the backfill and left the source.
          client("webhook", { firstAppointmentDate: Date.parse("2014-03-01T12:00:00Z"), firstAppointmentDateSource: "backfill:earliest-session" }),
          client("c", { firstAppointmentDate: inEra, firstAppointmentDateSource: "backfill:earliest-contract" }),
          client("d", { firstAppointmentDate: inEra }),
        ],
      }),
      opts(),
    );
    expect(changedFields(plan, "clients/a").sort()).toEqual(["firstAppointmentDate", "firstAppointmentDateSource"]);
    expect(changedFields(plan, "clients/b").sort()).toEqual(["firstAppointmentDate", "firstAppointmentDateSource"]);
    expect(changedFields(plan, "clients/webhook")).toEqual([]);
    expect(changedFields(plan, "clients/c")).toEqual([]);
    expect(changedFields(plan, "clients/d")).toEqual([]);
  });

  it("reads when the sessions began from an earlier run when none is left", () => {
    const base = input({ clients: [client("a", { firstSessionDate: Date.parse("2026-07-01T15:00:07Z") })] });
    expect(changedFields(planReset(base, opts()), "clients/a")).toEqual([]);
    expect(changedFields(planReset(base, opts([], { eraStartMs: Date.parse("2026-06-01T15:00:00Z") })), "clients/a")).toEqual(["firstSessionDate"]);
  });

  it("undoes a prospect's consultation and leaves everyone else's mark", () => {
    const plan = planReset(
      input({
        clients: [
          client("prospect", { requiresConsultation: true, consultationCompleted: true }),
          client("existing", { requiresConsultation: false, consultationCompleted: true }),
        ],
      }),
      opts(),
    );
    expect(changedFields(plan, "clients/prospect")).toEqual(["consultationCompleted"]);
    expect(changedFields(plan, "clients/existing")).toEqual([]);
  });

  it("takes a Confirm the test sessions are in, keeps one made before any, and a typed record only with prior-history", () => {
    const confirm = (through: string, recordedIso: string) => ({ source: "mindbody", sessions: 300, note: CONFIRM_NOTE, through, recordedAt: Date.parse(recordedIso) });
    const base = input({
      sessions: [...sessions, doc("sessions/s3", { clientId: "touched" })],
      clients: [
        // Confirmed the day after her first (test) session: Mindbody's count less it.
        client("afterTest", { priorHistory: confirm("2026-07-01", "2026-07-03T15:00:00Z") }),
        // A client the sessions touched, confirmed after one.
        client("touched", { completedSessions: 1, priorHistory: confirm("2026-05-01", "2026-07-03T15:00:00Z") }),
        // Confirmed before any Journey session: "through" is the day it was recorded, nothing was taken off.
        client("beforeAny", { completedSessions: 1, priorHistory: confirm("2026-07-03", "2026-07-03T15:00:00Z") }),
        // Confirmed long before the test sessions began.
        client("old", { priorHistory: confirm("2026-03-01", "2026-03-05T15:00:00Z") }),
        client("typedMindbody", { priorHistory: { source: "mindbody", sessions: 312 } }),
        client("typed", { priorHistory: { source: "filemaker", sessions: 300 }, firstStudioDay: "2014-01-01" }),
      ],
    });
    const core = planReset(base, opts());
    expect(changedFields(core, "clients/afterTest")).toEqual(["priorHistory"]);
    expect(changedFields(core, "clients/touched")).toContain("priorHistory");
    expect(changedFields(core, "clients/beforeAny")).not.toContain("priorHistory");
    expect(changedFields(core, "clients/old")).toEqual([]);
    expect(changedFields(core, "clients/typedMindbody")).toEqual([]);
    expect(changedFields(core, "clients/typed")).toEqual([]);
    const all = planReset(base, opts(["prior-history"]));
    expect(changedFields(all, "clients/typed").sort()).toEqual(["firstStudioDay", "priorHistory"]);
    expect(changedFields(all, "clients/typedMindbody")).toEqual(["priorHistory"]);
    // The Confirm made before any session isn't a typed record: prior-history leaves it too.
    expect(changedFields(all, "clients/beforeAny")).not.toContain("priorHistory");
  });

  it("puts the count back to 0 when a cleared Confirm leaves a client the sessions no longer touch", () => {
    // Her test session was discarded long ago; the reconciler had folded the Confirm's 312 into her count.
    const plan = planReset(
      input({
        sessions,
        clients: [
          client("discarded", {
            sessionCount: 312,
            priorHistory: { source: "mindbody", sessions: 312, note: CONFIRM_NOTE, through: "2026-07-01", recordedAt: Date.parse("2026-07-03T15:00:00Z") },
          }),
        ],
      }),
      opts(),
    );
    const step = plan.fieldSteps.find((s) => s.path === "clients/discarded")!;
    expect(step.changes.map((c) => [c.field.join("."), c.before, c.after])).toEqual([
      ["priorHistory", expect.objectContaining({ sessions: 312 }), ABSENT],
      ["sessionCount", 312, 0],
    ]);
    expect(step.changes.every((c) => c.part === "client-prior-confirmed")).toBe(true);
  });

  it("turns the B switch off only for clients whose routines go, and only with the routines group", () => {
    const base = input({
      clients: [client("withRoutine", { isRoutineBActive: true }), client("none", { isRoutineBActive: true })],
      routines: [doc("routines/r1", { clientId: "withRoutine", type: "A" })],
      routineChildren: [doc("routines/r1/planChanges/p1")],
    });
    expect(changedFields(planReset(base, opts()), "clients/withRoutine")).toEqual([]);
    const plan = planReset(base, opts(["routines"]));
    expect(changedFields(plan, "clients/withRoutine")).toEqual(["isRoutineBActive"]);
    expect(changedFields(plan, "clients/none")).toEqual([]);
    expect(deleted(plan)).toEqual(["routines/r1", "routines/r1/planChanges/p1"]);
  });

  it("merges every change to one client into one step", () => {
    const plan = planReset(input({ clients: [client("c", { sessionCount: 2, renewal: {}, subjectiveSnapshot: {} })] }), opts(["pulse"]));
    expect(plan.fieldSteps.filter((s) => s.path === "clients/c")).toHaveLength(1);
  });
});

describe("trainers and the jobs' output", () => {
  it("clears the old counts map first and deletes the counts last, keeping an all-zero one", () => {
    const plan = planReset(
      input({
        trainers: [doc("trainers/t1", { rollups: { sessionsCoached: 9 } }), doc("trainers/t2", {})],
        trainerStats: [
          doc("trainers/t1/stats/rollups", { sessionsCoached: 9, lastSessionAt: 1 }),
          doc("trainers/t2/stats/rollups", { sessionsCoached30d: 0, windowsUpdatedAt: 1 }),
        ],
      }),
      opts(),
    );
    expect(plan.fieldSteps.find((s) => s.path === "trainers/t1")?.phase).toBe("early");
    expect(plan.deletes.find((d) => d.path === "trainers/t1/stats/rollups")?.phase).toBe("late");
    expect(deleted(plan)).not.toContain("trainers/t2/stats/rollups");
    expect(rollupHoldsSessions({ sessionsCoached: 0 })).toBe(false);
  });

  it("deletes the nightly job's client states, Journey summary, All stars and month tallies, and leaves Openings and the performance watch", () => {
    const plan = planReset(
      input({
        clientStates: [doc("studios/westlake/clientStates/c1"), doc("studios/demo-studio/clientStates/dc")],
        watch: [
          doc("studios/westlake/watch/journey"),
          doc("studios/westlake/watch/hubMarks"),
          doc("studios/westlake/watch/hours-2026-09", { trainers: [{ key: "t1", weeks: { "2026-09-07": 3 } }], unattributed: 0, open: 0 }),
          doc("studios/westlake/watch/sessions-2026-09", { rows: ["x"], count: 1 }),
          // The job's own empty month (every studio, zeros and all) stays.
          doc("studios/westlake/watch/hours-2026-10", { trainers: [], lateIds: [], unattributed: 0, open: 0 }),
          doc("studios/westlake/watch/sessions-2026-10", { rows: [], count: 0, trainers: [], clients: [], machines: [], lateIds: [] }),
          doc("studios/westlake/watch/openings"),
          doc("studios/westlake/watch/performance"),
        ],
        leaderboards: [doc("leaderboards/x")],
      }),
      opts(),
    );
    expect(deleted(plan)).toEqual([
      "leaderboards/x",
      "studios/westlake/clientStates/c1",
      "studios/westlake/watch/hours-2026-09",
      "studios/westlake/watch/hubMarks",
      "studios/westlake/watch/journey",
      "studios/westlake/watch/sessions-2026-09",
    ]);
    expect(countOf(plan, "job-client-states").demoDocs).toBe(1);
  });
});

describe("the optional groups", () => {
  it("settings: the weights, or the set-ups whole; an open session's ghost set-up always goes", () => {
    const base = input({
      clientMachineSettings: [
        doc("clientMachineSettings/c1_m1", { clientId: "c1", settings: { seat: "3" }, currentWeight: 80, startingWeight: 60, nextWeight: { by: "x" } }),
        doc("clientMachineSettings/_m1", { clientId: "", settings: { seat: "2" } }),
      ],
    });
    expect(deleted(planReset(base, opts()))).toEqual(["clientMachineSettings/_m1"]);
    const weights = planReset(base, opts(["settings"]));
    expect(changedFields(weights, "clientMachineSettings/c1_m1").sort()).toEqual(["currentWeight", "nextWeight", "startingWeight"]);
    const whole = planReset(base, opts(["settings-all"]));
    expect(deleted(whole)).toEqual(["clientMachineSettings/_m1", "clientMachineSettings/c1_m1"]);
    expect(whole.fieldSteps).toEqual([]);
  });

  it("setting-history and floor-notes take only what was written before --before, and a floor note's updates with it", () => {
    const cut = Date.parse("2026-10-01T00:00:00Z");
    const plan = planReset(
      input({
        settingHistory: [
          doc("machines/m1/settingHistory/old", { timestamp: "2026-09-01T10:00:00Z" }),
          doc("machines/m1/settingHistory/new", { timestamp: "2026-10-05T10:00:00Z" }),
          doc("machines/m1/settingHistory/undated", {}),
        ],
        floorNotes: [
          doc("studios/w/floorNotes/root", { createdAt: Date.parse("2026-09-01T00:00:00Z") }),
          doc("studios/w/floorNotes/upd", { createdAt: Date.parse("2026-10-05T00:00:00Z"), threadId: "root" }),
          doc("studios/w/floorNotes/fresh", { createdAt: Date.parse("2026-10-05T00:00:00Z") }),
        ],
      }),
      opts(["setting-history", "floor-notes"], { beforeMs: cut }),
    );
    expect(deleted(plan)).toEqual(["machines/m1/settingHistory/old", "studios/w/floorNotes/root", "studios/w/floorNotes/upd"]);
    expect(plan.leftAlone.some((l) => /Setting change records with no time/.test(l.label))).toBe(true);
  });

  it("pulse and operations take whole collections, Demo Mode left out", () => {
    const plan = planReset(
      input({
        clients: [doc("clients/dc", { homeStudioId: "demo-studio" })],
        progressReports: [doc("progressReports/p", { clientId: "c1" }), doc("progressReports/pd", { clientId: "dc" })],
        clientFocuses: [doc("clientFocuses/f", { clientId: "c1" })],
        trainerFocuses: [doc("trainerFocuses/t", { clientId: "c1" })],
        watchlist: [doc("studios/w/watchlist/c1")],
        cases: [doc("studios/w/cases/c1")],
        dayLogs: [doc("studios/w/dayLogs/u_2026-10-01")],
        renewalTouches: [doc("studios/w/renewals/k/touches/t")],
      }),
      opts(["pulse", "operations"]),
    );
    expect(deleted(plan)).toEqual([
      "clientFocuses/f",
      "progressReports/p",
      "studios/w/cases/c1",
      "studios/w/dayLogs/u_2026-10-01",
      "studios/w/renewals/k/touches/t",
      "studios/w/watchlist/c1",
      "trainerFocuses/t",
    ]);
    expect(countOf(plan, "progress-reports").demoDocs).toBe(1);
  });
});

describe("what a commit has to name", () => {
  it("counts the documents it writes, and names the studios past a cutover", () => {
    const plan = planReset(
      input({
        sessions: [doc("sessions/s1", { clientId: "c1" })],
        clients: [doc("clients/c1", { homeStudioId: "w", completedSessions: 1, sessionCount: 1 })],
        studios: [
          doc("studios/westlake", { journeyCutoverDate: "2026-11-02" }),
          doc("studios/solon", {}),
          doc("studios/demo-studio", { journeyCutoverDate: "2026-01-01", isDemo: true }),
        ],
      }),
      opts(),
    );
    // One session deleted, one client changed.
    expect(plan.plannedDocuments).toBe(2);
    expect(plan.cutoverStudios).toEqual([{ id: "westlake", day: "2026-11-02" }]);
    expect(cutoverStudiosOf([doc("studios/solon", { journeyCutoverDate: null })])).toEqual([]);
  });

  it("works a stale FORD summary out again even when no detail goes this run", () => {
    const left = [doc("clients/c1/ford/a", { studioId: "w", origin: "profile", pillar: "dreams", body: "z", isArchived: false })];
    const stale = { counts: { family: 1, occupation: 0, recreation: 0, dreams: 1 }, untagged: 0, pinned: {}, openOpportunities: 0, nextDate: null, updatedAt: "x" };
    const fresh = { ...stale, counts: { family: 0, occupation: 0, recreation: 0, dreams: 1 }, updatedAt: "y" };
    const plan = planReset(input({ clients: [doc("clients/c1", { homeStudioId: "w", fordSummary: stale })], ford: left }), opts());
    expect(changedFields(plan, "clients/c1")).toEqual(["fordSummary"]);
    const same = planReset(input({ clients: [doc("clients/c1", { homeStudioId: "w", fordSummary: fresh })], ford: left }), opts());
    expect(changedFields(same, "clients/c1")).toEqual([]);
    expect(sameFordCounts(fresh, { ...fresh, updatedAt: "z", nextDate: null } as never)).toBe(true);
  });
});

describe("a second run", () => {
  it("finds nothing left to take", () => {
    const groups: GroupId[] = ["imported-history", "ford-briefing", "settings-all", "setting-history", "routines", "pulse", "floor-notes", "prior-history", "operations"];
    const before = input({
      sessions: [doc("sessions/s1", { clientId: "c1", createdAt: NOW - 5 * DAY, rollupCounted: true }), doc("sessions/c", { trainerInitials: "Legacy" })],
      exerciseLogs: [doc("exerciseLogs/l", { sessionId: "s1" })],
      journalEntries: [doc("journalEntries/j", { sessionId: "s1", origin: "in_session" }), doc("journalEntries/u", { threadId: "j" })],
      clients: [
        doc("clients/c1", {
          homeStudioId: "w",
          sessionCount: 3,
          lastSessionDate: "2026-10-01",
          firstSessionDate: NOW - 5 * DAY,
          renewal: {},
          isRoutineBActive: true,
          priorHistory: { source: "mindbody" },
          subjectiveSnapshot: {},
        }),
      ],
      ford: [doc("clients/c1/ford/a", { origin: "in_session", sessionId: "s1", studioId: "w", isArchived: false, body: "x" })],
      machineTotals: [doc("clients/c1/machineTotals/current", { machineStats: {} })],
      trainers: [doc("trainers/t", { rollups: { sessionsCoached: 1 } })],
      trainerStats: [doc("trainers/t/stats/rollups", { sessionsCoached: 1 })],
      routines: [doc("routines/r", { clientId: "c1" })],
      clientMachineSettings: [doc("clientMachineSettings/c1_m", { clientId: "c1", currentWeight: 50 })],
      acknowledgements: [doc("studios/w/acknowledgements/note:j")],
      noteDismissals: [doc("noteDismissals/u", { threads: { j: 1 } })],
      watch: [doc("studios/w/watch/journey")],
    });
    const first = planReset(before, opts(groups, { includeDemo: true }));
    expect(first.deletes.length).toBeGreaterThan(0);
    const after = apply(before, first);
    const second = planReset(after, opts(groups, { includeDemo: true }));
    expect(second.deletes).toEqual([]);
    expect(second.fieldSteps).toEqual([]);
  });
});

describe("helpers", () => {
  it("reads times in every shape the database holds", () => {
    expect(millisOf({ toMillis: () => 5 })).toBe(5);
    expect(millisOf({ seconds: 2, nanoseconds: 5_000_000 })).toBe(2005);
    expect(millisOf("2026-10-01")).toBe(Date.parse("2026-10-01T12:00:00Z"));
    expect(millisOf("not a time")).toBeNull();
    expect(millisOf(null)).toBeNull();
  });
  it("finds a value by its field path", () => {
    expect(valueAt({ a: { b: 1 } }, ["a", "b"])).toBe(1);
    expect(valueAt({ a: { b: 1 } }, ["a", "c"])).toBe(ABSENT);
    expect(valueAt({ a: 1 }, ["a", "b"])).toBe(ABSENT);
  });
  it("words a part with counts only", () => {
    const plan = planReset(input({ sessions: [doc("sessions/a"), doc("sessions/b", { hostedAtStudioId: "demo-studio" })] }), opts());
    expect(partLine(countOf(plan, "sessions"), "plan")).toBe("Sessions (open, unfinished and finished): would delete 1 document; 1 more in Demo Mode, left out");
    const two = planReset(input({ sessions: [doc("sessions/a", { isDemo: true }), doc("sessions/b", { hostedAtStudioId: "demo-studio" })] }), opts());
    expect(partLine(countOf(two, "sessions"), "plan")).toBe("Sessions (open, unfinished and finished): none here; 2 more in Demo Mode, left out");
  });
});
