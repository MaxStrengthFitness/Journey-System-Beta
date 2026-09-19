// @vitest-environment jsdom
/**
 * THE DELIGHT QUEUE MOUNTS with its row actions (Operations round, Sep 2026):
 * a one-off whose date has passed files under "Passed — still open", Take it
 * makes the signed-in person the owner and the idea planned, Done asks what
 * happened and writes it, Pass declines. Firestore answers the collection
 * group with two gestures; writes are recorded, not sent.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-ann" } }, functions: {} }));

const writes: Array<{ path: string; data: Record<string, unknown> }> = [];

vi.mock("firebase/firestore", () => {
  // Hoisted: helpers live inside the factory.
  const daysFromNow = (n: number) => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return new Date(d.getTime() + n * 86_400_000);
  };
  const ref = (...parts: unknown[]) => {
    const first = parts[0] as { path?: string } | undefined;
    const base = first && typeof first === "object" && typeof first.path === "string" ? [first.path] : [];
    const path = [...base, ...parts.filter((p) => typeof p === "string")].join("/");
    return { path, id: path.split("/").pop() ?? "id" };
  };
  const snap = (rows: Array<Record<string, unknown>>) => ({
    docs: rows.map((r) => ({ id: String(r.id), data: () => r, exists: () => true })),
    size: rows.length,
    empty: rows.length === 0,
    forEach: (fn: (d: unknown) => void) => rows.forEach((r) => fn({ id: String(r.id), data: () => r })),
    docChanges: () => [],
    metadata: { fromCache: false },
  });
  const ford = [
    {
      id: "f-grad",
      clientId: "c1",
      studioId: "solon",
      pillar: "family",
      body: "Daughter graduates",
      eventDate: daysFromNow(-3),
      recurrence: "none",
      opportunity: { status: "idea", idea: "A card from the whole floor", ownerTrainerId: null, ownerName: null, doneAt: null, outcome: null },
    },
    {
      id: "f-garden",
      clientId: "c2",
      studioId: "solon",
      pillar: "recreation",
      body: "Wishes she had help with the garden",
      eventDate: null,
      recurrence: "none",
      opportunity: { status: "planned", idea: "Send Bob's nephew round", ownerTrainerId: "uid-bob", ownerName: "Bob T", doneAt: null, outcome: null },
    },
  ];
  const answer = (path: string) => (path === "ford" ? snap(ford) : path.endsWith("/ford") ? snap(ford.filter((f) => path === `clients/${f.clientId}/ford`)) : snap([]));
  return {
    collection: ref,
    collectionGroup: ref,
    doc: ref,
    query: (q: { path?: string }) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: (target: { path: string }, a: unknown, b?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      const t = setTimeout(() => next(answer(target.path)), 0);
      return () => clearTimeout(t);
    },
    getDocs: async (target: { path?: string }) => answer(target?.path ?? ""),
    addDoc: async (target: { path: string }, data: Record<string, unknown>) => {
      writes.push({ path: target.path, data });
      return { id: "new" };
    },
    updateDoc: async (target: { path: string }, data: Record<string, unknown>) => {
      writes.push({ path: target.path, data });
    },
    setDoc: async (target: { path: string }, data: Record<string, unknown>) => {
      writes.push({ path: target.path, data });
    },
    serverTimestamp: () => "now",
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
  };
});

import { DelightQueue } from "./DelightQueue";
import type { Client, Trainer } from "../../types";

const clients = [
  { id: "c1", firstName: "Grace", lastName: "Hall" },
  { id: "c2", firstName: "Ruth", lastName: "Ito" },
] as Client[];

const trainers = [
  { id: "t-ann", authUid: "uid-ann", fullName: "Ann T", primaryHomeStudioId: "solon" },
  { id: "t-bob", authUid: "uid-bob", fullName: "Bob T", primaryHomeStudioId: "solon" },
  { id: "t-far", authUid: "uid-far", fullName: "Far Away", primaryHomeStudioId: "westlake" },
] as Trainer[];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <DelightQueue studioId="solon" clients={clients} trainers={trainers} me={{ id: "uid-ann", name: "Ann T" }} />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host;
}

const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
};

const click = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
};

const buttonIn = (row: Element, text: string) => [...row.querySelectorAll("button")].find((b) => b.textContent?.trim() === text)!;
const rowOf = (el: Element, client: string) => [...el.querySelectorAll(".ford-queue__row")].find((r) => r.textContent?.includes(client))!;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  writes.length = 0;
});

describe("Operations → Delight", () => {
  it("files a one-off whose date has passed under Passed, ahead of the undated ones", async () => {
    const el = await mount();
    const labels = [...el.querySelectorAll(".ford-queue__group-label")].map((n) => n.textContent);
    expect(labels).toEqual(["Passed — still open · 1", "No date — whenever the moment is right · 1"]);
    expect(rowOf(el, "Grace Hall").textContent).toContain("Needs an owner");
    expect(rowOf(el, "Ruth Ito").textContent).toContain("Bob T");
  });

  it("offers the studio's own people in Hand it to…, and Take it makes me the owner of a planned gesture", async () => {
    const el = await mount();
    const row = rowOf(el, "Grace Hall");
    const options = [...row.querySelectorAll("option")].map((o) => o.textContent);
    expect(options).toEqual(["Hand it to…", "Ann T", "Bob T"]);
    await click(buttonIn(row, "Take it"));
    expect(writes[0].path).toBe("clients/c1/ford/f-grad");
    expect(writes[0].data.opportunity).toMatchObject({ status: "planned", ownerTrainerId: "uid-ann", ownerName: "Ann T", outcome: null });
  });

  it("Done asks what happened and writes it, keeping the owner it had", async () => {
    const el = await mount();
    const row = rowOf(el, "Ruth Ito");
    await click(buttonIn(row, "Done"));
    const input = row.querySelector<HTMLInputElement>("input.ford-capture__field")!;
    expect(input.placeholder).toContain("What actually happened");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Nephew came Saturday. She cried.");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(buttonIn(row, "Done"));
    expect(writes[0].path).toBe("clients/c2/ford/f-garden");
    expect(writes[0].data.opportunity).toMatchObject({ status: "done", ownerTrainerId: "uid-bob", ownerName: "Bob T", outcome: "Nephew came Saturday. She cried." });
    expect((writes[0].data.opportunity as { doneAt: unknown }).doneAt).toBeInstanceOf(Date);
  });

  it("Pass declines without touching the owner", async () => {
    const el = await mount();
    await click(buttonIn(rowOf(el, "Ruth Ito"), "Pass"));
    expect(writes[0].data.opportunity).toMatchObject({ status: "declined", ownerTrainerId: "uid-bob" });
  });
});
