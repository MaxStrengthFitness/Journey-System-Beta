// @vitest-environment jsdom
/**
 * THE STUDIOS LISTENER CONFIRMS THE IPAD'S COPY (the speed round's final
 * review, Oct 6 2026). Firestore raises no event when the server's answer is
 * the same as the copy unless the listener asks for metadata changes; without
 * it a list painted from the copy is never confirmed. The trainers and
 * networks listeners are built the same way.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  options: null as unknown,
  next: null as null | ((s: unknown) => void),
}));

vi.mock("../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  onSnapshot: (_ref: unknown, options: unknown, next: (s: unknown) => void) => {
    h.options = options;
    h.next = next;
    return () => {};
  },
}));

import { useStudios } from "./useStudios";

function snap(ids: string[], changes: number, fromCache: boolean) {
  return {
    docs: ids.map((id) => ({ id, data: () => ({ name: id }) })),
    docChanges: () => Array.from({ length: changes }, () => ({})),
    metadata: { fromCache },
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("useStudios", () => {
  it("asks for metadata changes, and hands on the server's identical answer as a server answer", async () => {
    const calls: { ids: string[]; fromCache?: boolean }[] = [];
    const setStudios = (list: { id: string }[], meta?: { fromCache?: boolean }) =>
      calls.push({ ids: list.map((s) => s.id), fromCache: meta?.fromCache });
    function Probe() {
      useStudios(true, setStudios);
      return null;
    }
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root!.render(<Probe />));
    expect(h.options).toEqual({ includeMetadataChanges: true });
    await act(async () => h.next!(snap(["westlake"], 1, true)));
    // The server's answer matches the copy: no document changed.
    await act(async () => h.next!(snap(["westlake"], 0, false)));
    // A pending write acknowledged: nothing new to hand on.
    await act(async () => h.next!(snap(["westlake"], 0, false)));
    expect(calls).toEqual([
      { ids: ["westlake"], fromCache: true },
      { ids: ["westlake"], fromCache: false },
    ]);
  });
});
