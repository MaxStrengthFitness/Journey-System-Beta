// @vitest-environment jsdom
/**
 * MY PROFILE → MY CLIENTS, MOUNTED (Openings round, phase 12, Sep 27 2026).
 *
 * The card works out its rows during render from the studio's client list,
 * so these mount it: with NO cutover set (no studio has one today, so this
 * is what every trainer sees first), while the list is loading, after its
 * read failed, and with more than twelve clients.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, Trainer } from "../../types";
import type { RosterStatus } from "../../hooks/useStudioRoster";
import { MyClients } from "./MyClients";

const NOW = new Date("2026-09-30T12:00:00-04:00"); // Wednesday, noon Eastern

const trainer = {
  id: "t1",
  authUid: "uid-t1",
  claimedFromId: null,
  kaizenRoster: [{ clientId: "judy", clientName: "Judy Daus", reason: "Progression", addedAt: null }],
} as unknown as Trainer;

function client(id: string, first: string, last: string, over: Record<string, unknown> = {}): Client {
  return { id, firstName: first, lastName: last, homeStudioId: "westlake", isActive: true, height: "", ...over } as unknown as Client;
}

const clients: Client[] = [
  client("judy", "Judy", "Daus", { trainerTally: { t1: 42 }, renewal: { coachIds: ["t1"] }, lastSessionDate: "2026-09-25" }),
  client("sam", "Sam", "Okafor-Delacroix-Whitfield", { trainerTally: { "uid-t1": 3 }, renewal: { coachIds: ["uid-t1"] }, lastSessionDate: "2026-09-29" }),
  client("pat", "Pat", "Lee", { trainerTally: { t1: 60 }, lastSessionDate: "2026-06-02" }),
  client("vis", "Vi", "Sitor", { homeStudioId: "solon", trainerTally: { t1: 8 } }),
  client("other", "Oli", "Ver", { trainerTally: { t2: 20 } }),
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const opened: string[] = [];

beforeEach(() => {
  opened.length = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

async function mount(list: Client[], rosterStatus: RosterStatus, cutover: string | null = null) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <MyClients
          trainer={trainer}
          uid="uid-t1"
          clients={list}
          studioId="westlake"
          studioName="Westlake"
          cutover={cutover}
          rosterStatus={rosterStatus}
          tz="America/New_York"
          onSelectClient={(id) => opened.push(id)}
        />
      </StrictMode>,
    );
  });
  return host;
}

const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const rowsOf = (el: HTMLElement) => [...el.querySelectorAll("[data-testid='my-client-row']")];

describe("My clients", () => {
  it("lists your home clients with no cutover set: coached lately first, counts in Journey, the last session in Journey's words", async () => {
    const el = await mount(clients, "ready");
    const rows = rowsOf(el);
    expect(rows.map((r) => text(r.querySelector(".tp-row__name")))).toEqual([
      "Judy Daus",
      "Sam Okafor-Delacroix-Whitfield",
      "Pat Lee",
    ]);
    expect(text(rows[0].querySelector(".tp-row__sub"))).toBe("42 sessions with you in Journey · Last in Journey, with any trainer: Sep 25");
    // Sessions logged under the sign-in uid are yours too.
    expect(text(rows[1].querySelector(".tp-row__sub"))).toBe("3 sessions with you in Journey · Last in Journey, with any trainer: Sep 29");
    expect(text(rows[2].querySelector(".tp-row__sub"))).toBe("60 sessions with you in Journey · Last in Journey, with any trainer: Jun 2");
    // The Kaizen Roster's mark, on Judy only.
    expect(rows[0].querySelector("svg[aria-label='On your Kaizen Roster']")).not.toBeNull();
    expect(rows[1].querySelector("svg[aria-label='On your Kaizen Roster']")).toBeNull();
    // The two groups.
    expect([...el.querySelectorAll(".tp-mc__group")].map((g) => text(g))).toEqual([
      "Coached lately · the last 60 days",
      "Also trained with you",
    ]);
    // Never a since date, never all time; the migration line and what it counts.
    expect(el.textContent).not.toMatch(/since|all time/i);
    expect(el.textContent).toContain("Westlake is still moving off FileMaker, so older sessions may be missing.");
    expect(el.textContent).toContain("Clients whose home is another studio aren't listed");
    expect(text(el.querySelector(".tp-card__count"))).toBe("3 clients");
  });

  it("opens the client on a tap", async () => {
    const el = await mount(clients, "ready");
    await act(async () => {
      (rowsOf(el)[2] as HTMLButtonElement).click();
    });
    expect(opened).toEqual(["pat"]);
  });

  it("says it can't read the client list while it loads or after it failed — never an empty list", async () => {
    let el = await mount(clients, "loading");
    expect(text(el.querySelector("[data-testid='my-clients-state']"))).toBe("Can't read the client list just now.");
    expect(rowsOf(el)).toHaveLength(0);
    act(() => root?.unmount());
    host?.remove();

    el = await mount(clients, "error");
    expect(text(el.querySelector("[data-testid='my-clients-state']"))).toBe("Can't read the client list just now.");
    expect(rowsOf(el)).toHaveLength(0);
    act(() => root?.unmount());
    host?.remove();

    // After the roster's read failed the app still reads today's booked
    // clients by id — a home client among them is not the studio's list.
    el = await mount([clients[0]], "error");
    expect(text(el.querySelector("[data-testid='my-clients-state']"))).toBe("Can't read the client list just now.");
    expect(rowsOf(el)).toHaveLength(0);
    expect(el.textContent).not.toContain("No clients at");
  });

  it("says so in words when the list is read and nobody has sessions with you", async () => {
    const el = await mount([client("other", "Oli", "Ver", { trainerTally: { t2: 20 } })], "ready");
    expect(text(el.querySelector("[data-testid='my-clients-state']"))).toBe(
      "No clients at Westlake have sessions with you on record in Journey yet.",
    );
  });

  it("shows twelve, then all of them behind Show all", async () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      client(`c${i}`, `Client`, `Number ${String(i).padStart(2, "0")}`, { trainerTally: { t1: 30 - i } }),
    );
    const el = await mount(many, "ready");
    expect(rowsOf(el)).toHaveLength(12);
    const button = [...el.querySelectorAll("button")].find((b) => b.textContent === "Show all 15")!;
    expect(button).toBeTruthy();
    await act(async () => {
      button.click();
    });
    expect(rowsOf(el)).toHaveLength(15);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("drops the migration line once the studio's cutover date has come, and keeps it for one still ahead", async () => {
    let el = await mount(clients, "ready", "2026-09-01");
    expect(el.textContent).not.toContain("still moving off FileMaker");
    act(() => root?.unmount());
    host?.remove();

    el = await mount(clients, "ready", "2026-10-05");
    expect(el.textContent).toContain("Westlake is still moving off FileMaker, so older sessions may be missing.");
  });
});
