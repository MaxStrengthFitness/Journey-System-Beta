// @vitest-environment jsdom
/**
 * PLANS FROM THE TEAM, MOUNTED WITH A PLAN IN IT (client codex, phase 14).
 *
 * The card was redrawn on the codex kit in phase 14 and its behaviour was
 * meant to stay as it was. The Goals page's own render test only ever sees
 * an empty list, so this mounts the card with a shared plan by another
 * trainer and holds the list path:
 *
 *   - the plan's kind is a token dot and a label, its author and title shown;
 *   - a long plan folds until "Read all", and its links wait with it;
 *   - a studio leader may take it off the record: "Take off the record",
 *     then the confirm, then "Take it off" calls removeSharedNote ONCE; a
 *     refusal is said in the confirm and nothing closes;
 *   - a trainer who is neither the author nor a leader sees neither "Take off
 *     the record" nor "Edit in Relay"; the author sees "Edit in Relay" and
 *     "You", and is not offered taking their own plan off here;
 *   - nothing on the card sets a Tailwind size or colour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  notes: [] as unknown[],
  removes: [] as unknown[][],
  refuse: false,
}));

vi.mock("../../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-ann" } } }));

// The card's one read: handed the plans directly, as the listener would.
vi.mock("./hooks", () => ({
  useSharedNotes: () => ({ notes: fake.notes, loading: false, error: null }),
}));

vi.mock("./mutations", () => ({
  removeSharedNote: vi.fn(async (...args: unknown[]) => {
    fake.removes.push(args);
    if (fake.refuse) throw { code: "permission-denied" };
  }),
}));

import { SharedNotesCard } from "./SharedNotesCard";
import type { Client, Trainer } from "../../../types";
import type { SharedNote } from "./types";

const client = { id: "c1", firstName: "Carol", lastName: "Brennan", gender: "Female", homeStudioId: "s1" } as Client;
const her = { object: "her" as const, possessive: "her" as const };

const leader = { id: "t-lee", fullName: "Lee Leader", role: "StudioLeader", primaryHomeStudioId: "s1" } as Trainer;
const trainer = { id: "t-ann", fullName: "Ann Trainer", role: "LifeTransformer", primaryHomeStudioId: "s1" } as Trainer;

/** A long injury plan by Jess, with two sources. */
const longPlan = (over: Partial<SharedNote> = {}): SharedNote => ({
  id: "p1",
  clientId: "c1",
  title: "Right knee — the next six weeks",
  body: Array.from({ length: 8 }, (_, i) => `Week ${i + 1}: seat 7, stop at 90° at the bottom turn.`).join("\n"),
  kind: "injury",
  authorId: "uid-jess",
  authorName: "Jess Moreno",
  links: [
    { url: "https://example.org/knee", title: "Knee article" },
    { url: "https://example.org/turn", title: "The turnaround" },
  ],
  updatedAt: new Date(2027, 2, 10, 12),
  ...over,
});

let mounted: { root: Root; host: HTMLElement }[] = [];

async function settle() {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function mount(authTrainer: Trainer | null) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <SharedNotesCard client={client} authTrainer={authTrainer} onOpenPlanner={() => {}} pronouns={her} />
      </StrictMode>,
    );
  });
  await settle();
  mounted.push({ root, host });
  return host;
}

const button = (host: HTMLElement, words: string) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === words) ?? null;

async function click(el: HTMLElement | null) {
  expect(el).toBeTruthy();
  await act(async () => el!.click());
  await settle();
}

beforeEach(() => {
  fake.notes = [longPlan()];
  fake.removes.length = 0;
  fake.refuse = false;
});

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

describe("SharedNotesCard with a plan on the record", () => {
  it("draws the plan's kind, author and title, and folds a long plan and its links until Read all", async () => {
    const host = await mount(trainer);
    const item = host.querySelector<HTMLElement>(".snc-item")!;
    expect(item.querySelector(".snc-dot")?.getAttribute("data-kind")).toBe("injury");
    expect(item.querySelector(".snc-kind")?.textContent).toContain("Injury plan");
    expect(item.textContent).toContain("Jess Moreno");
    expect(item.querySelector(".snc-title")?.textContent).toBe("Right knee — the next six weeks");

    const body = item.querySelector<HTMLElement>(".snc-body")!;
    expect(body.hasAttribute("data-folded")).toBe(true);
    expect(item.querySelector(".snc-links")).toBeNull();
    const readAll = button(host, "Read all");
    expect(readAll?.getAttribute("aria-expanded")).toBe("false");

    await click(readAll);
    expect(host.querySelector(".snc-body")!.hasAttribute("data-folded")).toBe(false);
    expect(Array.from(host.querySelectorAll(".snc-link")).map((a) => a.textContent)).toEqual(["Knee article", "The turnaround"]);
    expect(button(host, "Show less")?.getAttribute("aria-expanded")).toBe("true");
  });

  it("lets a studio leader take it off the record: one confirm, one removeSharedNote", async () => {
    const host = await mount(leader);
    expect(button(host, "Edit in Relay")).toBeNull();
    await click(button(host, "Take off the record"));
    const confirm = host.querySelector<HTMLElement>('[role="alertdialog"]')!;
    expect(confirm.textContent).toContain("Take “Right knee — the next six weeks” off her record?");
    expect(confirm.textContent).toContain("Jess Moreno keeps their own copy");
    // The confirm replaces the button: it cannot be asked twice.
    expect(button(host, "Take off the record")).toBeNull();

    await click(button(host, "Take it off"));
    expect(fake.removes).toEqual([["c1", "p1"]]);
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("says so in the confirm when the database refuses, and keeps it open", async () => {
    fake.refuse = true;
    const host = await mount(leader);
    await click(button(host, "Take off the record"));
    await click(button(host, "Take it off"));
    expect(fake.removes).toHaveLength(1);
    const confirm = host.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(confirm?.querySelector(".snc-confirm__failure")?.textContent).toContain("The database refused that.");
    await click(button(host, "Keep it"));
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(fake.removes).toHaveLength(1);
  });

  it("offers a trainer who is neither the author nor a leader nothing to change", async () => {
    const host = await mount(trainer);
    expect(button(host, "Take off the record")).toBeNull();
    expect(button(host, "Edit in Relay")).toBeNull();
    // Still free to write a plan of their own.
    expect(button(host, "Write a plan")).toBeTruthy();
  });

  it("gives the author Edit in Relay and calls them You", async () => {
    fake.notes = [longPlan({ authorId: "uid-ann", authorName: "Ann Trainer" })];
    const host = await mount(trainer);
    expect(host.querySelector(".snc-item")?.textContent).toContain("You ·");
    expect(button(host, "Edit in Relay")).toBeTruthy();
    expect(button(host, "Take off the record")).toBeNull();
  });

  it("sets no Tailwind size or colour", async () => {
    const host = await mount(leader);
    await click(button(host, "Take off the record"));
    const classes = Array.from(host.querySelectorAll<HTMLElement>("[class]"))
      .map((el) => el.getAttribute("class") ?? "")
      .join(" ");
    expect(classes).not.toMatch(/\btext-(xs|sm|base|lg|xl|\[)/);
    expect(classes).not.toMatch(/\b(sky|slate|amber|emerald|rose)-\d/);
  });
});
