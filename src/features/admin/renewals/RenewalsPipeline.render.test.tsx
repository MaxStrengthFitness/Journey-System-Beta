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
  useCyclesFor: () => reads.cycles,
  useCyclesRead: () => ({ cycles: reads.cycles, loading: reads.cyclesLoading, failed: reads.cyclesFailed }),
  useMissingDataCount: () => 0,
  useMissingDataClients: () => null,
}));
const saved = vi.hoisted(() => ({ plans: [] as unknown[] }));
vi.mock("../../renewals/useRenewalCycle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../renewals/useRenewalCycle")>()),
  saveRenewalPlan: async (p: unknown) => {
    saved.plans.push(p);
  },
}));
vi.mock("../../inbody/useInBodyVariation", async () => {
  const { DEFAULT_INBODY_VARIATION } = await import("../../inbody/variation");
  return { useInBodyVariationLookup: () => () => DEFAULT_INBODY_VARIATION };
});
const reads = vi.hoisted(() => ({
  marks: new Map<string, { day: string }>(),
  marksLoading: false,
  cycles: {} as Record<string, unknown>,
  cyclesFailed: false,
  cyclesLoading: false,
}));
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
import type { Client, Trainer } from "../../../types";

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

// A trainer who works at Solon: anyone who works here may set a plan.
const jen = { id: "t-jen", fullName: "Jen Park", role: "Trainer", primaryHomeStudioId: "solon" } as unknown as Trainer;

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(props: { roster?: Client[]; rosterStatus?: RosterStatus; authTrainer?: Trainer | null; planSettingsReady?: boolean } = {}) {
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
          trainers={[jen]}
          authTrainer={props.authTrainer === undefined ? jen : props.authTrainer}
          planSettingsReady={props.planSettingsReady}
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
  reads.cycles = {};
  reads.cyclesFailed = false;
  reads.cyclesLoading = false;
  saved.plans = [];
});

const tile = (host: HTMLElement, label: string) =>
  Array.from(host.querySelectorAll<HTMLElement>(".adm-tile")).find((t) => t.querySelector(".adm-tile__label")?.textContent === label)!;
const tileValue = (host: HTMLElement, label: string) => tile(host, label).querySelector(".adm-tile__value")?.textContent;
const panel = (host: HTMLElement, title: string) =>
  Array.from(host.querySelectorAll<HTMLElement>(".adm-panel")).find((p) => p.querySelector(".adm-panel__title")?.textContent?.startsWith(`${title} · `)) ?? null;
// Running low's rows are the kit's; a lane's rows are the dashboard row (Oct 7 2026).
const names = (p: HTMLElement | null) => Array.from(p?.querySelectorAll<HTMLElement>(".adm-row__name, .rr__name") ?? []).map((n) => n.textContent);

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
    await act(async () => talk.querySelectorAll<HTMLElement>(".rr__open")[1].click());
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

/* ------------------------------------------------------------------ *
 * The renewals dashboard (Oct 7 2026): each lane's row is the dashboard
 * row, and its plan is a picker that fits the contract's auto-renew answer.
 * ------------------------------------------------------------------ */

// Strongsville's way: the contract doesn't renew by itself. Version 3.
const manual = person(
  "s1",
  "Sasha",
  snap({
    version: 3,
    cycleKey: "7001",
    packageKey: "committed",
    packageLabel: "Committed · 12 months",
    paymentMode: "monthly",
    autoRenews: false,
    chargeDate: "2026-12-01",
    chargeDateSource: "mindbody",
    commitmentEnd: "2026-12-01",
    commitmentEndSource: "mindbody",
    sessionsLeft: 9,
    sessionsOnHand: 9,
    conversationDue: true,
    focusDate: "2026-11-20",
    runOutDate: "2026-11-20",
    primaryTrainerId: "t-jen",
    ledger: { carriedIn: 4, thisContract: 5, toCome: 0, extra: 0, total: 9, source: "mindbody", asOf: "2026-10-05" },
    projection: { endsOn: "2026-12-01", endsOnSource: "mindbody", booked: 2, bookedThrough: "2026-10-15", paceWeeks: 6.7, pacePerWeek: 2, leftAtEnd: 0, leftAtEndLow: 0, leftAtEndHigh: 0, runOutDate: "2026-11-20" },
    rate: { perSession: 54, payment: 432, source: "mindbody", packageRate: 60, special: true },
  } as Partial<RenewalSnapshot>),
);

// A franchise contract that renews by itself and will bank sessions.
const autoRenewing = person(
  "b2",
  "Bea",
  snap({
    version: 3,
    cycleKey: "7002",
    packageKey: "committed",
    packageLabel: "Committed · 12 months",
    paymentMode: "monthly",
    autoRenews: true,
    situation: "will-bank",
    chargeWarning: true,
    chargeDate: "2026-10-28",
    chargeDateSource: "mindbody",
    focusDate: "2026-10-28",
    sessionsLeft: 30,
    bankedAtCharge: 24,
  } as Partial<RenewalSnapshot>),
);

const rowOf = (host: HTMLElement, name: string) =>
  Array.from(host.querySelectorAll<HTMLElement>(".rr")).find((r) => r.querySelector(".rr__name")?.textContent === name)!;
const optionsOf = (sel: HTMLSelectElement) => Array.from(sel.options).map((o) => o.textContent);

async function choose(sel: HTMLSelectElement, value: string) {
  await act(async () => {
    sel.value = value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function type(el: HTMLTextAreaElement, value: string) {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("RenewalsPipeline — the dashboard row", () => {
  it("says the client, their trainer, the package and rate, the end, what's left and what will be", async () => {
    const { host, onOpenBrief } = await mount({ roster: [manual] });
    const row = rowOf(host, "Sasha Reyes");
    const text = row.textContent ?? "";
    expect(text).toContain("Jen Park");
    expect(text).toContain("Committed · 12 months · at $54 a session (special)");
    expect(text).toContain("Ends Dec 1");
    expect(text).toContain("9 left: 4 rolled over · 5 this contract");
    expect(text).toContain("Runs out around Nov 20, 2 weeks before it ends");
    expect(text).toContain("Nobody has talked to them yet");
    // The working is on the (i), not printed on the row.
    expect(text).not.toContain("then 2× a week");
    await act(async () => row.querySelector<HTMLButtonElement>(".rr__info")!.click());
    expect(row.querySelector(".rr__why")?.textContent).toContain("At the end: 9 left, 2 booked, then 2× a week for 7 weeks.");
    await act(async () => row.querySelector<HTMLButtonElement>(".rr__open")!.click());
    expect(onOpenBrief).toHaveBeenCalledWith(manual);
  });

  it("offers a studio without auto-renew the manual plan, and saves it with the package and note", async () => {
    const { host } = await mount({ roster: [manual] });
    const row = rowOf(host, "Sasha Reyes");
    const sel = row.querySelector<HTMLSelectElement>('select[aria-label="Renewal plan for Sasha Reyes"]')!;
    expect(optionsOf(sel)).toEqual([
      "Set the plan…",
      "Same package",
      "Upgrading",
      "Downgrading",
      "Pay as you go",
      "Not renewing",
      "Not decided yet",
    ]);
    // Nothing is written by the select alone.
    await choose(sel, "upgrade");
    expect(saved.plans).toEqual([]);
    const pkg = row.querySelector<HTMLSelectElement>('select[aria-label="Package Sasha Reyes is renewing onto"]')!;
    expect(pkg.value).toBe("transformed");
    await type(row.querySelector<HTMLTextAreaElement>("textarea")!, "Wants the 18-month rate");
    const save = Array.from(row.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Save plan")!;
    await act(async () => save.click());
    expect(saved.plans).toHaveLength(1);
    expect(saved.plans[0]).toMatchObject({
      studioId: "solon",
      cycleKey: "7001",
      clientId: "s1",
      clientName: "Sasha Reyes",
      authorName: "Jen Park",
      draft: { choice: "upgrade", packageKey: "transformed", note: "Wants the 18-month rate" },
    });
    // The editor closes once it's saved.
    expect(row.querySelector("textarea")).toBeNull();
  });

  it("puts the plan back on Cancel, and writes nothing", async () => {
    const { host } = await mount({ roster: [manual] });
    const row = rowOf(host, "Sasha Reyes");
    const sel = row.querySelector<HTMLSelectElement>("select")!;
    await choose(sel, "not-renewing");
    const cancel = Array.from(row.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Cancel")!;
    await act(async () => cancel.click());
    expect(sel.value).toBe("");
    expect(saved.plans).toEqual([]);
  });

  it("offers a contract that renews by itself letting it renew or pausing billing", async () => {
    const { host } = await mount({ roster: [autoRenewing] });
    const sel = rowOf(host, "Bea Reyes").querySelector<HTMLSelectElement>("select")!;
    expect(optionsOf(sel)).toEqual([
      "Set the plan…",
      "Let it renew",
      "Pause billing",
      "Not renewing",
      "Not decided yet",
    ]);
    expect(rowOf(host, "Bea Reyes").textContent).toContain("Auto-renews Oct 28");
    // The label is short so a closed select shows it whole; the line under it says it all.
    await choose(sel, "pause-billing");
    expect(rowOf(host, "Bea Reyes").querySelector(".rr-plan__sentence")?.textContent).toBe("Pause billing in Mindbody until sessions run low");
    await choose(sel, "not-renewing");
    expect(rowOf(host, "Bea Reyes").querySelector(".rr-plan__sentence")).toBeNull();
  });

  it("shows the plan that was set, who set it and when, and the next step it sets", async () => {
    reads.cycles = {
      "7001": {
        clientId: "s1",
        cycleKey: "7001",
        latestLeaning: "leaning-yes",
        latestConcerns: [],
        needsLeader: false,
        lastTouchAt: { toDate: () => new Date("2026-10-03T15:00:00Z") },
        lastTouchByName: "Jen Park",
        plan: { choice: "renew-same", packageKey: "committed", note: "Signing Friday", byUid: "u", byName: "Jen Park", at: { toDate: () => new Date("2026-10-06T15:00:00Z") } },
      },
    };
    const { host } = await mount({ roster: [manual] });
    const row = rowOf(host, "Sasha Reyes");
    expect(row.querySelector<HTMLSelectElement>("select")!.value).toBe("renew-same");
    expect(row.querySelector(".rr-plan__sentence")?.textContent).toMatch(/^Renewing — same package \(.+\) · Jen, Oct 6$/);
    expect(row.textContent).toContain("Signing Friday");
    expect(row.textContent).toContain("Talked Oct 3 · Jen");
    expect(row.querySelector(".rr__next")?.textContent).toBe("Renewing — the new package shows here once it's in Mindbody");
  });

  it("says 'Couldn't check' when the conversations couldn't be read, never 'nobody'", async () => {
    reads.cyclesFailed = true;
    const { host } = await mount({ roster: [manual] });
    const row = rowOf(host, "Sasha Reyes");
    expect(row.textContent).toContain("Couldn't check");
    expect(row.textContent).not.toContain("Nobody has talked to them yet");
    // No plan is offered over one this screen couldn't read: a save would
    // replace it unseen.
    expect(row.querySelector("select")).toBeNull();
    expect(row.querySelector(".rr-plan__sentence")?.textContent).toBe("Couldn't check");
  });

  it("offers no plan while the conversations are still being read", async () => {
    reads.cyclesLoading = true;
    const { host } = await mount({ roster: [manual] });
    const row = rowOf(host, "Sasha Reyes");
    expect(row.querySelector("select")).toBeNull();
    expect(row.querySelector(".rr-plan__sentence")?.textContent).toBe("Checking…");
  });

  it("has the plan filters match nobody, never everybody, when the conversations couldn't be read", async () => {
    reads.cyclesFailed = true;
    const { host } = await mount({ roster: [...roster, manual] });
    const tab = (label: string) => Array.from(host.querySelectorAll<HTMLButtonElement>(".adm-seg")).find((b) => b.textContent === label)!;
    await act(async () => tab("Plan: not decided").click());
    expect(names(panel(host, "Talk now"))).toEqual([]);
    await act(async () => tab("Not renewing").click());
    expect(names(panel(host, "Talk now"))).toEqual([]);
  });

  it("shows the plan without the picker to someone who doesn't work here, or before the studio's settings answered", async () => {
    const outsider = await mount({ roster: [manual], authTrainer: null });
    expect(rowOf(outsider.host, "Sasha Reyes").querySelector("select")).toBeNull();
    expect(rowOf(outsider.host, "Sasha Reyes").textContent).toContain("No plan yet");
    const waiting = await mount({ roster: [manual], planSettingsReady: false });
    expect(rowOf(waiting.host, "Sasha Reyes").querySelector("select")).toBeNull();
  });

  it("filters to the plans not decided and to those not renewing", async () => {
    reads.cycles = {
      "7001": { clientId: "s1", cycleKey: "7001", latestConcerns: [], needsLeader: false, plan: { choice: "not-renewing", byUid: "u", byName: "Jen", at: null } },
    };
    const { host } = await mount({ roster: [...roster, manual] });
    const tab = (label: string) => Array.from(host.querySelectorAll<HTMLButtonElement>(".adm-seg")).find((b) => b.textContent === label)!;
    await act(async () => tab("Not renewing").click());
    expect(names(panel(host, "Talk now"))).toEqual(["Sasha Reyes"]);
    await act(async () => tab("Plan: not decided").click());
    expect(names(panel(host, "Talk now"))).toEqual(["Ivan Reyes", "Nora Reyes"]);
  });
});
