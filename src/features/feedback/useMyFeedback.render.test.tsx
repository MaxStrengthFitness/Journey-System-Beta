// @vitest-environment jsdom
/**
 * A TRAINER'S OWN REPORTS, READ (voice review follow-up, Sep 27 2026).
 *
 * The listener turned a refused read into an empty list, so Settings hid
 * "Your reports" as though there were none: a failed read shown as empty.
 * It now hands back the error, and a later good read clears it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fs = vi.hoisted(() => ({
  wheres: [] as unknown[][],
  next: null as null | ((snap: unknown) => void),
  fail: null as null | ((err: unknown) => void),
  unsubscribed: 0,
}));
vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  where: (...args: unknown[]) => {
    fs.wheres.push(args);
    return { where: args };
  },
  query: (...parts: unknown[]) => ({ parts }),
  onSnapshot: (_q: unknown, next: (snap: unknown) => void, fail: (err: unknown) => void) => {
    fs.next = next;
    fs.fail = fail;
    return () => {
      fs.unsubscribed += 1;
    };
  },
}));

import { useMyFeedback } from "./useMyFeedback";

let root: Root;
let host: HTMLDivElement;
let seen: ReturnType<typeof useMyFeedback> | null = null;

function Probe({ id }: { id: string | null }) {
  seen = useMyFeedback(id);
  return null;
}

beforeEach(() => {
  fs.wheres = [];
  fs.next = null;
  fs.fail = null;
  seen = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const snap = (docs: { id: string; data: Record<string, unknown> }[]) => ({
  docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
});

describe("useMyFeedback", () => {
  it("hands back the error when the read is refused, instead of an empty list that looks like none", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => root.render(<Probe id="t1" />));
    expect(seen!.error).toBeNull();
    await act(async () => fs.fail!(new Error("Missing or insufficient permissions.")));
    expect(seen!.error).toBe("Couldn't load your reports.");
    expect(seen!.reports).toEqual([]);
    expect(seen!.loading).toBe(false);
    quiet.mockRestore();
  });

  it("reads the trainer's reports, newest first, and a good read clears an old error", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => root.render(<Probe id="t1" />));
    await act(async () => fs.fail!(new Error("offline")));
    await act(async () =>
      fs.next!(
        snap([
          { id: "a", data: { description: "Old", status: "fixed", createdAt: { toMillis: () => 1 } } },
          { id: "b", data: { description: "New", status: "open", createdAt: { toMillis: () => 2 } } },
        ]),
      ),
    );
    expect(seen!.error).toBeNull();
    expect(seen!.reports.map((r) => r.id)).toEqual(["b", "a"]);
    expect(seen!.counts).toEqual({ open: 1, resolved: 1, total: 2 });
    quiet.mockRestore();
  });

  it("asks for nothing, and says nothing is wrong, before anyone is signed in", async () => {
    await act(async () => root.render(<Probe id={null} />));
    expect(fs.next).toBeNull();
    expect(seen!.error).toBeNull();
    expect(seen!.reports).toEqual([]);
  });
});
