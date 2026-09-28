// @vitest-environment jsdom
/**
 * OPERATIONS → TEAM → THIS WEEK MOUNTS — each trainer's card in today's
 * schedule order (last week's logging, their usual clients who are
 * slipping, what is worth recognising), Recognise putting the line on
 * today's huddle, and the leaders-only renewal counts (the redesign's
 * Operations room, phase 6).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));

const NOW = new Date("2026-09-28T13:00:00Z"); // Monday Sep 28, 9 AM Eastern
const eastern = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => {
    const first = parts[0] as { path?: string } | undefined;
    const base = first && typeof first === "object" && typeof first.path === "string" ? [first.path] : [];
    const path = [...base, ...parts.filter((p) => typeof p === "string")].join("/");
    return { path, id: path.split("/").pop() ?? "id" };
  };
  const snap = (rows: Array<Record<string, unknown>>) => ({
    docs: rows.map((r, i) => ({ id: String(r.id ?? i), data: () => r, exists: () => true })),
    size: rows.length,
    empty: rows.length === 0,
    forEach: (fn: (d: unknown) => void) => rows.forEach((r, i) => fn({ id: String(r.id ?? i), data: () => r })),
    docChanges: () => [],
    metadata: { fromCache: false },
  });
  const booking = (id: string, clientId: string, clientName: string, trainerId: string, day: string, hm: string) => ({
    id,
    clientId,
    clientName,
    trainerId,
    studioId: "westlake",
    startTime: eastern(day, hm),
    endTime: new Date(eastern(day, hm).getTime() + 30 * 60_000),
    status: "Scheduled",
  });
  const answer = (path: string) => {
    if (path === "schedules")
      return snap([
        booking("b1", "fatty", "Fredegar Bolger", "t1", "2026-09-28", "07:00"),
        booking("b2", "ann", "Ann Proudfoot", "t2", "2026-09-28", "10:00"),
        booking("b3", "bea2", "Bea Proudfoot", "t2", "2026-09-28", "13:00"),
        booking("b4", "rosie", "Rosie Cotton", "t1", "2026-09-29", "09:40"),
        booking("w1", "bea", "Bea Proudfoot", "t2", "2026-09-21", "09:00"),
        booking("w2", "cy", "Cy Gamgee", "t1", "2026-09-22", "09:00"),
        booking("w3", "hugo", "Hugo Bracegirdle", "t2", "2026-09-26", "10:30"),
      ]);
    if (path === "sessions")
      return snap([
        { id: "s1", status: "Completed", clientId: "bea", date: "2026-09-21", hostedAtStudioId: "westlake", trainerId: "t2", createdAt: eastern("2026-09-21", "09:40") },
        { id: "s2", status: "Completed", clientId: "cy", date: "2026-09-22", hostedAtStudioId: "westlake", trainerId: "t1", createdAt: eastern("2026-09-22", "09:40") },
      ]);
    if (path === "studios/westlake/taskInstances")
      return snap([{ id: "i1", localDate: "2026-09-26", scope: "studio", status: "done", completedBy: { id: "t1", name: "Imrahil Prince" }, kudos: { lead: true, t2: true } }]);
    if (path === "studios/westlake/renewals")
      return snap([
        { id: "r1", outcome: "renewed", closedOn: "2026-08-02", primaryTrainerId: "t1" },
        { id: "r2", outcome: "renewed", closedOn: "2026-08-12", primaryTrainerId: "t1" },
        { id: "r3", outcome: "upgraded", closedOn: "2026-09-02", primaryTrainerId: "t1" },
        { id: "r4", outcome: "lost", closedOn: "2026-09-12", primaryTrainerId: "t1" },
        { id: "r5", outcome: "renewed", closedOn: "2026-09-20", primaryTrainerId: "t2" },
      ]);
    return snap([]);
  };
  const isDoc = (path: string) => path.split("/").length % 2 === 0;
  const noDoc = { exists: () => false, data: () => undefined, id: "id", metadata: { fromCache: false } };
  return {
    collection: ref,
    doc: ref,
    query: (target: { path?: string }) => target,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    deleteField: () => null,
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
    onSnapshot: (target: { path: string }, a: unknown, b?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      const t = setTimeout(() => next(isDoc(target.path) ? noDoc : answer(target.path)), 0);
      return () => clearTimeout(t);
    },
    getDocs: async (target: { path: string }) => answer(target.path),
    getDocsFromServer: async (target: { path: string }) => answer(target.path),
    getDoc: async () => noDoc,
    setDoc: async () => {},
    updateDoc: async () => {},
    serverTimestamp: () => new Date(),
  };
});

import { TeamWeekPage } from "./TeamWeekPage";
import { huddleLines, resetHuddleMemory } from "./huddle-memory";
import type { Client, Studio, Trainer } from "../../../types";

const studio = { id: "westlake", name: "Westlake", timezone: "America/New_York" } as unknown as Studio;
const lead = { id: "lead", fullName: "Glorfindel Lord", role: "StudioLeader", primaryHomeStudioId: "westlake", isActive: true } as unknown as Trainer;
const imrahil = { id: "t1", fullName: "Imrahil Prince", role: "Trainer", primaryHomeStudioId: "westlake", isActive: true } as unknown as Trainer;
const beregond = { id: "t2", fullName: "Beregond Guard", role: "Trainer", primaryHomeStudioId: "westlake", isActive: true } as unknown as Trainer;
const ioreth = { id: "t3", fullName: "Ioreth Healer", role: "HeadTrainer", primaryHomeStudioId: "westlake", isActive: true } as unknown as Trainer;
const trainers = [lead, imrahil, beregond, ioreth];

const snapshot = (over: Record<string, unknown>) => ({
  situation: "on-track",
  pacePerWeek: 2,
  proof: { weeksObserved: 12 },
  flags: [],
  nextBookingDate: null,
  computedAt: new Date("2026-09-28T06:31:00Z"),
  focusDate: "2027-03-01",
  ...over,
});
const clients = [
  // Imrahil's: 18 days since her last visit, booked again tomorrow: Back.
  { id: "rosie", firstName: "Rosie", lastName: "Cotton", isActive: true, homeStudioId: "westlake", renewal: snapshot({ lastVisitDate: "2026-09-10", primaryTrainerId: "t1" }) },
  // Beregond's: twice a week, ten days, nothing booked: Drifting.
  { id: "gil", firstName: "Gil", lastName: "Galdor", isActive: true, homeStudioId: "westlake", renewal: snapshot({ lastVisitDate: "2026-09-18", primaryTrainerId: "t2" }) },
] as unknown as Client[];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  resetHuddleMemory();
  vi.useRealTimers();
});

async function mount(authTrainer: Trainer = lead) {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <TeamWeekPage studio={studio} studios={[studio]} clients={clients} trainers={trainers} authTrainer={authTrainer} />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return host;
}

const cardOf = (el: HTMLElement, name: string) => el.querySelector<HTMLElement>(`article[aria-label='${name}']`);
const lineOf = (card: HTMLElement | null, label: string) =>
  [...(card?.querySelectorAll(".ops-tr__l") ?? [])].find((p) => p.querySelector(".ops-tr__lab")?.textContent === label)?.textContent?.slice(label.length) ?? null;

describe("Team → This week", () => {
  it("lays the cards out in today's schedule order, then who is off today in name order", async () => {
    const el = await mount();
    const on = el.querySelector("#brief-on");
    expect([...(on?.querySelectorAll(".ops-tr__name") ?? [])].map((h) => h.textContent)).toEqual(["Imrahil Prince", "Beregond Guard"]);
    expect(cardOf(el, "Beregond Guard")?.querySelector(".ops-tr__meta")?.textContent).toBe("Life Transformer · 10:00 AM – 1:30 PM · 2 booked");
    const off = el.querySelector("#brief-off");
    expect([...(off?.querySelectorAll(".ops-tr__name") ?? [])].map((h) => h.textContent)).toEqual(["Glorfindel Lord", "Ioreth Healer"]);
  });

  it("says last week's logging, the usual clients who are slipping, and what is worth recognising", async () => {
    const el = await mount();
    const beregondCard = cardOf(el, "Beregond Guard");
    expect(lineOf(beregondCard, "Last week")).toBe("One session last week isn't logged yet: Hugo Bracegirdle, Sat 10:30 AM.");
    expect(lineOf(beregondCard, "Their clients")).toBe("Gil Galdor is drifting. They may know why.");
    expect(lineOf(beregondCard, "Recognise")).toBeNull();
    const imrahilCard = cardOf(el, "Imrahil Prince");
    expect(lineOf(imrahilCard, "Last week")).toBe("Last week's one session is logged.");
    expect(lineOf(imrahilCard, "Their clients")).toBe("None of their usual clients is drifting or at risk.");
    expect(lineOf(imrahilCard, "Recognise")).toBe("Rosie Cotton is booked again after a gap. 2 kudos from the team in the last seven days.");
  });

  it("Recognise puts the line on today's huddle and sends nothing", async () => {
    const el = await mount();
    const button = [...(cardOf(el, "Imrahil Prince")?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.includes("Recognise"))!;
    expect(button.getAttribute("aria-pressed")).toBe("false");
    await act(async () => button.click());
    const pressed = [...(cardOf(el, "Imrahil Prince")?.querySelectorAll("button") ?? [])].find((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed?.textContent).toContain("On today's huddle");
    expect(huddleLines("westlake", "2026-09-28")).toEqual(["Imrahil Prince: Rosie Cotton is booked again after a gap. 2 kudos from the team in the last seven days."]);
  });

  it("shows leaders this quarter's renewals by trainer in name order, with the chance check's floor", async () => {
    const el = await mount();
    const leaders = el.querySelector("#brief-leaders");
    expect(leaders?.textContent).toContain("Studio: 5 renewal points, 4 kept.");
    expect([...(leaders?.querySelectorAll("tbody tr") ?? [])].map((tr) => [...tr.children].map((c) => c.textContent))).toEqual([
      ["Beregond Guard", "1", "1"],
      ["Imrahil Prince", "4", "3"],
    ]);
    expect(leaders?.textContent).toContain("A rate appears at 10 renewal points. The chance check needs 10 renewal points across the studio this quarter. There are 5.");
    const how = [...(leaders?.querySelectorAll("button") ?? [])].find((b) => b.textContent === "How we check")!;
    await act(async () => how.click());
    expect(leaders?.querySelector(".ops-check")?.textContent).toContain("Nobody is called out below 5 renewal points");
  });

  it("keeps the renewal counts from someone who doesn't run the studio", async () => {
    const el = await mount(beregond);
    expect(el.querySelector("#brief-leaders")).toBeNull();
    expect(el.querySelector("#brief-on")).not.toBeNull();
  });
});
