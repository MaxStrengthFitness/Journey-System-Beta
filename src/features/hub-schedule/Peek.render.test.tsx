// @vitest-environment jsdom
/**
 * THE PEEK, MOUNTED (calm Hub round, Sep 28 2026): a tap on a card says every
 * mark in words and holds Open profile and Start session; a tap outside, the
 * close button or Escape closes it.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client } from "../../types";
import { loggedSessions } from "../../lib/booking-state";
import { buildDirectoryRows } from "../client-directory/row";
import { NOW, STUDIOS, TODAY, eastern, makeBooking, makeClient, makeContext } from "../client-directory/fixtures";
import { momentsToday } from "../hub-opportunities/moments-today";
import { Peek } from "./Peek";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const client = makeClient({
  id: "rosie",
  firstName: "Rosie",
  lastName: "Cotton",
  sessionCount: 44,
  clientsNumberOfVisitsAtSite: 2,
  isLiabilityReleased: false,
  priorityNote: "Pacemaker: no chest-compression machines",
} as Partial<Client> & { id: string });
const booking = makeBooking({ clientId: "rosie", start: eastern(TODAY, "16:00"), trainerId: "t-me", trainerName: "Sam Rivera" });

function entry() {
  const rows = buildDirectoryRows([client], makeContext({ schedules: [booking] }));
  return momentsToday({
    day: TODAY,
    today: TODAY,
    now: NOW,
    tz: "America/New_York",
    schedules: [booking],
    clientsById: new Map([["rosie", client]]),
    rowsById: new Map(rows.map((r) => [r.id, r])),
    studios: STUDIOS,
    logged: loggedSessions([]),
    criticalFor: () => [],
    myIds: ["t-me"],
    myName: "Sam Rivera",
  })[0];
}

function mount() {
  const calls = { close: 0, profile: [] as string[], start: [] as string[] };
  const card = document.createElement("button");
  document.body.appendChild(card);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <StrictMode>
        <Peek
          entry={entry()}
          sessionNumber={45}
          anchor={card}
          onClose={() => (calls.close += 1)}
          onOpenProfile={(id) => calls.profile.push(id)}
          onStartSession={(id) => calls.start.push(id)}
        />
      </StrictMode>,
    ),
  );
  return { el: host, calls, card };
}

const button = (el: HTMLElement, text: string) => [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes(text));

describe("the peek", () => {
  it("is a dialog that names her whole and says every mark in words", () => {
    const { el } = mount();
    const dialog = el.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-labelledby")).toBe("hp-name");
    expect(el.querySelector(".hp-name")?.textContent).toBe("Rosie Cotton");
    expect(el.querySelector(".hp-sub")?.textContent).toBe("4:00 – 4:30 PM · with you · her 45th session");
    expect(el.querySelector(".hp-critical")?.textContent).toBe("Read first: Pacemaker: no chest-compression machines");
    expect([...el.querySelectorAll(".hp-lines li")].map((l) => l.textContent)).toEqual(["No liability waiver signed in Mindbody."]);
  });

  it("opens her profile or starts her session", () => {
    const { el, calls } = mount();
    act(() => button(el, "Open profile")!.click());
    act(() => button(el, "Start session")!.click());
    expect(calls.profile).toEqual(["rosie"]);
    expect(calls.start).toEqual(["rosie"]);
  });

  it("closes on the close button, a tap outside, and Escape", () => {
    const { el, calls } = mount();
    act(() => (el.querySelector(".hp-close") as HTMLButtonElement).click());
    act(() => (el.querySelector(".hp-backdrop") as HTMLElement).click());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(calls.close).toBe(3);
  });

  it("is centred when it can't sit beside the card (here the card has no box)", () => {
    expect(mount().el.querySelector(".hp")?.getAttribute("data-mode")).toBe("center");
  });
});
