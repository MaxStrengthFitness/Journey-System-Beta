/**
 * The profile's read of a client's routines (the whole-branch review of the
 * first-session round, Oct 9 2026). The profile is too large to mount in a
 * test, so this reads its source, in the style of
 * ClientProfileView.history.test.ts.
 *
 *   - LIVE: one listener on `routines where clientId ==`, never a one-off
 *     `getDocs`. Every plan action rebuilds the plan from what the profile
 *     holds and writes it whole: with a copy read once when the profile
 *     opened, a Can't do marked on the floor, or the Wrap-up's ticks, landed
 *     since were dropped by the next Move up, without a word.
 *   - An EMPTY answer from this iPad's cache is not "no routine": it stays
 *     "loading" (the plan's doors wait for "ready"), so Keep, Save Routine A
 *     or Start B never makes a second Routine A or B offline. Metadata
 *     changes are listened to, so the server confirming an empty list is
 *     heard.
 *   - A refusal needs no second read: the listener brings the server's
 *     answer back.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "ClientProfileView.tsx"), "utf8");
/** Comments stripped, so prose about a read is not mistaken for one. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the profile's routines", () => {
  it("are one live listener on the client's routines, with metadata changes", () => {
    expect(code).toMatch(
      /onSnapshot\(\s*query\(collection\(db, "routines"\), where\("clientId", "==", clientId\)\),\s*\{ includeMetadataChanges: true \}/,
    );
    // Never read once and held: no getDocs of the routines anywhere in the profile.
    expect(code).not.toMatch(/getDocs\(\s*(?:query\(\s*)?collection\(db, "routines"\)/);
    expect(code).not.toMatch(/getDocs\(routinesQuery\)|getDocs\(qRoutines\)/);
  });

  it("an empty answer from the cache stays loading, never ready", () => {
    expect(code).toMatch(/const trusted = !\(snap\.empty && snap\.metadata\?\.fromCache\);/);
    expect(code).toMatch(/setRoutinesStatus\(trusted \? "ready" : "loading"\);/);
  });

  it("asks for no second read after a refused plan write", () => {
    expect(code).not.toMatch(/routinesReadNonce/);
    expect(code).not.toMatch(/onRefused:/);
  });
});
