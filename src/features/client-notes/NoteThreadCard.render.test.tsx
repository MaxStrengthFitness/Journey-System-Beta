// @vitest-environment jsdom
/**
 * Mounts a thread card against a fake Firestore.
 *
 * What only a mount proves: that a thread with no updates shows no spine and
 * no toggle (it is still just a note); that the spine reads oldest first;
 * that "Add an update" writes an ordinary journalEntries document carrying
 * `threadId` at PLAIN loudness rather than a note of its own; and that
 * closing stamps the ROOT, never an update.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../firebase", () => ({
  db: { __fake: true },
  auth: { currentUser: { uid: "uid-aj" } },
}));

const writes: { path: string; data: any }[] = [];
const updates: { path: string; data: any }[] = [];

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const path = (...parts: any[]) => parts.filter((p) => typeof p === "string").join("/");
  return {
    ...real,
    collection: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    doc: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    addDoc: async (ref: any, data: any) => {
      writes.push({ path: ref.__path, data });
      return { id: `new-${writes.length}` };
    },
    updateDoc: async (ref: any, data: any) => {
      updates.push({ path: ref.__path, data });
    },
    serverTimestamp: () => ({ __server: true }),
  };
});

import { ToastProvider } from "../../contexts/ToastContext";
import type { JournalEntry } from "../../types/journal";
import { assembleThreads } from "./threads";
import { NoteThreadCard } from "./NoteThreadCard";

const entry = (over: Partial<JournalEntry> & { id: string }): JournalEntry =>
  ({
    clientId: "c1",
    studioId: "westlake",
    kind: "injury",
    category: null,
    body: "No overhead until the shoulder's cleared",
    importance: "critical",
    machineId: null,
    focusId: null,
    threadId: null,
    sessionId: null,
    origin: "manual",
    authorId: "uid-aj",
    authorInitials: "AJ",
    authorName: "AJ",
    occurredAt: new Date("2026-09-01T16:00:00Z"),
    createdAt: new Date("2026-09-01T16:00:00Z"),
    updatedAt: new Date("2026-09-01T16:00:00Z"),
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  }) as JournalEntry;

const AUTHOR = { id: "uid-aj", initials: "AJ", fullName: "AJ" };

let host: HTMLDivElement;
let root: Root;

const mount = (entries: JournalEntry[], props: Record<string, unknown> = {}) => {
  const [thread] = assembleThreads(entries);
  act(() => {
    root.render(
      <StrictMode>
        <ToastProvider>
          <NoteThreadCard thread={thread} machines={[]} author={AUTHOR} {...props} />
        </ToastProvider>
      </StrictMode>,
    );
  });
};

const click = (el: Element | null) => {
  if (!el) throw new Error("nothing to click");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const byText = (needle: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => (b.textContent || "").includes(needle)) ?? null;

beforeEach(() => {
  writes.length = 0;
  updates.length = 0;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("a thread on screen", () => {
  it("a note with no updates is just a note — no spine, no toggle", () => {
    mount([entry({ id: "a" })]);
    expect(host.querySelector('[data-testid="spine-a"]')).toBeNull();
    expect(byText("update")?.textContent).not.toMatch(/\d+ updates?/);
    expect(host.textContent).toContain("No overhead");
  });

  it("shows the spine oldest first once it is opened", () => {
    mount([
      entry({ id: "a" }),
      entry({ id: "u2", threadId: "a", body: "MRI on the 31st", occurredAt: new Date("2026-09-10T16:00:00Z") }),
      entry({ id: "u1", threadId: "a", body: "still sore", occurredAt: new Date("2026-09-05T16:00:00Z") }),
    ]);
    click(byText("2 updates"));
    const spine = host.querySelector('[data-testid="spine-a"]')!;
    const bodies = Array.from(spine.querySelectorAll(".nt-update__body")).map((n) => n.textContent);
    expect(bodies).toEqual(["still sore", "MRI on the 31st"]);
  });

  it("an update is written onto the thread, plain, not as a note of its own", async () => {
    mount([entry({ id: "a" })]);
    click(byText("Add an update"));
    const box = host.querySelector("textarea")!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(box, "performed overhead, client seemed okay");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      byText("Add it")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe("journalEntries");
    expect(writes[0].data.threadId).toBe("a");
    expect(writes[0].data.importance).toBe("standard");
    expect(writes[0].data.kind).toBe("injury");
    expect(writes[0].data.body).toBe("performed overhead, client seemed okay");
  });

  it("closing stamps the root, and a closed thread offers to come back", async () => {
    mount([entry({ id: "a" }), entry({ id: "u1", threadId: "a", body: "still sore" })]);
    await act(async () => {
      byText("All healed up")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(updates).toHaveLength(1);
    expect(updates[0].path).toBe("journalEntries/a");
    expect(updates[0].data.resolvedAt).not.toBeNull();

    mount([entry({ id: "a", resolvedAt: new Date("2026-09-12T16:00:00Z") })]);
    expect(byText("It")?.textContent).toContain("back");
  });

  it("an imported record is read-only — no update, no close", () => {
    mount([entry({ id: "a", isLegacy: true, legacySource: "Mindbody account notes" })]);
    expect(byText("Add an update")).toBeNull();
    expect(byText("All healed up")).toBeNull();
  });
});
