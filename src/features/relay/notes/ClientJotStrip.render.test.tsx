// @vitest-environment jsdom
/**
 * THE JOT STRIP, MOUNTED (client codex, phase 14).
 *
 * The strip reads the trainer's own notes about this client with a listener
 * and, on Add, files the jot on the newest of them — or STARTS a new
 * "working notes" note when there is none. A failed read used to settle as
 * "none", so Add started a duplicate of the note the read could not see.
 * Only a mount proves the state it settles in:
 *
 *   - a failed read says so, and the box and Add stay off: nothing is saved;
 *   - a read that answered shows the three newest jots, each with a 40px
 *     Open, and Add files on the note that is there;
 *   - a read still on its way offers nothing to write.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  mode: "ok" as "ok" | "fail" | "pending",
  docs: [] as Array<{ id: string; data: Record<string, unknown> }>,
  saves: [] as unknown[],
  appends: [] as unknown[],
}));

vi.mock("../../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-ann" } } }));

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...real,
    query: (target: unknown) => target,
    where: () => ({}),
    limit: () => ({}),
    onSnapshot: (_q: unknown, next: (s: unknown) => void, error: (e: unknown) => void) => {
      const t = setTimeout(() => {
        if (fake.mode === "fail") error({ code: "unavailable" });
        else if (fake.mode === "ok") next({ docs: fake.docs.map((d) => ({ id: d.id, data: () => d.data })) });
      }, 0);
      return () => clearTimeout(t);
    },
  };
});

vi.mock("./mutations", () => ({
  notesRef: () => ({ path: "trainers/uid-ann/notes" }),
  newNoteId: () => "note-new",
  saveNote: vi.fn(async (args: unknown) => {
    fake.saves.push(args);
  }),
  appendNoteLog: vi.fn(async (...args: unknown[]) => {
    fake.appends.push(args);
  }),
}));

import { ClientJotStrip } from "./ClientJotStrip";
import type { Client } from "../../../types";

const client = { id: "c1", firstName: "Carol", lastName: "Brennan", gender: "Female" } as Client;
const her = { object: "her" as const };

/** A note of the trainer's about Carol, with jots in its log. */
const noteDoc = (id: string, jots: Array<{ id: string; text: string; at: number }>, updatedAt: number) => ({
  id,
  data: {
    title: "Carol Brennan — working notes",
    body: "",
    kind: "note",
    clientIds: ["c1"],
    clients: [{ id: "c1", name: "Carol Brennan" }],
    log: jots.map((j) => ({ ...j, clientId: "c1" })),
    updatedAt: new Date(updatedAt),
    createdAt: new Date(updatedAt),
  },
});

let mounted: { root: Root; host: HTMLElement }[] = [];

async function settle() {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <ClientJotStrip client={client} onOpenPlanner={() => {}} pronouns={her} />
      </StrictMode>,
    );
  });
  await settle();
  mounted.push({ root, host });
  return host;
}

async function type(box: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, value);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  fake.mode = "ok";
  fake.docs = [];
  fake.saves.length = 0;
  fake.appends.length = 0;
});

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

describe("ClientJotStrip", () => {
  it("says a failed read failed, keeps the box and Add off, and never starts a second note", async () => {
    fake.mode = "fail";
    const host = await mount();
    expect(host.textContent).toContain("Couldn't load your working notes, so a jot can't be added here now.");
    // A failed listener does not come back: the words never promise that the notes will load.
    expect(host.textContent).toContain("Reopen the profile to try again.");
    expect(host.textContent).not.toContain("until they load");
    const box = host.querySelector("textarea")!;
    const add = host.querySelector<HTMLButtonElement>('[aria-label="Add the jot"]')!;
    expect(box.disabled).toBe(true);
    expect(add.disabled).toBe(true);
    // Even a keyboard shortcut cannot file on a guess.
    await act(async () => {
      box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    });
    await act(async () => add.click());
    expect(fake.saves).toHaveLength(0);
    expect(fake.appends).toHaveLength(0);
  });

  it("offers nothing to write while the read is on its way", async () => {
    fake.mode = "pending";
    const host = await mount();
    expect(host.querySelector("textarea")!.disabled).toBe(true);
    expect(host.querySelector("textarea")!.placeholder).toBe("Loading your notes…");
    expect(host.textContent).not.toContain("starts when you jot");
  });

  it("shows the three newest jots with a 40px Open each, and files a jot on the note that is there", async () => {
    fake.docs = [
      noteDoc(
        "n1",
        [
          { id: "j1", text: "First jot", at: Date.UTC(2027, 2, 1) },
          { id: "j2", text: "Second jot", at: Date.UTC(2027, 2, 2) },
          { id: "j3", text: "Third jot", at: Date.UTC(2027, 2, 3) },
          { id: "j4", text: "Fourth jot", at: Date.UTC(2027, 2, 4) },
        ],
        Date.UTC(2027, 2, 4),
      ),
    ];
    const host = await mount();
    expect(host.textContent).toContain("Your working notes · only you");
    const items = Array.from(host.querySelectorAll(".jot__item"));
    expect(items.map((li) => li.querySelector(".jot__text")?.textContent)).toEqual(["Fourth jot", "Third jot", "Second jot"]);
    const opens = host.querySelectorAll(".jot__open");
    expect(opens).toHaveLength(3);
    for (const o of Array.from(opens)) expect(o.tagName).toBe("BUTTON");

    const box = host.querySelector("textarea")!;
    expect(box.disabled).toBe(false);
    expect(box.placeholder).toBe("What did you notice about her today?");
    await type(box, "Knee felt better today.");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Add the jot"]')!.click());
    await settle();
    expect(fake.saves).toHaveLength(0);
    expect(fake.appends).toHaveLength(1);
    expect((fake.appends[0] as unknown[])[1]).toBe("n1");
  });

  it("starts a working-notes note only when the read answered that there is none", async () => {
    const host = await mount();
    expect(host.textContent).toContain("A note about her starts when you jot.");
    await type(host.querySelector("textarea")!, "First thing I noticed.");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Add the jot"]')!.click());
    await settle();
    expect(fake.saves).toHaveLength(1);
    expect(fake.appends).toHaveLength(1);
  });
});

describe("the jot strip's stylesheet", () => {
  it("makes Open 40px tall and sets no size off the codex's scale", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "notes.css"), "utf8");
    const jot = css.slice(css.indexOf("/* The jot strip on a client's record"));
    expect(jot).toMatch(/\.jot__open \{[^}]*min-height: 40px/);
    for (const m of jot.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
      expect([11, 12, 14, 17, 30]).toContain(Number(m[1]));
    }
    expect(jot).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
