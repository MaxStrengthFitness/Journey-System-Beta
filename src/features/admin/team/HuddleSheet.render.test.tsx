// @vitest-environment jsdom
/**
 * HUDDLE MODE MOUNTS — five items to point at, each tapped as it is covered,
 * End huddle, and the lines Team recognised and the bell's announcements
 * (the redesign's Operations room, phase 6). Nothing is written.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));

const writes: string[] = [];
vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => {
    const first = parts[0] as { path?: string } | undefined;
    const base = first && typeof first === "object" && typeof first.path === "string" ? [first.path] : [];
    const path = [...base, ...parts.filter((p) => typeof p === "string")].join("/");
    return { path, id: path.split("/").pop() ?? "id" };
  };
  const announcement = {
    id: "a1",
    title: "Holiday hours",
    shortContent: "Closed Thursday for the harvest feast.",
    longContent: "",
    authorId: "lead",
    authorName: "Glorfindel Lord",
    studioId: "westlake",
    targetScope: "studio",
    targetId: "westlake",
    isActive: true,
    priority: "medium",
    createdAt: new Date("2026-09-27T12:00:00Z"),
  };
  return {
    collection: ref,
    doc: ref,
    query: (target: unknown) => target,
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: (target: { path: string }, next: (s: unknown) => void) => {
      const t = setTimeout(() => {
        if (target.path === "hub_announcements") next({ docs: [{ id: "a1", data: () => announcement }] });
        else next({ exists: () => false, data: () => undefined });
      }, 0);
      return () => clearTimeout(t);
    },
    setDoc: async (target: { path: string }) => {
      writes.push(target.path);
    },
    serverTimestamp: () => new Date(),
  };
});

import { BriefHuddle, Huddle } from "./HuddleSheet";
import { huddleAgenda } from "./huddle-agenda";
import { resetHuddleMemory, toggleHuddleLine } from "./huddle-memory";
import type { Trainer } from "../../../types";

const lead = { id: "lead", fullName: "Glorfindel Lord", role: "StudioLeader", primaryHomeStudioId: "westlake" } as unknown as Trainer;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  resetHuddleMemory();
  writes.length = 0;
});

async function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<StrictMode>{node}</StrictMode>);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

const sheet = () => document.querySelector<HTMLElement>("[data-testid='huddle']");
const items = () => [...(sheet()?.querySelectorAll<HTMLButtonElement>(".ops-huddle__i") ?? [])];

describe("huddle mode", () => {
  it("shows the five items, marks one covered on a tap, and ends on End huddle", async () => {
    let closed = 0;
    const agenda = huddleAgenda({
      concern: "Lobelia Sackville: knee pain on the leg press, Saturday.",
      win: "Rosie Cotton is booked again after a gap.",
      catchLines: [{ tag: "9:40 AM", text: "Rosie Cotton: back after 18 days." }],
      floor: ["Beregond Guard: Hugo Bracegirdle's 10:30 AM session has no workout logged yet."],
      recognition: [],
      announcements: [],
    });
    await render(<Huddle open onClose={() => (closed += 1)} studioName="Westlake" dateLabel="Monday, September 28" items={agenda} />);
    expect(sheet()?.textContent).toContain("Huddle · Westlake");
    expect(sheet()?.textContent).toContain("Monday, September 28");
    expect(items().map((b) => b.querySelector(".ops-huddle__t")?.firstChild?.textContent)).toEqual(["A concern and a win", "Today", "The floor", "Recognition", "Announcements"]);
    expect(items()[1].textContent).toContain("9:40 AMRosie Cotton: back after 18 days.");
    expect(items()[0].getAttribute("aria-pressed")).toBe("false");
    await act(async () => items()[0].click());
    expect(items()[0].getAttribute("aria-pressed")).toBe("true");
    await act(async () => items()[0].click());
    expect(items()[0].getAttribute("aria-pressed")).toBe("false");
    const end = [...(sheet()?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.includes("End huddle"))!;
    await act(async () => end.click());
    expect(closed).toBe(1);
    expect(sheet()?.textContent).toContain("Nothing here is sent to anyone.");
  });

  it("from Today: adds what Team recognised and what the bell is showing, and writes nothing", async () => {
    toggleHuddleLine("westlake", "2026-09-28", "Imrahil Prince: Rosie Cotton is booked again after a gap.");
    await render(
      <BriefHuddle
        studioId="westlake"
        studioName="Westlake"
        today="2026-09-28"
        dateLabel="Monday, September 28"
        authTrainer={lead}
        input={{ concern: null, win: null, catchLines: [], floor: [], recognition: ["Nienor is booked again after a gap, usually with Imrahil."] }}
        onClose={() => {}}
      />,
    );
    const recognition = items()[3];
    expect([...recognition.querySelectorAll(".ops-huddle__l")].map((l) => l.textContent)).toEqual([
      "Imrahil Prince: Rosie Cotton is booked again after a gap.",
      "Nienor is booked again after a gap, usually with Imrahil.",
    ]);
    expect(items()[4].textContent).toContain("Holiday hours: Closed Thursday for the harvest feast.");
    expect(items()[1].textContent).toContain("Nobody to catch in person today.");
    expect(writes).toEqual([]);
  });
});
