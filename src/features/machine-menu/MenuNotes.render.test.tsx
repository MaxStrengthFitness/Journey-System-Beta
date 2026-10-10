// @vitest-environment jsdom
/**
 * THE NOTES BLOCK, MOUNTED (the machine menu, phase 5).
 *
 * The box is the session's one note draft in a session and its own draft on
 * the profile, and it writes one of two stores, so only a mount proves
 * (machine menu design §C, "Notes, tap by tap"):
 *
 *   - in a session every keystroke goes to the tracker's draft (this
 *     machine, about the machine) and nothing is put in storage by the card:
 *     there is no second storage key;
 *   - a draft about another machine shows as it is, with "Make it about Leg
 *     Press";
 *   - a session note carries the session link, and the card never waits on
 *     the database: offline it says "Saved on this iPad";
 *   - the loudness starts at the category's own, and one picked by hand
 *     sticks;
 *   - "The machine itself" writes the studio's floor notes through
 *     `addFloorNote` and never `addMachineNote`;
 *   - the profile's draft joins the unsaved-changes registry;
 *   - the list leaves settings copies out (unless the setting changes
 *     couldn't be read), heads with the newest open note, groups All notes,
 *     and a note's thread offers Add update and More;
 *   - a watched session reads only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-sam" } } }));

const writes = vi.hoisted(() => ({
  machineNotes: [] as Record<string, unknown>[],
  floorNotes: [] as Record<string, unknown>[],
  answer: "ok" as "ok" | "never" | "refuse" | "later",
  thread: [] as [string, ...unknown[]][],
  /** "later": each write's own answer, given by the test. */
  pending: [] as { resolve: (v: unknown) => void; reject: (e: unknown) => void }[],
}));
const answer = <T,>(value: T): Promise<T> => {
  if (writes.answer === "later") {
    return new Promise<T>((resolve, reject) => writes.pending.push({ resolve: () => resolve(value), reject }));
  }
  return writes.answer === "never" ? new Promise<T>(() => {}) : writes.answer === "refuse" ? Promise.reject(new Error("refused")) : Promise.resolve(value);
};

vi.mock("../equipment/mutations", () => ({
  addMachineNote: (args: Record<string, unknown>) => {
    writes.machineNotes.push(args);
    return answer({ id: "journal:new", content: args.content });
  },
}));
vi.mock("../floor-notes/store", () => ({
  addFloorNote: (args: Record<string, unknown>) => {
    writes.floorNotes.push(args);
    return answer("floor-1");
  },
}));
vi.mock("../client-notes/thread-write", () => ({
  addThreadUpdate: (...a: unknown[]) => (writes.thread.push(["update", ...a]), Promise.resolve("u-1")),
  closeThread: (...a: unknown[]) => (writes.thread.push(["close", ...a]), Promise.resolve()),
  reopenThread: (...a: unknown[]) => (writes.thread.push(["reopen", ...a]), Promise.resolve()),
  archiveThread: (...a: unknown[]) => (writes.thread.push(["archive", ...a]), Promise.resolve()),
  unarchiveThread: (...a: unknown[]) => (writes.thread.push(["unarchive", ...a]), Promise.resolve()),
}));
vi.mock("../client-notes/dismissal-store", () => ({
  dismissThread: (...a: unknown[]) => (writes.thread.push(["dismiss", ...a]), Promise.resolve()),
}));

import { EMPTY_SESSION_DRAFT, type SessionNoteDraft } from "../client-notes/session-draft";
import { UnsavedChangesProvider, useUnsavedStatus } from "../unsaved-changes";
import { LEG_PRESS_HISTORY, LEG_PRESS_JOURNAL, TODAY } from "./fixtures";
import { MenuNotes, type MenuNotesProps } from "./MenuNotes";
import { parseSettingHistory } from "./setting-history";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HISTORY = parseSettingHistory(LEG_PRESS_HISTORY, "avery");
const AUTHOR = { id: "uid-sam", fullName: "Sam Reyes", initials: "SR" };
const SESSION_LINK = { studioId: "westlake", origin: "in_session" as const, sessionId: "s-71", sessionNumber: 71, sessionDay: TODAY };

function base(over: Partial<MenuNotesProps> = {}): MenuNotesProps {
  return {
    door: "profile",
    machineId: "leg-press",
    machineName: "Leg Press",
    machineNameOf: (id) => (id === "chest-press" ? "Chest Press" : null),
    clientId: "avery",
    clientFirstName: "Avery",
    journal: LEG_PRESS_JOURNAL,
    history: HISTORY,
    journalContext: { studioId: "westlake", origin: "profile" },
    floorStudio: { id: "westlake", name: "Westlake" },
    author: AUTHOR,
    online: true,
    today: TODAY,
    ...over,
  };
}

/** The tracker's side: it owns the one draft and gets every change. */
function Session({ start = null, onChange, ...over }: Partial<MenuNotesProps> & { start?: SessionNoteDraft | null; onChange: (d: SessionNoteDraft) => void }) {
  const [draft, setDraft] = useState<SessionNoteDraft | null>(start);
  return (
    <MenuNotes
      {...base({ door: "session", journalContext: SESSION_LINK, ...over })}
      draft={draft}
      onDraftChange={(d) => {
        onChange(d);
        // The tracker keeps a draft only while it has words (handleDraftChange).
        setDraft(d.body.trim() ? d : null);
      }}
    />
  );
}

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(node: ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  mounted.push({ root, host });
  return host;
}

beforeEach(() => {
  writes.machineNotes = [];
  writes.floorNotes = [];
  writes.thread = [];
  writes.pending = [];
  writes.answer = "ok";
  window.sessionStorage.clear();
});

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function type(el: Element | null, text: string) {
  expect(el).not.toBeNull();
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, text);
    el!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function focus(el: Element | null) {
  await act(async () => {
    (el as HTMLElement).focus();
    el!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  });
}

const byText = (host: HTMLElement, text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) ?? null;
const radio = (host: HTMLElement, text: string) => [...host.querySelectorAll('[role="radio"]')].find((b) => b.textContent?.trim() === text) ?? null;
const box = (host: HTMLElement) => host.querySelector<HTMLTextAreaElement>(".mm-cmp__text")!;

describe("in a session, the box is the tracker's one draft", () => {
  it("sends every keystroke to the tracker's draft, about this machine, with no second storage key", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const onChange = vi.fn();
    const host = await mount(<Session onChange={onChange} />);
    expect(box(host).getAttribute("placeholder")).toBe("Note about Avery on Leg Press…");
    await type(box(host), "Knee tracks in at the top");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: "Knee tracks in at the top",
        machineId: "leg-press",
        aboutMachine: true,
        category: "coaching",
        flavour: "Setup",
        importance: "standard",
      }),
    );
    expect(onChange.mock.lastCall![0].toFloor).toBeUndefined();
    // The card writes no storage of its own: the tracker mirrors its draft.
    expect(setItem).not.toHaveBeenCalled();
    expect(window.sessionStorage.length).toBe(0);
    // The box opened with its words: filing, loudness and the two buttons.
    expect(host.textContent).toContain("Filed as");
    expect(host.textContent).toContain("Coaching & equipment · Set-up");
    expect(byText(host, "Add note")).not.toBeNull();
  });

  it("shows a draft about another machine as it is, with 'Make it about Leg Press'", async () => {
    const onChange = vi.fn();
    const start = { ...EMPTY_SESSION_DRAFT, body: "Shoulder pinches at the top", machineId: "chest-press", aboutMachine: true };
    const host = await mount(<Session start={start} onChange={onChange} />);
    expect(box(host).value).toBe("Shoulder pinches at the top");
    expect(host.textContent).toContain("About Chest Press");
    expect(byText(host, "Add note")).toBeNull();
    await click(byText(host, "Make it about Leg Press"));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ body: "Shoulder pinches at the top", machineId: "leg-press", aboutMachine: true }));
    expect(byText(host, "Add note")).not.toBeNull();
  });

  it("files a note with the session link, never waiting on the database, and clears the words", async () => {
    writes.answer = "never";
    const onChange = vi.fn();
    const host = await mount(<Session onChange={onChange} online={false} />);
    await type(box(host), "Knee tracks in at the top");
    await click(byText(host, "Add note"));
    expect(writes.machineNotes).toHaveLength(1);
    expect(writes.machineNotes[0]).toMatchObject({
      clientId: "avery",
      machineId: "leg-press",
      machineName: "Leg Press",
      content: "Knee tracks in at the top",
      filing: { kind: "equipment", category: null },
      importance: "standard",
      author: AUTHOR,
      journal: { studioId: "westlake", origin: "in_session", sessionId: "s-71", sessionNumber: 71, sessionDay: TODAY },
    });
    expect(host.textContent).toContain("Saved on this iPad · sends when online");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ body: "" }));
    expect(box(host).value).toBe("");
  });

  it("waits only a moment online, then says it is saved on this iPad", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    writes.answer = "never";
    const host = await mount(<Session onChange={vi.fn()} />);
    await type(box(host), "Knee tracks in at the top");
    await click(byText(host, "Add note"));
    await act(async () => {
      vi.advanceTimersByTime(3_001);
    });
    expect(host.textContent).toContain("Saved on this iPad · sends when online");
  });

  it("keeps the words when the note is refused, and Try again sends them", async () => {
    writes.answer = "refuse";
    const host = await mount(<Session onChange={vi.fn()} />);
    await type(box(host), "Knee tracks in at the top");
    await click(byText(host, "Add note"));
    expect(host.textContent).toContain("Couldn't save. Your words are still here");
    expect(box(host).value).toBe("Knee tracks in at the top");
    writes.answer = "ok";
    await click(byText(host, "Try again"));
    expect(writes.machineNotes).toHaveLength(2);
    expect(host.textContent).toContain("Saved");
  });

  /* The open session round's review (Oct 9 2026): before Who's this?
     there is no client to file a note on. It said "Couldn't save" with a Try
     again that could never work. */
  it("an open session with no client yet writes nothing, keeps the words and says to choose who this is, with no Try again", async () => {
    const host = await mount(<Session onChange={vi.fn()} clientId="" clientFirstName="" />);
    await type(box(host), "Knee tracks in at the top");
    await click(byText(host, "Add note"));
    expect(writes.machineNotes).toEqual([]);
    expect(host.textContent).toContain("Choose who this is first (Who's this?) · your words stay here");
    expect(host.textContent).not.toContain("Couldn't save");
    expect(byText(host, "Try again")).toBeNull();
    expect(box(host).value).toBe("Knee tracks in at the top");
  });
});

describe("filing and loudness", () => {
  it("starts at the category's own loudness, and a loudness picked by hand sticks", async () => {
    const host = await mount(<MenuNotes {...base()} />);
    await focus(box(host));
    expect(radio(host, "Note")!.getAttribute("aria-checked")).toBe("true");
    await click(byText(host, "Change"));
    await click(byText(host, "Health"));
    expect(host.querySelector("[data-filed]")!.textContent).toBe("Health");
    expect(radio(host, "Heads up")!.getAttribute("aria-checked")).toBe("true");
    expect(host.textContent).toContain("Reaches the studio's leaders on Operations → Today");
    expect(byText(host, "Where on the body (optional)")).not.toBeNull();

    await click(radio(host, "Critical"));
    await click(byText(host, "Change"));
    await click(byText(host, "Set-up"));
    expect(radio(host, "Critical")!.getAttribute("aria-checked")).toBe("true");

    await type(box(host), "Hip pinches if the pace is fast");
    await click(byText(host, "Add note"));
    expect(writes.machineNotes[0]).toMatchObject({
      importance: "critical",
      filing: { kind: "equipment", category: null },
      journal: { studioId: "westlake", origin: "profile" },
    });
  });

  it("moves a loudness nobody picked with the filing", async () => {
    const host = await mount(<MenuNotes {...base()} />);
    await focus(box(host));
    await click(byText(host, "Change"));
    await click(byText(host, "Incident"));
    expect(radio(host, "Heads up")!.getAttribute("aria-checked")).toBe("true");
    await click(byText(host, "Change"));
    await click(byText(host, "Preference"));
    expect(radio(host, "Note")!.getAttribute("aria-checked")).toBe("true");
  });
});

describe("the machine itself", () => {
  it("writes the studio's floor notes through addFloorNote and never addMachineNote", async () => {
    const host = await mount(<MenuNotes {...base()} />);
    await focus(box(host));
    await type(box(host), "Seat pin sticks at 7");
    await click(radio(host, "The machine itself"));
    // The words stay; filing and loudness go.
    expect(box(host).value).toBe("Seat pin sticks at 7");
    expect(host.textContent).toContain("Westlake's notes on Leg Press · everyone at Westlake sees it");
    expect(host.textContent).not.toContain("Filed as");
    expect(radio(host, "Note")).toBeNull();
    await click(byText(host, "Add to Westlake's notes"));
    expect(writes.floorNotes).toEqual([
      { studioId: "westlake", machineId: "leg-press", machineName: "Leg Press", body: "Seat pin sticks at 7", writer: { name: "Sam Reyes" } },
    ]);
    expect(writes.machineNotes).toHaveLength(0);
    expect(host.textContent).toContain("On Westlake's notes for Leg Press. Everyone at Westlake sees it here and on the Catalog.");
  });

  it("rides on the session's draft as toFloor, picked before the first word", async () => {
    const onChange = vi.fn();
    const host = await mount(<Session onChange={onChange} />);
    await focus(box(host));
    await click(radio(host, "The machine itself"));
    expect(onChange).not.toHaveBeenCalled();
    await type(box(host), "Seat pin sticks at 7");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ body: "Seat pin sticks at 7", toFloor: true, machineId: "leg-press" }));
    await click(byText(host, "Add to Westlake's notes"));
    expect(writes.floorNotes).toHaveLength(1);
    expect(writes.machineNotes).toHaveLength(0);
  });
});

describe("on the profile", () => {
  it("keeps its own draft in the unsaved-changes registry", async () => {
    let status: { anyDirty: () => boolean } | null = null;
    function Probe() {
      status = useUnsavedStatus();
      return null;
    }
    const host = await mount(
      <UnsavedChangesProvider>
        <MenuNotes {...base()} />
        <Probe />
      </UnsavedChangesProvider>,
    );
    expect(status!.anyDirty()).toBe(false);
    await type(box(host), "Likes the pad a notch lower");
    expect(status!.anyDirty()).toBe(true);
  });

  it("opens with a Health note after a save for pain, never over words already there", async () => {
    const host = await mount(<MenuNotes {...base()} healthNote={{ changeWords: "Seat 4 → 5", nonce: 1 }} />);
    expect(box(host).value).toBe("Seat 4 → 5 for pain or discomfort.");
    expect(host.textContent).toContain("Health · Injury or pain");
    expect(radio(host, "Heads up")!.getAttribute("aria-checked")).toBe("true");
  });
});

describe("the list", () => {
  it("leaves settings copies out, heads with the newest open note, and counts only notes", async () => {
    const host = await mount(<MenuNotes {...base()} />);
    const rows = [...host.querySelectorAll("[data-note]")];
    expect(rows.map((r) => r.getAttribute("data-note"))).toEqual(["n3"]);
    expect(rows[0].textContent).toContain("Pushes through the toes near the end of the set; cue heels down.");
    expect(rows[0].textContent).toContain("Heads up · Ana · Sep 17");
    expect(byText(host, "All notes (3)")).not.toBeNull();
    expect(host.textContent).not.toContain("Back pad 3 → 2");
  });

  it("hides nothing when the setting changes couldn't be read", async () => {
    const host = await mount(<MenuNotes {...base({ history: null })} />);
    expect(byText(host, "All notes (6)")).not.toBeNull();
  });

  it("groups All notes Open · Standing context · Resolved, with Resolved folded", async () => {
    const host = await mount(<MenuNotes {...base()} />);
    await click(byText(host, "All notes (3)"));
    const zones = [...host.querySelectorAll("[data-note]")].map((r) => `${r.getAttribute("data-zone")}:${r.getAttribute("data-note")}`);
    expect(zones).toEqual(["open:n3", "standing:n1"]);
    expect(host.textContent).toContain("Standing context");
    await click(byText(host, "Resolved (1)"));
    expect(host.querySelector('[data-note="n2"]')!.getAttribute("data-zone")).toBe("resolved");
    expect(host.querySelector('[data-note="n2"]')!.textContent).toContain("Resolved");
  });

  it("opens a note's thread with Add update and More, and every write is the thread's own", async () => {
    const host = await mount(<MenuNotes {...base({ door: "session", journalContext: SESSION_LINK })} />);
    await click(host.querySelector('[data-note="n3"] .mm-note__row'));
    expect(host.textContent).toContain("Filed as Coaching & equipment · Posture");
    expect(host.textContent).toContain("No updates yet.");

    await click(byText(host, "Add update"));
    await type(host.querySelector(".mm-upd__input"), "Heels stayed down today");
    await click(byText(host, "Save update"));
    expect(writes.thread[0][0]).toBe("update");
    expect((writes.thread[0][1] as { id: string }).id).toBe("n3");
    expect(writes.thread[0][3]).toBe("Heels stayed down today");
    expect(writes.thread[0][4]).toEqual({ origin: "in_session", sessionId: "s-71" });

    await click(byText(host, "More"));
    await click(byText(host, "Close it"));
    expect(writes.thread[1]).toEqual(["close", "n3"]);

    await click(byText(host, "More"));
    await click(byText(host, "No need to remind me"));
    expect(writes.thread[2]).toEqual(["dismiss", "uid-sam", "n3"]);
    expect(host.textContent).toContain("Off your next briefing. Only you can see that.");

    await click(byText(host, "More"));
    await click(byText(host, "Take it off the list"));
    expect(writes.thread[3][0]).toBe("archive");
    await click(byText(host, "Undo"));
    expect(writes.thread[4][0]).toBe("unarchive");
  });

  it("says the notes couldn't be loaded rather than 'no notes'", async () => {
    const host = await mount(<MenuNotes {...base({ journal: null, journalFailed: true })} />);
    expect(host.textContent).toContain("Notes couldn't be loaded");
    expect(host.textContent).not.toContain("No notes on this machine yet.");
  });
});

describe("a watched session", () => {
  it("reads only: no box, no Add update, no More", async () => {
    const host = await mount(<MenuNotes {...base({ readOnly: true })} />);
    expect(host.querySelector("textarea")).toBeNull();
    await click(host.querySelector('[data-note="n3"] .mm-note__row'));
    expect(byText(host, "Add update")).toBeNull();
    expect(byText(host, "More")).toBeNull();
  });
});

describe("a refusal that comes after 'saved on this iPad'", () => {
  it("puts the words back in the session's draft while the box is empty, and says it couldn't save", async () => {
    writes.answer = "later";
    const onChange = vi.fn();
    const host = await mount(<Session onChange={onChange} online={false} />);
    await type(box(host), "Knee tracks in at the top");
    await click(byText(host, "Add note"));
    expect(host.textContent).toContain("Saved on this iPad · sends when online");
    expect(box(host).value).toBe("");

    await act(async () => {
      writes.pending[0].reject(new Error("permission-denied"));
    });
    expect(box(host).value).toBe("Knee tracks in at the top");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ body: "Knee tracks in at the top", machineId: "leg-press" }));
    expect(host.textContent).toContain("Couldn't save. Your words are still here");
    expect(byText(host, "Try again")).not.toBeNull();
  });

  it("never writes over words typed since: the line says what couldn't be saved", async () => {
    writes.answer = "later";
    const host = await mount(<MenuNotes {...base({ online: false })} />);
    await type(box(host), "First note");
    await click(byText(host, "Add note"));
    await type(box(host), "A second thought");
    await act(async () => {
      writes.pending[0].reject(new Error("permission-denied"));
    });
    expect(box(host).value).toBe("A second thought");
    expect(host.textContent).toContain("A note on Leg Press couldn't be saved. Write it again from the machine's card.");
  });

  it("says it in the app's toast once the card has closed", async () => {
    writes.answer = "later";
    const show = vi.fn();
    (window as unknown as { __showToast?: typeof show }).__showToast = show;
    try {
      const host = await mount(<MenuNotes {...base({ online: false })} />);
      await focus(box(host));
      await type(box(host), "Seat pin sticks at 7");
      await click(radio(host, "The machine itself"));
      await click(byText(host, "Add to Westlake's notes"));
      const m = mounted.pop()!;
      await act(async () => m.root.unmount());
      m.host.remove();
      await act(async () => {
        writes.pending[0].reject(new Error("permission-denied"));
      });
      expect(show).toHaveBeenCalledWith(
        "A note for Westlake's notes on Leg Press couldn't be saved. Write it again from the machine's card.",
        "error",
        8000,
      );
    } finally {
      delete (window as unknown as { __showToast?: unknown }).__showToast;
    }
  });

  it("cuts a long note to fit the journal's rule with the machine's name in front", async () => {
    const host = await mount(<MenuNotes {...base()} />);
    await type(box(host), "y".repeat(6000));
    await click(byText(host, "Add note"));
    expect(`Leg Press — ${writes.machineNotes[0].content as string}`.length).toBe(5000);
  });
});

describe("while a save waits", () => {
  it("holds the box still, so nothing typed then is cleared with the saved words", async () => {
    writes.answer = "later";
    const onChange = vi.fn();
    const host = await mount(<Session onChange={onChange} />);
    await type(box(host), "Knee tracks in");
    await click(byText(host, "Add note"));
    expect(box(host).readOnly).toBe(true);
    const calls = onChange.mock.calls.length;
    await type(box(host), "Knee tracks in and the left foot rolls");
    expect(onChange.mock.calls.length).toBe(calls);
    expect(box(host).value).toBe("Knee tracks in");

    await act(async () => {
      writes.pending[0].resolve(undefined);
    });
    expect(writes.machineNotes[0].content).toBe("Knee tracks in");
    expect(box(host).value).toBe("");
    expect(box(host).readOnly).toBe(false);
  });
});

describe("the floor's notes read again after one is added", () => {
  it("tells the card once the note is on the iPad, never after a refusal", async () => {
    const onFloorNoteAdded = vi.fn();
    const host = await mount(<MenuNotes {...base({ onFloorNoteAdded })} />);
    await focus(box(host));
    await type(box(host), "Seat pin sticks at 7");
    await click(radio(host, "The machine itself"));
    writes.answer = "refuse";
    await click(byText(host, "Add to Westlake's notes"));
    expect(onFloorNoteAdded).not.toHaveBeenCalled();
    writes.answer = "ok";
    await click(byText(host, "Add to Westlake's notes"));
    expect(onFloorNoteAdded).toHaveBeenCalledTimes(1);
  });
});

describe("the old list's notes, and settings copies", () => {
  const flagged = { id: "old-1", content: "Seat sticks; flag maintenance", authorName: "Ana Cole", timestamp: "2026-05-01T10:00:00-04:00", isImportant: true };
  const quiet = { id: "old-2", content: "Likes the thick pad", authorName: "Ana Cole", timestamp: "2026-04-01T10:00:00-04:00", isImportant: false };

  it("draws an old note flagged important as Critical, the strip's word, and leaves it out of the collapsed head", async () => {
    const host = await mount(<MenuNotes {...base({ journal: [], legacyNotes: [flagged, quiet] })} />);
    // Collapsed: the strip already says the flagged one, so the head is the quiet one.
    expect([...host.querySelectorAll("[data-note]")].map((r) => r.getAttribute("data-note"))).toEqual(["old-2"]);
    await click(byText(host, "All notes (2)"));
    const row = host.querySelector('[data-note="old-1"]')!;
    expect(row.textContent).toContain("Critical");
    expect(row.querySelector("svg.mm-g--alert")).not.toBeNull();
    expect(row.textContent).not.toContain("Heads up");
  });

  it("says where the setting saves are when they are all there is", async () => {
    const copies = LEG_PRESS_JOURNAL.filter((e) => e.id.startsWith("copy-"));
    const host = await mount(<MenuNotes {...base({ journal: copies })} />);
    expect(host.textContent).toContain("No notes on this machine yet. Its setting saves are under Setting changes.");
    const none = await mount(<MenuNotes {...base({ journal: [] })} />);
    expect(none.textContent).toContain("No notes on this machine yet.");
    expect(none.textContent).not.toContain("Setting changes");
  });
});
