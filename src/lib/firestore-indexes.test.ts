import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLIENT_REFERENCE_FIELDS } from "../features/admin/provisional/reconcile";
import {
  buildProgram,
  describeShape,
  findQueries,
  isServed,
  SECOND_FIELD_PLACEHOLDER,
  suggestedIndex,
  type CompositeIndex,
  type QueryShape,
  type Scope,
} from "./firestore-index-guard";

/**
 * NO QUERY SHIPS WITHOUT ITS INDEX (speed round, Oct 5 2026, R3).
 *
 * Production Firestore is the ENTERPRISE edition: it builds no index by
 * itself, and a query with no index still answers by reading the whole
 * collection — company-wide for a top-level collection or a collection group
 * — billed by the byte. Nothing fails and nothing is slow in a test, so this
 * file is the only thing that notices. `firestore-index-guard.ts` explains how
 * a query is read and what counts as served.
 *
 * IF THIS FAILS on a query you wrote, add the index it prints to the
 * `indexes` list of `firestore.indexes.json` (a composite, never a
 * `fieldOverrides` entry: Enterprise refuses those; give it a second field if
 * the printed one has only one, since a one-field composite is unchecked on
 * Enterprise) and deploy it before the app (`firebase deploy --only
 * firestore:indexes`, the first step of every ship script). Only if the
 * collection is genuinely tiny and scoped to one client or one trainer does
 * it belong in ALLOWED below, with the reason.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
/** The app, the web server (its entry and server/, the cron jobs included), and the Cloud Functions. */
const SCANNED = ["src", "server.ts", "server", "functions/src"];

function sourceFiles(dir: string): string[] {
  if (statSync(dir).isFile()) return [dir];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === "__tests__" || name === "__mocks__" || name === "test-utils") continue;
      out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) {
      out.push(path);
    }
  }
  return out;
}

/**
 * Queries that may scan, each with the reason. A key is
 * `scope group` (anywhere) or `scope group @ file` (that file only).
 *
 * A collection-scope query on a subcollection reads only that one parent's
 * collection (`clients/{id}/ford`, not every client's), so a scan of one
 * client's or one trainer's own subcollection is a scan of a handful of
 * documents. A top-level collection or a collection group never belongs here,
 * and a key with no file covers that collection id EVERYWHERE, so it is only
 * for an id that lives under one kind of parent (if a studio-level `notes`
 * ever appears, give these keys their files).
 *
 * Every entry here must still match a query: an entry nothing needs any
 * more fails the test, so the list can't quietly outlive its reason.
 */
const ALLOWED: Record<string, string> = {
  // ---- One client's or one trainer's own subcollection: a few documents, scanned whole ----
  "COLLECTION ford": "clients/{id}/ford: one client's FORD details (tens). The studio-wide reads are the collection group, indexed.",
  "COLLECTION touches": "studios/{s}/renewals/{cycle}/touches: one renewal cycle's conversation log (a few).",
  "COLLECTION inbodyScans": "clients/{id}/inbodyScans: one client's scans, a few a year.",
  "COLLECTION sharedNotes": "clients/{id}/sharedNotes: notes shared onto one client's record.",
  "COLLECTION notes": "trainers/{uid}/notes: one trainer's private notes.",

  // ---- The provisional-client merge: an administrator's rare repair, one client at a time ----
  "COLLECTION machineSettingChanges @ src/features/admin/provisional/mergeClient.ts":
    "Legacy collection nothing writes any more; repointed only when a temporary client is merged.",
  "COLLECTION mindbodyLimbo @ src/features/admin/provisional/mergeClient.ts":
    "mindbodyLimbo by clientId, only when a temporary client is merged (Limbo is a few hundred rows at most).",

  // ---- Parked: the service is commented out in render.yaml; index before switching it on ----
  "COLLECTION schedules @ server/cron-daily-reminders.ts":
    "PARKED cron (render.yaml). Before re-enabling: loop studios on (studioId, startTime), or add (startTime, studioId).",
  "COLLECTION schedules @ server/cron-weekly-coach-report.ts":
    "PARKED cron (render.yaml). Before re-enabling: loop studios on (studioId, startTime), or add (startTime, studioId).",
  "COLLECTION notificationQueue @ server/worker.ts":
    "PARKED worker (render.yaml). Before re-enabling: add (status, createdAt) and (scheduleId, status).",
};

/**
 * Files holding a query the guard can't read on its own (the collection or a
 * field is decided at run time), each with how the test reads it instead.
 * Every one is expanded into ordinary shapes below, so it is still judged.
 * Each file may hold exactly ONE such query: a second run-time query added
 * to one of these files fails the test rather than being read as the first.
 */
const EXPANDED: Record<string, (q: QueryShape) => QueryShape[]> = {
  // repointField(collectionName, field, ...) runs once per CLIENT_REFERENCE_FIELDS entry.
  "src/features/admin/provisional/mergeClient.ts": (q) =>
    CLIENT_REFERENCE_FIELDS.map((r) => ({ ...q, group: r.collection, scope: "COLLECTION" as Scope, equality: [r.field], unreadable: false })),
  // The four share groups, read from SHARE_GROUPS in the same file.
  "src/features/machine-db/fetch-share-offers.ts": (q) =>
    shareGroups().map((group) => ({ ...q, group, scope: "COLLECTION_GROUP" as Scope, unreadable: false })),
};

/** The collection groups `fetchShareOffers` reads (its SHARE_GROUPS literal). */
function shareGroups(): string[] {
  const text = readFileSync(join(ROOT, "src/features/machine-db/fetch-share-offers.ts"), "utf8");
  // From the array literal itself, past the type annotation (which names them too).
  const start = text.indexOf("= [", text.indexOf("SHARE_GROUPS"));
  const block = text.slice(start, text.indexOf("];", start));
  const groups = [...block.matchAll(/group:\s*"(\w+)"/g)].map((m) => m[1]);
  expect(groups.length, "SHARE_GROUPS could not be read").toBeGreaterThan(0);
  return groups;
}

const indexes = (JSON.parse(readFileSync(join(ROOT, "firestore.indexes.json"), "utf8")) as { indexes: CompositeIndex[] }).indexes;

function allowKey(q: QueryShape): string[] {
  return [`${q.scope} ${q.group}`, `${q.scope} ${q.group} @ ${q.file}`];
}

describe("every Firestore query has an index (Enterprise edition)", () => {
  const files = SCANNED.flatMap((d) => sourceFiles(join(ROOT, d)));
  const prog = buildProgram(files.map((f) => ({ rel: relative(ROOT, f).replace(/\\/g, "/"), text: readFileSync(f, "utf8") })));
  const found = findQueries(prog);
  const usedExpanded = new Map<string, number[]>();
  const queries = found.flatMap((q) => {
    const expand = EXPANDED[q.file];
    if (expand && (q.group === null || q.unreadable)) {
      usedExpanded.set(q.file, [...(usedExpanded.get(q.file) ?? []), q.line]);
      return expand(q);
    }
    return [q];
  });
  // A query is judged when its collection is known. One with a field the
  // guard couldn't read still passes if a field it COULD read is served;
  // otherwise it is listed as unreadable rather than guessed at.
  const known = queries.filter((q) => q.group !== null);
  const unreadable = queries.filter((q) => q.group === null || (q.unreadable && !isServed(q, indexes)));
  const usedAllow = new Set<string>();
  const missing = known.filter((q) => {
    if (q.unreadable) return false;
    if (isServed(q, indexes)) return false;
    const hit = allowKey(q).find((k) => k in ALLOWED);
    if (hit) {
      usedAllow.add(hit);
      return false;
    }
    return true;
  });

  it("finds the app's queries (the guard is reading the code)", () => {
    // A floor, not a count: if a refactor broke the parser this drops to
    // nothing and every other test here would pass vacuously. 177 on Oct 5 2026.
    expect(known.length).toBeGreaterThan(150);
    // And it finds the ones that matter by name.
    const seen = new Set(known.map((q) => `${q.file} ${q.group}`));
    for (const s of [
      "src/components/WorkoutTrackerView.tsx clientMachineSettings",
      "src/hooks/useLiveSchedule.ts schedules",
      "functions/src/mindbody/staffResolver.ts trainers",
      "server/machine-trends-job.ts exerciseLogs",
      "src/features/renewals/usePipeline.ts clients",
    ]) {
      expect(seen, s).toContain(s);
    }
  });

  it("every query is served by an index of its scope", () => {
    const lines = missing.map((q) => `${describeShape(q)}\n    add: ${JSON.stringify(suggestedIndex(q, indexes))}`);
    const placeholder = lines.some((l) => l.includes(SECOND_FIELD_PLACEHOLDER))
      ? `\n${SECOND_FIELD_PLACEHOLDER}: the query names one field, and a composite needs two. Put a second field these documents carry in its place.`
      : "";
    expect(lines, `Unindexed queries. Add each index to firestore.indexes.json "indexes":\n${lines.join("\n")}${placeholder}`).toEqual([]);
  });

  it("each EXPANDED file holds exactly one query read at run time", () => {
    const many = [...usedExpanded].filter(([, at]) => at.length !== 1).map(([file, at]) => `${file}: lines ${at.join(", ")}`);
    expect(many, "Each EXPANDED entry reads ONE query. Name the new query's collection, or give it its own entry").toEqual([]);
  });

  it("the guard can read every query, or says how it reads it", () => {
    const lines = unreadable.map((q) => describeShape(q));
    expect(
      lines,
      `Queries whose collection or field the guard can't read. Name the collection with a literal or a ref helper, or add the file to EXPANDED with how to read it:\n${lines.join("\n")}`,
    ).toEqual([]);
  });

  it("every allowance is still needed", () => {
    const stale = [
      ...Object.keys(ALLOWED).filter((k) => !usedAllow.has(k)),
      ...Object.keys(EXPANDED).filter((k) => !usedExpanded.has(k)),
    ];
    expect(stale, "These allowances match no query any more: remove them").toEqual([]);
  });

  it("the queries Query Insights caught scanning on Oct 5 2026 have their own composite", () => {
    // Served by a prefix is not enough for these: the renewal count walked
    // every client of the studio (139 a call), and the webhook's staff
    // lookup every trainer (801 times a day).
    const has = (group: string, scope: Scope, ...fields: string[]) =>
      indexes.some((i) => i.collectionGroup === group && i.queryScope === scope && fields.every((f, n) => i.fields[n]?.fieldPath === f));
    expect(has("clients", "COLLECTION", "homeStudioId", "renewal.situation")).toBe(true);
    expect(has("trainers", "COLLECTION", "mindbodyStaffId")).toBe(true);
    expect(has("exerciseLogs", "COLLECTION", "createdAt")).toBe(true);
  });
});

describe("firestore.indexes.json", () => {
  it("holds composites only, no duplicates, no single-field overrides", () => {
    const raw = JSON.parse(readFileSync(join(ROOT, "firestore.indexes.json"), "utf8")) as {
      indexes: CompositeIndex[];
      fieldOverrides?: unknown[];
    };
    // Enterprise refuses field overrides: the deploy fails (KNOWN-TRAPS).
    expect(raw.fieldOverrides ?? []).toEqual([]);
    const keys = raw.indexes.map((i) => JSON.stringify([i.collectionGroup, i.queryScope, i.fields]));
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([]);
    for (const i of raw.indexes) {
      expect(["COLLECTION", "COLLECTION_GROUP"] as Scope[]).toContain(i.queryScope);
      expect(i.fields.length).toBeGreaterThanOrEqual(2);
      for (const f of i.fields) {
        expect(f.fieldPath).toMatch(/^[A-Za-z_][\w.]*$/);
        expect(Boolean(f.order) !== Boolean(f.arrayConfig), JSON.stringify(f)).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* The parser itself, on snippets whose answer is known.               */
/* ------------------------------------------------------------------ */

function shapes(text: string, rel = "src/x.ts", more: { rel: string; text: string }[] = []): QueryShape[] {
  return findQueries(buildProgram([{ rel, text }, ...more]));
}

const IDX = (group: string, scope: Scope, ...fields: string[]): CompositeIndex => ({
  collectionGroup: group,
  queryScope: scope,
  fields: fields.map((f) => (f.endsWith("[]") ? { fieldPath: f.slice(0, -2), arrayConfig: "CONTAINS" } : { fieldPath: f, order: "ASCENDING" })),
});

describe("the guard's parser", () => {
  it("reads a modular query with every equality, not just the first constraint", () => {
    const [q] = shapes(`
      const q = query(collection(db, "schedules"),
        where("startTime", ">=", a), where("startTime", "<", b), where("studioId", "==", s));
    `);
    expect(q).toMatchObject({ group: "schedules", scope: "COLLECTION", equality: ["studioId"], range: ["startTime"] });
    expect(isServed(q, [IDX("schedules", "COLLECTION", "studioId", "startTime")])).toBe(true);
    // The naive check (first constraint against first index field) failed this one.
    expect(isServed(q, [IDX("schedules", "COLLECTION", "startTime", "clientId")])).toBe(false);
  });

  it("resolves a ref helper defined in another file, with its parameters", () => {
    const helper = { rel: "src/m.ts", text: `export function instancesRef(studioId: string) { return collection(db, "studios", studioId, "taskInstances"); }` };
    const [q] = shapes(`onSnapshot(query(instancesRef(id), where("localDate", "==", day)), cb);`, "src/x.ts", [helper]);
    expect(q).toMatchObject({ group: "taskInstances", scope: "COLLECTION", equality: ["localDate"] });
    expect(isServed(q, [])).toBe(false);
    expect(isServed(q, [IDX("taskInstances", "COLLECTION", "localDate", "kind")])).toBe(true);
  });

  it("reads constraints built in an array, pushed and spread", () => {
    const [q] = shapes(`
      function load(studioId?: string) {
        const constraints = [where("startTime", ">=", a)];
        if (studioId) constraints.push(where("studioId", "==", studioId));
        return getDocs(query(collection(db, "schedules"), ...constraints, orderBy("startTime", "desc")));
      }
    `);
    expect(q.equality).toEqual(["studioId"]);
    expect(q.range).toEqual(["startTime"]);
    expect(q.orderBy).toEqual([{ field: "startTime", direction: "DESCENDING" }]);
  });

  it("reads an admin chain, a collection group and a string constant", () => {
    const qs = shapes(`
      const QUEUE = "notificationQueue";
      db.collection(QUEUE).where("status", "==", "queued").limit(20).get();
      firestore.collectionGroup("roster").where("shared", "==", true).get();
      db.collection(\`studios/\${id}/bookingMarks\`).where("day", ">=", since).get();
    `);
    expect(qs.map((q) => [q.group, q.scope])).toEqual([
      ["notificationQueue", "COLLECTION"],
      ["roster", "COLLECTION_GROUP"],
      ["bookingMarks", "COLLECTION"],
    ]);
    // A collection-scope index doesn't serve a collection-group query.
    expect(isServed(qs[1], [IDX("roster", "COLLECTION", "shared", "studioId")])).toBe(false);
    expect(isServed(qs[1], [IDX("roster", "COLLECTION_GROUP", "shared", "studioId")])).toBe(true);
  });

  it("reads an admin count aggregate and a modular getCountFromServer", () => {
    const qs = shapes(`
      db.collection("trainers").where("mindbodyStaffId", "==", id).limit(3).get();
      db.collection("sessions").where("createdAt", ">=", cutoff).count().get();
      getCountFromServer(query(collection(db, "clients"), where("homeStudioId", "==", s), where("renewal.situation", "==", "unknown")));
    `);
    expect(qs.map((q) => [q.group, q.equality, q.range])).toEqual([
      ["trainers", ["mindbodyStaffId"], []],
      ["sessions", [], ["createdAt"]],
      ["clients", ["homeStudioId", "renewal.situation"], []],
    ]);
  });

  it("reads a reassigned admin query once per link and merges the base", () => {
    const qs = shapes(`
      let q = db.collection("sessions").where("clientId", "in", ids);
      q = q.orderBy("date", "desc");
    `);
    expect(qs.at(-1)).toMatchObject({ group: "sessions", equality: ["clientId"], orderBy: [{ field: "date", direction: "DESCENDING" }] });
  });

  it("serves a range-only or order-only query from an index leading with that field", () => {
    const [q] = shapes(`getDocs(query(collection(db, "bug_reports"), orderBy("createdAt", "desc"), limit(100)));`);
    expect(q.equality).toEqual([]);
    expect(isServed(q, [IDX("bug_reports", "COLLECTION", "userId", "createdAt")])).toBe(false);
    expect(isServed(q, [IDX("bug_reports", "COLLECTION", "createdAt", "userId")])).toBe(true);
    // One field named: the suggestion still has two, the second a marked
    // placeholder, so pasting it can't fail the index file's own test.
    expect(suggestedIndex(q)).toEqual({
      collectionGroup: "bug_reports",
      queryScope: "COLLECTION",
      fields: [
        { fieldPath: "createdAt", order: "DESCENDING" },
        { fieldPath: SECOND_FIELD_PLACEHOLDER, order: "ASCENDING" },
      ],
    });
  });

  it("every suggestion has at least two fields, a real second one when the query has it", () => {
    const qs = shapes(`
      getDocs(query(collection(db, "tasks"), where("status", "==", "open")));
      getDocs(query(collection(db, "tasks"), where("status", "==", "open"), orderBy("dueOn")));
    `);
    for (const q of qs) expect(suggestedIndex(q).fields.length).toBeGreaterThanOrEqual(2);
    expect(suggestedIndex(qs[0]).fields[1].fieldPath).toBe(SECOND_FIELD_PLACEHOLDER);
    expect(suggestedIndex(qs[1]).fields.map((f) => f.fieldPath)).toEqual(["status", "dueOn"]);
  });

  it("says it can't read constraints passed in as a parameter, never drops the query", () => {
    const [q] = shapes(`function read(cs: QueryConstraint[]) { return getDocs(query(collection(db, "sessions"), ...cs)); }`);
    expect(q).toMatchObject({ group: "sessions", unreadable: true });
    expect(isServed(q, [])).toBe(false);
  });

  it("says it can't read constraints from a helper it can't find, but reads a renamed Firestore import", () => {
    const qs = shapes(`
      import { limit as fsLimit, where as w } from "firebase/firestore";
      import { studioFilter } from "some-library";
      getDocs(query(collection(db, "sessions"), studioFilter(s)));
      getDocs(query(collection(db, "sessions"), w("clientId", "==", c), fsLimit(5)));
    `);
    expect(qs).toHaveLength(2);
    expect(qs[0]).toMatchObject({ group: "sessions", unreadable: true });
    expect(qs[1]).toMatchObject({ group: "sessions", equality: ["clientId"], unreadable: false });
  });

  it("judges each branch of a conditional and each disjunct of or() on its own", () => {
    const qs = shapes(`
      getDocs(query(collection(db, "tasks"), mine ? where("ownerId", "==", u) : where("studioId", "==", s)));
      getDocs(query(collection(db, "tasks"), or(where("ownerId", "==", u), where("studioId", "==", s))));
      getDocs(query(collection(db, "tasks"), where("studioId", "==", s), or(where("ownerId", "==", u), where("helperId", "==", u))));
    `);
    const onlyOwner = [IDX("tasks", "COLLECTION", "ownerId", "dueOn")];
    const onlyStudio = [IDX("tasks", "COLLECTION", "studioId", "dueOn")];
    // Only one branch's field indexed: the other branch still scans.
    expect(isServed(qs[0], onlyOwner)).toBe(false);
    expect(isServed(qs[1], onlyOwner)).toBe(false);
    expect(isServed(qs[0], [...onlyOwner, ...onlyStudio])).toBe(true);
    expect(isServed(qs[1], [...onlyOwner, ...onlyStudio])).toBe(true);
    // The suggestion is for the branch that isn't served.
    expect(suggestedIndex(qs[0], onlyOwner).fields[0].fieldPath).toBe("studioId");
    // An or() under an equality every way shares is served by that equality.
    expect(qs[2].variants).toHaveLength(2);
    expect(isServed(qs[2], onlyStudio)).toBe(true);
  });

  it("a spread that adds no disjunct to or() is not a way of its own", () => {
    const [q] = shapes(`
      getDocs(query(collection(db, "tasks"), or(where("ownerId", "==", u), ...(flag ? [where("helperId", "==", u)] : []))));
    `);
    expect(q.variants?.map((v) => v.equality)).toEqual([["ownerId"], ["helperId"]]);
  });

  it("an array-contains query needs an index leading with that field as CONTAINS", () => {
    const [q] = shapes(`query(collection(db, "noteShares"), where("audienceIds", "array-contains", uid), orderBy("createdAt", "desc"));`);
    expect(isServed(q, [IDX("noteShares", "COLLECTION", "audienceIds", "createdAt")])).toBe(false);
    expect(isServed(q, [IDX("noteShares", "COLLECTION", "audienceIds[]", "createdAt")])).toBe(true);
  });

  it("treats a document-id lookup as a key read, and an unfiltered read as nothing to index", () => {
    const qs = shapes(`
      getDocs(query(collection(db, "clients"), where(documentId(), "in", ids)));
      onSnapshot(query(collection(db, "hub_announcements")), cb);
    `);
    expect(qs).toHaveLength(1);
    expect(qs[0].docIdOnly).toBe(true);
    expect(isServed(qs[0], [])).toBe(true);
  });

  it("says when it can't tell which collection a query reads", () => {
    const [q] = shapes(`function read(ref: CollectionReference) { return getDocs(query(ref, where("status", "==", "open"))); }`);
    expect(q.group).toBeNull();
    expect(q.equality).toEqual(["status"]);
  });

  it("marks a field chosen at run time unreadable, but keeps the fields it can read", () => {
    const [q] = shapes(`
      const byField = (field: "firstName" | "lastName") =>
        query(collection(db, "clients"), where("homeStudioId", "in", ids), where(field, ">=", cap));
    `);
    expect(q).toMatchObject({ group: "clients", equality: ["homeStudioId"], unreadable: true });
    expect(isServed(q, [IDX("clients", "COLLECTION", "homeStudioId", "firstName")])).toBe(true);
  });

  it("ignores array and string methods that only look like a chain", () => {
    expect(shapes(`const xs = items.filter((x) => x.ok).slice(0, 3); const y = list.where;`)).toEqual([]);
  });
});
