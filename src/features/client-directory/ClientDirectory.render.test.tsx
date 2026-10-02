// @vitest-environment jsdom
/**
 * The Client Directory, MOUNTED over a fake roster (CLAUDE.md: a green
 * typecheck and suite do not mean a screen mounts). It builds every row,
 * parses the search and sections the list during render, so a mount is the
 * only check that it draws at all.
 *
 *   - "nan" finds Anne "Nancy" Fisher by her nickname, marked
 *   - a tap on the Last in header re-sorts, and says so in words
 *   - a stale bookings feed reads "Unknown", never "Nothing booked"
 *   - In today offers Start, which calls the session path
 *   - every client is listed: no "40 most recent"
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RenewalSettingsState } from "../renewals/useRenewalSettings";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "westlake", availableStudios: [] }),
}));
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

// The leaders' inactive marks and the studio's settings (the inactive round, Oct 1 2026).
const inactive = vi.hoisted(() => ({ marks: new Map<string, unknown>() }));
vi.mock("../admin/journey/inactive-store", () => ({
  useInactiveMarks: () => ({ marks: inactive.marks, loading: false, failed: false }),
}));
vi.mock("../studio-settings/useStudioSettings", async () => {
  const { resolveAll } = await import("../studio-settings/resolve");
  const all = resolveAll({ studio: null, company: null });
  return { useStudioSettings: () => ({ all, loading: false, failed: false, value: (k: keyof typeof all) => all[k].value, source: () => "app", studioValues: null, companyValues: null }) };
});

import { ClientDirectory, type ClientDirectoryProps } from "./ClientDirectory";
import { NOW, STUDIOS, TODAY, eastern, makeBooking, makeClient } from "./fixtures";
import type { Trainer } from "../../types";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  document.body.innerHTML = "";
});
beforeEach(() => {
  inactive.marks = new Map();
  document.body.innerHTML = "";
  try {
    window.localStorage.clear();
  } catch {
    // no storage in this environment
  }
});

const ME = { id: "t-me", fullName: "Sam Rivera", primaryHomeStudioId: "westlake" } as unknown as Trainer;

const roster = [
  makeClient({ id: "nk", firstName: "Nancy", lastName: "Kowalski", lastSessionDate: "2026-09-22" }),
  makeClient({ id: "nr", firstName: "Nancy", lastName: "Ruiz", lastSessionDate: "2026-09-08" }),
  makeClient({ id: "af", firstName: "Anne", nickname: "Nancy", lastName: "Fisher", lastSessionDate: "2026-05-30" }),
  makeClient({ id: "zp", firstName: "Zelda", lastName: "Price", lastSessionDate: "2026-09-26" }),
  makeClient({ id: "ob", firstName: "Sean", lastName: "O'Brien", priorHistory: { sessions: 120, through: "2026-08-31", source: "filemaker" } }),
];

const booked = [makeBooking({ clientId: "zp", start: eastern(TODAY, "16:00"), trainerId: "t-me", trainerName: "Sam Rivera" })];

interface Mounted {
  host: HTMLElement;
  root: Root;
  selected: string[];
  started: string[];
}

async function mount(over: Partial<ClientDirectoryProps> = {}): Promise<Mounted> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const m: Mounted = { host, root, selected: [], started: [] };
  await act(async () => {
    root.render(
      <StrictMode>
        <ClientDirectory
          clients={roster}
          onSelectClient={(id) => m.selected.push(id)}
          onStartSession={(id) => m.started.push(id)}
          authTrainer={ME}
          uid="uid-me"
          rosterStatus="ready"
          schedules={booked}
          schedulesFetchedAt={NOW.getTime() - 10 * 60_000}
          sessions={[]}
          sessionsKnown
          trainers={[ME]}
          studios={STUDIOS as never}
          now={NOW}
          {...over}
        />
      </StrictMode>,
    );
  });
  return m;
}

const rowIds = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>(".cd-row")].map((r) => r.dataset.clientId);
const sectionLabels = (host: HTMLElement) => [...host.querySelectorAll(".cd-sechead")].map((s) => s.textContent);
const row = (host: HTMLElement, id: string) => host.querySelector<HTMLElement>(`.cd-row[data-client-id="${id}"]`);
const cell = (host: HTMLElement, id: string, col: string) => row(host, id)?.querySelector<HTMLElement>(`.cd-cell[data-col="${col}"]`);

async function type(host: HTMLElement, text: string) {
  const input = host.querySelector<HTMLInputElement>(".cd-search-input")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(el: Element | null | undefined) {
  expect(el, "element to click").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

describe("ClientDirectory: inactive clients, out of the way and never deleted (Oct 1 2026)", () => {
  it("leaves an inactive client out of All behind an Inactive chip, shows her on a tap, and finds her by name with the word on her row", async () => {
    inactive.marks = new Map([["nr", { clientId: "nr", reason: "moved", note: null, day: "2026-09-20", markedBy: { id: "uid-l", name: "Leader" }, markedAt: null }]]);
    const gone = makeClient({
      id: "lb",
      firstName: "Lobelia",
      lastName: "Sackville",
      lastSessionDate: "2026-06-01",
      renewal: { lastVisitDate: "2026-06-01", nextBookingDate: null, situation: "on-track" } as never,
    });
    const { host } = await mount({ clients: [...roster, gone] });
    // Nancy Ruiz (a leader's mark) and Lobelia (past the 90-day line, nothing booked) are out of All.
    expect(rowIds(host)).toEqual(["zp", "nk", "af", "ob"]);
    const chip = [...host.querySelectorAll<HTMLButtonElement>(".cd-chip")].find((b) => b.textContent?.startsWith("Inactive"))!;
    expect(chip.textContent).toBe("Inactive2");
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(host.textContent).toContain("All 4 active clients are listed");
    expect(host.textContent).toContain("2 inactive are out of the way");
    await click(chip);
    expect(rowIds(host)).toContain("nr");
    expect(rowIds(host)).toContain("lb");
    expect(host.textContent).toContain("past the studio’s 90-day line with nothing booked");
    await click(chip);
    // A search still finds her, and her row says Inactive.
    await type(host, "ruiz");
    expect(rowIds(host)).toEqual(["nr"]);
    expect(row(host, "nr")?.querySelector(".cd-badge")?.textContent).toBe("Inactive");
  });

  it("draws no Inactive chip when nobody is inactive", async () => {
    const { host } = await mount();
    expect([...host.querySelectorAll(".cd-chip")].some((b) => b.textContent?.startsWith("Inactive"))).toBe(false);
  });
});

describe("ClientDirectory", () => {
  it("mounts and lists every client, sorted by last in, with no '40 most recent'", async () => {
    const { host } = await mount();
    expect(rowIds(host)).toEqual(["zp", "nk", "nr", "af", "ob"]);
    expect(sectionLabels(host)).toEqual([
      "Last 7 days \u00b7 2",
      "15\u201328 days ago \u00b7 1",
      "More than 3 months ago \u00b7 1",
      "Before Journey \u00b7 1",
    ]);
    expect(host.textContent).not.toMatch(/most recent of/);
    expect(host.textContent).toContain("All 5 clients are listed");
  });

  it("search nan: the nickname match is found and marked", async () => {
    const { host } = await mount();
    await type(host, "nan");
    expect(rowIds(host).sort()).toEqual(["af", "nk", "nr"]);
    const fisher = row(host, "af")!;
    expect(fisher.querySelector(".cd-name")?.textContent).toContain("Anne \u201cNancy\u201d Fisher");
    expect([...fisher.querySelectorAll("mark")].map((m) => m.textContent)).toEqual(["Nan"]);
    expect(host.textContent).toContain("3 of 5 match");
    // Sorted by last in, the most recent Nancy is first.
    expect(rowIds(host)[0]).toBe("nk");
  });

  it("tapping the Last in header re-sorts, and says so in words", async () => {
    const { host } = await mount();
    expect(sectionLabels(host)[0]).toBe("Last 7 days \u00b7 2");
    const lastIn = [...host.querySelectorAll<HTMLButtonElement>(".cd-colbtn")].find((b) => b.textContent?.startsWith("Last in"));
    expect(lastIn?.getAttribute("aria-pressed")).toBe("true");
    await click(lastIn);
    expect(sectionLabels(host)[0]).toBe("More than 3 months ago \u00b7 1");
    expect(rowIds(host)).toEqual(["af", "nr", "nk", "zp", "ob"]);
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="Sort"]')?.value).toBe("lastIn:asc");
    // Unknowns stay last whichever way it runs.
    expect(sectionLabels(host).at(-1)).toBe("Before Journey \u00b7 1");
  });

  it("a fresh feed may say Nothing booked; a stale one says Unknown", async () => {
    const fresh = await mount();
    expect(cell(fresh.host, "nk", "Next")?.querySelector(".cd-val")?.textContent).toBe("Nothing booked");
    fresh.root.unmount();

    const stale = await mount({ schedulesFetchedAt: NOW.getTime() - 3 * 60 * 60_000 });
    expect(cell(stale.host, "nk", "Next")?.querySelector(".cd-val")?.textContent).toBe("Unknown");
    expect(stale.host.textContent).not.toMatch(/Nothing booked/);
    expect(stale.host.textContent).toMatch(/haven\u2019t been read lately/);
    // Her booking today is still a booking.
    expect(cell(stale.host, "zp", "Next")?.querySelector(".cd-val")?.textContent).toBe("Today 4:00 PM");
    stale.root.unmount();

    const unread = await mount({ schedulesFetchedAt: null });
    expect(cell(unread.host, "nk", "Next")?.querySelector(".cd-val")?.textContent).toBe("Unknown");
  });

  it("an unknown explains itself on a tap, without opening the profile", async () => {
    const m = await mount({ schedulesFetchedAt: null });
    const why = cell(m.host, "nk", "Next")?.querySelector("button.cd-why");
    await click(why);
    expect(cell(m.host, "nk", "Next")?.textContent).toContain("Bookings haven't loaded yet.");
    expect(m.selected).toEqual([]);
  });

  it("the whole row opens the profile", async () => {
    const m = await mount();
    await click(row(m.host, "nk")?.querySelector(".cd-open"));
    expect(m.selected).toEqual(["nk"]);
  });

  it("In today lists today's bookings with Start, and My clients says what it means", async () => {
    const m = await mount();
    const chip = (label: string) => [...m.host.querySelectorAll<HTMLButtonElement>(".cd-chip")].find((b) => b.textContent?.startsWith(label));
    expect(chip("In today")?.textContent).toBe("In today1");
    await click(chip("In today"));
    expect(rowIds(m.host)).toEqual(["zp"]);
    await click(row(m.host, "zp")?.querySelector(".cd-start"));
    expect(m.started).toEqual(["zp"]);
    expect(m.selected).toEqual([]);

    await click(chip("My clients"));
    expect(m.host.textContent).toContain("My clients: booked with you, or coached by you in the last 60 days.");
    expect(rowIds(m.host)).toEqual(["zp"]);
  });

  it("describing words become removable tokens", async () => {
    const m = await mount({
      clients: [
        ...roster,
        makeClient({ id: "rn", firstName: "Eileen", lastName: "Rourke", gender: "Female", occupation: "ICU nurse", dateOfBirth: "1959-02-01" }),
      ],
    });
    await type(m.host, "female nurses over 60");
    const tokens = [...m.host.querySelectorAll(".cd-token")].map((t) => t.textContent);
    expect(tokens).toEqual(["Age: 60 and over", "Gender: female", "Occupation: nurse"]);
    expect(rowIds(m.host)).toEqual(["rn"]);
    expect(m.host.textContent).toContain("1 of 6 match");
    await click(m.host.querySelector('.cd-token[aria-label="Remove Occupation: nurse"]'));
    expect(m.host.querySelector<HTMLInputElement>(".cd-search-input")?.value).toBe("female over 60");
  });
});
