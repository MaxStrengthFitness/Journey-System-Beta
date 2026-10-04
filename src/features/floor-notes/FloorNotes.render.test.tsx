// @vitest-environment jsdom
/**
 * THE FLOOR'S NOTES ON A MACHINE, MOUNTED (notes round, Oct 3 2026).
 *
 * One dated list per machine (AJ's answer 2A): the note box, the open notes
 * with their updates, the closed ones folded, and the three old boxes' words
 * as earlier notes with Copy into the list. Mounted inside the real
 * unsaved-changes provider, so typing in any box asks before it goes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "u-lee" } } }));
const w = vi.hoisted(() => ({
  add: vi.fn(async () => "new"),
  update: vi.fn(async () => "up"),
  close: vi.fn(async () => {}),
  reopen: vi.fn(async () => {}),
  edit: vi.fn(async () => {}),
  archive: vi.fn(async () => {}),
  offer: vi.fn(async () => {}),
  noteOffer: vi.fn(async () => {}),
}));
vi.mock("./store", () => ({
  addFloorNote: w.add,
  addFloorUpdate: w.update,
  closeFloorNote: w.close,
  reopenFloorNote: w.reopen,
  editFloorNote: w.edit,
  archiveFloorNote: w.archive,
}));
vi.mock("../machine-db/mutations", () => ({ setFloorNoteOffer: w.offer, setNoteOffer: w.noteOffer }));

import { ToastProvider } from "../../contexts/ToastContext";
import { UnsavedChangesProvider, useLeaveGuard } from "../unsaved-changes";
import type { FloorNote } from "./floor-notes";
import { FloorNotes, type FloorNotesProps } from "./FloorNotes";

const at = (iso: string) => ({ toDate: () => new Date(iso) });
const NOW = new Date("2026-10-03T16:00:00Z").getTime();

function note(over: Partial<FloorNote> & { id: string }): FloorNote {
  return {
    machineId: "leg",
    machineName: "Leg Press",
    body: "The pin sticks at 7.",
    threadId: null,
    authorId: "u-lee",
    authorName: "Lee",
    createdAt: at("2026-10-01T14:00:00Z"),
    updatedAt: null,
    resolvedAt: null,
    resolvedBy: null,
    isArchived: false,
    ...over,
  };
}

const NOTES: FloorNote[] = [
  note({ id: "open1" }),
  note({ id: "upd1", threadId: "open1", body: "Maintenance booked for Tuesday.", authorId: "u-sam", authorName: "Sam", createdAt: at("2026-10-02T14:00:00Z") }),
  note({ id: "theirs", body: "Back pad loose.", authorId: "u-sam", authorName: "Sam", createdAt: at("2026-09-20T14:00:00Z") }),
  note({
    id: "done1",
    body: "Cable frayed.",
    createdAt: at("2026-08-01T14:00:00Z"),
    resolvedAt: at("2026-08-05T14:00:00Z"),
    resolvedBy: { id: "u-sam", name: "Sam" },
  }),
  note({ id: "chest", machineId: "chest", body: "Not this machine." }),
];

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  Object.values(w).forEach((f) => f.mockClear());
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function Away() {
  const leave = useLeaveGuard();
  const [left, setLeft] = useState(false);
  return (
    <button type="button" data-action="away" data-left={left ? "1" : "0"} onClick={() => leave(() => setLeft(true))}>
      Hub
    </button>
  );
}

const base: FloorNotesProps = {
  studioId: "solon",
  studioName: "Solon",
  machineId: "leg",
  machineName: "Leg Press",
  read: { state: "ready", notes: NOTES },
  earlier: {
    studioNotes: { text: "Footplate to 3 for short legs.", by: "Jo", at: at("2026-04-02T14:00:00Z") },
    unitNote: "Seat replaced March 2026.",
  },
  uid: "u-lee",
  writerName: "Lee",
  canLead: false,
  nowMs: NOW,
};

async function mount(over: Partial<FloorNotesProps> = {}) {
  await act(async () => {
    root.render(
      <UnsavedChangesProvider>
        <ToastProvider>
          <Away />
          <FloorNotes {...base} {...over} />
        </ToastProvider>
      </UnsavedChangesProvider>,
    );
  });
}

const buttons = (scope: ParentNode = host) => [...scope.querySelectorAll("button")];
const byText = (label: string, scope: ParentNode = host) => {
  const b = buttons(scope).find((x) => x.textContent?.trim() === label);
  if (!b) throw new Error(`No button "${label}"`);
  return b as HTMLButtonElement;
};
const click = (el: Element) => act(async () => (el as HTMLElement).click());
function setValue(el: Element | null, value: string) {
  if (!el) throw new Error("field not found");
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
const type = (el: Element | null, value: string) => act(async () => setValue(el, value));
const box = () => host.querySelector('textarea[id^="fn-new-"]');
const openList = () => host.querySelector('[aria-label="Open notes on the Leg Press"]')!;
const item = (text: string) => [...host.querySelectorAll("li.fn-note")].find((li) => li.textContent?.includes(text))!;
const question = () => document.querySelector('[role="alertdialog"]')?.textContent ?? "";

describe("the floor's notes on a machine", () => {
  it("lists this machine's open notes with their updates, the closed ones folded, and the earlier notes", async () => {
    await mount();
    const open = openList().textContent ?? "";
    expect(open).toContain("The pin sticks at 7.");
    expect(open).toContain("Maintenance booked for Tuesday.");
    expect(open).toContain("Sam · Oct 2");
    expect(open).toContain("Back pad loose.");
    expect(open).not.toContain("Not this machine.");
    // The note with the newest word comes first.
    expect(open.indexOf("The pin sticks")).toBeLessThan(open.indexOf("Back pad loose"));
    expect(host.textContent).not.toContain("Cable frayed.");
    await click(byText("Closed · 1"));
    expect(host.textContent).toContain("Cable frayed.");
    expect(host.textContent).toContain("Closed by Sam · Aug 5");
    const earlier = host.querySelector('[aria-label="Earlier notes"]')!.textContent ?? "";
    expect(earlier).toContain("Footplate to 3 for short legs.");
    expect(earlier).toContain("Jo · Apr 2");
    expect(earlier).toContain("Seat replaced March 2026.");
  });

  it("asks before typing in the box goes, and Add note saves it on this machine", async () => {
    await mount();
    await type(box(), "Ours sits two notches lower.");
    await click(host.querySelector('[data-action="away"]')!);
    expect(question()).toContain("Solon’s note on Leg Press");
    await click(document.querySelector('[data-testid="leave-confirm"] [data-action="keep-editing"]')!);
    await click(byText("Add note"));
    expect(w.add).toHaveBeenCalledWith(
      expect.objectContaining({
        studioId: "solon",
        machineId: "leg",
        machineName: "Leg Press",
        body: "Ours sits two notches lower.",
        writer: { name: "Lee" },
      }),
    );
    expect((box() as HTMLTextAreaElement).value).toBe("");
    await click(host.querySelector('[data-action="away"]')!);
    expect(question()).toBe("");
  });

  it("adds an update to a note, and closes one with what happened", async () => {
    await mount();
    await click(byText("Add an update", item("The pin sticks")));
    await type(item("The pin sticks").querySelector("textarea"), "Sprayed the pin.");
    await click(byText("Add update", item("The pin sticks")));
    expect(w.update).toHaveBeenCalledWith(
      expect.objectContaining({ studioId: "solon", body: "Sprayed the pin.", root: expect.objectContaining({ id: "open1" }) }),
    );
    await click(byText("Close", item("Back pad loose")));
    await type(item("Back pad loose").querySelector("textarea"), "Tightened.");
    await click(byText("Close the note", item("Back pad loose")));
    expect(w.close).toHaveBeenCalledWith(
      expect.objectContaining({ why: "Tightened.", root: expect.objectContaining({ id: "theirs" }) }),
    );
  });

  it("keeps a note to two buttons, with the rest behind More", async () => {
    await mount();
    const labels = buttons(item("The pin sticks")).map((b) => b.textContent?.trim());
    expect(labels).toEqual(["Add an update", "Close", "More"]);
  });

  it("lets its author or a leader change a note's words, and no one else", async () => {
    await mount();
    // Someone else's note has nothing behind More for a trainer, so no More.
    expect(buttons(item("Back pad loose")).map((b) => b.textContent?.trim())).toEqual(["Add an update", "Close"]);
    await click(byText("More", item("The pin sticks")));
    await click(byText("Change the words", item("The pin sticks")));
    await type(item("The pin sticks").querySelector("textarea"), "The pin sticks at 7 and 8.");
    await click(byText("Save the words", item("The pin sticks")));
    expect(w.edit).toHaveBeenCalledWith("solon", "open1", "The pin sticks at 7 and 8.");
  });

  it("gives a leader the words and Take off the list on everyone's notes", async () => {
    await mount({ canLead: true });
    await click(byText("More", item("Back pad loose")));
    await click(byText("Take off the list", item("Back pad loose")));
    await click(byText("Take it off", item("Back pad loose")));
    expect(w.archive).toHaveBeenCalledWith("solon", "theirs");
  });

  it("copies an earlier note into the list, saying where it came from", async () => {
    await mount();
    const earlier = host.querySelector('[aria-label="Earlier notes"]')!;
    const unit = [...earlier.querySelectorAll("li")].find((li) => li.textContent?.includes("Seat replaced"))!;
    await click(byText("Copy into the list", unit));
    expect(w.add).toHaveBeenCalledWith(
      expect.objectContaining({ body: "Seat replaced March 2026.", copiedFrom: "unit-note", machineId: "leg" }),
    );
  });

  it("opens a closed note again", async () => {
    await mount();
    await click(byText("Closed · 1"));
    await click(byText("Open again", item("Cable frayed")));
    expect(w.reopen).toHaveBeenCalledWith("solon", "done1");
  });

  it("offers its author's note to every MSF studio when the machine has keys, and never from Demo Mode", async () => {
    await mount({ shareKeys: ["m-leg-press"] });
    await click(byText("More", item("The pin sticks")));
    expect(buttons(item("The pin sticks")).map((b) => b.textContent)).toContain("Offer to all MSF studios");
    expect(buttons(item("Back pad loose")).map((b) => b.textContent)).not.toContain("More");
    await click(byText("Offer to all MSF studios", item("The pin sticks")));
    expect(w.offer).toHaveBeenCalledWith("solon", "open1", true, { keys: ["m-leg-press"], studioName: "Solon" });
    await mount({ shareKeys: ["m-leg-press"], studioId: "demo-studio" });
    expect(host.textContent).not.toContain("Offer to all MSF studios");
  });

  it("reads only, with no box and no buttons, for someone who can't write here", async () => {
    await mount({ writerName: null });
    expect(box()).toBeNull();
    expect(buttons(openList())).toEqual([]);
    expect(host.textContent).not.toContain("Copy into the list");
  });

  it("says a failed read couldn't load, never that there are no notes", async () => {
    await mount({ read: { state: "failed", notes: [] } });
    expect(host.textContent).toContain("Couldn’t load the floor’s notes.");
    expect(host.textContent).not.toContain("No notes on");
    // Earlier notes wait for the list: they might already be copied into it.
    expect(host.querySelector('[aria-label="Earlier notes"]')).toBeNull();
  });

  it("keeps half-written words when another iPad closes the note: they stay on screen and go on as an update", async () => {
    await mount();
    await click(byText("Add an update", item("Back pad loose")));
    await type(item("Back pad loose").querySelector("textarea"), "Tightened the bolt.");
    // Another iPad closes it.
    const closedElsewhere = NOTES.map((n) =>
      n.id === "theirs" ? { ...n, resolvedAt: at("2026-10-03T15:00:00Z"), resolvedBy: { id: "u-sam", name: "Sam" } } : n,
    );
    await mount({ read: { state: "ready", notes: closedElsewhere } });
    const kept = item("Back pad loose");
    expect((kept.querySelector("textarea") as HTMLTextAreaElement).value).toBe("Tightened the bolt.");
    expect(kept.textContent).toContain("This note was closed while you were writing.");
    await click(host.querySelector('[data-action="away"]')!);
    expect(question()).toContain("An update on the Leg Press");
    await click(document.querySelector('[data-testid="leave-confirm"] [data-action="keep-editing"]')!);
    await click(byText("Add update", kept));
    expect(w.update).toHaveBeenCalledWith(expect.objectContaining({ body: "Tightened the bolt.", root: expect.objectContaining({ id: "theirs" }) }));
    expect(w.close).not.toHaveBeenCalled();
  });

  it("keeps half-written words when another iPad takes the note off the list, and saves them as a new note", async () => {
    await mount();
    await click(byText("Add an update", item("Back pad loose")));
    await type(item("Back pad loose").querySelector("textarea"), "Still loose on Friday.");
    await mount({ read: { state: "ready", notes: NOTES.map((n) => (n.id === "theirs" ? { ...n, isArchived: true } : n)) } });
    const card = host.querySelector('[data-testid="floor-note-orphan"]')!;
    expect(card.textContent).toContain("(“Back pad loose.”) was taken off the list on another iPad");
    expect((card.querySelector("textarea") as HTMLTextAreaElement).value).toBe("Still loose on Friday.");
    await click(byText("Save as a new note", card));
    expect(w.add).toHaveBeenCalledWith(expect.objectContaining({ body: "Still loose on Friday.", machineId: "leg" }));
    expect(host.querySelector('[data-testid="floor-note-orphan"]')).toBeNull();
  });

  it("says a refused change isn't yours, never that the connection failed", async () => {
    w.edit.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "permission-denied" }));
    await mount({ canLead: true });
    await click(byText("More", item("Back pad loose")));
    await click(byText("Change the words", item("Back pad loose")));
    await type(item("Back pad loose").querySelector("textarea"), "Back pad loose on the left.");
    await click(byText("Save the words", item("Back pad loose")));
    expect(document.body.textContent).toContain("That isn't yours to change here.");
    // The words are still there to try again.
    expect((item("Back pad loose").querySelector("textarea") as HTMLTextAreaElement).value).toBe("Back pad loose on the left.");
  });

  it("says plainly when a machine has no notes at all", async () => {
    await mount({ read: { state: "ready", notes: [] }, earlier: {} });
    expect(host.textContent).toContain("No notes on the Leg Press at Solon yet.");
  });
});
