import { describe, expect, it } from "vitest";
import { canSaveNewClient, newClientPayload, parseAge, type NewClientAnswers } from "./consultation-answers";

/*
 * The consultation screens' own helpers (knownGender, ageOnFile,
 * demographicsPatch, consultationPatch, suggestedStartingWeight,
 * consultationNoteBody) went with the two screens in the first-session design
 * round (Oct 8 2026, §4.8; item 9 of AJ's brief, retiring the old pieces).
 * What is left is Add Client's intake, and it still invents nothing.
 */

describe("parseAge", () => {
  it("reads a typed age", () => {
    expect(parseAge("45")).toBe(45);
    expect(parseAge(" 62 ")).toBe(62);
    expect(parseAge(71)).toBe(71);
  });

  it("is null for a blank box, rubbish or an impossible age — never 0 or NaN", () => {
    expect(parseAge("")).toBeNull();
    expect(parseAge("abc")).toBeNull();
    expect(parseAge(0)).toBeNull();
    expect(parseAge(-3)).toBeNull();
    expect(parseAge(400)).toBeNull();
    expect(parseAge(undefined)).toBeNull();
    expect(parseAge(null)).toBeNull();
    expect(parseAge(Number.NaN)).toBeNull();
  });
});

describe("new-client intake", () => {
  const answers = (over: Partial<NewClientAnswers> = {}): NewClientAnswers => ({
    kind: "prospect",
    firstName: "Grace",
    lastName: "Ahn",
    phone: "",
    email: "",
    gender: "",
    age: "",
    homeStudioId: "westlake",
    discoveryNotes: "",
    ...over,
  });

  it("cannot be saved without a home studio", () => {
    expect(canSaveNewClient(answers())).toBe(true);
    expect(canSaveNewClient(answers({ homeStudioId: "" }))).toBe(false);
    expect(canSaveNewClient(answers({ homeStudioId: "  " }))).toBe(false);
    expect(canSaveNewClient(answers({ firstName: "" }))).toBe(false);
  });

  it("invents nothing: no height, no gender, no age, no package", () => {
    const doc = newClientPayload(answers());
    expect("height" in doc).toBe(false);
    expect("gender" in doc).toBe(false);
    expect("age" in doc).toBe(false);
    expect("phone" in doc).toBe(false);
    expect("email" in doc).toBe(false);
    expect("discoveryNotes" in doc).toBe(false);
    // The rules require a number; 0 is what every other creator writes.
    expect(doc.remainingSessions).toBe(0);
    expect(Object.values(doc)).not.toContain(undefined);
  });

  it("the same for an existing client — no 10 sessions out of nowhere", () => {
    const doc = newClientPayload(answers({ kind: "existing" }));
    expect(doc.remainingSessions).toBe(0);
    expect(doc.consultationCompleted).toBe(true);
    expect(doc.requiresConsultation).toBe(false);
  });

  it("writes what was answered", () => {
    const doc = newClientPayload(
      answers({ gender: "Prefer not to say", age: "47", phone: "555-0100", discoveryNotes: "Knee" }),
    );
    expect(doc).toMatchObject({
      gender: "Prefer not to say",
      age: 47,
      phone: "555-0100",
      discoveryNotes: "Knee",
      homeStudioId: "westlake",
      requiresConsultation: true,
      consultationCompleted: false,
    });
  });

  it("never writes a typed age it cannot read", () => {
    expect("age" in newClientPayload(answers({ age: "abc" }))).toBe(false);
  });
});
