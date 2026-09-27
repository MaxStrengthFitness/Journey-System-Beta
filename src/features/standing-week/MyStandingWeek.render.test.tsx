// @vitest-environment jsdom
/**
 * MY PROFILE → MY STANDING WEEK (voice-review round, Sep 27 2026), mounted:
 * a trainer builds a week, proposes it, sees where it stands, and a failed
 * read never shows as an empty week.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client } from "../../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  listeners: [] as { path: string; next: (snap: unknown) => void; fail: (err: unknown) => void }[],
  writes: [] as { path: string; data: Record<string, unknown>; options?: unknown }[],
  failWrite: false,
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-sam" } }, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    ...real,
    doc: ref,
    collection: ref,
    onSnapshot: (r: { path: string }, next: (snap: unknown) => void, fail: (err: unknown) => void) => {
      fake.listeners.push({ path: r.path, next, fail });
      return () => {};
    },
    setDoc: async (r: { path: string }, data: Record<string, unknown>, options?: unknown) => {
      if (fake.failWrite) throw new Error("Missing or insufficient permissions.");
      if (JSON.stringify(data, (_k, v) => (v === undefined ? "__undefined__" : v)).includes("__undefined__")) {
        throw new Error("Unsupported field value: undefined");
      }
      fake.writes.push({ path: r.path, data, options });
    },
    serverTimestamp: () => ({ __server: true }),
  };
});

import { MyStandingWeek } from "./MyStandingWeek";

const clients = [
  { id: "c-judy", firstName: "Judy", lastName: "Smith", isActive: true },
  { id: "c-jude", firstName: "Jude", lastName: "Law", isActive: true },
  { id: "c-bob", firstName: "Bob", lastName: "Jones", isActive: true },
] as unknown as Client[];

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  fake.listeners.length = 0;
  fake.writes.length = 0;
  fake.failWrite = false;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

async function mount() {
  await act(async () => {
    root.render(
      <StrictMode>
        <MyStandingWeek trainer={{ id: "t-sam", fullName: "Sam Lee" }} authUid="uid-sam" studioId="solon" studioName="Solon" clients={clients} tz="America/New_York" />
      </StrictMode>,
    );
  });
}

/** Deliver the trainer's document (or its absence) to every listener on it. */
async function deliver(data: Record<string, unknown> | null) {
  await act(async () => {
    for (const l of fake.listeners) l.next({ id: "uid-sam", exists: () => data !== null, data: () => data ?? undefined });
  });
}

const button = (label: string) => {
  const b = [...host.querySelectorAll("button")].find((x) => x.textContent === label || x.getAttribute("aria-label") === label);
  if (!b) throw new Error(`No button "${label}"`);
  return b as HTMLButtonElement;
};
const click = async (label: string) => {
  await act(async () => {
    button(label).click();
  });
};
const type = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("My standing week", () => {
  it("reads the trainer's own document at the studio", async () => {
    await mount();
    expect(fake.listeners[0].path).toBe("studios/solon/standingWeeks/uid-sam");
    expect(host.textContent).toContain("Reading your week…");
  });

  it("builds a week and proposes it", async () => {
    await mount();
    await deliver(null);
    expect(host.querySelector("[data-testid='my-week-status']")?.textContent).toBe("Not proposed yet.");
    expect(button("Propose this week").disabled).toBe(true);

    await click("Add hours on Monday");
    await click("Add hours on Tuesday"); // copies Monday's
    await click("Add a regular on Monday");
    const search = host.querySelector("input[aria-label='Find the client for Monday']") as HTMLInputElement;
    await type(search, "jud");
    const picks = [...host.querySelectorAll(".stw-pick")].map((b) => b.textContent);
    expect(picks).toEqual(["Jude Law", "Judy Smith"]);
    await click("Judy Smith");
    expect(host.querySelector("[aria-label='Regulars on Monday']")?.textContent).toContain("Judy Smith");

    expect(button("Propose this week").disabled).toBe(false);
    await click("Propose this week");
    expect(fake.writes).toHaveLength(1);
    const w = fake.writes[0];
    expect(w.path).toBe("studios/solon/standingWeeks/uid-sam");
    expect(w.options).toEqual({ merge: true });
    expect(w.data).toMatchObject({
      studioId: "solon",
      trainerUid: "uid-sam",
      trainerId: "t-sam",
      trainerName: "Sam Lee",
      proposedBy: { id: "uid-sam", name: "Sam Lee" },
      proposed: {
        hours: [
          { weekday: 1, from: "07:00", to: "13:00" },
          { weekday: 2, from: "07:00", to: "13:00" },
        ],
        regulars: [{ weekday: 1, start: "07:00", clientId: "c-judy", clientName: "Judy Smith" }],
      },
    });
    expect(w.data).not.toHaveProperty("final");
  });

  it("keeps the week and says so when proposing fails", async () => {
    await mount();
    await deliver(null);
    await click("Add hours on Monday");
    fake.failWrite = true;
    await click("Propose this week");
    expect(host.querySelector("[role='alert']")?.textContent).toContain("Couldn't propose it just now");
    expect(host.querySelector("[aria-label='Monday: starts']")).not.toBeNull();
  });

  it("shows an agreed week and, once changed, what the change is", async () => {
    const agreed = { hours: [{ weekday: 1, from: "07:00", to: "13:00" }], regulars: [{ id: "r1", weekday: 1, start: "08:00", clientId: "c-judy", clientName: "Judy Smith" }] };
    await mount();
    await deliver({
      studioId: "solon",
      trainerId: "t-sam",
      trainerName: "Sam Lee",
      proposed: { ...agreed, regulars: [] },
      proposedAt: new Date("2026-09-29T14:00:00Z"),
      final: agreed,
      finalAt: new Date("2026-09-28T14:00:00Z"),
      finalBy: { id: "uid-pat", name: "Pat Doe" },
    });
    expect(host.querySelector("[data-testid='my-week-status']")?.textContent).toBe(
      "Agreed by Pat Doe on Sep 28. You proposed a change on Sep 29; it's waiting for a studio leader.",
    );
    expect(host.querySelector("[aria-label='Your change']")?.textContent).toBe("Drops Judy Smith, Monday at 8:00 AM.");
    await click("Keep the agreed week");
    expect(fake.writes[0].data).toMatchObject({ proposed: null });
  });

  it("never shows a failed read as an empty week", async () => {
    await mount();
    await act(async () => {
      for (const l of fake.listeners) l.fail({ code: "permission-denied" });
    });
    expect(host.textContent).toContain("the new database rules may not be deployed yet");
    expect(host.querySelector(".stw")).toBeNull();
  });
});
