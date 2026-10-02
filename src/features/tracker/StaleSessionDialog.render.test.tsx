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

  it("keeps the two answers when no host offers the third", async () => {
    await mount({});
    expect(button("Finish it as it was")).toBeUndefined();
    expect(button("Resume it")).toBeTruthy();
  });
});
