/**
 * THE SESSION-SCOPE INVARIANT.
 *
 * Round: Unified Routine Builder, Sep 2026.
 *        Retargeted when the in-session modal became an inline panel.
 *
 * A trainer has full discretion over machine order and count on the day. The
 * client arrived late, so it is five machines instead of seven. The client
 * needs blood flow rather than a set to failure. Another trainer is on the
 * Leg Press, so the Pulldown moves up. All of that is normal coaching, and
 * none of it is a decision about the client's programme.
 *
 * So: a mid-session change is temporary and must never write back to the
 * client's routine. Permanent routine changes are made on the client profile
 * and nowhere else.
 *
 * One exception, on purpose (the first-session design round, Oct 8 2026):
 * Routine A's PLAN may be changed mid-session (AJ's Q6, quoted at its test
 * below), through routine-plan/store.ts alone and never awaited. Today's
 * order stays the session's own, and the Wrap-up decides what the routine
 * keeps.
 *
 * These tests read the source and assert that directly, in the same spirit as
 * journey-grid/contrast.test.ts parsing the token file. A unit test of the
 * components cannot catch this — the dangerous version still renders
 * correctly and still passes every behavioural test. What matters is which
 * functions each file is allowed to call.
 *
 * ── Why this file changed shape ──────────────────────────────────────────
 * It first asserted that the session surfaces contained NO Firestore mutator
 * at all, which worked while the in-session editor was its own modal. Folding
 * that modal into WorkoutTrackerView made the blunt assertion useless: that
 * file legitimately writes logs, sessions and clients on every set. So the
 * assertions are now about the `routines` collection specifically, and about
 * the one handler that commits a mid-session reorder.
 *
 * The test failing when the modal was deleted is the system working. It is
 * meant to fail when the shape of the thing it guards changes, so that
 * someone has to re-state the rule rather than quietly lose it.
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

/** Strip comments so prose about writes is not mistaken for a write. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** The body of a `const name = (...) => { ... }` declaration. */
function bodyOf(source: string, name: string): string {
  const at = source.indexOf(`const ${name} =`);
  if (at === -1) return "";
  const open = source.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(open, i + 1);
  }
  return "";
}

const MUTATORS = ["updateDoc", "setDoc", "addDoc", "deleteDoc", "writeBatch", "runTransaction"];

const WTV = code(read("src/components/WorkoutTrackerView.tsx"));
/*
 * The Active Session screen is being split up: pieces of WorkoutTrackerView
 * move into src/features/tracker/ (the three dialogs did, in the beta-prep
 * trim, Sep 17 2026). The two whole-screen rules below - no `permanentSave`,
 * no rewriting a saved routine - are about the SESSION PATH, not one file, so
 * they scan that folder too. A piece moved there must not escape them.
 */
const TRACKER_PIECES = readdirSync(resolve(root, "src/features/tracker"))
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
  .map((f) => code(read(`src/features/tracker/${f}`)))
  .join("\n");
const SESSION_PATH = WTV + "\n" + TRACKER_PIECES;
const BRIEFING = code(read("src/features/briefing/BriefingScreen.tsx"));

describe("the shared builder never persists anything", () => {
  // Whichever surface mounts it, the builder is controlled: ids in, ids out.
  // The moment it learns to save, every surface it serves saves with it.
  const files = [
    "RoutineBuilder.tsx",
    "SequenceMachineRow.tsx",
    "MachinePicker.tsx",
    "SwapSheet.tsx",
    "RotationPanel.tsx",
    "SuggestionRail.tsx",
    "CoverageStrip.tsx",
    "ViolationCard.tsx",
    "RoutineFigure.tsx",
  ];
  for (const file of files) {
    it(`${file} contains no Firestore write`, () => {
      const src = code(read(`src/features/routine-builder/${file}`));
      const found = MUTATORS.filter((m) => new RegExp(`\\b${m}\\s*\\(`).test(src));
      expect(found, `${file} must stay controlled — ids in, ids out`).toEqual([]);
    });
  }
});

describe("the pre-session briefing hands its sequence upward", () => {
  it("contains no Firestore write at all", () => {
    const found = MUTATORS.filter((m) => new RegExp(`\\b${m}\\s*\\(`).test(BRIEFING));
    expect(found).toEqual([]);
  });

  /* The briefing's "Today's routine" for a client with no routine lives in
     routine-plan (the first-session design round, Oct 8 2026, §4.5), in a
     folder whose neighbours DO write (store.ts, usePlanActions.ts). The
     briefing stays write-free only if its card does too: it hands the plan
     up, and the tracker writes it in the Start batch. */
  for (const file of [
    "src/features/routine-plan/ui/BriefingPlanCard.tsx",
    "src/features/routine-plan/ui/useBriefingPlan.ts",
    "src/features/routine-plan/briefing-plan.ts",
  ]) {
    it(`${file} (the briefing's plan card) contains no Firestore write`, () => {
      const src = code(read(file));
      const found = MUTATORS.filter((m) => new RegExp(`\\b${m}\\s*\\(`).test(src));
      expect(found).toEqual([]);
      // Nor does it reach the plan's writers.
      expect(src).not.toMatch(/from\s+["'][./]*(?:store|usePlanActions|starting-store)["']/);
    });
  }

  it("starting a session has no way to persist a routine", () => {
    // startNewSession used to take a `permanentSave` flag that rewrote the
    // client's saved routine as a side effect of starting a session. No
    // caller ever set it, which is what made it dangerous: a dead branch
    // enabling exactly the forbidden thing, one argument away from firing.
    expect(
      /permanentSave/.test(SESSION_PATH),
      "permanentSave is gone on purpose — do not reintroduce a way to save a " +
        "routine from the session path",
    ).toBe(false);
  });
});

describe("mid-session changes stay in session state", () => {
  it("the reorder handler records against the session, not the routine", () => {
    // This used to assert "no Firestore write at all", which was right while
    // mid-session order was purely local. It is now RECORDED — the session
    // document keeps the sequence actually performed — so the rule is about
    // which collection, not whether there is a write.
    const body = bodyOf(WTV, "applySessionMachineIds");
    expect(body, "applySessionMachineIds not found").not.toBe("");
    expect(body).toMatch(/setActiveMachineIds/);
    expect(body).toMatch(/sessionMachineIds/);
    expect(body).toMatch(/["']sessions["']/);
    expect(
      /["']routines["']/.test(body),
      "a mid-session reorder must never write to the routine — the client's " +
        "prescription is edited on their profile",
    ).toBe(false);
  });

  it("adding a machine mid-session goes through the same recorder", () => {
    const at = WTV.indexOf("onAddMachine:");
    expect(at, "onAddMachine not found").toBeGreaterThan(-1);
    const handler = WTV.slice(at, at + 400);
    expect(handler).toMatch(/applySessionMachineIds/);
    expect(/["']routines["']/.test(handler)).toBe(false);
  });

  it("the session's machine list is seeded once, not re-derived", () => {
    // The regression this guards is subtle and was live in production: an
    // effect that re-seeded activeMachineIds from the routine on every
    // [currentSession, routines, machines] change. Since writing a log
    // updates lastHeartbeatAt on the session, entering a weight produced a
    // new currentSession reference and silently reverted the trainer's
    // mid-session edits.
    expect(WTV).toMatch(/seededMachinesForSession/);
    const at = WTV.indexOf("seededMachinesForSession.current === sessionId");
    expect(at, "the once-per-session latch is gone").toBeGreaterThan(-1);
  });

  it("the session screen never updates or replaces a routine document", () => {
    // Rewriting an existing routine from here is not allowed. (Making one
    // was, through the briefing's Create_A / Create_B path, until the
    // first-session design round, Oct 8 2026: see the next test.)
    const writes = [
      ...SESSION_PATH.matchAll(/\b(updateDoc|setDoc|deleteDoc)\s*\(\s*doc\([^)]*?["']routines["']/g),
    ];
    expect(
      writes.map((m) => m[0]),
      "the live session must not rewrite a saved routine",
    ).toEqual([]);
  });

  // Changed on purpose (the first-session design round, Oct 8 2026, §4.8).
  // Start used to save the list the briefing built under a "Today only"
  // label as the client's Routine A or B (the Create_A / Create_B path).
  // The consult is not Routine A (AJ, Oct 8 2026: "this also counts with
  // the consult visit, sometimes the consult machines will not be the same
  // as their a routine"), so today's list is the session's alone. The one
  // routine Start makes is Routine A from a starting plan, for a client
  // starting out, EMPTY with the plan on it, written by the plan's own
  // writer (routine-plan/store.ts) in the Start batch. AJ, Oct 7 2026: "Any
  // trainer who trains the client can definitely change the plan ... You
  // should be able to change that and make the call as a trainer because
  // you're training them that day."
  it("Start never saves today's list as a routine: the only routine it makes is Routine A from a starting plan", () => {
    expect(
      /doc\(\s*collection\(\s*db\s*,\s*["']routines["']\s*\)\s*\)/.test(SESSION_PATH),
      "the session path names no new routine of its own; a starting plan's Routine A is made by routine-plan/store.ts",
    ).toBe(false);
    expect(WTV).toMatch(/addStartPlanToBatch\(db, batch,/);
    const START_PLAN = code(read("src/features/session-record/start-plan.ts"));
    expect(START_PLAN, "the create-from-today's-list kind is gone").not.toMatch(/kind:\s*["']create["']/);
  });

  // Changed on purpose (the first-session design round, Oct 8 2026, §4.6).
  // This file held that nothing on the session path writes a routine. AJ,
  // Oct 7 2026 (Q6): "Any trainer who trains the client can definitely
  // change the plan ... Again, you shouldn't really be blocked. Like if I
  // start a session with a client and I already think that, oh, hey, I think
  // they would be a lot better on this machine instead. You should be able
  // to change that and make the call as a trainer because you're training
  // them that day." And: "it's nice to be able to communicate like, hey, I'm
  // changing this plan because of this reason" (the reason asked, never
  // required). So the session may write Routine A's PLAN (a swap, a can't
  // do, a re-plan, the Academy column), and Routine A's machines with it
  // when the plan's change moves them, through routine-plan/store.ts's
  // `savePlanChange` alone, in one batch, issued and never awaited. It still
  // never writes a routine any other way: adding a machine is today only.
  it("the session writes Routine A's PLAN through routine-plan/store.ts alone, never awaited, and nothing else of a routine", () => {
    const HOOK = code(read("src/features/routine-plan/ui/useSessionPlan.ts"));
    expect(WTV, "the session's plan reads and writes go through one hook").toMatch(/useSessionPlan\(\{/);
    expect(WTV, "the tracker reaches the plan's writer only through the hook").not.toMatch(/savePlanChange|startPlan\(|saveRoutineEdit/);
    expect(HOOK).toMatch(/import \{ savePlanChange \} from "\.\.\/store";/);
    expect(MUTATORS.filter((m) => new RegExp(`\\b${m}\\s*\\(`).test(HOOK)), "the hook writes through store.ts only").toEqual([]);
    expect(HOOK, "a tap never waits on the plan's write").not.toMatch(/await\s+(?:commit|savePlanChange)|savePlanChange\([^)]*\)\s*\.then/);
    expect(HOOK).toMatch(/commit\.catch\(refused\)/);

    // The plan's sheet and the column's sheet write nothing: they hand each change up.
    for (const file of [
      "src/features/routine-plan/ui/SessionPlanSheet.tsx",
      "src/features/routine-plan/ui/StartingRangeSheet.tsx",
      "src/features/routine-plan/ui/SessionOrderLine.tsx",
      "src/features/routine-plan/session-plan.ts",
    ]) {
      const src = code(read(file));
      expect(MUTATORS.filter((m) => new RegExp(`\\b${m}\\s*\\(`).test(src)), file).toEqual([]);
      expect(src, file).not.toMatch(/from\s+["'][./]*(?:store|usePlanActions|starting-store)["']/);
    }

    // "Next in the plan · Add" is today's order only, through the one recorder.
    const at = WTV.indexOf("planAddRef.current = ");
    expect(at, "the plan's Add is gone").toBeGreaterThan(-1);
    const add = WTV.slice(at, at + 300);
    expect(add).toMatch(/applySessionMachineIds/);
    expect(/["']routines["']/.test(add)).toBe(false);
  });

  it("the builder's \"Today only\" is true on the briefing and in a session", () => {
    // The label used to sit over a list Start then saved as Routine A.
    const TYPES = read("src/features/routine-builder/types.ts");
    const scopes = [...TYPES.matchAll(/scope:\s*\{\s*label:\s*"Today only",\s*permanent:\s*false\s*\}/g)];
    expect(scopes).toHaveLength(2);
    expect(TYPES).not.toMatch(/the\s+briefing may create a routine/);
  });
});

describe("the client profile is the only place a routine is rewritten", () => {
  const DRAWER = code(read("src/components/EditRoutineDrawer.tsx"));

  it("EditRoutineDrawer writes routines and logs an adjustment", () => {
    expect(DRAWER).toMatch(/routineAdjustments/);
    expect(DRAWER).toMatch(/\b(updateDoc|addDoc)\s*\(/);
  });

  // Changed on purpose (the first-session design round, Oct 8 2026). This
  // held that every rewrite was GATED on a reason of three characters or
  // more. AJ, Oct 7 2026: "Any trainer who trains the client can definitely
  // change the plan ... You should be able to change that and make the call
  // as a trainer because you're training them that day." And: "it's nice to
  // be able to communicate like, hey, I'm changing this plan because of this
  // reason". So the reason is ASKED, NEVER REQUIRED: the drawer still asks
  // and keeps what was typed beside the change, and Apply works without it.
  it("every routine rewrite asks for a reason and never requires one", () => {
    expect(DRAWER, "the reason gate is gone on purpose").not.toMatch(/reason\.trim\(\)\.length\s*[<>]=?\s*\d/);
    expect(DRAWER).toMatch(/Why\? It helps the next trainer\. Optional\./);
    // What was typed still rides on the change, when there is any.
    expect(DRAWER).toMatch(/\.\.\.\(why \? \{ notes: why \} : \{\}\)/);
  });

  it("a drawer save on a routine with a plan writes the matching plan change in the same batch", () => {
    // The drawer keeps the plan (the design round, section 4.3): the
    // routine, its adjustment and the plan change, one batch, written by the
    // plan's own writer (routine-plan/store.ts `saveRoutineEdit`, whose
    // store.test.ts holds the one batch), never a batch of the drawer's own.
    expect(DRAWER).toMatch(/planChangeFromEdit\(/);
    expect(DRAWER).toMatch(/saveRoutineEdit\(db,/);
    expect(DRAWER, "the plan is written through store.ts, not here").not.toMatch(/writeBatch|PLAN_CHANGES/);
  });
});
