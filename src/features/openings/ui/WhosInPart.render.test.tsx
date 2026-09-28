// @vitest-environment jsdom
/**
 * MY STUDIO → OPENINGS → WHO'S USUALLY IN (Openings round), mounted:
 * everyone who works at the studio, in name order, each with their AGREED
 * week read only (AJ: "schedules are open to all"), from the one read of the
 * studio's standing weeks. Nothing ranked or counted; a proposal nobody has
 * agreed stays theirs; the leader's note stays the leader's; a regular's
 * name only after a tap; a failed read is never "no agreed week".
 *
 * Today is Monday Nov 9 2026, noon Eastern.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Trainer } from "../../../types";
import type { StandingWeekDoc } from "../../standing-week/week";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  weeks: { docs: [] as unknown[], loading: false, error: null as string | null },
  reads: [] as string[],
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-pat" } }, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    ...real,
    doc: ref,
    collection: ref,
    getDoc: (r: { path: string }) => {
      fake.reads.push(r.path);
      return Promise.resolve({ exists: () => false, data: () => undefined, metadata: { fromCache: false } });
    },
    onSnapshot: (r: { path: string }, _o: unknown, next: (s: unknown) => void) => {
      fake.reads.push(r.path);
      const t = setTimeout(() => next({ docs: [], metadata: { fromCache: false } }), 0);
      return () => clearTimeout(t);
    },
    getDocs: () => Promise.reject(new Error("Who's usually in reads no bookings")),
  };
});
vi.mock("../../standing-week/useStandingWeeks", () => ({ useStandingWeeks: () => fake.weeks }));

import { forgetPersonalMemory } from "../../sign-out/memory";
import { OpeningsSection } from "./OpeningsSection";
import { rememberOpeningsPart } from "./part-memory";
import { KIM, PAT, PAT_WEEK, SAM, SAM_TUESDAYS, Shell, WESTLAKE, person } from "./test-shell";

const samWeek = (): StandingWeekDoc => ({
  ...SAM_TUESDAYS,
  final: { ...SAM_TUESDAYS.final!, regulars: [{ id: "r1", weekday: 2, start: "10:00", clientId: "c-judy", clientName: "Judy Smith" }], note: "For my leader only" },
  finalBy: { id: "uid-lee", name: "Lee Leader" },
  away: [
    { id: "a0", from: "2026-11-02", to: "2026-11-04" },
    { id: "a1", from: "2026-11-23", to: "2026-11-27", note: "Thanksgiving" },
  ],
});
const kimProposal = (): StandingWeekDoc => ({
  id: "uid-kim",
  studioId: "westlake",
  trainerUid: "uid-kim",
  trainerId: "t-kim",
  trainerName: "Kim Ray",
  proposed: { hours: [{ weekday: 3, from: "06:00", to: "09:00" }], regulars: [] },
  final: null,
  away: [],
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-11-09T12:00:00-05:00") });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  forgetPersonalMemory();
  fake.weeks = { docs: [samWeek(), PAT_WEEK, kimProposal()], loading: false, error: null };
  fake.reads.length = 0;
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

async function mount(trainers: Trainer[] = [SAM, PAT, KIM], viewer: Trainer = PAT) {
  rememberOpeningsPart("who");
  await act(async () => {
    root.render(
      <StrictMode>
        <Shell>
          <OpeningsSection studio={WESTLAKE} authTrainer={viewer} trainers={trainers} />
        </Shell>
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

const people = () => [...host.querySelectorAll("[data-testid='person-week']")];
const card = (name: string) => people().find((p) => p.querySelector(".op-person__name")?.textContent === name)!;

describe("who's usually in", () => {
  it("lists everyone who works at the studio, in name order, and nobody else", async () => {
    const elsewhere = person("t-far", "Aaron Away", { primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] });
    await mount([SAM, PAT, KIM, elsewhere]);
    expect(people().map((p) => p.querySelector(".op-person__name")?.textContent)).toEqual(["Kim Ray", "Pat Moss", "Sam Lee"]);
  });

  it("shows each agreed week read only, with no count beside anyone", async () => {
    await mount();
    const sam = card("Sam Lee");
    expect(sam.textContent).toContain("Agreed by Lee Leader on Sep 1.");
    const days = [...sam.querySelectorAll(".stw-read__day")].map((d) => d.textContent);
    expect(days).toEqual(["Monday7:00 AM – 10:00 AM", "Tuesday10:00 AM – 12:00 PM10:00 AM · a regular"]);
    expect(card("Pat Moss").textContent).toContain("Monday7:00 AM – 9:00 AM");
    // Nothing to edit, and no tally of days or regulars.
    expect(sam.querySelectorAll("input, textarea, select")).toHaveLength(0);
    expect(host.textContent).not.toMatch(/\d+ days? ·|\d+ regulars?/);
  });

  it("keeps a proposal nobody has agreed, and the leader's note, out of it", async () => {
    await mount();
    expect(card("Kim Ray").textContent).toContain("No agreed week yet.");
    expect(card("Kim Ray").textContent).not.toContain("Wednesday");
    expect(host.textContent).not.toContain("For my leader only");
  });

  it("shows the days away that haven't ended", async () => {
    await mount();
    const away = card("Sam Lee").querySelector("[aria-label=\"Sam's dates away\"]");
    expect(away?.textContent).toContain("Mon, Nov 23 – Fri, Nov 27");
    expect(away?.textContent).toContain("Thanksgiving");
    expect(away?.textContent).not.toContain("Mon, Nov 2 –");
    expect(away?.querySelectorAll("li")).toHaveLength(1);
  });

  it("names a regular only after a tap", async () => {
    await mount();
    expect(host.textContent).not.toContain("Judy");
    const show = card("Sam Lee").querySelector<HTMLButtonElement>(".op-btn")!;
    expect(show.textContent).toBe("Show the regulars' names");
    await act(async () => show.click());
    expect(card("Sam Lee").textContent).toContain("10:00 AM · Judy Smith");
    expect(show.getAttribute("aria-expanded")).toBe("true");
    // Pat has no regulars: nothing to show.
    expect(card("Pat Moss").querySelector(".op-btn")).toBeNull();
  });

  it("reads no bookings: only the standing weeks the section already holds", async () => {
    await mount();
    expect(fake.reads.every((p) => p === "studios/westlake/watch/openings" || p === "studios/westlake/openingsMarks")).toBe(true);
  });

  it("never shows a failed read as 'no agreed week'", async () => {
    fake.weeks = { docs: [], loading: false, error: "Couldn't load the standing weeks. Check the connection." };
    await mount();
    expect(host.textContent).toContain("Couldn't load the standing weeks. Check the connection.");
    expect(host.textContent).not.toContain("No agreed week yet.");
    expect(people()).toHaveLength(0);
  });

  it("says it is reading while the weeks are still coming", async () => {
    fake.weeks = { docs: [], loading: true, error: null };
    await mount();
    expect(host.textContent).toContain("Reading the standing weeks…");
  });
});
