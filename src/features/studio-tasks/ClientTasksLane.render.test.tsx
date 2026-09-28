// @vitest-environment jsdom
/**
 * CLIENTS WAITING ON US, MOUNTED — and "Ask" on a client's task (Relay room,
 * Sep 28 2026): the Ask sheet on A question with her name filled in, which
 * opens the open-questions trail. Offered only on an open task with a client,
 * and only where Relay's Ask sheet is.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { ClientTasksLane } from "./ClientTasksLane";
import { row, template } from "../relay/board/fixtures";

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const report = template("report-nancy", {
  title: "Progress report",
  kind: "client",
  category: "client-service",
  target: { kind: "client", clientId: "c-nancy", action: "custom" },
});
const open = row(report, undefined, "open", { clientName: "Nancy Took", kind: "client" });
const done = { ...row(template("call-odo", { title: "Call", kind: "client", target: { kind: "client", clientId: "c-odo", action: "custom" } }), undefined, "done"), clientName: "Odo Proudfoot", kind: "client" as const };

async function render(onAskAbout?: (c: { id: string; name: string }) => void) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ClientTasksLane rows={[open, done]} onComplete={() => {}} onOpenClientTask={() => {}} onAskAbout={onAskAbout} />);
  });
  return host;
}

describe("Clients waiting on us", () => {
  it("offers Ask on an open client task, opening the question with her name", async () => {
    const onAskAbout = vi.fn();
    const h = await render(onAskAbout);
    const asks = [...h.querySelectorAll<HTMLButtonElement>(".sh__client-ask")];
    expect(asks.map((b) => b.getAttribute("aria-label"))).toEqual(["Ask the team about Nancy Took"]);
    await act(async () => asks[0].click());
    expect(onAskAbout).toHaveBeenCalledWith({ id: "c-nancy", name: "Nancy Took" });
  });

  it("offers no Ask outside Relay", async () => {
    const h = await render();
    expect(h.querySelector(".sh__client-ask")).toBeNull();
  });
});
