import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FORD'S NEW WRITES (client codex, phase 11), against a fake Firestore that
 * records every write:
 *   - Follow up next time: a new detail carries the question with who and
 *     when, or three nulls — never undefined; an edit writes the three
 *     fields only when it is sent them; "Asked it" nulls all three;
 *   - In one line: a first line is the whole document at the fixed id,
 *     archived, no pillar, stamped with the studio and the Auth uid; a
 *     rewrite is an update of the words and who wrote them — never the
 *     studio or the client, which the rule holds immutable; an empty box
 *     clears an existing line and writes nothing when there is none; a
 *     failure answers "failed", and a refused FIRST line "blocked" (a line
 *     from the client's earlier studio is in the way, and trying again
 *     cannot help).
 */

const fake = vi.hoisted(() => ({
  writes: [] as { op: string; path: string; data: Record<string, unknown> }[],
  fail: null as null | { code: string },
}));

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-ann" } }, functions: {} }));
vi.mock("../../lib/firestore-errors", () => ({
  OperationType: { GET: "get", CREATE: "create", UPDATE: "update", DELETE: "delete", LIST: "list", WRITE: "write" },
  handleFirestoreError: vi.fn(),
}));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  const record = (op: string) => async (r: { path: string }, data: Record<string, unknown>) => {
    if (fake.fail) throw fake.fail;
    fake.writes.push({ op, path: r.path, data });
    return { id: "new-1" };
  };
  return {
    ...real,
    collection: ref,
    doc: ref,
    query: (target: { path: string }) => ({ path: target.path }),
    where: () => ({}),
    limit: () => ({}),
    getDocs: async () => ({ docs: [], size: 0, empty: true }),
    getDoc: async () => ({ exists: () => true, data: () => ({ homeStudioId: "s1" }) }),
    addDoc: record("add"),
    setDoc: record("set"),
    updateDoc: record("update"),
    serverTimestamp: () => ({ __server: true }),
  };
});

import { Timestamp } from "firebase/firestore";
import { clearFollowUp, createFordEntry, saveFordOneLine, updateFordEntry } from "./ford-write";
import { FORD_ONE_LINE_ID } from "./one-line";
import type { FordEntry } from "./types";

const AUTHOR = { id: "uid-ann", initials: "AT", fullName: "Ann Trainer" };

const writesTo = (path: string) => fake.writes.filter((w) => w.path === path);

beforeEach(() => {
  fake.writes.length = 0;
  fake.fail = null;
});

describe("Follow up next time", () => {
  it("a new detail with a question stamps who set it and when", async () => {
    await createFordEntry("c1", "s1", AUTHOR, { pillar: "recreation", body: "New boots", followUp: "  How were the boots?  " });
    const add = writesTo("clients/c1/ford").find((w) => w.op === "add")!;
    expect(add.data.followUp).toBe("How were the boots?");
    expect(add.data.followUpBy).toBe("Ann Trainer");
    expect(add.data.followUpAt).toBeInstanceOf(Timestamp);
  });

  it("a new detail without one writes three nulls, never undefined", async () => {
    await createFordEntry("c1", "s1", AUTHOR, { pillar: "family", body: "Wife is Karen." });
    const add = writesTo("clients/c1/ford").find((w) => w.op === "add")!;
    expect(add.data).toMatchObject({ followUp: null, followUpAt: null, followUpBy: null });
    expect(Object.values(add.data).some((v) => v === undefined)).toBe(false);
    await createFordEntry("c1", "s1", AUTHOR, { pillar: "family", body: "x", followUp: "   " });
    expect(fake.writes.filter((w) => w.op === "add")[1].data.followUp).toBeNull();
  });

  it("an edit writes the follow-up fields only when it is sent them", async () => {
    await updateFordEntry("c1", "f1", { body: "New boots, broken in" });
    const plain = writesTo("clients/c1/ford/f1")[0].data;
    expect("followUp" in plain || "followUpAt" in plain || "followUpBy" in plain).toBe(false);

    const at = new Date(2027, 2, 15, 9);
    await updateFordEntry("c1", "f1", { followUp: "How were the boots?", followUpAt: at, followUpBy: "Ann Trainer" });
    const stamped = writesTo("clients/c1/ford/f1")[1].data;
    expect(stamped.followUp).toBe("How were the boots?");
    expect((stamped.followUpAt as Timestamp).toDate().getTime()).toBe(at.getTime());
    expect(stamped.followUpBy).toBe("Ann Trainer");
  });

  it("'Asked it' nulls all three and touches nothing else about the detail", async () => {
    expect(await clearFollowUp("c1", "f1")).toBe(true);
    const data = writesTo("clients/c1/ford/f1")[0].data;
    expect(data).toEqual({ followUp: null, followUpAt: null, followUpBy: null, updatedAt: { __server: true } });
  });

  it("'Asked it' does not refresh the rollup — a follow-up is not in it", async () => {
    await clearFollowUp("c1", "f1");
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.writes.map((w) => w.path)).toEqual(["clients/c1/ford/f1"]);
  });

  it("answers false when the clear was refused", async () => {
    fake.fail = { code: "permission-denied" };
    expect(await clearFollowUp("c1", "f1")).toBe(false);
  });
});

describe("In one line", () => {
  const existing = { id: FORD_ONE_LINE_ID, body: "Old line", studioId: "s1", clientId: "c1" } as FordEntry;

  it("a first line is the whole document at the fixed id: archived, no pillar, the studio and the Auth uid", async () => {
    expect(await saveFordOneLine("c1", "s1", AUTHOR, "  Retired hygienist,\npickleball regular ", null)).toBe("saved");
    expect(fake.writes).toHaveLength(1);
    const w = fake.writes[0];
    expect(w).toMatchObject({ op: "set", path: "clients/c1/ford/one-line" });
    expect(w.data).toMatchObject({
      kind: "one-line",
      clientId: "c1",
      studioId: "s1",
      pillar: null,
      body: "Retired hygienist, pickleball regular",
      isArchived: true,
      opportunity: null,
      followUp: null,
      authorId: "uid-ann",
      authorName: "Ann Trainer",
      authorInitials: "AT",
      origin: "profile",
    });
    expect(Object.values(w.data).some((v) => v === undefined)).toBe(false);
  });

  it("a rewrite is an update of the words and who wrote them — never the studio or the client", async () => {
    expect(await saveFordOneLine("c1", "s1", AUTHOR, "Walking the Camino in May", existing)).toBe("saved");
    const w = fake.writes[0];
    expect(w).toMatchObject({ op: "update", path: "clients/c1/ford/one-line" });
    expect(w.data).toMatchObject({ body: "Walking the Camino in May", authorId: "uid-ann", authorName: "Ann Trainer" });
    for (const key of ["studioId", "clientId", "kind", "isArchived", "pillar", "createdAt"]) {
      expect(key in w.data, key).toBe(false);
    }
  });

  it("an empty box clears a line that is there, and writes nothing when there is none", async () => {
    expect(await saveFordOneLine("c1", "s1", AUTHOR, "   ", existing)).toBe("saved");
    expect(fake.writes[0]).toMatchObject({ op: "update", data: { body: "" } });
    fake.writes.length = 0;
    expect(await saveFordOneLine("c1", "s1", AUTHOR, "", null)).toBe("saved");
    expect(fake.writes).toEqual([]);
  });

  it("caps the line at 120 characters", async () => {
    await saveFordOneLine("c1", "s1", AUTHOR, "a".repeat(300), null);
    expect(fake.writes[0].data.body).toBe("a".repeat(120));
  });

  it("answers 'failed' when it could not save — a refused rewrite, the network, nobody signed in, or no studio", async () => {
    fake.fail = { code: "permission-denied" };
    expect(await saveFordOneLine("c1", "s1", AUTHOR, "A line", existing)).toBe("failed");
    fake.fail = { code: "unavailable" };
    expect(await saveFordOneLine("c1", "s1", AUTHOR, "A line", null)).toBe("failed");
    expect(await saveFordOneLine("c1", "s1", AUTHOR, "A line", existing)).toBe("failed");
    fake.fail = null;
    expect(await saveFordOneLine("c1", "s1", { ...AUTHOR, id: "" }, "A line", null)).toBe("failed");
    expect(await saveFordOneLine("c1", "", AUTHOR, "A line", null)).toBe("failed");
    expect(fake.writes).toEqual([]);
  });

  it("answers 'blocked' when a FIRST line is refused: a line from an earlier studio is in the way", async () => {
    // A client who moved home studio: her old line sits at the fixed id,
    // stamped with the old studio. This studio's listener filters it out, so
    // the page shows no line, and the rules refuse the setDoc (an update that
    // would change studioId) every time. Retrying can never work.
    fake.fail = { code: "permission-denied" };
    expect(await saveFordOneLine("c1", "s2", AUTHOR, "A line", null)).toBe("blocked");
    fake.fail = { code: "PERMISSION_DENIED" };
    expect(await saveFordOneLine("c1", "s2", AUTHOR, "A line", null)).toBe("blocked");
    expect(fake.writes).toEqual([]);
  });

  it("does not refresh the rollup — the line is not a detail", async () => {
    await saveFordOneLine("c1", "s1", AUTHOR, "A line", null);
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.writes.some((w) => w.path === "clients/c1")).toBe(false);
  });
});
