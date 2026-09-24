// @vitest-environment jsdom
/**
 * Mounts a thread card against a fake Firestore.
 *
 * What only a mount proves: that a thread with no updates shows no spine and
 * no toggle (it is still just a note); that the spine reads oldest first;
 * that "Add an update" writes an ordinary journalEntries document carrying
 * `threadId` at PLAIN loudness rather than a note of its own; that closing
 * stamps the ROOT, never an update; that the close words fit the note; that
 * Archive takes the WHOLE thread in one batch, and only after a confirm; and
 * that the briefing line says where the thread stands with this trainer.
 *
 * Client codex (the Notes page): the card is one panel on the Equipment
 * tokens — no Tailwind palette class and no raw colour anywhere in it.
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
const batches: { updates: { path: string; data: any }[] }[] = [];

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
    writeBatch: () => {
      const b = { updates: [] as { path: string; data: any }[] };
      return {
        update(ref: any, data: any) {
          b.updates.push({ path: ref.__path, data });
        },
        set() {},
        delete() {},
        async commit() {
          batches.push(b);
        },
      };
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
const TODAY = "2026-09-24";

let host: HTMLDivElement;
let root: Root;

const mount = (entries: JournalEntry[], props: Record<string, unknown> = {}) => {
  const [thread] = assembleThreads(entries);
  act(() => {
    root.render(
      <StrictMode>
        <ToastProvider>
          <NoteThreadCard
            thread={thread}
            machines={[{ id: "m-leg", name: "Leg Press" } as any]}
            author={AUTHOR}
            today={TODAY}
            {...props}
          />
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
  batches.length = 0;
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
    expect(host.querySelector('[data-testid="spine-a"]')).toBeNull();
    const toggle = byText("2 updates")!;
    expect(toggle.textContent).toContain("last Sep 10");
    click(toggle);
    const spine = host.querySelector('[data-testid="spine-a"]')!;
    const bodies = Array.from(spine.querySelectorAll(".nt-upd__body")).map((n) => n.textContent);
    expect(bodies).toEqual(["still sore", "MRI on the 31st"]);
    expect(spine.textContent).toContain("Sep 5 · AJ:");
  });

  it("draws the spine open from the start when asked (the Open zone)", () => {
    mount(
      [entry({ id: "a" }), entry({ id: "u1", threadId: "a", body: "still sore", occurredAt: new Date("2026-09-05T16:00:00Z") })],
      { defaultOpen: true },
    );
    expect(host.querySelector('[data-testid="spine-a"]')?.textContent).toContain("still sore");
  });

  it("an update is written onto the thread, plain, not as a note of its own", async () => {
    mount([entry({ id: "a" })]);
    click(byText("Add an update"));
    const box = host.querySelector("textarea")!;
    // It takes the focus when it opens — never on mount.
    expect(document.activeElement).toBe(box);
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
    expect(host.querySelector(".nt-pill")?.textContent).toBe("Resolved");
    expect(host.querySelector("article")?.className).toContain("nt-card--resolved");
  });

  it("an equipment note simply closes and reopens — it is never 'healed'", async () => {
    mount([entry({ id: "e", kind: "equipment", importance: "standard", body: "Extra pad on the chest press" })]);
    expect(byText("All healed up")).toBeNull();
    expect(byText("Close")).not.toBeNull();
    mount([entry({ id: "e", kind: "equipment", importance: "standard", resolvedAt: new Date("2026-09-12T16:00:00Z") })]);
    expect(byText("Reopen")).not.toBeNull();
    expect(byText("back")).toBeNull();
  });

  it("an imported record is read-only — no update, no close, no ⋯ — and says where it lives", () => {
    mount([entry({ id: "a", isLegacy: true, legacySource: "Mindbody account notes", authorId: "unknown" })]);
    expect(byText("Add an update")).toBeNull();
    expect(byText("All healed up")).toBeNull();
    expect(host.querySelector('[aria-label="More for this note"]')).toBeNull();
    expect(host.textContent).toContain("Read-only · Mindbody account notes");
    expect(host.textContent).toContain("Edit it where it lives.");
    expect(host.querySelector("article")?.className).toContain("nt-card--legacy");
  });

  it("archives the whole thread — the root and every update in one batch — only after a confirm", async () => {
    mount([
      entry({ id: "a" }),
      entry({ id: "u1", threadId: "a", body: "still sore" }),
      entry({ id: "u2", threadId: "a", body: "MRI booked" }),
    ]);
    // Keep writes nothing.
    click(host.querySelector('[aria-label="More for this note"]'));
    click(byText("Archive…"));
    expect(host.textContent).toContain("Archive this note and its 2 updates? It leaves every screen.");
    click(byText("Keep"));
    expect(batches).toHaveLength(0);
    expect(updates).toHaveLength(0);

    click(host.querySelector('[aria-label="More for this note"]'));
    click(byText("Archive…"));
    await act(async () => {
      byText("Archive")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(batches).toHaveLength(1);
    expect(batches[0].updates.map((u) => u.path)).toEqual(["journalEntries/a", "journalEntries/u1", "journalEntries/u2"]);
    for (const u of batches[0].updates) {
      expect(Object.keys(u.data).sort()).toEqual(["isArchived", "updatedAt"]);
      expect(u.data.isArchived).toBe(true);
    }
    // Nothing else was written: archiving is not closing.
    expect(updates).toHaveLength(0);
  });

  it("says where the thread stands with this trainer's briefing, and offers the hush only once dismissals are read", () => {
    const onHush = vi.fn();
    mount([entry({ id: "a" })], { briefing: { kind: "on", checked: true }, onHush });
    expect(host.textContent).toContain("On your next briefing.");
    click(byText("No need to remind me"));
    expect(onHush).toHaveBeenCalledTimes(1);

    mount([entry({ id: "a" })], { briefing: { kind: "on", checked: false }, onHush });
    expect(byText("No need to remind me")).toBeNull();

    const onRestore = vi.fn();
    mount([entry({ id: "a" })], { briefing: { kind: "hushed" }, onRestore });
    expect(host.textContent).toContain("You hushed this on your briefing. Only you can see that.");
    click(byText("Show it again"));
    expect(onRestore).toHaveBeenCalledTimes(1);

    mount([entry({ id: "a" })], { briefing: { kind: "from", day: "2026-10-01" } });
    expect(host.textContent).toContain("On the briefing from Oct 1.");

    mount([entry({ id: "a", importance: "elevated" })], { briefing: { kind: "aged-off", since: "2026-09-22" } });
    expect(host.textContent).toContain("Off the briefing since Sep 22: a Heads up with no end day is read out for three weeks.");

    mount([entry({ id: "a" })], { briefing: null });
    expect(host.querySelector(".nt-brief")).toBeNull();
  });

  it("wears its loudness as its colour, names the machine in full, and uses no palette class or raw colour", () => {
    mount([entry({ id: "a", machineId: "m-leg" })]);
    const card = host.querySelector("article")!;
    expect(card.className).toContain("nt-card--critical");
    expect(card.querySelector(".nt-pill")?.textContent).toBe("Critical");
    expect(card.querySelector(".nt-pill")?.getAttribute("data-tone")).toBe("alert");
    expect(card.textContent).toContain("Leg Press");

    mount([entry({ id: "h", importance: "elevated", kind: "coaching", category: "Pace" })]);
    expect(host.querySelector("article")!.className).toContain("nt-card--headsup");
    expect(host.querySelector(".nt-pill")?.getAttribute("data-tone")).toBe("warn");
    expect(host.querySelector(".nt-cat")?.textContent).toBe("Pace");

    const classes = Array.from(host.querySelectorAll("[class]")).map((el) => el.getAttribute("class") ?? "");
    for (const c of classes) {
      expect(c).not.toMatch(/rose-|violet-|fuchsia-|slate-|amber-|#/);
    }
    expect(host.innerHTML).not.toMatch(/style="[^"]*(?:#|rgb)/);
  });
});
