// @vitest-environment jsdom
/**
 * The question before a stale session is carried on with, mounted: its third
 * answer (the Atlas answers, Oct 2 2026), "Finish it as it was".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StaleSessionDialog } from "./StaleSessionDialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const session = { id: "s-old", date: "2026-09-29", startTime: new Date(2026, 8, 29, 9, 0) } as never;

async function mount(props: Partial<Parameters<typeof StaleSessionDialog>[0]>) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StaleSessionDialog
        open
        clientFirstName="Judy"
        session={session}
        begunMachines={3}
        todayKey="2026-10-02"
        onResume={vi.fn()}
        onStartNew={vi.fn()}
        {...props}
      />,
    );
  });
}
const button = (text: string) => Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent?.trim() === text);

describe("StaleSessionDialog", () => {
  it("asks about an abandoned OPEN session too: no client named, Who's this? still there (the whole-branch review, Oct 9 2026)", async () => {
    const onResume = vi.fn();
    const onStartNew = vi.fn();
    await mount({ clientFirstName: null, begunMachines: null, onResume, onStartNew });
    const text = document.body.textContent ?? "";
    expect(text).toContain("Your open session was never finished");
    expect(text).toContain("Who's this? is still there");
    expect(text).not.toMatch(/profile|null|undefined/);
    expect(button("Finish it as it was")).toBeUndefined();
    await act(async () => button("Resume it")!.click());
    expect(onResume).toHaveBeenCalledTimes(1);
    await act(async () => button("Start a new session")!.click());
    expect(onStartNew).toHaveBeenCalled();
  });

  it("offers Finish it as it was as a third answer, and says what it does", async () => {
    const onFinishAsItWas = vi.fn();
    const onStartNew = vi.fn();
    await mount({ onFinishAsItWas, onStartNew });
    expect(button("Resume it")).toBeTruthy();
    expect(button("Start a new session")).toBeTruthy();
    const finish = button("Finish it as it was")!;
    expect(finish).toBeTruthy();
    expect(document.body.textContent).toContain("its sets count");
    await act(async () => finish.click());
    expect(onFinishAsItWas).toHaveBeenCalledTimes(1);
    expect(onStartNew).not.toHaveBeenCalled();
  });

  it("holds Finish it as it was until the client's machine totals have answered", async () => {
    const onFinishAsItWas = vi.fn();
    await mount({ onFinishAsItWas, finishAsItWasReady: false });
    expect(button("Finish it as it was")).toBeUndefined();
    const waiting = button("Reading the machines…")!;
    expect(waiting).toBeTruthy();
    expect(waiting.disabled).toBe(true);
    await act(async () => waiting.click());
    expect(onFinishAsItWas).not.toHaveBeenCalled();
    // The other two answers never wait.
    expect(button("Resume it")!.disabled).toBe(false);
    expect(button("Start a new session")!.disabled).toBe(false);
  });

  it("keeps the two answers when no host offers the third", async () => {
    await mount({});
    expect(button("Finish it as it was")).toBeUndefined();
    expect(button("Resume it")).toBeTruthy();
  });
});
