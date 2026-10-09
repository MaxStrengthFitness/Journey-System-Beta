import { describe, expect, it } from "vitest";
import { assignRefusedWords, assignSessionPatch, assignSetPatch, resendSetFields, setsToAssign } from "./assign";

const STAMP = { __server: true };

describe("assignSessionPatch: the client's fields a client Start writes", () => {
  it("gives the session the client, its home, its name and its number, and says it is no longer open", () => {
    expect(
      assignSessionPatch({
        client: { id: "c-sam", firstName: "Sam", lastName: "Reed", homeStudioId: "solon", sessionCount: 11, mindbodyClientId: "100000123" },
        hostedAtStudioId: "solon",
        stamp: STAMP,
      }),
    ).toEqual({
      clientId: "c-sam",
      isUnassigned: false,
      mindbodyClientId: "100000123",
      clientName: "Sam Reed",
      homeStudioId: "solon",
      clientHomeStudioId: "solon",
      isCrossTrain: false,
      sessionNumber: 12,
      lastHeartbeatAt: STAMP,
    });
  });

  it("is a cross-train visit when the client belongs to another studio, as Start says it", () => {
    const p = assignSessionPatch({ client: { id: "c", homeStudioId: "westlake" }, hostedAtStudioId: "solon", stamp: STAMP });
    expect(p.isCrossTrain).toBe(true);
    expect(p.clientHomeStudioId).toBe("westlake");
  });

  it("a brand-new client is session 1, with no Mindbody id and nothing undefined", () => {
    const p = assignSessionPatch({ client: { id: "c-new", firstName: "Ana", lastName: "" }, hostedAtStudioId: "solon", stamp: STAMP });
    expect(p.sessionNumber).toBe(1);
    expect(p.mindbodyClientId).toBeNull();
    expect(p.clientName).toBe("Ana");
    // No home on file: not called a cross-train visit, and the home is "" as Start writes it.
    expect(p.isCrossTrain).toBe(false);
    expect(p.homeStudioId).toBe("");
    expect(Object.values(p).some((v) => v === undefined)).toBe(false);
  });

  it("falls back to the older Mindbody id field", () => {
    expect(assignSessionPatch({ client: { id: "c", mindbodyId: "77" }, hostedAtStudioId: "solon", stamp: STAMP }).mindbodyClientId).toBe("77");
  });
});

describe("setsToAssign: every set the session holds, once", () => {
  it("takes the screen's sets, the ones still on the typing timer and the iPad's copy, each once", () => {
    const out = setsToAssign("s1", "c-sam", [
      [{ id: "s1_m-a", sessionId: "s1", machineId: "m-a", clientId: null }],
      [{ id: "s1_m-b", sessionId: "s1", machineId: "m-b" }],
      [
        { id: "s1_m-a", sessionId: "s1", machineId: "m-a" },
        { id: "s1_m-t_Left", sessionId: "s1", machineId: "m-t" },
      ],
    ]);
    expect(out.sets).toEqual([
      { id: "s1_m-a", machineId: "m-a" },
      { id: "s1_m-b", machineId: "m-b" },
      { id: "s1_m-t_Left", machineId: "m-t" },
    ]);
    expect(out.withClient).toEqual([]);
  });

  it("leaves out another session's sets and a set with no machine", () => {
    const out = setsToAssign("s1", "c-sam", [[
      { id: "s0_m-a", sessionId: "s0", machineId: "m-a" },
      { id: "s1_x", sessionId: "s1", machineId: "" },
    ]]);
    expect(out.sets).toEqual([]);
  });

  it("a set that already has another client is left alone and counted apart (the rules never move it)", () => {
    const out = setsToAssign("s1", "c-sam", [
      [{ id: "s1_m-a", sessionId: "s1", machineId: "m-a" }],
      [{ id: "s1_m-a", sessionId: "s1", machineId: "m-a", clientId: "c-x" }],
    ]);
    expect(out.sets).toEqual([]);
    expect(out.withClient).toEqual(["s1_m-a"]);
  });

  it("a set already marked with THIS client is named again: the screen marks its sets the moment the client is chosen", () => {
    const out = setsToAssign("s1", "c-sam", [
      [{ id: "s1_m-a", sessionId: "s1", machineId: "m-a", clientId: "c-sam" }],
      [{ id: "s1_m-a", sessionId: "s1", machineId: "m-a", clientId: null }],
    ]);
    expect(out.sets).toEqual([{ id: "s1_m-a", machineId: "m-a" }]);
    expect(out.withClient).toEqual([]);
  });
});

describe("resendSetFields: a set sent again after a refused assign", () => {
  it("keeps the set's numbers and leaves out its client and its first write's fields", () => {
    expect(
      resendSetFields({
        id: "s1_m-a",
        sessionId: "s1",
        machineId: "m-a",
        clientId: "c-sam",
        weight: "100",
        reps: "11",
        side: undefined,
        machineSettings: { seat: "4" },
        createdAt: { seconds: 1 },
        homeStudioId: "solon",
        clientHomeStudioId: "solon",
        studioId: "solon",
      }),
    ).toEqual({ sessionId: "s1", machineId: "m-a", weight: "100", reps: "11", machineSettings: { seat: "4" }, studioId: "solon" });
  });
});

describe("assignSetPatch", () => {
  it("names the set's session, machine and client, and never its numbers", () => {
    expect(assignSetPatch("s1", { machineId: "m-a" }, { id: "c-sam", homeStudioId: "solon" })).toEqual({
      sessionId: "s1",
      machineId: "m-a",
      clientId: "c-sam",
      homeStudioId: "solon",
      clientHomeStudioId: "solon",
    });
  });
});

describe("assignRefusedWords", () => {
  it("says the session is still open and what to do", () => {
    expect(assignRefusedWords("Sam")).toBe(
      "The session didn't go onto Sam's record, so it is still open. Check the connection, then press Who's this? again.",
    );
    expect(assignRefusedWords("")).toContain("the client's record");
  });
});
