import { describe, expect, it } from "vitest";
import { EMPTY_SESSION_DRAFT, isSessionNoteDraft } from "../client-notes/session-draft";
import {
  DEFAULT_FILING,
  FILING_CHIPS,
  HEALTH_NOTE_BUTTON,
  LEADERS_LINE,
  NOTE_SAVE_WORDS,
  aboutChoices,
  aboutWords,
  addButtonLabel,
  asksWhereOnBody,
  chipOf,
  clientNoteOf,
  composerPlaceholder,
  draftOwnerOf,
  fileDraft,
  filedAsWords,
  floorConfirmation,
  floorNoteOf,
  floorTitle,
  healthNoteAfterPain,
  loudnessAfterFiling,
  makeItAbout,
  makeItAboutWords,
  noteOrigin,
  reachesLeaders,
  setTarget,
  showsFiling,
  startingLoudness,
  targetOf,
  typeInto,
  unsavedNoteLabel,
  withMenuDefaults,
  type MenuNoteDraft,
} from "./note-target";

const chip = (id: string) => FILING_CHIPS.find((c) => c.id === id)!;

describe("the default filing: Coaching & equipment · Set-up", () => {
  it("starts an empty draft as this machine's Set-up note, at Note", () => {
    const d = withMenuDefaults(EMPTY_SESSION_DRAFT, "leg-press");
    expect(d).toMatchObject({ machineId: "leg-press", aboutMachine: true, category: "coaching", flavour: "Setup", importance: "standard", body: "" });
    expect(DEFAULT_FILING).toEqual({ category: "coaching", flavour: "Setup" });
    expect(filedAsWords(d.category, d.flavour)).toBe("Coaching & equipment · Set-up");
  });

  it("writes through the notes catalog's one answer", () => {
    const note = clientNoteOf(typeInto(null, "leg-press", "  Cue heels down at the end.  "));
    expect(note).toEqual({ body: "Cue heels down at the end.", kind: "equipment", category: null, bodyParts: null, importance: "standard" });
  });

  it("keeps a filing picked before the first word", () => {
    const picked = fileDraft(withMenuDefaults(null, "leg-press"), chip("health"), false);
    const typed = typeInto(picked, "leg-press", "Left knee sore");
    expect([typed.category, typed.importance]).toEqual(["health", "elevated"]);
  });
});

describe("filing and loudness", () => {
  it("offers the chips in order", () => {
    expect(FILING_CHIPS.map((c) => c.label)).toEqual(["Set-up", "Posture", "Path", "Pace", "Purpose", "Health", "Incident", "Preference"]);
  });

  it("says what a filing is", () => {
    expect(filedAsWords("coaching", "Posture")).toBe("Coaching & equipment · Posture");
    expect(filedAsWords("health", "Injury")).toBe("Health · Injury or pain");
    expect(filedAsWords("incident", null)).toBe("Incident");
    expect(filedAsWords(null, null)).toBe("Not filed yet");
  });

  it("starts each category at its own loudness: Coaching and Preference at Note, Health and Incident at Heads up", () => {
    expect(["coaching", "preference", "health", "incident"].map((c) => startingLoudness(c as never))).toEqual(["standard", "standard", "elevated", "elevated"]);
    const d = withMenuDefaults(null, "leg-press");
    expect(fileDraft(d, chip("health"), false).importance).toBe("elevated");
    expect(fileDraft(d, chip("incident"), false).importance).toBe("elevated");
    expect(fileDraft(fileDraft(d, chip("health"), false), chip("pace"), false).importance).toBe("standard");
  });

  it("keeps a loudness picked by hand when the filing changes", () => {
    const loud: MenuNoteDraft = { ...withMenuDefaults(null, "leg-press"), importance: "critical" };
    expect(fileDraft(loud, chip("preference"), true).importance).toBe("critical");
    expect(loudnessAfterFiling("critical", true, "coaching")).toBe("critical");
    expect(loudnessAfterFiling("critical", false, "coaching")).toBe("standard");
  });

  it("asks where on the body for Health and Incident, and drops the parts when the filing moves on", () => {
    expect([asksWhereOnBody("health"), asksWhereOnBody("incident"), asksWhereOnBody("coaching")]).toEqual([true, true, false]);
    const withKnee: MenuNoteDraft = { ...fileDraft(withMenuDefaults(null, "m"), chip("health"), false), bodyParts: [{ part: "knee", side: "left" } as never] };
    expect(fileDraft(withKnee, chip("incident"), false).bodyParts).toHaveLength(1);
    expect(fileDraft(withKnee, chip("setup"), false).bodyParts).toEqual([]);
  });

  it("says Health and Incident reach the studio's leaders", () => {
    expect([reachesLeaders("health"), reachesLeaders("incident"), reachesLeaders("coaching"), reachesLeaders(null)]).toEqual([true, true, false, false]);
    expect(LEADERS_LINE).toBe("Reaches the studio's leaders on Operations → Today");
  });

  it("finds the picked chip", () => {
    expect(chipOf("coaching", "Setup")?.id).toBe("setup");
    expect(chipOf("health", "Injury")?.id).toBe("health");
    expect(chipOf("coaching", null)).toBeNull();
    expect(chipOf(null, null)).toBeNull();
  });
});

describe("the session's one draft", () => {
  const about = (machineId: string | null, body = "Pushes through the toes"): MenuNoteDraft => ({
    ...EMPTY_SESSION_DRAFT,
    body,
    machineId,
    aboutMachine: machineId !== null,
  });

  it("knows whose words it holds", () => {
    expect(draftOwnerOf(null, "leg-press")).toBe("empty");
    expect(draftOwnerOf(about("leg-press", "  "), "leg-press")).toBe("empty");
    expect(draftOwnerOf(about("leg-press"), "leg-press")).toBe("this");
    expect(draftOwnerOf(about("chest-press"), "leg-press")).toBe("other");
    expect(draftOwnerOf(about(null), "leg-press")).toBe("general");
  });

  it("keeps words about another machine that machine's until Make it about", () => {
    const typed = typeInto(about("chest-press", "Elbows"), "leg-press", "Elbows wide");
    expect([typed.machineId, typed.body]).toEqual(["chest-press", "Elbows wide"]);
    expect(makeItAbout(typed, "leg-press")).toMatchObject({ machineId: "leg-press", aboutMachine: true, body: "Elbows wide" });
    expect(aboutWords("Chest Press")).toBe("About Chest Press");
    expect(makeItAboutWords("Leg Press")).toBe("Make it about Leg Press");
  });

  it("stays a session draft the tracker can store and read back", () => {
    const d = setTarget(typeInto(null, "leg-press", "Seat pin sticks"), "floor");
    expect(isSessionNoteDraft(JSON.parse(JSON.stringify(d)))).toBe(true);
  });
});

describe("The machine itself: a floor note, never the client's record", () => {
  it("keeps the words when the switch flips, both ways", () => {
    const d = typeInto(null, "leg-press", "The seat pin sticks at 7");
    const floor = setTarget(d, "floor");
    expect([floor.body, targetOf(floor)]).toEqual(["The seat pin sticks at 7", "floor"]);
    const back = setTarget(floor, "client");
    expect([back.body, targetOf(back), "toFloor" in back]).toEqual(["The seat pin sticks at 7", "client", false]);
  });

  it("reads the switch defensively: anything but true is a client note", () => {
    expect(targetOf(null)).toBe("client");
    expect(targetOf({ toFloor: "yes" as never })).toBe("client");
    expect(targetOf({ toFloor: 1 as never })).toBe("client");
    expect(targetOf({ toFloor: true })).toBe("floor");
  });

  it("writes a floor note or a client note, never both", () => {
    const d = typeInto(null, "leg-press", "The seat pin sticks at 7");
    expect(floorNoteOf(setTarget(d, "floor"))).toEqual({ body: "The seat pin sticks at 7" });
    expect(clientNoteOf(setTarget(d, "floor"))).toBeNull();
    expect(floorNoteOf(d)).toBeNull();
    expect(clientNoteOf(withMenuDefaults(null, "m"))).toBeNull();
    expect(floorNoteOf(setTarget(withMenuDefaults(null, "m"), "floor"))).toBeNull();
  });

  it("hides filing and loudness for a floor note", () => {
    expect([showsFiling("client"), showsFiling("floor")]).toEqual([true, false]);
  });

  it("says where it went", () => {
    expect(floorTitle("Westlake", "Leg Press")).toBe("Westlake's notes on Leg Press · everyone at Westlake sees it");
    expect(addButtonLabel("floor", "Westlake")).toBe("Add to Westlake's notes");
    expect(addButtonLabel("client")).toBe("Add note");
    expect(floorConfirmation("Westlake", "Leg Press")).toBe("On Westlake's notes for Leg Press. Everyone at Westlake sees it here and on the Catalog.");
    expect(floorTitle(null, "Leg Press")).toBe("The studio's notes on Leg Press · everyone at the studio sees it");
  });
});

describe("after a save for pain or discomfort", () => {
  it("opens a Health · Injury or pain note at Heads up with the change typed", () => {
    const d = healthNoteAfterPain(null, "leg-press", "Seat 4 → 5")!;
    expect(d).toMatchObject({ body: "Seat 4 → 5 for pain or discomfort.", category: "health", flavour: "Injury", importance: "elevated", machineId: "leg-press" });
    expect(clientNoteOf(d)).toMatchObject({ kind: "injury", category: "Injury", importance: "elevated" });
    expect(filedAsWords(d.category, d.flavour)).toBe("Health · Injury or pain");
    expect(HEALTH_NOTE_BUTTON).toBe("Add a Health note");
  });

  it("never replaces words already in the box", () => {
    expect(healthNoteAfterPain(typeInto(null, "leg-press", "Half a thought"), "leg-press", "Seat 4 → 5")).toBeNull();
  });

  it("is a client note even when the box was switched to the floor before any words", () => {
    const d = healthNoteAfterPain(setTarget(withMenuDefaults(null, "m"), "floor"), "m", "Seat 4 → 5")!;
    expect(targetOf(d)).toBe("client");
  });
});

describe("the rest of the words", () => {
  it("words the box, the switch, the save and the leave question", () => {
    expect(composerPlaceholder("Avery", "Leg Press")).toBe("Note about Avery on Leg Press…");
    expect(aboutChoices("Avery")).toEqual(["Avery", "The machine itself"]);
    expect(NOTE_SAVE_WORDS).toEqual({
      saved: "Saved",
      queued: "Saved on this iPad · sends when online",
      failed: "Couldn't save. Your words are still here · Try again",
    });
    expect(unsavedNoteLabel("Leg Press", "Avery")).toBe("Leg Press note for Avery");
    expect([noteOrigin("session"), noteOrigin("profile")]).toEqual(["in_session", "profile"]);
  });

  it("never guesses a pronoun", () => {
    const all = [
      composerPlaceholder("Avery", "Leg Press"),
      composerPlaceholder("", ""),
      ...aboutChoices(""),
      floorTitle("Westlake", "Leg Press"),
      floorConfirmation(null, "Leg Press"),
      ...Object.values(NOTE_SAVE_WORDS),
      LEADERS_LINE,
      unsavedNoteLabel("Leg Press", ""),
    ].join("\n");
    expect(all).not.toMatch(/\b(her|she|his|he)\b/i);
  });
});
