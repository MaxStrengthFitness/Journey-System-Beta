import { describe, expect, it } from "vitest";
import {
  ageOnFile,
  canSaveNewClient,
  consultationNoteBody,
  consultationPatch,
  demographicsPatch,
  knownGender,
  newClientPayload,
  parseAge,
  suggestedStartingWeight,
  type NewClientAnswers,
} from "./consultation-answers";
import { calculateStartingWeight } from "./consultation-utils";

describe("knownGender", () => {
  it("knows the two the screens offer, and nothing else", () => {
    expect(knownGender("Male")).toBe("Male");
    expect(knownGender("Female")).toBe("Female");
    // "Other" and "Prefer not to say" are real answers from intake, but not
    // ones these screens can pick; treating them as unanswered leaves them on
    // file untouched.
    expect(knownGender("Other")).toBeNull();
    expect(knownGender("")).toBeNull();
    expect(knownGender(undefined)).toBeNull();
    expect(knownGender(null)).toBeNull();
  });
});

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

describe("ageOnFile", () => {
  const now = new Date("2026-09-24T12:00:00");

  it("is the typed age first, then the birth date", () => {
    expect(ageOnFile({ age: 58, dateOfBirth: "1990-01-01" }, now)).toBe(58);
    expect(ageOnFile({ dateOfBirth: "1960-03-10" }, now)).toBe(66);
  });

  it("is null when nothing is on file — never 40", () => {
    expect(ageOnFile({}, now)).toBeNull();
    expect(ageOnFile({ age: 0 }, now)).toBeNull();
    expect(ageOnFile(null, now)).toBeNull();
  });
});

describe("demographicsPatch", () => {
  it("writes only what was answered", () => {
    expect(demographicsPatch({ gender: "Female", age: 52 })).toEqual({ gender: "Female", age: 52 });
    expect(demographicsPatch({ gender: "Male", age: null })).toEqual({ gender: "Male" });
    expect(demographicsPatch({ gender: null, age: 52 })).toEqual({ age: 52 });
  });

  it("writes nothing at all when nothing was answered — no Male, no 40", () => {
    const patch = demographicsPatch({ gender: null, age: null });
    expect(patch).toEqual({});
    expect("gender" in patch).toBe(false);
    expect("age" in patch).toBe(false);
  });
});

describe("consultationPatch", () => {
  const blank = { gender: null, age: null, occupation: "", medicalHistory: "", activity: "", goals: "" };

  it("is empty when every question was left alone", () => {
    expect(consultationPatch(blank)).toEqual({});
  });

  it("leaves a blank text answer out rather than writing an empty string over what is on file", () => {
    const patch = consultationPatch({ ...blank, occupation: "Nurse", goals: "   " });
    expect(patch).toEqual({ occupation: "Nurse" });
    expect("goals" in patch).toBe(false);
  });

  it("has no undefined anywhere (Firestore refuses it)", () => {
    const patch = consultationPatch({ ...blank, gender: "Female" });
    expect(Object.values(patch)).not.toContain(undefined);
  });
});

describe("suggestedStartingWeight", () => {
  it("makes no suggestion until both gender and age are answered", () => {
    expect(suggestedStartingWeight("Leg Press", null, 50, "Novice")).toBeNull();
    expect(suggestedStartingWeight("Leg Press", "Female", null, "Novice")).toBeNull();
    expect(suggestedStartingWeight("Leg Press", null, null, "Novice")).toBeNull();
  });

  it("is the ordinary calculation once they are", () => {
    expect(suggestedStartingWeight("Leg Press", "Female", 50, "Novice")).toBe(
      calculateStartingWeight("Leg Press", "Female", 50, "Novice"),
    );
  });
});

describe("consultationNoteBody", () => {
  it("says the age only when it was given", () => {
    expect(consultationNoteBody({ age: 61, skillLevel: "Novice", goals: "Bone density" })).toBe(
      "Consultation. Age: 61, Skill: Novice. Goals: Bone density",
    );
    expect(consultationNoteBody({ age: null, skillLevel: "Novice", goals: "" })).toBe("Consultation. Skill: Novice.");
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
