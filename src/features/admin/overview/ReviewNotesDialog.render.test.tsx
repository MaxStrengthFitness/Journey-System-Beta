// @vitest-environment jsdom
/**
 * The 60-day review's "No longer", MOUNTED (Oct 2 2026): it asks for an
 * optional one-line reason, and the reason reaches the note's thread.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const closeNote = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}));
vi.mock("../../client-notes/thread-write", () => ({ closeThreadNoLongerMatters: closeNote }));
vi.mock("../../../hooks/useClientJournal", () => ({ reviewJournalEntry: vi.fn(async () => {}) }));
vi.mock("../../../contexts/ToastContext", () => {
  const api = { success: () => {}, error: () => {}, info: () => {} };
  return { useToast: () => api };
});

import { ReviewNotesDialog } from "./ReviewNotesDialog";
import type { ReviewRow } from "./questions";

const row: ReviewRow = {
  entryId: "n1",
  clientId: "c1",
  name: "Carol Brennan",
  importance: "elevated",
  body: "Prefers the 7am slot.",
  authorName: "Jess",
  days: 64,
  root: { id: "n1", clientId: "c1", studioId: "s1", kind: "preference", category: null, machineId: null },
};
const author = { id: "uid-ann", initials: "AJ", fullName: "Ann Jones" };

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = "";
  closeNote.mockClear();
});

const button = (text: string) =>
  Array.from(document.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === text) as HTMLButtonElement | undefined;

async function mount(withAuthor: boolean) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ReviewNotesDialog open onOpenChange={() => {}} rows={[row]} author={withAuthor ? author : null} />);
  });
}

describe("ReviewNotesDialog: No longer, with a reason", () => {
  it("asks why (optional) and writes the reason on the note's thread", async () => {
    await mount(true);
    await act(async () => button("No longer")!.click());
    expect(closeNote).not.toHaveBeenCalled();
    const input = document.querySelector<HTMLInputElement>("#why-n1")!;
    expect(input).toBeTruthy();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "She moved to mornings.");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Close the note")!.click());
    expect(closeNote).toHaveBeenCalledWith(row.root, author, "She moved to mornings.");
  });

  it("closes with no reason when it is left blank", async () => {
    await mount(true);
    await act(async () => button("No longer")!.click());
    await act(async () => button("Close the note")!.click());
    expect(closeNote).toHaveBeenCalledWith(row.root, author, "");
  });
});
