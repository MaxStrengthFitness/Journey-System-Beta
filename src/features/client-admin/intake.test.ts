import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FordEntry } from "../ford/types";
import { pronounsOf } from "../client-codex/kit/pronouns";
import {
  aliasKind,
  intakeGoalsLines,
  intakeNorm,
  matchIntake,
  nextFieldValue,
  parseIntakeNotes,
  type IntakeFord,
  type IntakeMatch,
  type IntakeView,
} from "./intake";

/**
 * THE INTAKE MATCHER (client codex, phase 17; AJ's decision 4).
 *
 * The parser splits Mindbody's account notes only where a label says to, and
 * keeps the words; the matcher says where each line belongs, what Journey
 * already has there, and the one tap on offer — and never judges whether a
 * medical line is covered by what Body holds.
 */

const MOCKUP =
  "OCC: Retired dental hygienist.\nMED: R TKA Mar 2024. BP managed w/ meds.\nACTIVITY: Pickleball 2x/wk, gardening.\nGOALS: Keep up w/ grandkids. Camino!";

const she = pronounsOf({ gender: "Female" });
const he = pronounsOf({ gender: "Male" });

const lines = (raw: string | null | undefined) => parseIntakeNotes(raw).lines;
const kinds = (raw: string) => lines(raw).map((l) => [l.kind, l.label, l.text]);

describe("parseIntakeNotes", () => {
  it("reads the mockup's block as four lines, labels as written and words verbatim", () => {
    expect(kinds(MOCKUP)).toEqual([
      ["occupation", "OCC", "Retired dental hygienist."],
      ["medical", "MED", "R TKA Mar 2024. BP managed w/ meds."],
      ["activity", "ACTIVITY", "Pickleball 2x/wk, gardening."],
      ["goals", "GOALS", "Keep up w/ grandkids. Camino!"],
    ]);
    expect(lines(MOCKUP).map((l) => l.index)).toEqual([0, 1, 2, 3]);
  });

  it("knows a label in any case, with a full stop, a space before the colon, or a dash", () => {
    for (const raw of ["occ: nurse", "Occ : nurse", "Occ.: nurse", "OCCUPATION - nurse", "Occupation — nurse", "Job – nurse"]) {
      expect(lines(raw), raw).toEqual([expect.objectContaining({ kind: "occupation", text: "nurse" })]);
    }
    expect(lines("Med Hx: asthma")[0]).toMatchObject({ kind: "medical", label: "Med Hx" });
    expect(lines("Long-term goal: walk the Camino")[0]).toMatchObject({ kind: "goals", label: "Long-term goal" });
    expect(aliasKind("Med-Hx.")).toBe("medical");
    expect(aliasKind("Pmt")).toBeNull();
  });

  it("reads a label after a list mark, and a label joining known words of one kind", () => {
    expect(kinds("- Occ: nurse\n* Med: asthma")).toEqual([
      ["occupation", "Occ", "nurse"],
      ["medical", "Med", "asthma"],
    ]);
    expect(aliasKind("Hobbies/Activities")).toBe("activity");
    expect(aliasKind("Meds & injuries")).toBe("medical");
    expect(aliasKind("Hobbies and sports")).toBe("activity");
    // Two kinds in one label: not known, so nothing is offered for it.
    expect(aliasKind("Occupation & hobbies")).toBeNull();
    expect(kinds("Occupation & hobbies: nurse, golf")).toEqual([["other", null, "Occupation & hobbies: nurse, golf"]]);
  });

  it("never makes a label of a dash after a name it does not know", () => {
    expect(lines("Tom - husband")).toEqual([
      { index: 0, kind: "other", label: null, text: "Tom - husband", truncated: false },
    ]);
  });

  it("carries a line with no label on from the one above, until a blank line", () => {
    expect(kinds("Med:\nR TKA 2024\nBP managed")).toEqual([["medical", "Med", "R TKA 2024\nBP managed"]]);
    expect(kinds("Med: R TKA 2024\n\nCall Tom about Tuesdays")).toEqual([
      ["medical", "Med", "R TKA 2024"],
      ["other", null, "Call Tom about Tuesdays"],
    ]);
    // A first line with no label has nothing to carry on from.
    expect(kinds("Referred by her sister\nOcc: nurse")).toEqual([
      ["other", null, "Referred by her sister"],
      ["occupation", "Occ", "nurse"],
    ]);
  });

  it("splits one line at KNOWN labels after a break, and nowhere else", () => {
    expect(kinds("Occ: nurse. Med: asthma; Activity: golf")).toEqual([
      ["occupation", "Occ", "nurse."],
      ["medical", "Med", "asthma"],
      ["activity", "Activity", "golf"],
    ]);
    expect(kinds("Occ: nurse | Goals: stay strong")).toEqual([
      ["occupation", "Occ", "nurse"],
      ["goals", "Goals", "stay strong"],
    ]);
    expect(kinds("Occ: nurse  Med: asthma")).toEqual([
      ["occupation", "Occ", "nurse"],
      ["medical", "Med", "asthma"],
    ]);
    // "re:" is not a label, and an unknown label never splits a line mid-way.
    expect(kinds("Note: call re: payment")).toEqual([["other", null, "Note: call re: payment"]]);
    expect(kinds("Med: knee. BP: 120/80")).toEqual([["medical", "Med", "knee. BP: 120/80"]]);
  });

  it("starts a new line at a known label straight after an empty one (a blank field of the form)", () => {
    // Read as one line, "Med: asthma" would be offered as her job title.
    expect(kinds("Occ:   Med: asthma")).toEqual([["medical", "Med", "asthma"]]);
    expect(kinds("Occ: Med: asthma")).toEqual([["medical", "Med", "asthma"]]);
    expect(kinds("Occ: Med: Activity: golf")).toEqual([["activity", "Activity", "golf"]]);
    expect(kinds("Occ:  Med: asthma. Goals: stay strong")).toEqual([
      ["medical", "Med", "asthma."],
      ["goals", "Goals", "stay strong"],
    ]);
    // An empty label with its words on the next line still carries on as before.
    expect(kinds("Occ:\nnurse")).toEqual([["occupation", "Occ", "nurse"]]);
    // A label it does not know is not followed into: the line is kept as typed.
    expect(kinds("Note: Med: asthma")).toEqual([["other", null, "Note: Med: asthma"]]);
  });

  it("keeps a line with an unknown label exactly as typed, and times and links whole", () => {
    expect(kinds("Pmt: autopay")).toEqual([["other", null, "Pmt: autopay"]]);
    // A short sentence with a colon is not cut into a label and words.
    expect(kinds("Please call re: billing")).toEqual([["other", null, "Please call re: billing"]]);
    // It still starts its own line: it is not the line above going on.
    expect(kinds("Med: asthma\nPmt: autopay")).toEqual([
      ["medical", "Med", "asthma"],
      ["other", null, "Pmt: autopay"],
    ]);
    // And a KNOWN label after a break in it still starts a line.
    expect(kinds("Pmt: autopay. Occ: nurse")).toEqual([
      ["other", null, "Pmt: autopay."],
      ["occupation", "Occ", "nurse"],
    ]);
    expect(kinds("Seen at 7:00 today")).toEqual([["other", null, "Seen at 7:00 today"]]);
    expect(kinds("See https://x.y")).toEqual([["other", null, "See https://x.y"]]);
    // A long run of words before a colon is a sentence, not a label.
    expect(kinds("Wife is Karen and she said: hello")).toEqual([["other", null, "Wife is Karen and she said: hello"]]);
  });

  it("reads HTML and entities as plain text", () => {
    expect(kinds("Occ: nurse<br>Med: none&nbsp;known")).toEqual([
      ["occupation", "Occ", "nurse"],
      ["medical", "Med", "none known"],
    ]);
    expect(kinds("<p>Goals: Tom &amp; the grandkids</p><div>Activity: golf &lt;3x a week&gt;</div>")).toEqual([
      ["goals", "Goals", "Tom & the grandkids"],
      ["activity", "Activity", "golf <3x a week>"],
    ]);
  });

  it("reads Windows line ends, and nothing from nothing", () => {
    expect(kinds("Occ: nurse\r\nMed: asthma\rActivity: golf")).toEqual([
      ["occupation", "Occ", "nurse"],
      ["medical", "Med", "asthma"],
      ["activity", "Activity", "golf"],
    ]);
    expect(parseIntakeNotes("")).toEqual({ lines: [], truncated: false });
    expect(parseIntakeNotes("  \n  ")).toEqual({ lines: [], truncated: false });
    expect(parseIntakeNotes(null)).toEqual({ lines: [], truncated: false });
    expect(parseIntakeNotes(undefined)).toEqual({ lines: [], truncated: false });
  });

  it("collapses runs of spaces and trims, and never touches the words", () => {
    expect(lines("Goals:    Keep   up w/ grandkids.   ")[0].text).toBe("Keep up w/ grandkids.");
  });

  it("says the notes may be cut off when they reach the sync's 1,000 characters", () => {
    const at = (n: number) => `Occ: nurse\nMed: ${"x".repeat(n - "Occ: nurse\nMed: ".length)}`;
    const full = parseIntakeNotes(at(1000));
    expect(at(1000)).toHaveLength(1000);
    expect(full.truncated).toBe(true);
    expect(full.lines.map((l) => l.truncated)).toEqual([false, true]);
    const short = parseIntakeNotes(at(999));
    expect(short.truncated).toBe(false);
    expect(short.lines.every((l) => !l.truncated)).toBe(true);
  });

  it("hands Goals & Focus the Goals lines, verbatim", () => {
    expect(intakeGoalsLines(parseIntakeNotes(MOCKUP))).toEqual(["Keep up w/ grandkids. Camino!"]);
  });

  it("marks a Goals line the sync may have cut short with an ellipsis, so it never reads as whole", () => {
    const raw = `Occ: nurse\nGoals: ${"walk the Camino and ".repeat(60)}`.slice(0, 1000);
    const [goals] = intakeGoalsLines(parseIntakeNotes(raw));
    expect(goals.endsWith("\u2026")).toBe(true);
    expect(goals.slice(0, -1)).toBe(parseIntakeNotes(raw).lines[1].text);
  });

  it("uses no regex lookbehind (older iPadOS Safari fails the module on one)", () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "intake.ts"), "utf8");
    expect(src).not.toMatch(/\(\?<[=!]/);
  });
});

/* ------------------------------------------------------------------ */
/* The matcher                                                         */
/* ------------------------------------------------------------------ */

const READY: IntakeFord = { status: "ready", entries: [], studioId: "westlake", canAdd: true };

const detail = (over: Partial<FordEntry>): FordEntry =>
  ({
    id: "f1",
    clientId: "c1",
    studioId: "westlake",
    pillar: "recreation",
    body: "Loves the garden",
    subject: null,
    isPinned: true,
    eventDate: null,
    recurrence: "none",
    opportunity: null,
    occurredAt: null,
    createdAt: null,
    updatedAt: null,
    authorId: "u1",
    authorName: "Jess Moreno",
    authorInitials: "JM",
    origin: "profile",
    sessionId: null,
    isArchived: false,
    ...over,
  }) as FordEntry;

function match(raw: string, view: IntakeView = {}, ford: IntakeFord = READY, p = she): IntakeMatch[] {
  return matchIntake(parseIntakeNotes(raw), view, ford, p);
}
const one = (raw: string, view?: IntakeView, ford?: IntakeFord, p = she) => match(raw, view, ford, p)[0];

describe("matchIntake — Occ goes to the job title, only while it is empty", () => {
  it("offers an empty client's job title, staged, the words verbatim", () => {
    const m = one("OCC: Retired dental hygienist.");
    expect(m).toMatchObject({
      target: "occupation",
      targetLabel: "Occupation",
      journey: "nothing",
      sentence: "No job title on her record yet.",
      action: { kind: "field", field: "occupation", mode: "set", label: "Add to Occupation", text: "Retired dental hygienist." },
      door: { page: "ford", anchor: "ford-occupation", label: "Open Occupation" },
    });
  });

  it("never replaces a job title that is there, and says what Journey has", () => {
    const m = one("Occ: nurse", { occupation: "Dental hygienist", isRetired: true });
    expect(m.journey).toBe("something");
    expect(m.sentence).toBe("Journey has: “Dental hygienist” as her job title, retired.");
    expect(m.action).toBeNull();
    // A title that says "retired" itself is not told so twice.
    expect(one("Occ: nurse", { occupation: "Retired dental hygienist.", isRetired: true }).sentence).toBe(
      "Journey has: “Retired dental hygienist.” as her job title.",
    );
    const ford: IntakeFord = { ...READY, entries: [detail({ pillar: "occupation" })] };
    expect(one("Occ: nurse", { occupation: "Hygienist" }, ford).sentence).toBe(
      "Journey has: “Hygienist” as her job title · 1 FORD detail in Occupation.",
    );
  });

  it("says the line is the job title once it is (the form's value, so a staged one counts)", () => {
    const m = one("Occ: Retired dental hygienist.", { occupation: "retired dental hygienist" });
    expect(m).toMatchObject({ journey: "present", sentence: "This is her job title in Journey.", action: null });
  });

  it("names what else Journey holds about her work, and FORD's Occupation details once FORD answered", () => {
    const ford: IntakeFord = { ...READY, entries: [detail({ pillar: "occupation" }), detail({ id: "f2", pillar: "occupation" })] };
    const m = one("Occ: nurse", { isRetired: true }, ford);
    expect(m.journey).toBe("something");
    expect(m.sentence).toBe("No job title on her record yet. Journey has: Retired · 2 FORD details in Occupation.");
    expect(m.action).toMatchObject({ field: "occupation", mode: "set" });
    // FORD not read: nothing is claimed about it, and the job title is still offered (it is not FORD's).
    const unread = one("Occ: nurse", {}, { ...READY, status: "failed" });
    expect(unread).toMatchObject({ journey: "nothing", sentence: "No job title on her record yet." });
    expect(unread.action).not.toBeNull();
  });

  it("offers nothing a job title box could not hold", () => {
    const long = "Occ: Retired after thirty-one years as a dental hygienist, now volunteers at the library";
    const m = one(long);
    expect(m.action).toBeNull();
    expect(m.sentence).toContain("longer than a job title");
    expect(one("Occ:\nnurse\nweekends at the clinic").action).toBeNull();
  });
});

describe("matchIntake — Activity goes to FORD's Recreation, saved at once", () => {
  it("offers an empty client a pinned Recreation detail with the words verbatim", () => {
    const m = one("ACTIVITY: Pickleball 2x/wk, gardening.");
    expect(m).toMatchObject({
      target: "recreation",
      journey: "nothing",
      sentence: "Nothing in Recreation yet.",
      action: { kind: "ford", pillar: "recreation", label: "Add to Recreation", body: "Pickleball 2x/wk, gardening.", isPinned: true },
      door: { page: "ford", anchor: "ford-recreation", label: "Open Recreation" },
    });
  });

  it("still offers it beside what Journey has — FORD is a list, and the app can't tell whether they say the same", () => {
    const ford: IntakeFord = { ...READY, entries: [detail({}), detail({ id: "f2", isArchived: true })] };
    const m = one("Activity: Pickleball 2x/wk", { activityLevel: "Moderate", recreationActivities: ["Golf", "Walking"] }, ford);
    expect(m.journey).toBe("something");
    expect(m.sentence).toBe("Journey has: Moderate · Golf, Walking · 1 detail in Recreation.");
    expect(m.action).toMatchObject({ kind: "ford", pillar: "recreation" });
  });

  it("offers nothing when these words are already a detail, wherever it is filed, or were archived", () => {
    const filed = { ...READY, entries: [detail({ pillar: "family", body: "pickleball 2x/wk, gardening" })] };
    expect(one("Activity: Pickleball 2x/wk, gardening.", {}, filed)).toMatchObject({
      journey: "present",
      sentence: "This line is already a detail in Family.",
      action: null,
    });
    const unfiled = { ...READY, entries: [detail({ pillar: null, body: "Pickleball 2x/wk, gardening." })] };
    expect(one("Activity: Pickleball 2x/wk, gardening.", {}, unfiled).sentence).toBe(
      "This line is already in FORD, waiting to be filed.",
    );
    const archived = { ...READY, entries: [detail({ isArchived: true, body: "Pickleball 2x/wk, gardening." })] };
    const m = one("Activity: Pickleball 2x/wk, gardening.", {}, archived);
    expect(m.journey).toBe("present");
    expect(m.action).toBeNull();
    expect(m.sentence).toContain("archived");
  });

  it("offers no tap to a reader the FORD create rule refuses (an administrator who works elsewhere), and says why", () => {
    const m = one("Activity: golf", {}, { ...READY, canAdd: false });
    expect(m.journey).toBe("nothing");
    expect(m.action).toBeNull();
    expect(m.sentence).toBe(
      "Nothing in Recreation yet. Only a trainer at her home studio can add a FORD detail, so it isn't offered here.",
    );
    const withSome = one("Activity: golf", { activityLevel: "Moderate" }, { ...READY, canAdd: false });
    expect(withSome.sentence).toMatch(/^Journey has: Moderate\. Only a trainer at her home studio/);
    // The record's own fields are not FORD's: still offered.
    expect(one("Occ: nurse", {}, { ...READY, canAdd: false }).action).not.toBeNull();
  });

  it("is unknown — never 'nothing' — while FORD is unread, and offers no tap", () => {
    const at = (status: IntakeFord["status"], studioId = "westlake") =>
      one("Activity: golf", {}, { status, entries: [], studioId, canAdd: true });
    expect(at("loading")).toMatchObject({ journey: "unknown", action: null });
    expect(at("loading").sentence).toBe("Still reading FORD, so it isn't known yet whether this line is in Recreation.");
    expect(at("failed").sentence).toMatch(/^Couldn't check FORD just now/);
    expect(at("denied").sentence).toBe("FORD is kept by her home studio, so this line can't be checked or added to Recreation here.");
    expect(at("off").sentence).toBe(at("denied").sentence);
    expect(at("failed", "").sentence).toMatch(/no home studio on file/);
    for (const s of ["loading", "failed", "denied", "off"] as const) expect(at(s).action).toBeNull();
  });
});

describe("matchIntake — Goals go to the why, only while it is empty", () => {
  it("offers an empty why, staged", () => {
    expect(one("GOALS: Keep up w/ grandkids. Camino!")).toMatchObject({
      target: "her-why",
      targetLabel: "Her why",
      journey: "nothing",
      sentence: "Her why isn't written yet.",
      action: { kind: "field", field: "globalNotes", mode: "set", label: "Use as her why", text: "Keep up w/ grandkids. Camino!" },
      door: { page: "goals", anchor: "goals-why", label: "Open her why" },
    });
  });

  it("never replaces a why that is written", () => {
    expect(one("Goals: walk the Camino", { globalNotes: "Stay strong for the grandkids" })).toMatchObject({
      journey: "something",
      sentence: "Her why is already written on her record.",
      action: null,
    });
    expect(one("Goals: walk the Camino", { globalNotes: "I want to walk the Camino." })).toMatchObject({
      journey: "present",
      sentence: "Her why already says this.",
    });
    // Part of a longer word is not the words: "strength" is not in "strengthening".
    expect(one("Goals: strength", { globalNotes: "Strengthening her back" }).journey).toBe("something");
  });

  it("speaks in the client's pronoun", () => {
    const m = one("Goals: stay strong", {}, READY, he);
    expect(m.targetLabel).toBe("His why");
    expect(m.sentence).toBe("His why isn't written yet.");
    expect(m.action?.label).toBe("Use as his why");
  });
});

describe("matchIntake — Med goes to the medical history, and coverage is never judged", () => {
  const NEVER = /\bcovered\b|\balready (covered|in body)\b|\bmatch/i;

  it("offers an empty Body the line as its medical history", () => {
    const m = one("MED: R TKA Mar 2024.");
    expect(m).toMatchObject({
      target: "body",
      targetLabel: "Body",
      journey: "nothing",
      sentence: "Nothing in Body's watch-outs yet.",
      action: { kind: "field", field: "medicalHistory", mode: "set", label: "Add as medical history", text: "R TKA Mar 2024." },
      door: { page: "body", anchor: "body-watchouts", label: "Open Watch-outs" },
    });
  });

  it("with flags and a history on file, still offers the line — added to the history — and says to read both", () => {
    const m = one("MED: R TKA Mar 2024. BP managed w/ meds.", {
      clinicalFlags: ["joint-tka", "gen-blood-pressure"],
      medicalHistory: "Knee replaced 2024.",
      clinicalNotes: "No deep flexion",
    });
    expect(m.journey).toBe("something");
    expect(m.sentence).toBe(
      "Body has 2 clinical flags, a medical history and contraindications & constraints on file. Read both side by side; the app can't tell whether they say the same thing.",
    );
    expect(m.action).toMatchObject({ field: "medicalHistory", mode: "append", label: "Add to medical history" });
    expect(one("Med: asthma", { clinicalFlags: ["gen-asthma"] }).sentence).toMatch(/^Body has 1 clinical flag on file\./);
    expect(one("Med: asthma", { clinicalFlags: ["gen-asthma"] }).action).toMatchObject({ mode: "set" });
  });

  it("offers nothing only when these exact words are already in the history", () => {
    const m = one("MED: R TKA Mar 2024.", { medicalHistory: "Notes from intake:\n\nR TKA  Mar 2024\nMore" });
    expect(m).toMatchObject({ journey: "present", sentence: "This exact line is in her medical history.", action: null });
  });

  it("compares whole words, so a short line is never 'there' inside a longer word", () => {
    for (const [line, history] of [
      ["Med: knee", "Kneecap fracture 2010"],
      ["Med: hip", "HIPAA form signed"],
      ["Med: BP", "BPPV, managed"],
    ]) {
      const m = one(line, { medicalHistory: history });
      expect(m.journey, line).toBe("something");
      expect(m.action, line).toMatchObject({ field: "medicalHistory", mode: "append", label: "Add to medical history" });
    }
    // Punctuation and spacing are not words.
    expect(one("Med: R-TKA, Mar 2024", { medicalHistory: "Had R TKA Mar 2024; doing well" }).journey).toBe("present");
    // A line with no words at all is never "there".
    expect(one("Med: --", { medicalHistory: "Knee" }).journey).toBe("something");
  });

  it("never says 'covered' or 'match' in any medical sentence", () => {
    const views: IntakeView[] = [
      {},
      { clinicalFlags: ["joint-tka"] },
      { medicalHistory: "Knee" },
      { clinicalNotes: "No lunges" },
      { clinicalFlags: ["joint-tka"], medicalHistory: "Knee", clinicalNotes: "No lunges" },
      { medicalHistory: "R TKA Mar 2024." },
    ];
    for (const view of views) {
      const m = one("Med: R TKA Mar 2024.", view);
      expect(m.sentence ?? "", JSON.stringify(view)).not.toMatch(NEVER);
      expect(m.action?.label ?? "").not.toMatch(NEVER);
    }
  });
});

describe("matchIntake — every other line", () => {
  it("is shown with nowhere to go and nothing offered", () => {
    for (const raw of ["Pmt: autopay", "Referred by her sister", "Seen at 7:00 today"]) {
      expect(one(raw), raw).toMatchObject({ target: null, targetLabel: null, sentence: null, action: null, door: null });
    }
  });

  it("never offers a line the sync may have cut off mid-sentence", () => {
    const raw = `Occ: nurse\nGoals: ${"walk the Camino and ".repeat(60)}`.slice(0, 1000);
    const [occ, goals] = match(raw);
    expect(occ.action).not.toBeNull();
    expect(goals.line.truncated).toBe(true);
    expect(goals.action).toBeNull();
    expect(goals.sentence).toBe(
      "Her why isn't written yet. This line may be cut off where Journey's copy of the notes ends, so it isn't offered.",
    );
  });

  it("keys a line by its kind and words, so a re-read of the same notes keys it the same", () => {
    const [a] = match("Occ: Nurse.");
    const [b] = match("\n\nOCC:   nurse");
    expect(a.key).toBe("occupation:nurse");
    expect(b.key).toBe(a.key);
  });
});

describe("nextFieldValue and intakeNorm", () => {
  it("sets an empty field to the line, and appends after a blank line", () => {
    const set = { kind: "field", field: "globalNotes", mode: "set", label: "Use as her why", text: "Camino!" } as const;
    const append = { kind: "field", field: "medicalHistory", mode: "append", label: "Add to medical history", text: "R TKA" } as const;
    expect(nextFieldValue("", set)).toBe("Camino!");
    expect(nextFieldValue(undefined, set)).toBe("Camino!");
    expect(nextFieldValue("Knee replaced.  \n", append)).toBe("Knee replaced.\n\nR TKA");
    // Appending to nothing is the line alone.
    expect(nextFieldValue("   ", append)).toBe("R TKA");
  });

  it("compares words, not punctuation at the end or spacing", () => {
    expect(intakeNorm("  Pickleball 2x/wk,\n gardening. ")).toBe("pickleball 2x/wk, gardening");
    expect(intakeNorm(null)).toBe("");
  });
});
