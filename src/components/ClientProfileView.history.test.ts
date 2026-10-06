/**
 * The profile's read of a client's sessions, as the machine menu is handed
 * it (machine menu review, Oct 2026). The profile is too large to mount in a
 * test, so this reads its source, in the style of
 * ClientProfileView.discard.test.ts and ClientProfileView.tabs.test.ts.
 *
 *   - An answer only this iPad's cache gave (getDocs offline answers from the
 *     cache instead of failing) is "cache-only", never "ready": the first
 *     page, its sets, a later page and its sets all look at `fromCache`, and
 *     an empty later page from the cache is not the end of the record. The
 *     menu then draws what was read with its cache line and never claims a
 *     first time, a start wall or a start from it.
 *   - Retrying the read asks once: the read's own clearing of the ask is not
 *     a second ask (on the Journey tab it read the whole page twice).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "ClientProfileView.tsx"), "utf8");
const between = (from: string, to: string) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  expect(start, from).toBeGreaterThan(-1);
  expect(end, to).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe("a read only this iPad's cache answered", () => {
  it("can be recorded as cache-only", () => {
    expect(source).toMatch(/useState<ClientAnswer<"ready" \| "cache-only" \| "failed">/);
  });

  it("is looked for on the first page, both when it is empty and when it isn't, and on its sets", () => {
    const first = between("const fetchInitialSessions = async", "fetchInitialSessions();");
    expect(first).toMatch(/sessionSnap\.metadata\?\.fromCache/);
    expect(first).toMatch(/value: sessionsCached \? "cache-only" : "ready"/);
    expect(first).toMatch(/value: sessionsCached \|\| logsCached \? "cache-only" : "ready"/);
    expect(first).not.toMatch(/value: "ready" \}/);
    const logs = between("const fetchLogsForSessions = async", "return { logs: fetchedLogs, fromCache };");
    expect(logs).toMatch(/snap\.metadata\?\.fromCache/);
  });

  it("never ends the record on an empty older page the cache gave", () => {
    const more = between("const handleLoadMoreHistory = async", "} finally {");
    expect(more).toMatch(/if \(pageCached\) return false;/);
    expect(more.indexOf("if (pageCached) return false;")).toBeLessThan(more.indexOf("setHasMoreSessions(false)"));
    expect(more).toMatch(/if \(pageCached \|\| moreLogsCached\) setHistoryRead\(\{ clientId, value: "cache-only" \}\)/);
  });

  it("reaches the menu as cache-only", () => {
    const state = between("const profileHistoryState", "const ensureHistory");
    expect(state).toMatch(/read === "ready" \|\| read === "cache-only"\) return read;/);
  });
});

describe("retrying the read", () => {
  it("skips the run where the read clears its own ask, so the page is read once", () => {
    const effect = between("const justCleared = lastHistoryWanted.current !== null && historyWanted === null;", "const fetchInitialSessions");
    expect(effect).toMatch(/lastHistoryWanted\.current = historyWanted;/);
    expect(effect).toMatch(/if \(justCleared \|\| !clientId \|\| hasQuotaError\) return;/);
  });
});

/*
 * The speed round (Oct 5 2026; R12): the page is read once per client and
 * again only when her record changed, and its sets go out side by side.
 * These hold the effect's shape, so reverting it fails a test.
 */
describe("reading the page once, and again only on a change", () => {
  const deps = () => {
    const m = source.match(/fetchInitialSessions\(\);[\s\S]*?\}, \[([^\]]*)\]\);/);
    expect(m, "the fetch effect's dependency list").not.toBeNull();
    return m![1].split(",").map((d) => d.trim());
  };

  it("does not depend on the open tab, only on whether it draws the page and on a change", () => {
    expect(deps()).not.toContain("activeTab");
    expect(deps()).toEqual(expect.arrayContaining(["clientId", "tabDrawsHistory", "historyChanges", "inProgressWatchFailed"]));
    expect(deps()).not.toContain("historyRead");
  });

  it("sends a page's set reads all at once, never one after another", () => {
    const logs = between("const fetchLogsForSessions = async", "return { logs: fetchedLogs, fromCache };");
    expect(logs).toMatch(/await Promise\.all\(/);
    expect(logs).not.toMatch(/for \([^)]*\)\s*\{[^}]*await /);
  });

  it("drops a superseded answer after every wait", () => {
    const first = between("const fetchInitialSessions = async", "fetchInitialSessions();");
    const awaits = first.match(/= await /g) ?? [];
    const guards = first.match(/if \(!current\(\)\) return;/g) ?? [];
    expect(awaits.length).toBeGreaterThanOrEqual(2);
    expect(guards.length).toBeGreaterThanOrEqual(awaits.length);
  });

  it("merges an older page's sets by id, never by appending", () => {
    const more = between("const handleLoadMoreHistory = async", "} finally {");
    expect(more).toMatch(/setAllLogs\(\(prev\) => mergeHistoryLogs\(/);
    expect(more).not.toMatch(/setAllLogs\(\(prev\) => \[\.\.\.prev/);
  });

  it("reads again on every return when the In-Progress listener failed", () => {
    expect(source).toMatch(/watchFailed: inProgressWatchFailed/);
  });
});
