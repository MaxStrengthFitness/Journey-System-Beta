// @vitest-environment jsdom
/**
 * A KAIZEN ROSTER CHANGE IS BUILT ON THE SERVER'S COPY (the speed round's
 * review, Oct 5 2026).
 *
 * The roster is rewritten as a whole array. Since the speed round the app
 * opens on the iPad's own copy of the trainers, which can be days old for a
 * moment; built on that, an add would drop whatever another iPad added since.
 * So every change reads the server's roster first, and only offline falls
 * back to the copy in hand.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  server: null as null | (() => Promise<unknown>),
  writes: [] as unknown[],
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("../../lib/firestore-errors", () => ({ OperationType: { UPDATE: "update" }, handleFirestoreError: () => {} }));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ success: h.toastSuccess, error: h.toastError }),
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  getDocFromServer: () => h.server!(),
  updateDoc: vi.fn(async (_ref: unknown, data: unknown) => {
    h.writes.push(data);
  }),
  Timestamp: {
    now: () => ({ seconds: 1, nanoseconds: 0 }),
    fromDate: (d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 }),
  },
}));

import { useKaizenRoster } from "./useKaizenRoster";
import type { KaizenRosterEntry, Trainer } from "../../types";

const entry = (clientId: string) =>
  ({ clientId, clientName: clientId, reason: "plateau", addedAt: { seconds: 0 }, addedByTrainerId: "u1" }) as unknown as KaizenRosterEntry;

let hook: ReturnType<typeof useKaizenRoster>;
function Probe({ trainer }: { trainer: Trainer }) {
  hook = useKaizenRoster(trainer);
  return null;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
beforeEach(() => {
  h.writes = [];
  h.toastError.mockClear();
  h.toastSuccess.mockClear();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

async function mount(roster: KaizenRosterEntry[]) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const trainer = { id: "u1", kaizenRoster: roster } as unknown as Trainer;
  await act(async () => root!.render(<Probe trainer={trainer} />));
}

const serverHas = (roster: KaizenRosterEntry[]) => async () => ({ exists: () => true, data: () => ({ kaizenRoster: roster }) });

describe("useKaizenRoster", () => {
  it("adds onto the server's roster, keeping what another iPad added since", async () => {
    await mount([entry("a")]); // the iPad's stale copy
    h.server = serverHas([entry("a"), entry("b")]);
    await act(async () => {
      await hook.add({ id: "c", firstName: "C", lastName: "" }, "plateau" as never);
    });
    const written = (h.writes[0] as { kaizenRoster: KaizenRosterEntry[] }).kaizenRoster.map((e) => e.clientId);
    expect(written).toEqual(["a", "b", "c"]);
  });

  it("removes from the server's roster", async () => {
    await mount([entry("a")]);
    h.server = serverHas([entry("a"), entry("b")]);
    await act(async () => {
      await hook.remove("a");
    });
    expect((h.writes[0] as { kaizenRoster: KaizenRosterEntry[] }).kaizenRoster.map((e) => e.clientId)).toEqual(["b"]);
  });

  it("writes nothing when the server's roster already has the client", async () => {
    await mount([]);
    h.server = serverHas([entry("c")]);
    let saved: boolean | undefined;
    await act(async () => {
      saved = await hook.add({ id: "c", firstName: "C", lastName: "" }, "plateau" as never);
    });
    expect(saved).toBe(false);
    expect(h.writes).toHaveLength(0);
    expect(h.toastError).toHaveBeenCalled();
  });

  it("offline, it builds on the copy in hand, as it always did", async () => {
    await mount([entry("a")]);
    h.server = async () => {
      throw new Error("unavailable");
    };
    await act(async () => {
      await hook.add({ id: "c", firstName: "C", lastName: "" }, "plateau" as never);
    });
    expect((h.writes[0] as { kaizenRoster: KaizenRosterEntry[] }).kaizenRoster.map((e) => e.clientId)).toEqual(["a", "c"]);
  });
});
