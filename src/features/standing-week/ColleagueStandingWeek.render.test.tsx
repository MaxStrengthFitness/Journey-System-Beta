// @vitest-environment jsdom
/**
 * A COLLEAGUE'S STANDING WEEK, READ ONLY (voice review follow-up, Sep 27
 * 2026), mounted: the agreed week and the days away on a colleague's
 * profile, nothing editable, "No agreed week yet" otherwise. Then WHERE the
 * trainer page puts it: on a colleague's page at a studio you both work at,
 * never on your own (that is My standing week) and never where you can't
 * read the weeks.
 *
 * Today is Monday Sep 28 2026, noon Eastern.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, Studio, Trainer } from "../../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  listeners: [] as { path: string; next: (snap: unknown) => void; fail: (err: unknown) => void }[],
  active: null as null | { activeStudioId: string; activeStudio: { name: string; timezone?: string } },
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "t-pat" } }, functions: {} }));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  Timestamp: { fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms), now: () => new Date() },
  getDocs: async () => ({ docs: [], size: 0, empty: true, forEach: () => {} }),
  getDoc: async () => ({ exists: () => false, data: () => undefined }),
  onSnapshot: (...args: unknown[]) => {
    const ref = args[0] as { path?: string };
    const fns = args.filter((a): a is (x: unknown) => void => typeof a === "function");
    fake.listeners.push({ path: ref?.path ?? "", next: fns[0], fail: fns[1] });
    return () => {};
  },
  setDoc: async () => {},
  updateDoc: async () => {},
  serverTimestamp: () => ({ __server: true }),
}));
// The trainer page's other cards have their own tests and their own reads.
vi.mock("../trainer-profile/KaizenRoster", () => ({ KaizenRoster: () => null }));
vi.mock("../trainer-profile/EditTrainerModal", () => ({ EditTrainerModal: () => null }));
vi.mock("../renewals/MyRenewals", () => ({ MyRenewals: () => null }));
vi.mock("../../contexts/ActiveStudioContext", () => ({ useOptionalActiveStudio: () => fake.active }));
vi.mock("./MyStandingWeek", () => ({ MyStandingWeek: () => <section data-testid="my-standing-week" /> }));

import { ColleagueStandingWeek } from "./ColleagueStandingWeek";
import { TrainerProfileView } from "../trainer-profile/TrainerProfileView";

const TZ = "America/New_York";
const person = (id: string, fullName: string, over: Record<string, unknown> = {}) =>
  ({ id, fullName, initials: "", role: "LifeTransformer", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"], activeGuestStudioIds: [], ...over }) as unknown as Trainer;
const sam = person("t-sam", "Sam Lee");
const pat = person("t-pat", "Pat Doe");
const agreed = {
  hours: [
    { weekday: 1, from: "07:00", to: "13:00" },
    { weekday: 3, from: "12:00", to: "18:00" },
  ],
  regulars: [{ id: "r1", weekday: 1, start: "08:00", clientId: "c-judy", clientName: "Judy Smith" }],
  note: "For my leader only",
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-09-28T12:00:00-04:00") });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  fake.listeners.length = 0;
  fake.active = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function mountCard() {
  await act(async () => {
    root.render(
      <StrictMode>
        <ColleagueStandingWeek trainer={sam} studioId="solon" studioName="Solon" tz={TZ} />
      </StrictMode>,
    );
  });
}
async function deliver(data: Record<string, unknown> | null) {
  await act(async () => {
    for (const l of fake.listeners) l.next({ id: "t-sam", exists: () => data !== null, data: () => data ?? undefined });
  });
}

describe("a colleague's standing week", () => {
  it("reads their week at the studio, keyed by their uid", async () => {
    await mountCard();
    expect(fake.listeners[0].path).toBe("studios/solon/standingWeeks/t-sam");
    expect(host.textContent).toContain("Reading Sam's week…");
  });

  it("shows the agreed week and the days away that haven't ended, with nothing to edit", async () => {
    await mountCard();
    await deliver({
      trainerId: "t-sam",
      trainerName: "Sam Lee",
      proposed: { ...agreed, regulars: [] },
      final: agreed,
      finalAt: new Date("2026-09-20T14:00:00Z"),
      finalBy: { id: "uid-ann", name: "Ann Park" },
      away: [
        { id: "a0", from: "2026-09-14", to: "2026-09-18" },
        { id: "a1", from: "2026-10-05", to: "2026-10-09", note: "Vacation" },
      ],
    });
    const week = host.querySelector("[aria-label=\"Sam's agreed week\"]");
    expect([...week!.querySelectorAll(".stw-read__name")].map((n) => n.textContent)).toEqual(["Monday", "Wednesday"]);
    expect(week!.textContent).toContain("7:00 AM – 1:00 PM");
    expect(week!.textContent).toContain("8:00 AM · Judy Smith");
    // The agreed week, not the proposal waiting on a leader; the leader's note stays theirs.
    expect(host.textContent).toContain("Agreed by Ann Park on Sep 20.");
    expect(host.textContent).not.toContain("For my leader only");
    const away = host.querySelector("[aria-label=\"Sam's dates away\"]");
    expect(away?.textContent).toContain("Mon, Oct 5 – Fri, Oct 9");
    expect(away?.textContent).toContain("Vacation");
    expect(away?.textContent).not.toContain("Sep 14");
    expect(host.querySelectorAll("button, input, select, textarea")).toHaveLength(0);
  });

  it("says there is no agreed week yet, and still shows the days away", async () => {
    await mountCard();
    await deliver({ trainerId: "t-sam", trainerName: "Sam Lee", proposed: agreed, final: null, away: [{ id: "a1", from: "2026-09-28", to: "2026-09-28" }] });
    expect(host.textContent).toContain("No agreed week yet.");
    expect(host.querySelector("[aria-label=\"Sam's dates away\"]")?.textContent).toContain("Mon, Sep 28");
    await deliver(null);
    expect(host.textContent).toContain("No agreed week yet.");
  });

  it("never shows a failed read as no week", async () => {
    await mountCard();
    await act(async () => {
      for (const l of fake.listeners) l.fail({ code: "permission-denied" });
    });
    expect(host.textContent).toContain("the new database rules may not be deployed yet");
    expect(host.textContent).not.toContain("No agreed week yet.");
  });
});

describe("where the trainer page puts it", () => {
  const studios = [{ id: "solon", name: "Solon", timezone: TZ }] as unknown as Studio[];
  const render = async (subject: Trainer, viewer: Trainer, studioId = "solon") => {
    fake.active = { activeStudioId: studioId, activeStudio: { name: studioId === "solon" ? "Solon" : "Westlake", timezone: TZ } };
    await act(async () => {
      root.render(
        <TrainerProfileView trainer={subject} authTrainer={viewer} schedules={[]} sessions={[]} clients={[] as Client[]} studios={studios} onSelectClient={() => {}} setView={() => {}} />,
      );
    });
  };
  const card = () => host.querySelector("[data-testid='colleague-standing-week']");

  it("is on a colleague's page at a studio you both work at", async () => {
    await render(sam, pat);
    expect(card()).not.toBeNull();
    expect(host.querySelector("[data-testid='my-standing-week']")).toBeNull();
  });

  it("is never on your own page, where My standing week is", async () => {
    await render(sam, sam);
    expect(card()).toBeNull();
    expect(host.querySelector("[data-testid='my-standing-week']")).not.toBeNull();
  });

  it("is not there when the colleague doesn't work at the studio, or you can't read its weeks", async () => {
    await render(person("t-far", "Far Away", { primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake", "solon-x"] }), pat);
    expect(card()).toBeNull();
    // A peer from another studio (they share Westlake) viewing at Westlake, where only Sam works.
    const westlakeSam = person("t-sam", "Sam Lee", { accessibleStudioIds: ["solon", "westlake"] });
    const westlakeOnly = person("t-wes", "Wes Only", { primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"] });
    await render(westlakeSam, westlakeOnly, "solon");
    expect(card()).toBeNull();
  });

  it("is there for a franchise owner, who reads every studio's weeks", async () => {
    await render(sam, person("t-own", "Olive Owner", { role: "FranchiseOwner", primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"] }));
    expect(card()).not.toBeNull();
  });
});
