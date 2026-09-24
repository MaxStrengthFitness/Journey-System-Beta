import { describe, expect, it } from "vitest";
import type { Client } from "../../../types";
import { pronounsOf } from "../kit/pronouns";
import { NOT_RECORDED, baselineWords, buildFacts, heightHint, reachSentence, statureLede } from "./build";

const NOW = new Date(2027, 2, 24, 12);
const her = pronounsOf({ gender: "Female" });
const them = pronounsOf({});

const client = (over: Partial<Client> = {}): Client =>
  ({ id: "c1", firstName: "Carol", lastName: "B", gender: "Female", height: `5'0"`, ...over }) as Client;

const facts = (c: Client, formData: Partial<Client> = {}, p = her) =>
  buildFacts({ client: c, formData, pronouns: p, now: NOW });

describe("Build — where she sits against the machines", () => {
  it("reads a 5'0\" woman as shorter, against the women's baseline", () => {
    const f = facts(client());
    expect(f.band).toBe("shorter");
    expect(f.lede).toBe("Shorter than our machines are set for.");
    expect(f.height.text).toBe(`5'0"`);
    expect(f.height.source).toBe(
      `The catalog baseline for women is 5'4"; 3" or more under it counts as shorter, 3" or more over it as taller.`,
    );
  });

  it("reads a 6'0\" man as taller", () => {
    const f = facts(client({ gender: "Male", height: "72" }));
    expect(f.band).toBe("taller");
    expect(f.lede).toBe("Taller than our machines are set for.");
    expect(f.height.source).toContain(`men is 5'9"`);
  });

  it("measures a client with no gender against 5'6½\"", () => {
    const f = facts(client({ gender: undefined, height: "66" }), {}, them);
    expect(f.band).toBe("average");
    expect(f.lede).toBe(`Within 3" of the height our machines are set for.`);
    expect(baselineWords(null)).toBe(`clients with no gender on file is 5'6½"`);
  });

  it("says a height it cannot read is unreadable — never average, never missing", () => {
    const f = facts(client({ height: "five four" }));
    expect(f.heightUnreadable).toBe(true);
    expect(f.band).toBeNull();
    expect(f.lede).toBe(`The height on file (“five four”) isn't one the app can read. Write it like 5'4" or 64.`);
  });

  it("says no height on file, in her pronoun", () => {
    expect(facts(client({ height: "" })).lede).toBe("No height on file, so machine set-up can't be matched to her.");
    expect(statureLede(null, { pronouns: them })).toBe(
      "No height on file, so machine set-up can't be matched to them.",
    );
  });

  it("shows what Save will write: the form over the record", () => {
    const f = facts(client({ height: `5'0"` }), { height: "72", gender: "Male" });
    expect(f.band).toBe("taller");
  });
});

describe("Build — reach", () => {
  it("compares the wingspan with the height", () => {
    const f = facts(client({ wingspan: "59" }));
    expect(f.reach).toEqual({ text: `4'11" wingspan`, source: `1" less than her height` });
    expect(reachSentence(60, 60, her)).toBe("The same as her height");
    expect(reachSentence(60, 62.5, her)).toBe(`2.5" more than her height`);
    expect(reachSentence(null, 60, her)).toBe("No height on file to compare it with.");
  });

  it("leaves the row out with no wingspan", () => {
    expect(facts(client()).reach).toBeNull();
  });
});

describe("Build — weight, body fat, age and sex", () => {
  it("lets a scan's weight beat a typed one, and names where each came from", () => {
    const scanned = client({
      weight: "150",
      inbodySummary: {
        scanCount: 2,
        firstTestedAt: "2026-09-02",
        latestTestedAt: "2027-03-03",
        latest: { weightLb: 142, skeletalMuscleMassLb: 48.3, bodyFatMassLb: 48.4, percentBodyFat: 34.1 },
        weightLbChange: null,
        muscleLbChange: null,
        bodyFatLbChange: null,
        bodyFatPctChange: null,
      },
    });
    const f = facts(scanned);
    expect(f.weight).toEqual({ text: "142 lb", source: "InBody, Mar 3" });
    expect(f.bodyFat).toEqual({ text: "34.1%", source: "InBody, Mar 3" });
    expect(facts(client({ weight: "150" })).weight).toEqual({ text: "150 lb", source: "Typed on her record" });
  });

  it("says no scan and not recorded, never blank", () => {
    const f = facts(client());
    expect(f.bodyFat.text).toBe("No InBody scan yet");
    expect(f.weight.text).toBe(NOT_RECORDED);
  });

  it("gives age and sex from Mindbody when the client is linked", () => {
    const linked = facts(client({ dateOfBirth: "1958-06-01", mindbodyClientId: "100000123" } as Partial<Client>));
    expect(linked.ageSex).toEqual({ text: "68 · female", source: "From Mindbody" });
    const own = facts(client({ dateOfBirth: "1958-06-01" }));
    expect(own.ageSex.source).toBe("On her record");
  });
});

describe("Build — work, outside, and the training story", () => {
  it("reads work and recreation the way FORD writes them", () => {
    const f = facts(
      client({
        occupation: "Dental hygienist",
        workProfile: "on-feet",
        isRetired: true,
        activityLevel: "Moderate",
        recreationActivities: ["Pickleball", "Walking"],
      }),
    );
    expect(f.work.text).toBe("Retired — was on their feet (Dental hygienist)");
    expect(f.work.source).toBe("From FORD · Occupation. Hours standing and walking — legs and feet arrive tired.");
    expect(f.outside).toEqual({ text: "Moderate · Pickleball, Walking", source: "From FORD · Recreation" });
  });

  it("reads Not recorded yet for an empty training story", () => {
    const f = facts(client());
    expect(f.training.before.text).toBe(NOT_RECORDED);
    expect(f.training.protocol.text).toBe(NOT_RECORDED);
    expect(f.training.strength.text).toBe(NOT_RECORDED);
    expect(f.work.text).toBe(NOT_RECORDED);
  });

  it("dates protocol mastery and names what each field sets", () => {
    const f = facts(
      client({
        fitnessBackground: ["Physical therapy"],
        needsUnteaching: true,
        trainingPedigree: "Advanced",
        pedigreeHistory: [
          { level: "Intermediate", at: "" },
          { level: "Advanced", at: "2026-11-10T15:00:00.000Z" },
        ],
        experienceLevel: "Intermediate",
      } as Partial<Client>),
    );
    expect(f.training.before.text).toBe("Physical therapy, has habits to unteach");
    expect(f.training.protocol.text).toBe("Advanced");
    expect(f.training.protocol.source).toMatch(
      /^Intermediate → Advanced \(Nov 2026\) · Sets the rep range the Journey grid's cue reads$/,
    );
    expect(f.training.strength).toEqual({
      text: "Intermediate",
      source: "Sets the studio's suggested starting weights",
    });
  });
});

describe("the height box's live line", () => {
  it("says how the app reads what is typed", () => {
    expect(heightHint(`5'4"`, 64)).toBe(`Reads as 5'4".`);
    expect(heightHint("five four", null)).toBe(`The app can't read this as a height. Write it like 5'4" or 64.`);
    expect(heightHint("", null)).toMatch(/^Write it like/);
  });
});
