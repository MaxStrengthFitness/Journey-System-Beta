// @vitest-environment jsdom
/**
 * The Run-sheet, MOUNTED (CLAUDE.md: only a render test proves a screen
 * mounts). It builds every entry, sections and chips during render.
 *
 *   - one row per client booked that day, the sort's sentence in one column
 *   - a sort tap changes the sentence in place, and a second tap reverses
 *   - filter chips carry counts and a zero is not drawn
 *   - "Can't tell yet" is folded last and opens on a tap
 *   - a row opens in place into three slots, and its buttons call the Hub's
 *   - everything is asked about the SELECTED day
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import type { RenewalSettingsState } from "../renewals/useRenewalSettings";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("../renewals/useRenewalSettings", async () => {
  const { DEFAULT_RENEWAL_SETTINGS } = await import("../renewals/settings");
  const state: RenewalSettingsState = {
    settings: DEFAULT_RENEWAL_SETTINGS,
    saved: true,
    ownPackageTable: false,
    forStudioId: "westlake",
    loading: false,
    error: null,
  };
  return { useRenewalSettings: () => state };
});

import { RunSheet } from "./RunSheet";
import { useDayMoments, type DayMomentsProps } from "./use-day-moments";
import { NOW, STUDIOS, TODAY, eastern, makeBooking, makeClient } from "../client-directory/fixtures";
import type { Trainer } from "../../types";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  document.body.innerHTML = "";
  try {
    window.localStorage.clear();
  } catch {
    // no storage here
  }
});

const ME = { id: "t-me", fullName: "Sam Rivera" } as unknown as Trainer;
const PIP = { id: "t-pip", fullName: "Pippin Took" } as unknown as Trainer;

const clients = [
  makeClient({ id: "ruth", firstName: "Ruth", lastName: "Alvarez", dateOfBirth: "1946-10-01", sessionCount: 99, clientsNumberOfVisitsAtSite: 3 }),
  makeClient({ id: "harold", firstName: "Harold", lastName: "Kim", lastSessionDate: "2026-09-24", mindbodyServices: { s: { serviceId: 1, name: "96 PIF", count: 96, remaining: 40 } } as never }),
  makeClient({ id: "arwen", firstName: "Arwen", lastName: "Ohl", clientsNumberOfVisitsAtSite: 304 }),
];

const schedules = [
  makeBooking({ clientId: "ruth", start: eastern(TODAY, "15:00"), trainerId: "t-me", trainerName: "Sam Rivera" }),
  makeBooking({ clientId: "harold", start: eastern(TODAY, "16:00"), trainerId: "t-pip", trainerName: "Pippin Took" }),
  makeBooking({ clientId: "arwen", start: eastern(TODAY, "17:00"), trainerId: "t-pip", trainerName: "Pippin Took" }),
  makeBooking({ clientId: "ruth", start: eastern("2026-10-01", "09:00"), trainerId: "t-me", trainerName: "Sam Rivera" }),
];

type MountProps = DayMomentsProps & { onOpenProfile: (id: string) => void; onStartSession: (id: string) => void };

/** The Hub works the day out once (use-day-moments) and hands the Run-sheet its entries. */
function WithTheDay(props: MountProps) {
  const { entries } = useDayMoments(props);
  return <RunSheet day={props.day} entries={entries} onOpenProfile={props.onOpenProfile} onStartSession={props.onStartSession} />;
}

async function mount(over: Partial<MountProps> = {}) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const calls = { open: [] as string[], start: [] as string[] };
  const props: MountProps = {
    day: TODAY,
    now: NOW,
    schedules,
    clients,
    sessions: [],
    sessionsKnown: true,
    studios: STUDIOS,
    activeStudioId: "westlake",
    authTrainer: ME,
    uid: "uid-me",
    trainers: [ME, PIP],
    criticalFor: () => [],
    onOpenProfile: (id) => calls.open.push(id),
    onStartSession: (id) => calls.start.push(id),
    ...over,
  };
  await act(async () => {
    root.render(
      <StrictMode>
        <WithTheDay {...props} />
      </StrictMode>,
    );
  });
  return { host, root, calls };
}

const rows = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>(".ho-row")].map((r) => r.dataset.clientId);
const sentence = (host: HTMLElement, id: string) => host.querySelector(`.ho-row[data-client-id="${id}"] .ho-sentence`)?.textContent;
const chips = (host: HTMLElement, id: string) => [...host.querySelectorAll(`.ho-row[data-client-id="${id}"] .ho-chip`)].map((c) => c.textContent);
const button = (host: HTMLElement, selector: string, text: string) =>
  [...host.querySelectorAll<HTMLButtonElement>(selector)].find((b) => b.textContent?.startsWith(text));

async function click(el: Element | null | undefined) {
  expect(el, "element to click").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

describe("RunSheet", () => {
  it("lists every client booked on the day, one row each, by time", async () => {
    const { host } = await mount();
    expect(rows(host)).toEqual(["ruth", "harold", "arwen"]);
    expect(sentence(host, "ruth")).toBe("3:00 \u2013 3:30 PM");
    expect(host.querySelector('.ho-row[data-client-id="ruth"] .ho-when')?.textContent).toBe("3:00 PM \u00b7 with you");
    expect(chips(host, "ruth")).toEqual(["100th today", "Turns 80 Thu"]);
  });

  it("a sort tap rewrites the one column; the sorted fact is not repeated as a chip", async () => {
    const { host } = await mount();
    await click(button(host, ".ho-seg-btn", "Birthday"));
    expect(sentence(host, "ruth")).toBe("turns 80 \u00b7 Thu Oct 1");
    expect(chips(host, "ruth")).toEqual(["100th today"]);
    await click(button(host, ".ho-seg-btn", "Sessions"));
    expect(sentence(host, "ruth")).toBe("100th session today");
    expect(chips(host, "ruth")).toEqual(["Turns 80 Thu"]);
    // Harold and Arwen can't be numbered: folded under Can't tell yet.
    expect(rows(host)).toEqual(["ruth"]);
    const cant = button(host, ".ho-sechead", "Can\u2019t tell yet");
    expect(cant?.getAttribute("aria-expanded")).toBe("false");
    await click(cant);
    expect(rows(host)).toEqual(["ruth", "harold", "arwen"]);
    expect(sentence(host, "arwen")).toBe("Total not recorded yet");
  });

  it("filter chips carry counts, and a zero is not drawn", async () => {
    const { host } = await mount();
    const labels = [...host.querySelectorAll(".ho-filter")].map((f) => f.textContent);
    expect(labels).toEqual(["All 3", "Celebrate 1"]);
    await click(button(host, ".ho-filter", "Celebrate"));
    expect(rows(host)).toEqual(["ruth"]);
  });

  it("Mine is booked with me today", async () => {
    const { host } = await mount();
    await click(button(host, ".ho-seg-btn", "Mine"));
    expect(rows(host)).toEqual(["ruth"]);
  });

  it("a row opens in place into three slots, and its buttons call the Hub's handlers", async () => {
    const { host, calls } = await mount();
    await click(host.querySelector('.ho-row[data-client-id="ruth"] .ho-rowbtn'));
    const titles = [...host.querySelectorAll(".ho-slot-title")].map((t) => t.textContent);
    expect(titles).toEqual(["Where she is", "Something to say", "Watch"]);
    expect(host.querySelector(".ho-open")?.textContent).toContain("Turns 80 on Thursday, Oct 1.");
    expect(host.querySelector(".ho-open")?.textContent).toContain("Nothing to watch.");
    await click(button(host, ".ho-action", "Open profile"));
    await click(button(host, ".ho-action", "Start session"));
    expect(calls).toEqual({ open: ["ruth"], start: ["ruth"] });
  });

  it("asks everything about the selected day, not today", async () => {
    const { host } = await mount({ day: "2026-10-01" });
    expect(rows(host)).toEqual(["ruth"]);
    expect(chips(host, "ruth")).toEqual(["Turns 80 today"]);
    await click(button(host, ".ho-seg-btn", "Sessions"));
    expect(sentence(host, "ruth")).toBe("#101");
  });
});
