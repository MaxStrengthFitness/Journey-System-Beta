// @vitest-environment jsdom
/**
 * BUG REPORTS MOUNT — the four statuses under plain names with their counts,
 * a status set with a button and written as the stored value, and a read
 * that failed saying so instead of "No reports yet".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const writes: Array<{ path: string; data: unknown }> = [];
let answer: "reports" | "fails" = "reports";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "adm" } } }));
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));
vi.mock("firebase/firestore", () => {
  const reports = [
    { id: "b1", kind: "bug", description: "Timer froze after the Wrap-up", status: "open", userName: "Ioreth", createdAt: new Date("2026-09-26T14:00:00Z") },
    { id: "b2", kind: "ui", description: "Leg Press seat setting missing on the briefing", userName: "Mablung", createdAt: new Date("2026-09-27T14:00:00Z") },
    {
      id: "b3",
      kind: "idea",
      description: "A second theme for the Wrap-up",
      status: "wont-fix",
      userName: "Beregond",
      createdAt: new Date("2026-09-12T14:00:00Z"),
      reply: { text: "The Wrap-up follows the app's theme, so it stays one switch.", by: { uid: "adm", name: "Faramir" }, at: new Date("2026-09-13T14:00:00Z") },
    },
    { id: "b4", kind: "bug", description: "Renewals list shows yesterday late at night", status: "investigating", userName: "Bergil", createdAt: new Date("2026-09-21T14:00:00Z") },
  ];
  return {
    collection: (_db: unknown, name: string) => ({ path: name }),
    doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
    query: (q: unknown) => q,
    orderBy: () => ({}),
    limit: () => ({}),
    getDocs: async () => {
      if (answer === "fails") throw new Error("Missing or insufficient permissions.");
      return { docs: reports.map((r) => ({ id: r.id, data: () => r })) };
    },
    updateDoc: async (ref: { path: string }, data: unknown) => void writes.push({ path: ref.path, data }),
    serverTimestamp: () => "SERVER_TIME",
  };
});

import { AdminBugReportsTab } from "./AdminBugReportsTab";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  writes.length = 0;
  answer = "reports";
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount(onChanged?: () => void) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<AdminBugReportsTab studios={[]} onChanged={onChanged} replierName="Faramir" />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host;
}

const click = async (el: Element | null | undefined) => {
  expect(el, "element to click").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
};
const chipTexts = (el: ParentNode) => [...el.querySelectorAll('[aria-label="Show reports by status"] .hq-chip')].map((c) => c.textContent);

describe("bug reports", () => {
  it("names the four statuses plainly, with their counts, and says what is new", async () => {
    const el = await mount();
    expect(chipTexts(el)).toEqual(["All4", "New2", "Looking into it1", "Fixed0", "Won't fix1"]);
    expect(el.textContent).toContain("2 new reports, 1 being looked into.");
    // New work first.
    const statuses = [...el.querySelectorAll(".adm-bug-row .adm-badge:first-child")].map((b) => b.textContent);
    expect(statuses).toEqual(["New", "New", "Looking into it", "Won't fix"]);
  });

  it("filters by a status chip", async () => {
    const el = await mount();
    await click([...el.querySelectorAll(".hq-chip")].find((c) => c.textContent === "Won't fix1"));
    expect([...el.querySelectorAll(".adm-bug-row__desc")].map((d) => d.textContent)).toEqual(["A second theme for the Wrap-up"]);
  });

  it("sets a status with a button, writing the stored value", async () => {
    const changed = vi.fn();
    const el = await mount(changed);
    await click(el.querySelector(".adm-bug-row"));
    const group = el.querySelector('[role="group"][aria-label="Status"]')!;
    expect([...group.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["New", "Looking into it", "Fixed", "Won't fix"]);
    await click([...group.querySelectorAll("button")].find((b) => b.textContent === "Looking into it"));
    expect(writes).toEqual([{ path: "bug_reports/b2", data: { status: "investigating" } }]);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("replies to the reporter in the app, signed and dated, and says nothing is emailed", async () => {
    const el = await mount();
    await click(el.querySelector(".adm-bug-row"));
    await click([...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Reply to Mablung"));
    const box = el.querySelector<HTMLTextAreaElement>("#hq-reply-b2")!;
    expect(el.textContent).toContain("Mablung reads it on this report in Settings, the next time they look. Nothing is emailed.");
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(box, "It's in the briefing's set-up card now. Thanks, Mablung.");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click([...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Save the reply"));
    expect(writes).toEqual([
      {
        path: "bug_reports/b2",
        data: { reply: { text: "It's in the briefing's set-up card now. Thanks, Mablung.", by: { uid: "adm", name: "Faramir" }, at: "SERVER_TIME" } },
      },
    ]);
    // Shown as the reply the reporter reads, with Edit.
    expect(el.querySelector(".hq-reply__text")?.textContent).toBe("It's in the briefing's set-up card now. Thanks, Mablung.");
    expect([...el.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Edit the reply")).toBe(true);
    expect(el.querySelector(".adm-bug-row--on .adm-bug-row__who")?.textContent).toContain("replied");
  });

  it("shows a reply already given, with who and when", async () => {
    const el = await mount();
    const row = [...el.querySelectorAll(".adm-bug-row")].find((r) => r.textContent?.includes("A second theme"));
    await click(row);
    expect(el.textContent).toContain("Faramir replied on Sun, Sep 13. Beregond reads it in Settings.");
    expect(el.querySelector(".hq-reply__text")?.textContent).toBe("The Wrap-up follows the app's theme, so it stays one switch.");
  });

  it("says a read that failed failed, never No reports yet", async () => {
    answer = "fails";
    const el = await mount();
    expect(el.textContent).toContain("Couldn't load the bug reports just now");
    expect(el.textContent).not.toContain("No reports yet");
    expect(chipTexts(el)).toEqual([]);
  });
});
