// @vitest-environment jsdom
/**
 * A MACHINE'S STUDIO SETUP CARD, MOUNTED (voice review follow-up, Sep 27 2026).
 *
 * StudioSetupCard holds typing and did not join the unsaved-changes
 * registry, so the bottom bar (or My Studio's sections, where the card also
 * renders) took a half-typed setting away without a word. (The Studio notes
 * card beside it went in the notes round, Oct 3 2026; the floor's notes are
 * held by floor-notes/FloorNotes.render.test.tsx.) Here
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

import { ToastProvider } from "../../contexts/ToastContext";
import { UnsavedChangesProvider, useLeaveGuard } from "../unsaved-changes";
import { StudioSetupCard } from "./StudioSetupCard";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
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

  it("names its icon-only buttons for a screen reader", async () => {
    await mount(card(true));
    expect(host.querySelector(".ssc__addbtn")?.getAttribute("aria-label")).toBe("Add this setting to Chest Press");
    expect(host.querySelector(".ssc__remove")?.getAttribute("aria-label")).toBe("Remove Seat");
  });

  it("never asks a trainer who can only read the settings", async () => {
    await mount(card(false));
    await click(away());
    expect(question()).toBeNull();
    expect(left()).toBe(true);
  });
});
