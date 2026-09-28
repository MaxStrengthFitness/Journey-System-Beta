// @vitest-environment jsdom
/**
 * MY STUDIO → OPENINGS → A TIME'S SHEET → "MARK THIS TIME" (Openings round,
 * phase 6), mounted in the real section with a time's sheet open in the
 * Context Panel. Every read and write the section makes is faked at
 * `firebase/firestore`; the marks listener answers again after each write,
 * as the server would.
 *
 *   - a time nobody marked: the form, the bookings' disagreement shown first,
 *     and the write, as the person signed in, at the server's time;
 *   - a colleague's mark changed (signed by the person changing it, a note
 *     taken out is gone) and removed (one question first);
 *   - the 60-day review: "Still true?" with Keep, which signs it again today;
 *   - what the chosen word changes is the core's answer for THIS time: a
 *     time that reads Always full is never promised as an offer;
 *   - a half-written mark is typing: Openings' parts, the Context Panel's X
 *     and Escape, a tap on another time and the form's own Cancel ask
 *     before they would lose it, and it is never saved onto another time;
 *   - a failed write keeps the typing and says so; a write the database
 *     hasn't answered (offline, or slow) never hangs the sheet: the form
 *     closes and says it is saved on this iPad, and a later refusal is said;
 *     with the marks unknown, nothing can be marked.
 *
 * Today is Monday Nov 9 2026, noon Eastern, the day after the fixture's
 * Sunday run. Monday 8:00 AM reads Always full (full in all of the last 8
 * Mondays); Tuesday 10:30 AM reads Usually has room (room in 8 of 8).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Trainer } from "../../../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Stored = { id: string; data: Record<string, unknown> };
type Write = { op: "set" | "delete"; path: string; data?: Record<string, unknown>; options?: unknown };

const fake = vi.hoisted(() => ({
  summary: null as unknown,
  weeks: { docs: [] as unknown[], loading: false, error: null as string | null },
  marks: [] as Stored[],
  marksFail: false,
  listeners: new Set<(snap: unknown) => void>(),
  writes: [] as Write[],
  writeFails: false,
  /** The write is on the iPad (its copy answers the listener) and its promise waits for the database. */
  writeHangs: false,
  pending: [] as { resolve: () => void; reject: (err: unknown) => void }[],
  answer: () => {},
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-sam" } }, functions: {} }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  const snapshot = () => ({ docs: fake.marks.map((m) => ({ id: m.id, data: () => m.data })), metadata: { fromCache: false } });
  const answer = () => setTimeout(() => fake.listeners.forEach((next) => next(snapshot())), 0);
  fake.answer = answer;
  const written = (op: Write["op"], r: { path: string }, data?: Record<string, unknown>, options?: unknown) => {
    fake.writes.push({ op, path: r.path, data, options });
    if (fake.writeFails) return Promise.reject(Object.assign(new Error("offline"), { code: "unavailable" }));
    const id = r.path.split("/").pop()!;
    fake.marks = fake.marks.filter((m) => m.id !== id);
    // The server stamps its own time (the iPad's copy estimates it).
    if (op === "set") fake.marks.push({ id, data: { ...data, at: new Date() } });
    answer();
    if (fake.writeHangs) return new Promise<void>((resolve, reject) => fake.pending.push({ resolve, reject }));
    return Promise.resolve();
  };
  return {
    ...real,
    doc: ref,
    collection: ref,
    serverTimestamp: () => "SERVER_TIME",
    getDoc: () => Promise.resolve({ exists: () => true, data: () => fake.summary, metadata: { fromCache: false } }),
    onSnapshot: (_r: unknown, _opts: unknown, next: (s: unknown) => void, fail: (e: unknown) => void) => {
      const t = setTimeout(() => {
        if (fake.marksFail) return fail(Object.assign(new Error("denied"), { code: "permission-denied" }));
        fake.listeners.add(next);
        next(snapshot());
      }, 0);
      return () => {
        clearTimeout(t);
        fake.listeners.delete(next);
      };
    },
    setDoc: (r: { path: string }, data: Record<string, unknown>, options?: unknown) => written("set", r, data, options),
    deleteDoc: (r: { path: string }) => written("delete", r),
  };
});
vi.mock("../../standing-week/useStandingWeeks", () => ({ useStandingWeeks: () => fake.weeks }));

import { forgetPersonalMemory } from "../../sign-out/memory";
import { FINISH_WAIT_MS } from "../../session-record/finish-wait";
import { OpeningsSection } from "./OpeningsSection";
import { PAT, PAT_WEEK, SAM, SAM_TUESDAYS, Shell, WESTLAKE, foldFixture } from "./test-shell";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-11-09T12:00:00-05:00") });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  forgetPersonalMemory();
  fake.summary = foldFixture();
  fake.weeks = { docs: [SAM_TUESDAYS, PAT_WEEK], loading: false, error: null };
  fake.marks = [];
  fake.marksFail = false;
  fake.listeners.clear();
  fake.writes = [];
  fake.writeFails = false;
  fake.writeHangs = false;
  fake.pending = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function mount(viewer: Trainer = SAM) {
  await act(async () => {
    root.render(
      <StrictMode>
        <Shell>
          <OpeningsSection studio={WESTLAKE} authTrainer={viewer} trainers={[SAM, PAT]} />
        </Shell>
      </StrictMode>,
    );
  });
  await settle();
}
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
const cell = (key: string) => host.querySelector<HTMLButtonElement>(`[data-key="${key}"]`)!;
const sheet = () => host.querySelector<HTMLElement>("[data-testid='time-sheet']")!;
const markPart = () => host.querySelector<HTMLElement>("[data-testid='mark-this-time']");
const leadLines = () => [...sheet().querySelectorAll(".op-sheet__line--lead")].map((l) => l.textContent);
const buttonIn = (within: ParentNode, text: string) => [...within.querySelectorAll("button")].find((b) => b.textContent === text) ?? null;
const chip = (text: string) => buttonIn(markPart()!, text)!;
const note = () => markPart()!.querySelector("textarea")!;

async function open(key: string) {
  await act(async () => cell(key).click());
}
async function tap(button: HTMLButtonElement | null) {
  expect(button).not.toBeNull();
  await act(async () => button!.click());
  await settle();
}
async function type(text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(note(), text);
    note().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
/** The leave question, rendered into <body>. */
const question = () => [...document.body.querySelectorAll("[role='alertdialog'], [role='dialog']")].find((d) => /unsaved changes/i.test(d.textContent ?? "")) ?? null;
const MONDAY_QUESTION = "You have unsaved changes to the mark on Monday 8:00 AM. Leave without saving?";
const panelTitle = () => host.querySelector(".cp__title")?.textContent ?? null;
/** The iPad knows it is offline (no online/offline event: the marks were read before it went). */
const goOffline = () => vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
const queuedLine = () => host.querySelector("[data-testid='mark-queued']")?.textContent ?? null;
const disabledIn = (within: ParentNode) => [...within.querySelectorAll("button")].filter((b) => b.disabled).map((b) => b.textContent);
/** Monday 8:00 with the form open, Usually has room chosen and a note typed. */
async function typingOnMonday(text = "Monday's note") {
  await open("1-0800");
  await tap(buttonIn(markPart()!, "Mark this time"));
  await tap(chip("Usually has room"));
  await type(text);
}

/** Pat's mark on a time, as the server holds it. */
const patsMark = (key: string, over: Record<string, unknown> = {}): Stored => {
  const [wd, hhmm] = key.split("-");
  return {
    id: key,
    data: {
      weekday: Number(wd),
      time: `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`,
      mark: "full",
      note: "The rotation's regulars",
      by: { id: "uid-pat", name: "Pat Moss" },
      at: new Date("2026-11-02T15:00:00Z"),
      ...over,
    },
  };
};

describe("a time nobody has marked", () => {
  it("offers Mark this time, and the form shows the bookings' disagreement first", async () => {
    await mount();
    await open("2-1030");
    expect(leadLines()).toEqual(["Tuesday 10:30 AM · Usually has room: room in 8 of the last 8 Tuesdays, and nobody booked in 8 of them."]);
    expect(markPart()?.textContent).toContain("A mark sits beside the numbers and never replaces them.");
    await tap(buttonIn(markPart()!, "Mark this time"));

    // Nothing chosen yet: nothing to save.
    expect(buttonIn(markPart()!, "Save the mark")?.disabled).toBe(true);
    expect(chip("Always full").getAttribute("aria-pressed")).toBe("false");

    // Always full, where the bookings say room: they say so before anything is saved.
    await tap(chip("Always full"));
    expect(host.querySelector("[data-testid='mark-disagree']")?.textContent).toBe("The bookings disagree: room in 8 of the last 8 Tuesdays.");
    expect(markPart()?.textContent).toContain("Always full counts as usually full on Next 7 days, and is never offered as a new regular time.");
    // Usually has room agrees with them: no disagreement.
    await tap(chip("Usually has room"));
    expect(host.querySelector("[data-testid='mark-disagree']")).toBeNull();
    // The time already reads Usually has room: the offer is the numbers' own, and when it would be listed.
    expect(host.querySelector("[data-testid='mark-changes']")?.textContent).toBe(
      "Usually has room can be offered as a new regular time when someone's agreed week has them in then with no regular there, and the coming weeks don't show it taken.",
    );
    expect(fake.writes).toEqual([]);
  });

  it("saves the mark as the person signed in, at the server's time, and the sheet shows it first", async () => {
    await mount();
    await open("2-1030");
    await tap(buttonIn(markPart()!, "Mark this time"));
    await tap(chip("Always full"));
    await type("  Pat's two regulars take it most weeks  ");
    expect(markPart()?.textContent).toContain("Everyone at Westlake sees it, with your name. 41 of 200.");
    await tap(buttonIn(markPart()!, "Save the mark"));

    expect(fake.writes).toEqual([
      {
        op: "set",
        path: "studios/westlake/openingsMarks/2-1030",
        data: {
          weekday: 2,
          time: "10:30",
          mark: "full",
          note: "Pat's two regulars take it most weeks",
          // The Auth uid, never the trainers/{id}; the whole name.
          by: { id: "uid-sam", name: "Sam Lee" },
          at: "SERVER_TIME",
        },
        // The whole mark is written: never a merge.
        options: undefined,
      },
    ]);
    // The form closed; the server's answer is on the sheet, the disagreement first.
    expect(markPart()?.querySelector("textarea")).toBeNull();
    expect(leadLines()).toEqual(["The bookings disagree: room in 8 of the last 8 Tuesdays.", "Marked Always full by you, Nov 9."]);
    expect(sheet().querySelector("[data-testid='mark-note']")?.textContent).toBe("“Pat's two regulars take it most weeks”");
    expect(cell("2-1030").textContent).toContain("Marked");
    expect(buttonIn(markPart()!, "Change the mark")).not.toBeNull();
  });

  it("holds the note to 200 characters", async () => {
    await mount();
    await open("1-0800");
    await tap(buttonIn(markPart()!, "Mark this time"));
    expect(note().maxLength).toBe(200);
    await type("x".repeat(230));
    expect(note().value).toHaveLength(200);
    expect(markPart()?.textContent).toContain("200 of 200.");
  });
});

describe("a colleague's mark", () => {
  it("shows who marked it and their note, after the bookings' disagreement", async () => {
    fake.marks = [patsMark("2-1030")];
    await mount();
    await open("2-1030");
    expect(leadLines()).toEqual(["The bookings disagree: room in 8 of the last 8 Tuesdays.", "Marked Always full by Pat, Nov 2."]);
    // The note sits under the line that says who marked it.
    const lines = [...sheet().querySelectorAll(".op-sheet__lead > p")].map((p) => p.textContent);
    expect(lines).toEqual([
      "The bookings disagree: room in 8 of the last 8 Tuesdays.",
      "Marked Always full by Pat, Nov 2.",
      "“The rotation's regulars”",
    ]);
  });

  it("changed by someone else is signed by them, and a note taken out is gone", async () => {
    fake.marks = [patsMark("1-0800")];
    await mount();
    await open("1-0800");
    expect(leadLines()).toEqual(["Marked Always full by Pat, Nov 2.", "The bookings say: full in all of the last 8 Mondays."]);
    await tap(buttonIn(markPart()!, "Change the mark"));
    // The form opens on the mark as it stands.
    expect(chip("Always full").getAttribute("aria-pressed")).toBe("true");
    expect(note().value).toBe("The rotation's regulars");
    await tap(chip("Usually has room"));
    expect(host.querySelector("[data-testid='mark-disagree']")?.textContent).toBe("The bookings disagree: full in 8 of the last 8 Mondays.");
    // A time that reads Always full is never offered, whatever the mark: the form doesn't promise it.
    expect(markPart()?.textContent).toContain("This time reads Always full, so it isn't offered as a new regular time, whatever the mark.");
    expect(markPart()?.textContent).not.toContain("can be offered as a new regular time");
    await type("");
    await tap(buttonIn(markPart()!, "Save the mark"));
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0].path).toBe("studios/westlake/openingsMarks/1-0800");
    expect(fake.writes[0].data).toEqual({ weekday: 1, time: "08:00", mark: "room", by: { id: "uid-sam", name: "Sam Lee" }, at: "SERVER_TIME" });
    expect(leadLines()[1]).toBe("Marked Usually has room by you, Nov 9.");
    expect(sheet().querySelector("[data-testid='mark-note']")).toBeNull();
  });

  it("is removed only after one question, for everyone", async () => {
    fake.marks = [patsMark("1-0800")];
    await mount();
    await open("1-0800");
    await tap(buttonIn(markPart()!, "Remove the mark"));
    expect(fake.writes).toEqual([]);
    const asked = host.querySelector<HTMLElement>("[data-testid='mark-remove-question']")!;
    expect(asked.textContent).toContain("Remove this mark? It goes for everyone at Westlake.");
    // Cancel keeps it.
    await tap(buttonIn(asked, "Cancel"));
    expect(fake.writes).toEqual([]);
    await tap(buttonIn(markPart()!, "Remove the mark"));
    await tap(buttonIn(host.querySelector("[data-testid='mark-remove-question']")!, "Remove it"));
    expect(fake.writes).toEqual([{ op: "delete", path: "studios/westlake/openingsMarks/1-0800", data: undefined, options: undefined }]);
    // Back to the time's own sentence, and the door to mark it again.
    expect(leadLines()).toEqual(["Monday 8:00 AM · Always full: full in all of the last 8 Mondays."]);
    expect(buttonIn(markPart()!, "Mark this time")).not.toBeNull();
    expect(cell("1-0800").textContent).not.toContain("Marked");
  });
});

describe("the 60-day review", () => {
  it("asks Still true? with Keep and Remove, and Keep signs it again, today, as the person keeping it", async () => {
    // Marked Sun Sep 6: 64 days before Mon Nov 9.
    fake.marks = [patsMark("1-0800", { at: new Date("2026-09-06T16:00:00Z") })];
    await mount();
    await open("1-0800");
    expect(leadLines()).toEqual([
      "Marked Always full by Pat, Sep 6.",
      "The bookings say: full in all of the last 8 Mondays.",
      "Marked 64 days ago. Still true?",
    ]);
    const review = host.querySelector<HTMLElement>("[data-testid='mark-review']")!;
    expect([...review.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Keep", "Remove"]);
    // Keep's the save here: the solid blue.
    expect(buttonIn(review, "Keep")?.className).toContain("pl__btn--primary");
    await tap(buttonIn(review, "Keep"));
    expect(fake.writes).toEqual([
      {
        op: "set",
        path: "studios/westlake/openingsMarks/1-0800",
        data: { weekday: 1, time: "08:00", mark: "full", note: "The rotation's regulars", by: { id: "uid-sam", name: "Sam Lee" }, at: "SERVER_TIME" },
        options: undefined,
      },
    ]);
    // Signed again today: no longer up for review.
    expect(leadLines()).toEqual(["Marked Always full by you, Nov 9.", "The bookings say: full in all of the last 8 Mondays."]);
    expect(host.querySelector("[data-testid='mark-review']")).toBeNull();
  });

  it("keeps working while it waits, and Remove there asks first", async () => {
    fake.marks = [patsMark("1-0800", { at: new Date("2026-09-06T16:00:00Z") })];
    await mount();
    expect(cell("1-0800").textContent).toContain("Marked");
    await open("1-0800");
    await tap(buttonIn(host.querySelector("[data-testid='mark-review']")!, "Remove"));
    expect(fake.writes).toEqual([]);
    await tap(buttonIn(host.querySelector("[data-testid='mark-remove-question']")!, "Remove it"));
    expect(fake.writes.map((w) => `${w.op} ${w.path}`)).toEqual(["delete studios/westlake/openingsMarks/1-0800"]);
  });
});

describe("a half-written mark is typing", () => {
  it("Openings' parts ask before they would lose it", async () => {
    await mount();
    await open("1-0800");
    await tap(buttonIn(markPart()!, "Mark this time"));
    await tap(chip("Usually has room"));
    await type("Two regulars moved to 7:00");
    await tap(host.querySelector<HTMLButtonElement>("#op-tab-next"));
    expect(question()?.textContent).toContain("You have unsaved changes to the mark on Monday 8:00 AM. Leave without saving?");
    await tap(buttonIn(question()!, "Keep editing"));
    // Still on the usual week, with the typing.
    expect(host.querySelector("#op-tab-usual")?.getAttribute("aria-selected")).toBe("true");
    expect(note().value).toBe("Two regulars moved to 7:00");
    expect(fake.writes).toEqual([]);
  });

  it("the form's own Cancel asks too, and Leave throws the typing away", async () => {
    await mount();
    await open("1-0800");
    await tap(buttonIn(markPart()!, "Mark this time"));
    await tap(chip("Usually has room"));
    await tap(buttonIn(markPart()!, "Cancel"));
    expect(question()).not.toBeNull();
    await tap(buttonIn(question()!, "Leave"));
    expect(markPart()?.querySelector("textarea")).toBeNull();
    expect(buttonIn(markPart()!, "Mark this time")).not.toBeNull();
    expect(fake.writes).toEqual([]);
  });

  it("opened and left untouched, it asks nothing", async () => {
    await mount();
    await open("1-0800");
    await tap(buttonIn(markPart()!, "Mark this time"));
    await tap(buttonIn(markPart()!, "Cancel"));
    expect(question()).toBeNull();
    expect(buttonIn(markPart()!, "Mark this time")).not.toBeNull();
  });

  it("a tap on another time asks first, and the typing is never saved onto it", async () => {
    await mount();
    await typingOnMonday();
    await open("2-1030");
    await settle();
    expect(question()?.textContent).toContain(MONDAY_QUESTION);
    // Keep editing: Monday's sheet, with the typing.
    await tap(buttonIn(question()!, "Keep editing"));
    expect(panelTitle()).toContain("Monday 8:00 AM");
    expect(note().value).toBe("Monday's note");
    expect(cell("1-0800").getAttribute("aria-current")).toBe("true");
    // Leave: Tuesday's sheet starts clean, no form, no Monday note.
    await open("2-1030");
    await settle();
    await tap(buttonIn(question()!, "Leave"));
    expect(panelTitle()).toContain("Tuesday 10:30 AM");
    expect(markPart()?.querySelector("textarea")).toBeNull();
    expect(buttonIn(markPart()!, "Mark this time")).not.toBeNull();
    expect(fake.writes).toEqual([]);
  });

  it("a tap on the time already open asks nothing and keeps the typing", async () => {
    await mount();
    await typingOnMonday();
    await open("1-0800");
    await settle();
    expect(question()).toBeNull();
    expect(note().value).toBe("Monday's note");
  });

  it("the sheet's X asks first", async () => {
    await mount();
    await typingOnMonday();
    await tap(host.querySelector<HTMLButtonElement>(".cp__close"));
    expect(question()?.textContent).toContain(MONDAY_QUESTION);
    await tap(buttonIn(question()!, "Keep editing"));
    expect(panelTitle()).toContain("Monday 8:00 AM");
    expect(note().value).toBe("Monday's note");
    await tap(host.querySelector<HTMLButtonElement>(".cp__close"));
    await tap(buttonIn(question()!, "Leave"));
    expect(host.querySelector("[data-testid='time-sheet']")).toBeNull();
    expect(fake.writes).toEqual([]);
  });

  it("Escape asks first", async () => {
    await mount();
    await typingOnMonday();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(question()?.textContent).toContain(MONDAY_QUESTION);
    await tap(buttonIn(question()!, "Keep editing"));
    expect(panelTitle()).toContain("Monday 8:00 AM");
    expect(note().value).toBe("Monday's note");
    expect(fake.writes).toEqual([]);
  });

  it("with nothing typed, another time and the X just go", async () => {
    await mount();
    await open("1-0800");
    await open("2-1030");
    await settle();
    expect(question()).toBeNull();
    expect(panelTitle()).toContain("Tuesday 10:30 AM");
    await tap(host.querySelector<HTMLButtonElement>(".cp__close"));
    expect(question()).toBeNull();
    expect(host.querySelector("[data-testid='time-sheet']")).toBeNull();
  });
});

describe("when a write can't be made", () => {
  it("a failed save keeps the typing and says so, and it still counts as unsaved", async () => {
    fake.writeFails = true;
    await mount();
    await open("1-0800");
    await tap(buttonIn(markPart()!, "Mark this time"));
    await tap(chip("Usually has room"));
    await type("Two regulars moved to 7:00");
    await tap(buttonIn(markPart()!, "Save the mark"));
    expect(markPart()?.textContent).toContain("Couldn't save the mark just now. Check the connection and try again.");
    expect(note().value).toBe("Two regulars moved to 7:00");
    await tap(host.querySelector<HTMLButtonElement>("#op-tab-next"));
    expect(question()).not.toBeNull();
    await tap(buttonIn(question()!, "Keep editing"));
  });

  it("while a save is on its way, the form waits a moment and says so, then closes: it never hangs", async () => {
    fake.writeHangs = true;
    await mount();
    await open("1-0800");
    await tap(buttonIn(markPart()!, "Mark this time"));
    await tap(chip("Usually has room"));
    await tap(buttonIn(markPart()!, "Save the mark"));
    const saving = buttonIn(markPart()!, "Saving…");
    expect(saving?.disabled).toBe(true);
    expect(buttonIn(markPart()!, "Cancel")?.disabled).toBe(true);
    expect(fake.writes).toHaveLength(1);
    // No answer from the database in a moment: saved on this iPad, and the form closes.
    await act(async () => {
      vi.advanceTimersByTime(FINISH_WAIT_MS);
    });
    await settle();
    expect(markPart()?.querySelector("textarea")).toBeNull();
    expect(queuedLine()).toBe("Saved on this iPad. It goes to the studio when the connection is back.");
    expect(disabledIn(sheet())).toEqual([]);
    // The database answers: the line goes.
    await act(async () => fake.pending[0].resolve());
    await settle();
    expect(queuedLine()).toBeNull();
  });

  it("offline, Save closes the form at once, and the sheet shows the mark from the iPad", async () => {
    fake.writeHangs = true;
    await mount();
    await typingOnMonday("Two regulars moved to 7:00");
    goOffline();
    await tap(buttonIn(markPart()!, "Save the mark"));
    expect(buttonIn(markPart()!, "Saving…")).toBeNull();
    expect(markPart()?.querySelector("textarea")).toBeNull();
    expect(queuedLine()).toBe("Saved on this iPad. It goes to the studio when the connection is back.");
    expect(leadLines()).toEqual(["The bookings disagree: full in 8 of the last 8 Mondays.", "Marked Usually has room by you, Nov 9."]);
    expect(buttonIn(markPart()!, "Change the mark")).not.toBeNull();
    expect(disabledIn(sheet())).toEqual([]);
    // Nothing half-written is left to ask about: the X just closes.
    await tap(host.querySelector<HTMLButtonElement>(".cp__close"));
    expect(question()).toBeNull();
    expect(host.querySelector("[data-testid='time-sheet']")).toBeNull();
  });

  it("offline, a save the database refuses later says so at the foot of the sheet", async () => {
    fake.writeHangs = true;
    await mount();
    await typingOnMonday();
    goOffline();
    await tap(buttonIn(markPart()!, "Save the mark"));
    expect(queuedLine()).not.toBeNull();
    // Refused: the iPad's copy takes the mark back, and the write's promise says so.
    await act(async () => {
      fake.marks = [];
      fake.answer();
      fake.pending[0].reject(Object.assign(new Error("denied"), { code: "permission-denied" }));
    });
    await settle();
    expect(queuedLine()).toBeNull();
    expect(markPart()?.textContent).toContain("Couldn't save the mark just now. Check the connection and try again.");
    expect(buttonIn(markPart()!, "Mark this time")).not.toBeNull();
  });

  it("offline, Remove it closes the question at once", async () => {
    fake.writeHangs = true;
    fake.marks = [patsMark("1-0800")];
    await mount();
    await open("1-0800");
    goOffline();
    await tap(buttonIn(markPart()!, "Remove the mark"));
    await tap(buttonIn(host.querySelector("[data-testid='mark-remove-question']")!, "Remove it"));
    expect(host.querySelector("[data-testid='mark-remove-question']")).toBeNull();
    expect(queuedLine()).toBe("Removed on this iPad. It goes to the studio when the connection is back.");
    expect(leadLines()).toEqual(["Monday 8:00 AM · Always full: full in all of the last 8 Mondays."]);
    expect(disabledIn(sheet())).toEqual([]);
  });

  it("offline, Keep signs the mark on the iPad at once, and nothing stays disabled", async () => {
    fake.writeHangs = true;
    fake.marks = [patsMark("1-0800", { at: new Date("2026-09-06T16:00:00Z") })];
    await mount();
    await open("1-0800");
    goOffline();
    await tap(buttonIn(host.querySelector("[data-testid='mark-review']")!, "Keep"));
    expect(queuedLine()).toBe("Kept on this iPad. It goes to the studio when the connection is back.");
    expect(host.querySelector("[data-testid='mark-review']")).toBeNull();
    expect(leadLines()[0]).toBe("Marked Always full by you, Nov 9.");
    expect(disabledIn(sheet())).toEqual([]);
  });

  it("with the marks unknown, nothing can be marked, and the sheet says it can't tell", async () => {
    fake.marksFail = true;
    await mount();
    await open("1-0800");
    expect(sheet().textContent).toContain("Can't tell just now whether anyone has marked this time.");
    expect(markPart()).toBeNull();
    expect(sheet().querySelectorAll("button")).toHaveLength(0);
  });
});
