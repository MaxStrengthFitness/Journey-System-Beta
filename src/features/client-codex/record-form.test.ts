import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Client } from "../../types";
import { RECORD_ANCHORS, pageOfAnchor, recordLocation } from "../client-profile/profile-nav";
import { saveBarSentence } from "./kit/save-bar";
import {
  FIELD_HOME,
  RECORD_FORM_KEYS,
  dirtyWhere,
  isRecordFormKey,
  nextDirty,
  sameValue,
  savePayload,
  seedForm,
  type RecordFormKey,
} from "./record-form";

const client = (over: Partial<Client> = {}): Client =>
  ({
    id: "c1",
    firstName: "Carol",
    lastName: "Brennan",
    homeStudioId: "s1",
    height: "5'0\"",
    ...over,
  }) as Client;

const none: ReadonlySet<RecordFormKey> = new Set();

describe("RECORD_FORM_KEYS", () => {
  it("holds only what a codex editor writes — no retired or Mindbody-owned field", () => {
    for (const k of [
      "recoveryMetric",
      "renewal",
      "mindbodyId",
      "mindbodyClientId",
      "mindbody_name",
      "mindbodyNotes",
      "photoUrl",
      "packageTier",
      "events",
      "sessionCount",
      "fordSummary",
    ]) {
      expect(isRecordFormKey(k), k).toBe(false);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(RECORD_FORM_KEYS).size).toBe(RECORD_FORM_KEYS.length);
  });
});

describe("FIELD_HOME", () => {
  it("is total over the form's keys", () => {
    for (const k of RECORD_FORM_KEYS) expect(FIELD_HOME[k], k).toBeTruthy();
    expect(Object.keys(FIELD_HOME).sort()).toEqual([...RECORD_FORM_KEYS].sort());
  });

  it("sends every field to a card in the anchor registry, on that card's own page", () => {
    for (const k of RECORD_FORM_KEYS) {
      const home = FIELD_HOME[k];
      expect((RECORD_ANCHORS as readonly string[]).includes(home.anchor), `${k} → ${home.anchor}`).toBe(true);
      expect(pageOfAnchor(home.anchor), k).toBe(home.page);
      // A door that names the wrong page's card lands on the page top instead.
      expect(recordLocation(home.page, home.anchor), k).toEqual({ tab: "record", page: home.page, anchor: home.anchor });
    }
  });

  it("puts the fields where AJ's pages put them", () => {
    expect(FIELD_HOME.occupation).toMatchObject({ page: "ford", anchor: "ford-occupation" });
    expect(FIELD_HOME.recreationActivities).toMatchObject({ page: "ford", anchor: "ford-recreation" });
    expect(FIELD_HOME.wingspan).toMatchObject({ page: "body", anchor: "body-build" });
    // Experience moved to Body & Pulse (AJ's decision 6).
    expect(FIELD_HOME.experienceLevel).toMatchObject({ page: "body", anchor: "body-training-story" });
    expect(FIELD_HOME.clinicalFlags).toMatchObject({ page: "body", anchor: "body-watchouts" });
    expect(FIELD_HOME.globalNotes).toMatchObject({ page: "goals", anchor: "goals-why" });
    expect(FIELD_HOME.goalHistory).toMatchObject({ page: "goals", anchor: "goals-now" });
    expect(FIELD_HOME.nickname).toMatchObject({ page: "account", anchor: "account-contact" });
    expect(FIELD_HOME.contractTierOverride).toMatchObject({ page: "account", anchor: "account-membership" });
    // The studios she may also train at are their own card (phase 16), so Show lands on them.
    expect(FIELD_HOME.approvedCrossTrainStudioIds).toEqual({
      page: "account",
      anchor: "account-train-at",
      label: "Where they can train",
    });
    // The card's own title, so "Referred by" reads "Account · How they found us".
    expect(FIELD_HOME.referredBy).toEqual({ page: "account", anchor: "account-found-us", label: "How they found us" });
  });
});

describe("dirtyWhere", () => {
  it("names a card once, however many of its fields changed", () => {
    expect(dirtyWhere(["occupation", "isRetired"])).toEqual([
      { page: "ford", anchor: "ford-occupation", label: "Occupation" },
    ]);
    expect(saveBarSentence(2, dirtyWhere(["occupation", "isRetired"]))).toBe("2 unsaved changes · FORD · Occupation");
  });

  it("orders by page, then by where the card sits on the page", () => {
    const where = dirtyWhere(["referredBy", "weight", "occupation", "clinicalFlags", "height"]);
    expect(where.map((w) => w.anchor)).toEqual([
      "ford-occupation",
      "body-build",
      "body-watchouts",
      "account-found-us",
    ]);
    expect(saveBarSentence(5, where)).toBe(
      "5 unsaved changes · FORD · Occupation, Body & Pulse · Build, Body & Pulse · Watch-outs, and 1 more place",
    );
  });

  it("is empty for nothing", () => {
    expect(dirtyWhere([])).toEqual([]);
  });
});

describe("seedForm", () => {
  it("seeds wingspan — the old form never did, so a saved wingspan showed blank", () => {
    expect(seedForm(client({ wingspan: "59" })).wingspan).toBe("59");
    expect(seedForm(client()).wingspan).toBe("");
  });

  it("starts a missing choice unpicked, never at a default that looks assessed", () => {
    const f = seedForm(client());
    expect(f.activityLevel).toBe("");
    expect(f.experienceLevel).toBe("");
    expect(f.trainingPedigree).toBe("");
    expect(f.isRetired).toBe(false);
    expect(f.workProfile).toBeNull();
    expect(f.recreationActivities).toEqual([]);
    expect(f.clinicalFlags).toEqual([]);
  });

  it("keeps the saved values, and never seeds recoveryMetric", () => {
    const f = seedForm(
      client({ occupation: "Dental hygienist", clinicalFlags: ["joint-tka"], recoveryMetric: "Poor", smartGoal: "Walk 10 miles" }),
    );
    expect(f.occupation).toBe("Dental hygienist");
    expect(f.clinicalFlags).toEqual(["joint-tka"]);
    expect(f.smartGoal).toBe("Walk 10 miles");
    expect("recoveryMetric" in f).toBe(false);
    for (const k of Object.keys(f)) expect(isRecordFormKey(k), k).toBe(true);
  });

  it("seeds a checklist, a date, the history and the lock only when the record has them", () => {
    const bare = seedForm(client());
    for (const k of ["smartChecks", "goalTargetDate", "goalHistory", "contractTierOverride"]) {
      expect(k in bare, k).toBe(false);
    }
    const full = seedForm(client({ smartChecks: null, goalTargetDate: "2026-11-26", goalHistory: [] }));
    expect(full.smartChecks).toBeNull();
    expect(full.goalTargetDate).toBe("2026-11-26");
    expect(full.goalHistory).toEqual([]);
  });

  // Landing, Sep 24 2026 (from claude/elastic-margulis-5fc2d8, written
  // against the old ClientInfoSheet): a stored wingspan showed as an empty
  // box because the form never seeded it. The codex seeds every
  // RECORD_FORM_KEY, so the guard here is that every field a Notes & Profile
  // editor writes through updateField IS one: a key outside the list is
  // never seeded (its box would open blank however much is stored) and
  // updateField refuses the edit. The original guard held what the record
  // DISPLAYS from the form, so the reads are held too: a card that shows
  // `formData.someKey` with no fallback, for a key outside the list, would be
  // an always-empty box.
  it("seeds every field a Notes & Profile editor writes or reads from the form, with its stored value", () => {
    const dirs = ["client-codex", "client-admin", "client-life", "ford/page", "goals"].map((d) =>
      resolve(process.cwd(), "src/features", d),
    );
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
      }
    };
    dirs.forEach(walk);
    const written = new Set<string>();
    const read = new Set<string>();
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/\bupdateField\(\s*"([A-Za-z_]+)"/g)) written.add(m[1]);
      // formData.key, formData?.key, formData["key"], formData?.["key"]
      for (const m of text.matchAll(/\bformData(?:\?\.)?(?:\.([A-Za-z_]\w*)|\[\s*["']([A-Za-z_]\w*)["']\s*\])/g)) {
        read.add(m[1] ?? m[2]);
      }
    }
    // Guard against passing vacuously if updateField or formData is ever renamed.
    expect([...written]).toEqual(expect.arrayContaining(["height", "wingspan", "weight", "occupation", "smartGoal"]));
    expect([...read]).toEqual(expect.arrayContaining(["medicalHistory", "clinicalFlags", "occupation"]));
    for (const key of new Set([...written, ...read])) {
      expect(isRecordFormKey(key), key).toBe(true);
      expect((seedForm(client({ [key]: "stored" } as Partial<Client>)) as Record<string, unknown>)[key], key).toBe(
        "stored",
      );
    }
  });
});

describe("sameValue", () => {
  it("treats every shape of nothing as the same", () => {
    expect(sameValue(undefined, null)).toBe(true);
    expect(sameValue(undefined, "")).toBe(true);
    expect(sameValue("", undefined)).toBe(true);
    expect(sameValue(undefined, false)).toBe(true);
    expect(sameValue(undefined, [])).toBe(true);
    expect(sameValue(null, "")).toBe(true);
  });

  it("compares arrays and plain objects by value", () => {
    expect(sameValue(["Golf", "Pickleball"], ["Golf", "Pickleball"])).toBe(true);
    expect(sameValue(["Golf"], ["Pickleball"])).toBe(false);
    expect(sameValue(["Golf", "Pickleball"], ["Pickleball", "Golf"])).toBe(false);
    expect(sameValue({ s: true, m: false, a: false, r: false, t: false }, { s: true, m: false, a: false, r: false, t: false })).toBe(true);
    expect(sameValue({ s: true }, { s: false })).toBe(false);
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameValue([{ level: "Novice", at: "x" }], [{ level: "Novice", at: "x" }])).toBe(true);
  });

  it("tells a value from nothing", () => {
    expect(sameValue("Moderate", "")).toBe(false);
    expect(sameValue(true, undefined)).toBe(false);
    expect(sameValue(["Golf"], undefined)).toBe(false);
    expect(sameValue({ s: false }, null)).toBe(false);
  });

  it("compares a Timestamp-like value with its own isEqual", () => {
    class Stamp {
      ms: number;
      constructor(ms: number) {
        this.ms = ms;
      }
      isEqual(o: { ms?: number }) {
        return o?.ms === this.ms;
      }
    }
    const at = (ms: number) => new Stamp(ms);
    expect(sameValue(at(5), at(5))).toBe(true);
    expect(sameValue(at(5), at(6))).toBe(false);
  });
});

describe("nextDirty", () => {
  it("marks an edit and clears it when the edit returns to the saved value", () => {
    const c = client({ occupation: "Hygienist" });
    const a = nextDirty(none, "occupation", "Teacher", c);
    expect([...a]).toEqual(["occupation"]);
    const b = nextDirty(a, "occupation", "Hygienist", c);
    expect([...b]).toEqual([]);
  });

  it("does not count typing into an empty field and deleting it again", () => {
    const c = client();
    const a = nextDirty(none, "medicalHistory", "Knee", c);
    expect(a.has("medicalHistory")).toBe(true);
    expect(nextDirty(a, "medicalHistory", "", c).size).toBe(0);
  });

  it("treats an edit-then-revert of an array or an object as clean", () => {
    const c = client({
      recreationActivities: ["Golf"],
      smartChecks: { s: true, m: true, a: false, r: false, t: false },
      contractTierOverride: { term: 12, payment: "monthly" } as Client["contractTierOverride"],
    });
    let d = nextDirty(none, "recreationActivities", ["Golf", "Pickleball"], c);
    d = nextDirty(d, "recreationActivities", ["Golf"], c);
    d = nextDirty(d, "smartChecks", { s: true, m: true, a: false, r: false, t: false }, c);
    d = nextDirty(d, "contractTierOverride", { term: 12, payment: "monthly" }, c);
    expect(d.size).toBe(0);
  });

  it("hands back the same set when nothing changed", () => {
    const c = client();
    expect(nextDirty(none, "occupation", "", c)).toBe(none);
  });
});

describe("savePayload", () => {
  it("writes only the changed fields and who changed them", () => {
    const form = { ...seedForm(client()), occupation: "Teacher", medicalHistory: "Knee" };
    expect(savePayload(["occupation"], form, "t-1")).toEqual({ occupation: "Teacher", lastUpdatedBy: "t-1" });
  });

  it("never writes renewal, a non-form key, or undefined", () => {
    const form = { ...seedForm(client()), occupation: undefined } as Record<string, unknown>;
    form.renewal = { situation: "on-track" };
    const out = savePayload(["occupation", "renewal" as RecordFormKey], form, "t-1");
    expect(out).toEqual({ lastUpdatedBy: "t-1" });
    expect("renewal" in out).toBe(false);
    expect(Object.values(out).every((v) => v !== undefined)).toBe(true);
  });

  it("strips undefined inside a history entry", () => {
    const form = { goalHistory: [{ goal: "Walk", achievedAt: "2026-09-01", reward: undefined }] } as never;
    const out = savePayload(["goalHistory"], form, null);
    expect(out).toEqual({ goalHistory: [{ goal: "Walk", achievedAt: "2026-09-01" }] });
    expect("lastUpdatedBy" in out).toBe(false);
  });
});
