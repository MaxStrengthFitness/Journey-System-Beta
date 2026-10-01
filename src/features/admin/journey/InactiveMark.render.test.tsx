// @vitest-environment jsdom
/**
 * THE INACTIVE MARK MOUNTS (the inactive round, Oct 1 2026) — a leader marks
 * a client inactive with a reason from the pick list and an optional note,
 * and the whole document goes, signed with the Auth uid and dated the
 * studio's day; a marked client says who, when and why, and a leader takes
 * it back with Mark active again; a mark she has visited since says it no
 * longer holds; a trainer reads it and gets no button; a failed read is
 * never "active".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-lead" } }, functions: {} }));

const writes = vi.hoisted(() => ({ sets: [] as Array<{ path: string; data: Record<string, unknown> }>, deletes: [] as string[] }));

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    collection: ref,
    doc: ref,
    onSnapshot: () => () => {},
    setDoc: async (target: { path: string }, data: Record<string, unknown>) => {
      writes.sets.push({ path: target.path, data });
    },
    deleteDoc: async (target: { path: string }) => {
      writes.deletes.push(target.path);
    },
    serverTimestamp: () => "__now__",
  };
});

import { InactiveMarkPanel, type InactiveMarkProps } from "./InactiveMark";
import type { InactiveMark } from "./inactive";

const mark: InactiveMark = {
  clientId: "rosie",
  reason: "health",
  note: "Knee surgery in November",
  day: "2026-09-22",
  markedBy: { id: "uid-lead", name: "Glorfindel Lord" },
  markedAt: new Date("2026-09-22T14:00:00Z"),
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  writes.sets = [];
  writes.deletes = [];
});

async function mount(over: Partial<InactiveMarkProps> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const props: InactiveMarkProps = {
    studioId: "westlake",
    clientId: "rosie",
    clientName: "Rosie Cotton",
    mark: null,
    read: "ready",
    lastVisit: "2026-09-15",
    automatic: null,
    leads: true,
    markerName: "Glorfindel Lord",
    today: "2026-10-01",
    ...over,
  };
  await act(async () => {
    root!.render(
      <StrictMode>
        <InactiveMarkPanel {...props} />
      </StrictMode>,
    );
  });
  return host;
}

const button = (el: HTMLElement, text: string) => [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.trim() === text) ?? null;
const click = async (b: HTMLElement | null) => {
  await act(async () => b!.click());
};

describe("the inactive mark", () => {
  it("lets a leader mark a client inactive with a reason and a note, signed and dated", async () => {
    const el = await mount();
    expect(el.textContent).toContain("Active: not marked inactive.");
    await click(button(el, "Mark inactive"));
    const form = el.querySelector("form[aria-label='Mark Rosie inactive']")!;
    expect(form).not.toBeNull();
    // No reason yet: the save waits for one.
    expect(form.querySelector<HTMLButtonElement>("button[type='submit']")!.disabled).toBe(true);
    const reasons = [...form.querySelectorAll<HTMLButtonElement>(".ops-inactive__reason")];
    expect(reasons.map((r) => r.textContent)).toEqual(["Moved away", "Injury or health", "Cost", "Schedule or time", "Taking a break, her choice", "Other"]);
    await click(reasons[2]);
    expect(reasons[2].getAttribute("aria-pressed")).toBe("true");
    const note = form.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      set.call(note, "Asked to stop for now");
      note.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(form.querySelector<HTMLButtonElement>("button[type='submit']"));
    expect(writes.sets).toEqual([
      {
        path: "studios/westlake/inactiveMarks/rosie",
        data: { clientId: "rosie", reason: "cost", note: "Asked to stop for now", day: "2026-10-01", markedBy: { id: "uid-lead", name: "Glorfindel Lord" }, markedAt: "__now__" },
      },
    ]);
    expect(el.querySelector("form")).toBeNull();
  });

  it("says who marked her, when and why, and lets a leader take it back", async () => {
    const el = await mount({ mark });
    expect(el.textContent).toContain("Marked inactive by Glorfindel Lord on Tue, Sep 22, 2026: Injury or health: Knee surgery in November.");
    expect(el.textContent).toContain("A booking makes her active again by itself.");
    await click(button(el, "Mark active again"));
    expect(writes.deletes).toEqual(["studios/westlake/inactiveMarks/rosie"]);
    expect(writes.sets).toEqual([]);
  });

  it("says a mark she has visited since no longer holds", async () => {
    const el = await mount({ mark, lastVisit: "2026-09-29" });
    expect(el.textContent).toContain("she has visited since, so the mark no longer holds");
    expect(button(el, "Change the reason")).toBeNull();
    expect(button(el, "Mark active again")).not.toBeNull();
  });

  it("says inactive by herself in the Journey's words, and offers a leader's mark beside it", async () => {
    const el = await mount({ automatic: "120 days since her last visit, past the studio's 90-day line, and nothing is booked: inactive by herself." });
    expect(el.textContent).toContain("past the studio's 90-day line");
    expect(el.textContent).toContain("Inactive by herself: a booking makes her active again.");
    expect(button(el, "Mark inactive")).not.toBeNull();
  });

  it("gives a trainer the words and no button", async () => {
    const el = await mount({ mark, leads: false });
    expect(el.textContent).toContain("Marked inactive by Glorfindel Lord");
    expect(el.textContent).toContain("Only a leader of this studio marks a client inactive or active again.");
    expect(el.querySelectorAll("button")).toHaveLength(0);
  });

  it("never calls a client active when the mark couldn't be read", async () => {
    const el = await mount({ read: "failed" });
    expect(el.textContent).toContain("couldn't be read just now");
    expect(el.textContent).not.toContain("Active: not marked inactive.");
    expect(button(el, "Mark inactive")).toBeNull();
  });

  it("offers every reason as its own tap (ops.css holds .ops-inactive__reason at 44px)", async () => {
    const el = await mount();
    await click(button(el, "Mark inactive"));
    expect(el.querySelectorAll(".ops-inactive__reason")).toHaveLength(6);
    expect(el.querySelector("form")?.getAttribute("aria-label")).toBe("Mark Rosie inactive");
  });
});
