// @vitest-environment jsdom
/**
 * OPERATIONS → RENEWALS → PIPELINE, mounted over a roster.
 *
 * Running low (AJ, Oct 6 2026: "we need a way for operations to show how
 * many clients are running out of their sessions ... In total"): the count
 * is the roster's, the list is behind a tap.
 *
 * The lanes (the same day, on AJ's yes to the brief-back): they read the
 * roster too, through lanes.ts, so a client too slow for the old date window
 * reaches Talk now, a client a leader marked Inactive and a visitor don't,
 * Away keeps its old window, and the Talk now and Before the charge tiles
 * say what Operations → Today counts. Nothing is drawn while the roster, the
 * marks or the Inactive line are still reading, and a roster that failed
 * with nothing held says "—", never 0.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-leader" } } }));
vi.mock("../../../lib/studio-time", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/studio-time")>()),
  studioTodayKey: () => "2026-10-06",
}));
vi.mock("../../renewals/usePipeline", () => ({
  useCyclesFor: () => ({}),
  useMissingDataCount: () => 0,
  useMissingDataClients: () => null,
}));
vi.mock("../../inbody/useInBodyVariation", async () => {
  const { DEFAULT_INBODY_VARIATION } = await import("../../inbody/variation");
  return { useInBodyVariationLookup: () => () => DEFAULT_INBODY_VARIATION };
});
const reads = vi.hoisted(() => ({ marks: new Map<string, { day: string }>(), marksLoading: false }));
vi.mock("../journey/inactive-store", () => ({
  useInactiveMarks: () => ({ marks: reads.marks, loading: reads.marksLoading, failed: false }),
}));
vi.mock("../../studio-settings/useStudioSettings", () => ({
  useStudioSettings: () => ({ value: () => 90, loading: false, failed: false }),
}));

import { RenewalsPipeline } from "./RenewalsPipeline";
import { renewalsQuestion } from "../overview/questions";
import { DEFAULT_RENEWAL_SETTINGS } from "../../renewals/settings";
import type { RosterStatus } from "../../../hooks/useStudioRoster";
import type { RenewalSnapshot } from "../../renewals/types";
import type { Client } from "../../../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TODAY = "2026-10-06";

function snap(over: Partial<RenewalSnapshot>): RenewalSnapshot {
  return {
    version: 2,
    cycleKey: null,
    renewalOnBooks: null,
    situation: "on-track",
    sessionsLeft: 20,
    sessionsLeftSource: "mindbody",
    sessionsOnHand: 20,
    paymentsLeft: 0,
    paymentMode: "prepaid",
    pacePerWeek: 2,
    runOutDate: null,
    lastVisitDate: "2026-10-02",
    nextBookingDate: "2026-10-08",
    conversationDue: false,
    chargeWarning: false,
    focusDate: null,
    flags: [],
    proof: { weeksAttended: null, weeksObserved: null, machinesImproved: null, machinesTracked: null, bestGain: null, inbody: null },
    ...over,
  } as RenewalSnapshot;
}

const person = (id: string, first: string, renewal: RenewalSnapshot, over: Partial<Client> = {}): Client =>
  ({ id, firstName: first, lastName: "Reyes", homeStudioId: "solon", renewal, ...over }) as Client;

const roster: Client[] = [
  // A quarter a week: runs out next May, far past the old three-month window.
  person("c1", "Nora", snap({ sessionsLeft: 8, sessionsOnHand: 8, pacePerWeek: 0.25, runOutDate: "2027-05-18", focusDate: "2027-05-18", conversationDue: true })),
  person("c2", "Ivan", snap({ sessionsLeft: 3, sessionsOnHand: 3, runOutDate: "2026-10-17", focusDate: "2026-10-17", conversationDue: true })),
  person("c3", "Lena", snap({ sessionsLeft: 40, sessionsOnHand: 40 })),
  person("c4", "Omar", snap({ sessionsLeft: 5, renewalOnBooks: { cycleKey: "n", packageKey: null, startsOn: "2026-11-01" } })),
];

// Something in a lane (Coming up), and not running low.
const comingUp = person("c3", "Lena", snap({ sessionsLeft: 40, sessionsOnHand: 40, focusDate: "2026-11-20", runOutDate: "2026-11-20" }));

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(props: { roster?: Client[]; rosterStatus?: RosterStatus } = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onOpenBrief = vi.fn();
  await act(async () => {
    root.render(
      <StrictMode>
        <RenewalsPipeline
          studioId="solon"
          studioName="Solon"
          settings={DEFAULT_RENEWAL_SETTINGS}
          onOpenBrief={onOpenBrief}
          roster={props.roster ?? roster}
          rosterStatus={props.rosterStatus ?? "ready"}
        />
      </StrictMode>,
    );
  });
  mounted.push({ root, host });
  return { host, onOpenBrief };
}

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
  reads.marks = new Map();
  reads.marksLoading = false;
});

const tile = (host: HTMLElement, label: string) =>
  Array.from(host.querySelectorAll<HTMLElement>(".adm-tile")).find((t) => t.querySelector(".adm-tile__label")?.textContent === label)!;
const tileValue = (host: HTMLElement, label: string) => tile(host, label).querySelector(".adm-tile__value")?.textContent;
const panel = (host: HTMLElement, title: string) =>
  Array.from(host.querySelectorAll<HTMLElement>(".adm-panel")).find((p) => p.querySelector(".adm-panel__title")?.textContent?.startsWith(`${title} · `)) ?? null;
const names = (p: HTMLElement | null) => Array.from(p?.querySelectorAll<HTMLElement>(".adm-row__name") ?? []).map((n) => n.textContent);

describe("RenewalsPipeline — Running low", () => {
  it("counts the roster at or under the studio's number, in total, and lists them behind a tap", async () => {
    const { host, onOpenBrief } = await mount();
    const t = tile(host, "Running low");
    expect(tileValue(host, "Running low")).toBe("2");
    expect(t.textContent).toContain("10 or fewer left, in total");
    expect(t.textContent).toContain("Tap to see who");
    expect(panel(host, "Running low")).toBeNull();

    await act(async () => (t as HTMLButtonElement).click());
    const low = panel(host, "Running low")!;
    expect(low.querySelector(".adm-panel__title")?.textContent).toBe("Running low · 2");
    const rows = Array.from(low.querySelectorAll<HTMLElement>(".adm-row"));
    // Fewest first; the renewed client and the one with 40 left aren't there.
    expect(names(low)).toEqual(["Ivan Reyes", "Nora Reyes"]);
    expect(rows[0].textContent).toContain("3 left · runs out around Oct 17");
    expect(rows[1].textContent).toContain("8 left · runs out around May 18, 2027");
    expect(rows[0].textContent).toContain("Start the conversation");

    await act(async () => rows[1].click());
    expect(onOpenBrief).toHaveBeenCalledWith(roster[0]);
    expect(host.textContent).not.toContain("No renewals to plan");
  });

  it("says nobody is running low when nobody is, once tapped", async () => {
    const { host } = await mount({ roster: [comingUp] });
    const t = tile(host, "Running low");
    expect(tileValue(host, "Running low")).toBe("0");
    await act(async () => (t as HTMLButtonElement).click());
    expect(host.textContent).toContain("Nobody is running low");
    expect(host.textContent).toContain("Nobody at Solon has 10 or fewer sessions left.");
  });
});

describe("RenewalsPipeline — the lanes, from the roster (Oct 6 2026)", () => {
  it("puts a client too slow for the old date window in Talk now, and opens the Brief from it", async () => {
    const { host, onOpenBrief } = await mount();
    expect(tileValue(host, "Talk now")).toBe("2");
    const talk = panel(host, "Talk now")!;
    // Soonest first: Ivan runs out on Oct 17, Nora next May.
    expect(names(talk)).toEqual(["Ivan Reyes", "Nora Reyes"]);
    await act(async () => talk.querySelectorAll<HTMLElement>(".adm-row")[1].click());
    expect(onOpenBrief).toHaveBeenCalledWith(roster[0]);
  });

  it("leaves out a client a leader marked Inactive, one past the Inactive line, and a visitor", async () => {
    const quiet = { nextBookingDate: null, lastVisitDate: "2026-09-01" };
    reads.marks = new Map([["m1", { day: "2026-09-20" }]]);
    const { host } = await mount({
      roster: [
        ...roster,
        person("m1", "Marta", snap({ ...quiet, sessionsLeft: 4, focusDate: "2026-10-30", conversationDue: true })),
        person("g1", "Gus", snap({ nextBookingDate: null, lastVisitDate: "2026-06-01", sessionsLeft: 6, focusDate: "2026-10-25", conversationDue: true })),
        person("v1", "Vera", snap({ sessionsLeft: 2, focusDate: "2026-10-12", conversationDue: true }), { homeStudioId: "westlake" }),
      ],
    });
    expect(names(panel(host, "Talk now"))).toEqual(["Ivan Reyes", "Nora Reyes"]);
    expect(tileValue(host, "Talk now")).toBe("2");
    // Running low leaves the same three out.
    expect(tileValue(host, "Running low")).toBe("2");
  });

  it("keeps Away as it was: a package ending past the horizon isn't on it", async () => {
    const { host } = await mount({
      roster: [
        comingUp,
        person("a1", "Ada", snap({ situation: "away", awayUntil: "2027-01-10", focusDate: "2026-12-01" })),
        person("a2", "Abe", snap({ situation: "away", awayUntil: "2027-04-01", focusDate: "2027-05-01" })),
      ],
    });
    expect(panel(host, "Away")?.querySelector(".adm-panel__title")?.textContent).toBe("Away · 1");
  });

  it("says what Operations → Today counts, over the same roster and marks", async () => {
    reads.marks = new Map([["m1", { day: "2026-09-20" }]]);
    const list = [
      ...roster,
      person("m1", "Marta", snap({ nextBookingDate: null, lastVisitDate: "2026-09-01", sessionsLeft: 4, focusDate: "2026-10-30", conversationDue: true })),
      person("b1", "Bo", snap({ situation: "will-bank", chargeWarning: true, chargeDate: "2026-10-20", focusDate: "2026-10-20", sessionsLeft: 30 } as Partial<RenewalSnapshot>)),
      person("v1", "Vera", snap({ sessionsLeft: 2, focusDate: "2026-10-12", conversationDue: true }), { homeStudioId: "westlake" }),
    ];
    const { host } = await mount({ roster: list });
    const today = renewalsQuestion(list, {}, { studioId: "solon", settings: DEFAULT_RENEWAL_SETTINGS, today: TODAY, inactiveMarks: reads.marks, inactiveDays: 90 });
    expect(tileValue(host, "Talk now")).toBe(String(today.counts["talk-now"]));
    expect(tileValue(host, "Before the charge")).toBe(String(today.counts["before-charge"]));
    expect(today.counts["talk-now"]).toBe(2);
    expect(today.counts["before-charge"]).toBe(1);
  });

  it("draws no lane while the roster or the marks are still reading", async () => {
    const loading = await mount({ rosterStatus: "loading" });
    expect(tile(loading.host, "Running low").querySelector(".adm-skeleton")).not.toBeNull();
    expect(tile(loading.host, "Running low").tagName).toBe("DIV");
    expect(tile(loading.host, "Talk now").querySelector(".adm-skeleton")).not.toBeNull();
    expect(panel(loading.host, "Talk now")).toBeNull();
    expect(loading.host.textContent).not.toContain("Nothing in this lane");

    reads.marksLoading = true;
    const marks = await mount();
    expect(tile(marks.host, "Talk now").querySelector(".adm-skeleton")).not.toBeNull();
    expect(panel(marks.host, "Talk now")).toBeNull();
  });

  it("says the client list couldn't be read, never a 0, when the roster failed with nothing held", async () => {
    const { host } = await mount({ roster: [], rosterStatus: "error" });
    expect(host.querySelector(".adm-notice")?.textContent).toContain("Couldn't read the client list");
    for (const label of ["Before the charge", "Talk now", "Coming up", "Running low"]) expect(tileValue(host, label)).toBe("—");
    expect(tile(host, "Running low").tagName).toBe("DIV");
    expect(panel(host, "Talk now")).toBeNull();
    expect(host.textContent).not.toContain("No renewals to plan");
  });

  it("keeps working off the roster it holds when a later read failed", async () => {
    const { host } = await mount({ rosterStatus: "error" });
    expect(host.querySelector(".adm-notice")).toBeNull();
    expect(tileValue(host, "Talk now")).toBe("2");
  });
});
