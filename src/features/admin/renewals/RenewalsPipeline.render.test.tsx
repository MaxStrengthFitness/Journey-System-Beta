// @vitest-environment jsdom
/**
 * OPERATIONS → RENEWALS → PIPELINE, mounted: Running low (AJ, Oct 6 2026:
 * "we need a way for operations to show how many clients are running out of
 * their sessions ... In total"). The count is the roster's, so a client the
 * pipeline's date window never returned is still counted; the list is behind
 * a tap; a roster still loading shows no number, and one that failed with
 * nothing held says "—", never 0.
 *
 * The pipeline's own reads are stubs here: an empty window, so every row
 * below comes from the roster.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-leader" } } }));
vi.mock("../../../lib/studio-time", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/studio-time")>()),
  studioTodayKey: () => "2026-10-06",
}));
const pipe = vi.hoisted(() => ({ clients: [] as unknown[] }));
vi.mock("../../renewals/usePipeline", () => ({
  usePipelineClients: () => ({ clients: pipe.clients, loading: false, error: null }),
  useCyclesFor: () => ({}),
  useMissingDataCount: () => 0,
  useMissingDataClients: () => null,
}));
vi.mock("../../inbody/useInBodyVariation", async () => {
  const { DEFAULT_INBODY_VARIATION } = await import("../../inbody/variation");
  return { useInBodyVariationLookup: () => () => DEFAULT_INBODY_VARIATION };
});
vi.mock("../journey/inactive-store", () => ({
  useInactiveMarks: () => ({ marks: new Map(), loading: false, failed: false }),
}));
vi.mock("../../studio-settings/useStudioSettings", () => ({
  useStudioSettings: () => ({ value: () => 90, loading: false, failed: false }),
}));

import { RenewalsPipeline } from "./RenewalsPipeline";
import { DEFAULT_RENEWAL_SETTINGS } from "../../renewals/settings";
import type { RosterStatus } from "../../../hooks/useStudioRoster";
import type { RenewalSnapshot } from "../../renewals/types";
import type { Client } from "../../../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const person = (id: string, first: string, renewal: RenewalSnapshot): Client =>
  ({ id, firstName: first, lastName: "Reyes", homeStudioId: "solon", renewal }) as Client;

const roster: Client[] = [
  // A quarter a week: runs out next May, far past the pipeline's three-month window.
  person("c1", "Nora", snap({ sessionsLeft: 8, sessionsOnHand: 8, pacePerWeek: 0.25, runOutDate: "2027-05-18", conversationDue: true })),
  person("c2", "Ivan", snap({ sessionsLeft: 3, sessionsOnHand: 3, runOutDate: "2026-10-17", conversationDue: true })),
  person("c3", "Lena", snap({ sessionsLeft: 40, sessionsOnHand: 40 })),
  person("c4", "Omar", snap({ sessionsLeft: 5, renewalOnBooks: { cycleKey: "n", packageKey: null, startsOn: "2026-11-01" } })),
];

// Something in a lane (Coming up), so the page shows its numbers rather than "nothing to plan".
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
  pipe.clients = [];
});

const tile = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>(".adm-tile")).find((t) => t.querySelector(".adm-tile__label")?.textContent === "Running low")!;

describe("RenewalsPipeline — Running low", () => {
  it("counts the roster at or under the studio's number, in total, and lists them behind a tap", async () => {
    const { host, onOpenBrief } = await mount();
    const t = tile(host);
    expect(t.querySelector(".adm-tile__value")?.textContent).toBe("2");
    expect(t.textContent).toContain("10 or fewer left, in total");
    expect(t.textContent).toContain("Tap to see who");
    expect(host.textContent).not.toContain("Running low · 2");

    await act(async () => (t as HTMLButtonElement).click());
    expect(host.textContent).toContain("Running low · 2");
    const rows = Array.from(host.querySelectorAll<HTMLElement>(".adm-row"));
    // Fewest first; the renewed client and the one with 40 left aren't there.
    expect(rows.map((r) => r.querySelector(".adm-row__name")?.textContent)).toEqual(["Ivan Reyes", "Nora Reyes"]);
    expect(rows[0].textContent).toContain("3 left · runs out around Oct 17");
    expect(rows[1].textContent).toContain("8 left · runs out around May 18, 2027");
    expect(rows[0].textContent).toContain("Start the conversation");

    await act(async () => rows[1].click());
    expect(onOpenBrief).toHaveBeenCalledWith(roster[0]);

    // The pipeline window was empty, yet the page isn't "nothing to plan".
    expect(host.textContent).not.toContain("No renewals to plan");
  });

  it("shows no number while the roster loads, and never a 0 off a failed, empty read", async () => {
    const loading = await mount({ rosterStatus: "loading" });
    expect(tile(loading.host).querySelector(".adm-skeleton")).not.toBeNull();
    expect(tile(loading.host).tagName).toBe("DIV");

    pipe.clients = [comingUp];
    const failed = await mount({ roster: [], rosterStatus: "error" });
    expect(tile(failed.host).querySelector(".adm-tile__value")?.textContent).toBe("—");
    expect(tile(failed.host).textContent).toContain("Couldn't read the client list");
  });

  it("says nobody is running low when nobody is, once tapped", async () => {
    pipe.clients = [comingUp];
    const { host } = await mount({ roster: [comingUp] });
    const t = tile(host);
    expect(t.querySelector(".adm-tile__value")?.textContent).toBe("0");
    await act(async () => (t as HTMLButtonElement).click());
    expect(host.textContent).toContain("Nobody is running low");
    expect(host.textContent).toContain("Nobody at Solon has 10 or fewer sessions left.");
  });
});
