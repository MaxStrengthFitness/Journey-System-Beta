// @vitest-environment jsdom
/**
 * A MACHINE'S TWO STUDIO CARDS, MOUNTED (voice review follow-up, Sep 27 2026).
 *
 * StudioNotesCard and StudioSetupCard hold typing and did not join the
 * unsaved-changes registry, so the bottom bar (or My Studio's sections, where
 * both cards also render) took a half-written note away without a word. Here
 * each is mounted inside the real provider beside a navigation that asks the
 * gate the way the app's own does: typing makes it ask, in words that name
 * the machine; "Keep editing" keeps every character; "Leave" puts the card
 * back to what is saved, because the card itself survives a studio switch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(async () => {}),
  serverTimestamp: () => "now",
}));
const saved = vi.hoisted(() => ({ notes: vi.fn(async () => {}) }));
vi.mock("./mutations", () => ({ saveStudioMachineNotes: saved.notes }));

import { ToastProvider } from "../../contexts/ToastContext";
import { UnsavedChangesProvider, useLeaveGuard } from "../unsaved-changes";
import { StudioNotesCard } from "./StudioNotesCard";
import { StudioSetupCard } from "./StudioSetupCard";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  saved.notes.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

/** Somewhere else in the app, reached the way the bottom bar goes: through the gate. */
function Away() {
  const leave = useLeaveGuard();
  const [left, setLeft] = useState(false);
  return (
    <button type="button" data-action="away" data-left={left ? "1" : "0"} onClick={() => leave(() => setLeft(true))}>
      Hub
    </button>
  );
}

async function mount(card: React.ReactNode) {
  await act(async () => {
    root.render(
      <UnsavedChangesProvider>
        <ToastProvider>
          <Away />
          {card}
        </ToastProvider>
      </UnsavedChangesProvider>,
    );
  });
}

function setValue(el: Element | null, value: string) {
  if (!el) throw new Error("field not found");
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
const type = (el: Element | null, value: string) => act(async () => setValue(el, value));
const click = (el: Element | null | undefined) =>
  act(async () => {
    if (!el) throw new Error("element not found");
    (el as HTMLElement).click();
  });

const away = () => host.querySelector('[data-action="away"]');
const left = () => away()!.getAttribute("data-left") === "1";
const question = () => document.querySelector('[role="alertdialog"]');
const answer = (a: "keep-editing" | "leave") =>
  document.querySelector(`[data-testid="leave-confirm"] [data-action="${a}"]`);

describe("a machine's studio notes", () => {
  const card = (
    <StudioNotesCard machineId="cp" machineName="Chest Press" studioId="solon" studioName="Solon" value="Left pad sticks." author={{ id: "t1", name: "Sara" }} />
  );
  const notes = () => host.querySelector("textarea") as HTMLTextAreaElement;

  it("lets the app go without asking while nothing is typed", async () => {
    await mount(card);
    await click(away());
    expect(question()).toBeNull();
    expect(left()).toBe(true);
  });

  it("asks, naming the studio and the machine, and Keep editing keeps every character", async () => {
    await mount(card);
    await type(notes(), "Left pad sticks. Use the footstool.");
    await click(away());
    expect(question()!.textContent).toContain("You have unsaved changes to Solon’s notes on Chest Press.");
    await click(answer("keep-editing"));
    expect(left()).toBe(false);
    expect(notes().value).toBe("Left pad sticks. Use the footstool.");
  });

  it("Leave goes, and puts the note back to what is saved", async () => {
    await mount(card);
    await type(notes(), "Half a thought");
    await click(away());
    await click(answer("leave"));
    expect(left()).toBe(true);
    expect(notes().value).toBe("Left pad sticks.");
    expect(saved.notes).not.toHaveBeenCalled();
  });

  it("stops asking once the note is saved", async () => {
    await mount(card);
    await type(notes(), "Use the footstool.");
    await click([...host.querySelectorAll("button")].find((b) => b.textContent === "Save notes"));
    expect(saved.notes).toHaveBeenCalledTimes(1);
    await click(away());
    expect(question()).toBeNull();
    expect(left()).toBe(true);
  });
});

describe("a machine's studio setup", () => {
  const setting = { studioId: "solon", machineId: "cp", settingOptions: ["Seat"], standardSettings: { Seat: "4" } };
  const card = (canEdit: boolean) => (
    <StudioSetupCard machineId="cp" machineName="Chest Press" studioId="solon" setting={setting as never} canEdit={canEdit} authorId="t1" />
  );
  const seat = () => host.querySelector('input[aria-label="Standard Seat for Chest Press"]') as HTMLInputElement;
  const addField = () => host.querySelector('input[aria-label="Add a setting to Chest Press"]') as HTMLInputElement;

  it("asks about a changed value, and Leave puts it back", async () => {
    await mount(card(true));
    await type(seat(), "6");
    await click(away());
    expect(question()!.textContent).toContain("You have unsaved changes to the Chest Press settings for this studio.");
    await click(answer("leave"));
    expect(left()).toBe(true);
    expect(seat().value).toBe("4");
  });

  it("counts a setting name typed but not yet added as typing", async () => {
    await mount(card(true));
    await type(addField(), "Back pad");
    await click(away());
    expect(question()).not.toBeNull();
    await click(answer("keep-editing"));
    expect(addField().value).toBe("Back pad");
  });

  it("never asks a trainer who can only read the settings", async () => {
    await mount(card(false));
    await click(away());
    expect(question()).toBeNull();
    expect(left()).toBe(true);
  });
});
