// @vitest-environment jsdom
/**
 * ASK NEXT'S "ASKED IT", MOUNTED (client codex, phase 11 review).
 *
 * The line works out during render which question to show: the live Ask next,
 * or — while "Asked it" is open — the question it was opened on. Real
 * Firestore applies an update to this iPad's cache before the server answers,
 * so the host hands the line a NEW Ask next (the next question, or a prompt)
 * while a clear is still in flight; if the server refuses, the old question
 * comes back. These cases hand the line those props in that order, which the
 * FORD page's fake Firestore (it writes nothing locally first) cannot.
 *
 * What it holds:
 *   - an open panel keeps its question and meta while Ask next moves on, says
 *     "The answer is saved…" when the clear is then refused, and a retry
 *     clears THAT question, not the one Ask next showed meanwhile;
 *   - while the opened question is still the live one, its live words show;
 *   - a closed line follows Ask next, and a prompt offers no "Asked it".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// AskNextLine reads FORD_BODY_MAX from ford-write, which imports the app's
// Firestore handle; nothing here writes.
vi.mock("../../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: null }, functions: {} }));
vi.mock("../../../lib/firestore-errors", () => ({
  OperationType: { GET: "get", CREATE: "create", UPDATE: "update", DELETE: "delete", LIST: "list", WRITE: "write" },
  handleFirestoreError: vi.fn(),
}));

import { AskNextLine, type AskNextActions } from "./AskNextLine";
import type { AskNext, FollowUpAsk } from "../ask-next";
import type { FordEntry } from "../types";

const followUp = (id: string, question: string, byName = "Jess Moreno"): FollowUpAsk => ({
  kind: "follow-up",
  question,
  entry: { id, pillar: "recreation", subject: null, body: "A detail", followUp: question } as FordEntry,
  byName,
  at: new Date(2027, 2, 15, 9),
});

const BOOTS = followUp("boots", "How were the boots?");
const TRIP = followUp("trip", "How was the Smokies trip?", "AJ Jurgens");
const PROMPT: AskNext = { kind: "prompt", question: "What do you do for fun these days?", why: "pillar" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let mounted: { root: Root; host: HTMLElement }[] = [];

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  const render = (ask: AskNext, meta: string, actions: AskNextActions | null) =>
    act(async () => {
      root.render(
        <StrictMode>
          <AskNextLine ask={ask} meta={meta} actions={actions} />
        </StrictMode>,
      );
    });
  return { host, render };
}

const button = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === text);

/** Click, then let the writes the click started run as far as they can. */
const click = (el: Element | null | undefined) =>
  act(async () => {
    if (!el) throw new Error("element not found");
    (el as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
  });

function typeInto(el: Element | null | undefined, value: string) {
  if (!el) throw new Error("field not found");
  return act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Asked it holds its question", () => {
  it("keeps the question while Ask next moves on, says the answer is saved when the clear is refused, and retries that question", async () => {
    const clear = deferred<boolean>();
    const actions = {
      answer: vi.fn(async () => true),
      clear: vi.fn((_ask: FollowUpAsk) => clear.promise),
    };
    const { host, render } = mount();
    await render(BOOTS, "Follow up from Jess Moreno, Mar 15", actions);
    await click(button(host, "Asked it"));
    await typeInto(host.querySelector("textarea"), "No blisters.");
    await click(button(host, "Save the answer"));
    expect(actions.answer).toHaveBeenCalledWith(BOOTS, "No blisters.");
    expect(actions.clear).toHaveBeenCalledTimes(1);

    // The cache already shows the question cleared: Ask next is the trip now.
    await render(TRIP, "Follow up from AJ Jurgens, Feb 1", actions);
    expect(host.textContent).toContain("“How were the boots?”");
    expect(host.textContent).toContain("Follow up from Jess Moreno, Mar 15");
    expect(host.textContent).not.toContain("Smokies");
    expect(host.querySelector("textarea")).not.toBeNull();

    // The server refuses the clear.
    await act(async () => clear.resolve(false));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("The answer is saved.");
    expect(host.textContent).toContain("“How were the boots?”");
    expect((button(host, "Save the answer") as HTMLButtonElement).disabled).toBe(true);

    // The retry clears the boots question — not the trip Ask next showed meanwhile.
    actions.clear.mockImplementation(async () => true);
    await click(button(host, "Nothing new, clear it"));
    expect(actions.clear).toHaveBeenLastCalledWith(BOOTS);
    expect(actions.answer).toHaveBeenCalledTimes(1);

    // Closed, the line follows Ask next again.
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).toContain("“How was the Smokies trip?”");
    expect(host.textContent).toContain("Follow up from AJ Jurgens, Feb 1");
  });

  it("closes on a clear that landed, and shows what Ask next says now", async () => {
    const clear = deferred<boolean>();
    const actions = { answer: vi.fn(async () => true), clear: vi.fn(() => clear.promise) };
    const { host, render } = mount();
    await render(BOOTS, "Follow up from Jess Moreno, Mar 15", actions);
    await click(button(host, "Asked it"));
    await click(button(host, "Nothing new, clear it"));
    await render(PROMPT, "One of FORD’s Recreation questions", actions);
    expect(host.textContent).toContain("“How were the boots?”");
    await act(async () => clear.resolve(true));
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).toContain("“What do you do for fun these days?”");
    // A prompt offers no "Asked it": the pillar's Add records the answer.
    expect(button(host, "Asked it")).toBeUndefined();
  });

  it("shows the live words while the question it was opened on is still the live one", async () => {
    const actions = { answer: vi.fn(async () => true), clear: vi.fn(async () => true) };
    const { host, render } = mount();
    await render(BOOTS, "Follow up from Jess Moreno, Mar 15", actions);
    await click(button(host, "Asked it"));
    // Someone rewords the same question while the panel is open.
    await render(followUp("boots", "How were the boots on the long walk?"), "Follow up from Jess Moreno, Mar 16", actions);
    expect(host.textContent).toContain("“How were the boots on the long walk?”");
    expect(host.textContent).toContain("Mar 16");
    expect(host.querySelector("textarea")).not.toBeNull();
  });

  it("offers no Asked it to a reader who may not write FORD", async () => {
    const { host, render } = mount();
    await render(BOOTS, "Follow up from Jess Moreno, Mar 15", null);
    expect(host.textContent).toContain("“How were the boots?”");
    expect(button(host, "Asked it")).toBeUndefined();
  });
});
