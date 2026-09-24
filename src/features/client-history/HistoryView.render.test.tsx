// @vitest-environment jsdom
/**
 * The History tab, MOUNTED, for what it says about a client's absences and
 * her session numbers (Sep 24 2026, lib/history-claims.ts).
 *
 * FileMaker stays live through the migration, so a client in twice a week
 * can have weeks recorded only there. The tab used to open on "No visit in
 * 4 weeks" in crimson for her. Now:
 *   - a gap is a break only where Journey sees every session (`breakWindow`);
 *     a caller that passes none claims none;
 *   - with no such days yet, the break tiles become "In Journey since" and
 *     "Before Journey";
 *   - rows carry a number only through the session-number gate.
 *
 * HistoryView is drawn from plain props (no Firestore), so nothing is mocked.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HistoryView, type HistoryViewProps } from "./HistoryView";
import type { HistorySession } from "./model";
import type { PriorHistory } from "../../lib/prior-history";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const g = globalThis as unknown as Record<string, unknown>;
const stubs = ["ResizeObserver", "IntersectionObserver"].filter((k) => !(k in g));
beforeAll(() => {
  for (const k of stubs) {
    g[k] = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };
  }
});
afterAll(() => {
  for (const k of stubs) delete g[k];
});

const on = (date: string): HistorySession =>
  ({
    id: `s-${date}`,
    clientId: "c1",
    hostedAtStudioId: "solon",
    clientHomeStudioId: "solon",
    status: "Completed",
    date,
  }) as unknown as HistorySession;

/* Last Journey session Aug 24; "today" is Sep 24 - a month with nothing in Journey. */
const sessions = [on("2026-08-24"), on("2026-08-20"), on("2026-07-02"), on("2026-06-29"), on("2026-06-01")];
const TODAY = "2026-09-24";

let mounted: { root: Root; host: HTMLElement }[] = [];
async function mount(over: Partial<HistoryViewProps> = {}): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <HistoryView
          sessions={sessions}
          status="ready"
          hasMore={false}
          isFull
          onLoadAll={() => {}}
          trainers={[]}
          logsBySession={new Map()}
          onNeedLogs={() => {}}
          onOpenSessions={() => {}}
          today={TODAY}
          timeZone="America/New_York"
          {...over}
        />
      </StrictMode>,
    );
  });
  mounted.push({ root, host });
  return host;
}
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

const prior: PriorHistory = { sessions: 412, importedCount: 0, through: "2026-05-31", source: "filemaker" };

describe("the History tab and a client whose story predates Journey", () => {
  it("claims no break and no absence when Journey owns none of her timeline", async () => {
    const host = await mount();
    expect(host.querySelector(".hist-notice")).toBeNull();
    expect(host.textContent).not.toMatch(/No visit in/);
    expect(host.textContent).not.toContain("Breaks of 2+ weeks");
    expect(host.textContent).not.toContain("Longest break");
    expect(host.querySelector(".hist-stat--alert")).toBeNull();
    // What IS known, instead.
    expect(host.textContent).toContain("In Journey since");
    expect(host.textContent).toContain("Jun 2026");
    expect(host.textContent).toContain("Before Journey");
    expect(host.textContent).toContain("not recorded yet");
  });

  it("says how many sessions came before Journey when somebody recorded them", async () => {
    // A cutover still to come: Journey owns no day yet, but the prior record is known.
    const host = await mount({ prior: { ...prior, through: "2026-12-31" }, breakWindow: { complete: false, from: "2027-01-01" } });
    expect(host.textContent).toContain("Before Journey");
    expect(host.textContent).toContain("412");
    expect(host.textContent).toContain("FileMaker");
    expect(host.querySelector(".hist-notice")).toBeNull();
  });

  it("claims only what falls inside the days Journey owns", async () => {
    // Her studio moved onto Journey on Aug 1: the June gap may be FileMaker's,
    // the month since Aug 24 is real.
    const host = await mount({ breakWindow: { complete: false, from: "2026-08-01" } });
    const notice = host.querySelector(".hist-notice");
    expect(notice?.textContent).toContain("No visit in");
    expect(host.textContent).toContain("Breaks of 2+ weeks");
    expect(host.textContent).toContain("since Aug 2026");
  });

  it("still tells a client whose whole story is here that she has been away", async () => {
    const host = await mount({ breakWindow: { complete: true, from: null } });
    expect(host.querySelector(".hist-notice")?.textContent).toContain("No visit in");
    expect(host.textContent).toContain("Longest break");
    // Jul 2 -> Aug 20, the longest - closed, so it is not flagged as ongoing.
    expect(host.textContent).toMatch(/7\s*weeks/);
  });
});

describe("the History list's session numbers", () => {
  const numbers = (host: HTMLElement) => Array.from(host.querySelectorAll(".hist-num")).map((n) => n.textContent);

  it("numbers nothing until her total is known", async () => {
    const host = await mount({ view: "list", onViewChange: () => {} });
    expect(numbers(host)).toEqual([]);
  });

  it("numbers on top of the sessions before Journey once it is", async () => {
    const host = await mount({ view: "list", onViewChange: () => {}, quoteSessionNumbers: true, prior });
    expect(numbers(host)).toEqual(["S417", "S416", "S415", "S414", "S413"]);
  });
});
