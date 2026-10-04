// @vitest-environment jsdom
/**
 * OPERATIONS → CLIENTS → TRENDS MOUNTS — the quarter's lines, each naming the
 * least it needs, then Insights with "By trainer" in name order (the
 * redesign's Operations room, phase 5).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));

const NOW = new Date("2026-09-28T13:00:00Z"); // Monday Sep 28, 9 AM Eastern: the quarter is Jul-Sep

vi.mock("firebase/firestore", () => {
  type Clause = { field?: string; op?: string; value?: unknown };
  const ref = (...parts: unknown[]) => {
    const first = parts[0] as { path?: string } | undefined;
    const base = first && typeof first === "object" && typeof first.path === "string" ? [first.path] : [];
    const path = [...base, ...parts.filter((p) => typeof p === "string")].join("/");
    return { path, id: path.split("/").pop() ?? "id", clauses: [] as Clause[] };
  };
  const snap = (rows: Array<Record<string, unknown>>) => ({
    docs: rows.map((r, i) => ({ id: String(r.id ?? i), data: () => r, exists: () => true })),
    size: rows.length,
    empty: rows.length === 0,
    forEach: (fn: (d: unknown) => void) => rows.forEach((r, i) => fn({ id: String(r.id ?? i), data: () => r })),
    docChanges: () => [],
    metadata: { fromCache: false },
  });
  const renewals = [
    { id: "r1", clientName: "Arwen Undomiel", outcome: "renewed", closedOn: "2026-08-10" },
    { id: "r2", clientName: "Belladonna Took", outcome: "upgraded", closedOn: "2026-09-01" },
    { id: "r3", clientName: "Lobelia Sackville", outcome: "lost", closedOn: "2026-09-15", latestConcerns: ["price"] },
    { id: "r4", clientName: "Ioreth Healer", outcome: "renewed", closedOn: "2026-05-02" },
  ];
  const inRange = (row: Record<string, unknown>, clauses: Clause[]) =>
    clauses.every((c) => c.field !== "closedOn" || (c.op === ">=" ? String(row.closedOn) >= String(c.value) : c.op === "<=" ? String(row.closedOn) <= String(c.value) : true));
  const answer = (target: { path: string; clauses?: Clause[] }) => {
    if (target.path === "studios/westlake/renewals") return snap(renewals.filter((r) => inRange(r, target.clauses ?? [])));
    if (target.path === "sessions") {
      const at = (h: number) => new Date(`2026-09-2${h}T14:00:00Z`);
      return snap([
        { id: "s1", status: "Completed", clientId: "c1", trainerId: "t1", hostedAtStudioId: "westlake", createdAt: at(1) },
        { id: "s2", status: "Completed", clientId: "c2", trainerId: "t1", hostedAtStudioId: "westlake", createdAt: at(2) },
        { id: "s3", status: "Completed", clientId: "c3", trainerId: "t1", hostedAtStudioId: "westlake", createdAt: at(3) },
        { id: "s4", status: "Completed", clientId: "c4", trainerId: "t2", hostedAtStudioId: "westlake", createdAt: at(4) },
      ]);
    }
    return snap([]);
  };
  return {
    collection: ref,
    doc: ref,
    query: (target: { path: string; clauses?: Clause[] }, ...clauses: Clause[]) => ({ ...target, clauses: [...(target.clauses ?? []), ...clauses] }),
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    orderBy: () => ({}),
    limit: () => ({}),
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
    onSnapshot: (target: { path: string; clauses?: Clause[] }, a: unknown, b?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      const isDoc = target.path.split("/").length % 2 === 0;
      const t = setTimeout(() => next(isDoc ? { exists: () => false, data: () => undefined, id: "id", metadata: { fromCache: false } } : answer(target)), 0);
      return () => clearTimeout(t);
    },
    getDocs: async (target: { path: string; clauses?: Clause[] }) => answer(target),
    getDocsFromServer: async (target: { path: string; clauses?: Clause[] }) => answer(target),
    getDoc: async () => ({ exists: () => false, data: () => undefined }),
    setDoc: async () => {},
    serverTimestamp: () => new Date(),
  };
});

import { TrendsPage } from "./TrendsPage";
import type { Client, Studio, Trainer } from "../../../types";

const studio = { id: "westlake", name: "Westlake", timezone: "America/New_York" } as unknown as Studio;
const lead = { id: "lead", fullName: "Glorfindel Lord", role: "StudioLeader", primaryHomeStudioId: "westlake" } as unknown as Trainer;
// Beregond has the most sessions, Anborn the fewest: the table still reads Anborn first.
const trainers = [lead, { id: "t1", fullName: "Beregond Guard", primaryHomeStudioId: "westlake" }, { id: "t2", fullName: "Anborn Ranger", primaryHomeStudioId: "westlake" }] as unknown as Trainer[];
const gil = {
  id: "gil",
  firstName: "Gil",
  lastName: "Galdor",
  isActive: true,
  homeStudioId: "westlake",
  renewal: { situation: "on-track", pacePerWeek: 2, proof: { weeksObserved: 12 }, flags: [], lastVisitDate: "2026-09-25", nextBookingDate: "2026-09-29", computedAt: new Date("2026-09-28T06:31:00Z"), focusDate: "2027-03-01" },
} as unknown as Client;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
});

async function mount() {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <TrendsPage studio={studio} studios={[studio]} clients={[gil]} trainers={trainers} authTrainer={lead} />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return host;
}

/** A line below its minimum is a name in the "Not enough data yet" group; a tap opens its count and the least it needs (the calm round). */
const waiting = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>(".ops-trend-wait .ops-namechip")];
const lineOf = async (el: HTMLElement, title: string) => {
  const chip = waiting(el).find((b) => b.textContent === title);
  if (!chip) throw new Error(`no waiting line ${title}`);
  if (chip.getAttribute("aria-expanded") !== "true") await act(async () => chip.click());
  const open = el.querySelector(".ops-trend-wait__open");
  return { say: open?.querySelector(".ops-line")?.textContent ?? null, min: open?.querySelector(".ops-trend__min")?.textContent ?? null };
};

describe("Clients → Trends", () => {
  it("folds every line below its minimum into one group, and says its count and minimum on a tap", async () => {
    const el = await mount();
    // None has met its minimum here: no line claims a rate, and none is a paragraph on the page.
    expect(el.querySelectorAll(".ops-trend")).toHaveLength(0);
    expect(waiting(el).map((t) => t.textContent)).toEqual([
      "Renewal outcomes",
      "A longer package",
      "Start groups",
      "Studio rhythm",
      "Lost reasons",
      "Win-back results",
      "The signal check",
    ]);
    expect(el.textContent).not.toContain("A rate appears from");
    expect(await lineOf(el, "Renewal outcomes")).toEqual({
      say: "3 renewal points closed this quarter: 1 renewed, 1 on a longer package, 0 on a shorter one, 0 pay-as-you-go, 1 lost.",
      min: "A rate appears from 10 renewal points. There are 3.",
    });
    expect(await lineOf(el, "A longer package")).toEqual({
      say: "1 of 2 renewals this quarter moved to a longer package.",
      min: "Compared with last quarter only when both have 10 or more renewals: this quarter 2, last quarter 1.",
    });
    expect((await lineOf(el, "Studio rhythm")).say).toBe("1 client has a measured rhythm so far.");
    expect((await lineOf(el, "Lost reasons")).say).toBe("1 client was lost this quarter. That's fewer than 5, so no breakdown by reason yet.");
    expect((await lineOf(el, "Win-back results")).say).toMatch(/^Not enough history yet\./);
    expect((await lineOf(el, "The signal check")).say).toMatch(/^Not enough history yet\./);
  });

  it("keeps Insights below, with By trainer in name order and no red", async () => {
    const el = await mount();
    expect(el.textContent).toContain("What stands out");
    const rows = [...el.querySelectorAll(".adm-ins-table tbody th")].map((th) => th.textContent?.replace("small sample", "").trim());
    expect(rows).toEqual(["Anborn Ranger", "Beregond Guard"]);
    expect(el.querySelector(".adm-ins-bad")).toBeNull();
  });
});
