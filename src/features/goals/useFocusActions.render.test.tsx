// @vitest-environment jsdom
/**
 * THE FOCUS ACTIONS, MOVED (client codex, Sep 2026).
 *
 * The focus writes moved out of ClientJournalTab into useFocusActions so the
 * Goals & Focus page files a focus exactly as the journal's Focus area did
 * (phase 14 then took the board out of ClientJournalTab altogether). The
 * writers themselves (useClientJournal) are pinned elsewhere; this mounts the
 * hook, and the focus board through it as the Goals page wires it, and pins
 * what the move must not change:
 *   - the author is the AUTH UID, and the coach's ids are both of theirs;
 *   - a check-in carries its focus id and the client's home studio;
 *   - an empty check-in writes nothing; a failed one says so and resolves false;
 *   - the board's card still files through it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  calls: [] as { fn: string; args: unknown[] }[],
  fail: false,
  toasts: [] as { kind: "success" | "error"; text: string }[],
}));

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-jane" } } }));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({
    success: (text: string) => fake.toasts.push({ kind: "success", text }),
    error: (text: string) => fake.toasts.push({ kind: "error", text }),
    info: () => {},
  }),
}));
vi.mock("../../hooks/useClientJournal", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../hooks/useClientJournal")>();
  const record =
    (fn: string, result: unknown = undefined) =>
    async (...args: unknown[]) => {
      fake.calls.push({ fn, args });
      if (fake.fail) throw new Error("offline");
      return result;
    };
  return {
    ...real,
    createClientFocus: record("createClientFocus", "focus-new"),
    createJournalEntry: record("createJournalEntry", "entry-new"),
    setFocusStatus: record("setFocusStatus"),
    extendFocus: record("extendFocus"),
  };
});

import { useFocusActions, type FocusActions } from "./useFocusActions";
import { FocusBoard } from "../../components/journal/FocusBoard";
import type { Client, Trainer } from "../../types";
import type { ClientFocus } from "../../types/journal";

const client = { id: "judy", firstName: "Judy", homeStudioId: "westlake" } as unknown as Client;
// An older account: the trainer document id is NOT the Auth uid.
const jane = { id: "trainer-doc-jane", fullName: "Jane Coach", initials: "jc", role: "Trainer" } as unknown as Trainer;
const focus = {
  id: "f1",
  clientId: "judy",
  category: "Pace",
  intent: "Slow the lowering on the leg press",
  targetMachineId: "leg-press",
  status: "active",
} as unknown as ClientFocus;

let actions: FocusActions | null = null;
function Probe(props: { clientId: string | null; client: Client | null; authTrainer?: Trainer | null }) {
  actions = useFocusActions(props);
  return null;
}

let root: Root | null = null;
let host: HTMLElement | null = null;

async function mount(ui: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<StrictMode>{ui}</StrictMode>);
  });
  return host;
}

beforeEach(() => {
  fake.calls.length = 0;
  fake.toasts.length = 0;
  fake.fail = false;
  actions = null;
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("useFocusActions", () => {
  it("knows the coach by both ids, and their role", async () => {
    await mount(<Probe clientId="judy" client={client} authTrainer={jane} />);
    expect(actions!.viewerIds).toEqual(["uid-jane", "trainer-doc-jane"]);
    expect(actions!.viewerRole).toBe("Trainer");
  });

  it("files a check-in with its focus, as the Auth uid, at the client's home studio", async () => {
    await mount(<Probe clientId="judy" client={client} authTrainer={jane} />);
    let saved = false;
    await act(async () => {
      saved = await actions!.onCheckIn(focus, "  Slower today, 4 seconds down  ");
    });
    expect(saved).toBe(true);
    expect(fake.calls).toHaveLength(1);
    const [clientId, studioId, author, draft] = fake.calls[0].args as [string, string, Record<string, unknown>, Record<string, unknown>];
    expect(fake.calls[0].fn).toBe("createJournalEntry");
    expect(clientId).toBe("judy");
    expect(studioId).toBe("westlake");
    expect(author).toEqual({ id: "uid-jane", initials: "JC", fullName: "Jane Coach" });
    expect(draft).toMatchObject({
      kind: "coaching",
      category: "Pace",
      body: "Slower today, 4 seconds down",
      importance: "standard",
      machineId: "leg-press",
      focusId: "f1",
      origin: "manual",
    });
    expect(fake.toasts).toEqual([{ kind: "success", text: "Check-in logged." }]);
  });

  it("writes nothing for an empty check-in, or with no client", async () => {
    await mount(<Probe clientId="judy" client={client} authTrainer={jane} />);
    let saved = true;
    await act(async () => {
      saved = await actions!.onCheckIn(focus, "   ");
    });
    expect(saved).toBe(false);
    await act(async () => root!.unmount());
    root = null;
    await mount(<Probe clientId={null} client={null} authTrainer={jane} />);
    await act(async () => {
      saved = await actions!.onCheckIn(focus, "Something");
      await actions!.onCreate({ category: "Pace", intent: "Slow down", targetMachineId: null });
    });
    expect(saved).toBe(false);
    expect(fake.calls).toHaveLength(0);
  });

  it("says a check-in failed and resolves false, so the card keeps the text", async () => {
    fake.fail = true;
    await mount(<Probe clientId="judy" client={client} authTrainer={jane} />);
    let saved = true;
    await act(async () => {
      saved = await actions!.onCheckIn(focus, "Slower today");
    });
    expect(saved).toBe(false);
    expect(fake.toasts).toEqual([
      { kind: "error", text: "Could not save that check-in. Check your connection and try again." },
    ]);
  });

  it("sets, achieves, extends and retires with the same words as before", async () => {
    await mount(<Probe clientId="judy" client={client} authTrainer={jane} />);
    await act(async () => {
      await actions!.onCreate({ category: "Posture", intent: "Chin tucked on the row", targetMachineId: "row" });
      await actions!.onAchieve(focus, "Kaizen pin");
      await actions!.onExtend(focus);
      await actions!.onRetire(focus);
    });
    expect(fake.calls.map((c) => c.fn)).toEqual(["createClientFocus", "setFocusStatus", "extendFocus", "setFocusStatus"]);
    expect(fake.calls[0].args.slice(0, 2)).toEqual(["judy", "westlake"]);
    expect((fake.calls[0].args[2] as { id: string }).id).toBe("uid-jane");
    expect(fake.calls[1].args).toEqual(["f1", "passed", { rewardNote: "Kaizen pin" }]);
    expect(fake.calls[2].args).toEqual(["f1"]);
    expect(fake.calls[3].args).toEqual(["f1", "retired"]);
    expect(fake.toasts.map((t) => t.text)).toEqual([
      "Focus set: Posture.",
      "Pace focus achieved. Nice work.",
      "Focus extended by three weeks.",
      "Focus retired.",
    ]);
  });

  it("the Goals page's focus board files a card's check-in through it, focus id and all", async () => {
    const card = {
      ...focus,
      studioId: "westlake",
      trainerId: "uid-jane",
      trainerName: "Jane Coach",
      trainerInitials: "JC",
      startedAt: new Date(2026, 7, 1, 10),
      reviewDueAt: null,
      passedAt: null,
      lastExtendedAt: null,
      extensionCount: 0,
      checkInCount: 0,
      lastCheckInAt: null,
      createdAt: new Date(2026, 7, 1, 10),
      updatedAt: new Date(2026, 7, 1, 10),
    } as unknown as ClientFocus;
    // What Goals & Focus does: the board draws, useFocusActions writes.
    function Board() {
      const a = useFocusActions({ clientId: "judy", client, authTrainer: jane });
      return (
        <FocusBoard
          focuses={[card]}
          entries={[]}
          machines={[]}
          viewerIds={a.viewerIds}
          viewerRole={a.viewerRole}
          onCreate={a.onCreate}
          onAchieve={a.onAchieve}
          onExtend={a.onExtend}
          onRetire={a.onRetire}
          onCheckIn={a.onCheckIn}
        />
      );
    }
    const el = await mount(<Board />);
    const active = el.querySelector('[data-testid="active-focus"]') as HTMLElement;
    const button = (text: string) =>
      Array.from(active.querySelectorAll("button")).find((b) => b.textContent?.includes(text))!;
    await act(async () => button("Check in").click());
    await act(async () => {
      const box = active.querySelector("textarea")!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(box, "Held the bottom today");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Log check-in").click());

    expect(fake.calls.map((c) => c.fn)).toEqual(["createJournalEntry"]);
    const [clientId, studioId, author, draft] = fake.calls[0].args as [string, string, { id: string }, Record<string, unknown>];
    expect([clientId, studioId, author.id]).toEqual(["judy", "westlake", "uid-jane"]);
    expect(draft).toMatchObject({ focusId: "f1", body: "Held the bottom today", kind: "coaching" });
  });

  it("stamps no studio when the client names none, as the journal always has", async () => {
    await mount(<Probe clientId="judy" client={{ id: "judy" } as Client} authTrainer={null} />);
    await act(async () => {
      await actions!.onCheckIn(focus, "Slower today");
    });
    const [, studioId, author] = fake.calls[0].args as [string, string, Record<string, unknown>];
    expect(studioId).toBe("");
    expect(author).toEqual({ id: "uid-jane", initials: "TR", fullName: "Coach" });
  });
});
