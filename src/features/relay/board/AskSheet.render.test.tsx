// @vitest-environment jsdom
/**
 * THE ASK SHEET, MOUNTED (Relay room, Sep 28 2026; phase 7): the six tiles,
 * each tile's own questions, what each posts, the open-questions trail from
 * the sheet, a failed write that says so and loses nothing, and the leave
 * warning over typing. Over a Firestore that refuses undefined the way the
 * real one does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  adds: [] as { path: string; data: Record<string, unknown> }[],
  sets: [] as { path: string; data: Record<string, unknown> }[],
  fail: null as null | ((path: string) => boolean),
  n: 0,
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "t-ioreth" } }, functions: {} }));
vi.mock("../../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "s1", activeStudio: { id: "s1", name: "Westlake", headTrainerId: "t-glorfindel" } }),
}));
vi.mock("../../../hooks/useStudioMachines", () => ({
  useStudioMachines: (studioId: string | null) => ({
    machines: studioId ? [{ machineId: "lp", name: "Leg Press" }, { machineId: "po", name: "Pullover" }] : [],
    loading: false,
  }),
}));
// The directory search is ClientPicker's own (relay/notes/hooks); here it is
// the roster as buttons.
vi.mock("../ClientPicker", () => ({
  ClientPicker: ({ roster, onChange }: { roster: { id: string; firstName: string; lastName: string }[]; onChange: (p: { id: string; name: string }[]) => void }) => (
    <div>
      {roster.map((c) => (
        <button key={c.id} type="button" onClick={() => onChange([{ id: c.id, name: `${c.firstName} ${c.lastName}` }])}>
          {c.firstName} {c.lastName}
        </button>
      ))}
    </div>
  ),
}));
vi.mock("firebase/firestore", () => {
  const hasUndefined = (v: unknown): boolean =>
    v === undefined || (Array.isArray(v) ? v.some(hasUndefined) : v !== null && typeof v === "object" && Object.values(v).some(hasUndefined));
  const refuse = (path: string, data: unknown) => {
    if (hasUndefined(data)) throw new Error("Unsupported field value: undefined");
    if (state.fail?.(path)) throw new Error("unavailable");
  };
  // A reference's path, from strings and from a parent reference (doc(collectionRef, id)).
  const ref = (...parts: unknown[]) => ({
    path: parts
      .map((p) => (typeof p === "string" ? p : (p as { path?: string } | null)?.path))
      .filter(Boolean)
      .join("/"),
  });
  return {
    collection: ref,
    doc: ref,
    addDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      refuse(r.path, data);
      state.n += 1;
      state.adds.push({ path: r.path, data });
      return { id: `doc${state.n}` };
    },
    updateDoc: async () => {},
    setDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      refuse(r.path, data);
      state.sets.push({ path: r.path, data });
    },
    writeBatch: () => {
      const pending: { path: string; data: Record<string, unknown> }[] = [];
      return {
        set: (r: { path: string }, data: Record<string, unknown>) => pending.push({ path: r.path, data }),
        update() {},
        delete() {},
        commit: async () => {
          for (const p of pending) refuse(p.path, p.data);
          state.sets.push(...pending);
        },
      };
    },
    serverTimestamp: () => "__now__",
    increment: (n: number) => n,
    deleteField: () => "__delete__",
    FieldPath: class {},
    Timestamp: { now: () => "__stamp__", fromDate: (d: Date) => ({ ms: d.getTime() }) },
    query: (q: unknown) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    onSnapshot: () => () => {},
  };
});

import { ToastProvider } from "../../../contexts/ToastContext";
import { UnsavedChangesProvider } from "../../unsaved-changes";
import { AskSheet } from "./AskSheet";
import { RelayProvider, type RelayContextValue } from "./RelayContext";
import { nowContext } from "./now-context";
import { coverPresetOf, type AskPreset } from "./ask";
import { BEREGOND, GLORFINDEL, IORETH, TODAY, trainerDoc } from "./fixtures";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T14:18:00-04:00`));
  state.adds = [];
  state.sets = [];
  state.fail = null;
  state.n = 0;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const nancy = { id: "c-nancy", firstName: "Nancy", lastName: "Took" };

function relayValue(over: Partial<RelayContextValue> = {}): RelayContextValue {
  return {
    studioId: "s1",
    studioName: "Westlake",
    authTrainer: trainerDoc(IORETH, "LifeTransformer", { initials: "IH" } as never),
    uid: "t-ioreth",
    trainers: [trainerDoc(IORETH), trainerDoc(BEREGOND), trainerDoc(GLORFINDEL, "StudioLeader")],
    clients: [nancy] as never,
    schedules: [],
    sessions: [],
    machines: [],
    now: nowContext([], 14 * 60 + 18, TODAY),
    canLead: false,
    panel: null,
    openCapture: () => {},
    openPanel: () => {},
    closePanel: () => {},
    ...over,
  };
}

async function render(preset: AskPreset | null = null, over: Partial<RelayContextValue> = {}) {
  const onOpenChange = vi.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <ToastProvider>
        <UnsavedChangesProvider>
          <RelayProvider value={relayValue(over)}>
            <AskSheet open preset={preset} onOpenChange={onOpenChange} />
          </RelayProvider>
        </UnsavedChangesProvider>
      </ToastProvider>,
    );
  });
  return { onOpenChange };
}

const buttons = () => [...document.querySelectorAll<HTMLButtonElement>("button")];
const button = (words: string) => buttons().find((b) => (b.textContent ?? "").trim() === words || b.getAttribute("aria-label") === words);
const click = async (el: Element | null | undefined) => {
  expect(el, "the thing to tap").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await act(async () => {});
};
const tile = (label: string) => [...document.querySelectorAll<HTMLButtonElement>(".rak-tile")].find((b) => b.querySelector(".rak-tile__t")?.textContent === label);
async function type(text: string) {
  const area = document.querySelector<HTMLTextAreaElement>(".rak-form textarea");
  expect(area).toBeTruthy();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(area, text);
    area!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const post = () => click(buttons().find((b) => /Post the ask|Flag it/.test(b.textContent ?? "")));

describe("the Ask sheet", () => {
  it("offers six tiles, and asks only for what the picked one needs", async () => {
    await render();
    expect([...document.querySelectorAll(".rak-tile__t")].map((t) => t.textContent)).toEqual([
      "Cover me",
      "A hand on the floor",
      "Hand this off",
      "A question",
      "Something's broken",
      "Other",
    ]);
    expect(buttons().find((b) => b.textContent?.includes("Post the ask"))?.disabled).toBe(true);
    expect(document.body.textContent).toContain("Pick one. Each asks only for what it needs.");
    await click(tile("A question"));
    expect(tile("A question")?.getAttribute("aria-pressed")).toBe("true");
    expect(document.body.textContent).toContain("Your question");
    expect(document.body.textContent).toContain("About a client (optional)");
    expect(document.body.textContent).toContain("In the app only. Nobody is messaged.");
  });

  it("posts Cover me from a session on the day strip, the time in the words and nowhere else", async () => {
    const { onOpenChange } = await render(coverPresetOf({ clientId: "c-hamfast", clientName: "Hamfast Gamgee", startMin: 16 * 60, endMin: 16 * 60 + 30 }));
    expect(document.body.textContent).toContain("Hamfast Gamgee");
    await post();
    expect(state.adds).toHaveLength(1);
    expect(state.adds[0].path).toBe("studios/s1/taskRequests");
    expect(state.adds[0].data).toMatchObject({
      kind: "cover",
      title: "Cover Hamfast Gamgee at 4:00 PM",
      clientId: "c-hamfast",
      sessionDate: TODAY,
      dueOn: TODAY,
      estMinutes: 30,
      priority: "urgent",
      createdBy: { id: "t-ioreth", name: IORETH.name },
    });
    expect(state.adds[0].data).not.toHaveProperty("time");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks a question about a client: her record's thread first, by the asker, then the ask with its id", async () => {
    await render({ tile: "question" });
    await type("Nancy isn't feeling her seated dip\nI couldn't get her to activate it. Can anyone help?");
    await click(button("Nancy Took"));
    expect(document.body.textContent).toContain("It opens a thread on Nancy's record");
    await post();
    const [thread, ask] = state.adds;
    expect(thread.path).toBe("journalEntries");
    expect(thread.data).toMatchObject({ clientId: "c-nancy", kind: "question", importance: "elevated", authorId: "t-ioreth", threadId: null });
    expect(ask.path).toBe("studios/s1/taskRequests");
    expect(ask.data).toMatchObject({ kind: "question", clientId: "c-nancy", threadId: "doc1", title: "Nancy isn't feeling her seated dip" });
  });

  it("says so when the board fails, keeps everything, and a retry makes no second thread", async () => {
    const { onOpenChange } = await render({ tile: "question", client: { id: "c-nancy", name: "Nancy Took" } });
    await type("Who has worked on Nancy's seated dip?");
    state.fail = (path) => path === "studios/s1/taskRequests";
    await post();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("It's on Nancy's record, but the Board didn't take the ask.");
    expect(document.querySelector<HTMLTextAreaElement>(".rak-form textarea")?.value).toBe("Who has worked on Nancy's seated dip?");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    state.fail = null;
    await post();
    expect(state.adds.filter((a) => a.path === "journalEntries")).toHaveLength(1);
    expect(state.adds.find((a) => a.path === "studios/s1/taskRequests")?.data.threadId).toBe("doc1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("posts nothing when her record doesn't take the question, and keeps the words", async () => {
    await render({ tile: "question", client: { id: "c-nancy", name: "Nancy Took" } });
    await type("Seated dip help?");
    state.fail = (path) => path === "journalEntries";
    await post();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Nancy's record didn't take the question, so nothing was posted.");
    expect(state.adds).toEqual([]);
  });

  it("makes a trainer's hand-off an offer on the board, with no bell (AJ, q5)", async () => {
    await render({ tile: "handoff" });
    expect(document.body.textContent).not.toContain("It arrives as");
    await type("Hugo Bracegirdle's progress report\nThe InBody numbers are in.");
    await post();
    expect(state.adds).toHaveLength(1);
    expect(state.adds[0].data).toMatchObject({ kind: "todo", title: "Hugo Bracegirdle's progress report", detail: "The InBody numbers are in." });
    expect(state.adds[0].data).not.toHaveProperty("forId");
  });

  it("lets a leader hand it straight to someone, ringing their bell once, as the signed-in person", async () => {
    await render({ tile: "handoff" }, { canLead: true });
    await type("Plan tomorrow");
    await click(buttons().find((b) => b.textContent?.includes(BEREGOND.name)));
    expect(document.body.textContent).toContain("It arrives as Beregond's");
    await post();
    expect(state.adds[0].data).toMatchObject({ kind: "handoff", forId: BEREGOND.id, forName: BEREGOND.name });
    expect(state.adds[1].path).toBe(`trainers/${BEREGOND.id}/notifications`);
    expect(state.adds[1].data).toMatchObject({ kind: "handoff", actor: { id: "t-ioreth", name: IORETH.name } });
  });

  it("flags a broken machine on the Floor Map, saying whether it can be used, and rings the leader's bell", async () => {
    await render({ tile: "broken" });
    await click(button("Leg Press"));
    await type("The seat catch slips on notch 4.");
    await click(button("Don't use it"));
    expect(document.body.textContent).toContain("The Floor Map, flagged on the Leg Press");
    await post();
    expect(state.sets[0].path).toBe("studios/s1/machineCare/lp");
    expect(state.sets[0].data.flag).toMatchObject({ note: "Don't use it until it's fixed. The seat catch slips on notch 4.", by: { id: "t-ioreth" } });
    expect(state.adds[0].path).toBe(`trainers/${GLORFINDEL.id}/notifications`);
  });

  it("asks before closing over typing, and Keep editing keeps it", async () => {
    const { onOpenChange } = await render({ tile: "other" });
    await type("The front desk printer is out of paper.");
    await click(button("Cancel"));
    expect(document.body.textContent).toContain("You have unsaved changes to your ask. Leave without saving?");
    await click(button("Keep editing"));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLTextAreaElement>(".rak-form textarea")?.value).toBe("The front desk printer is out of paper.");
    await click(button("Cancel"));
    await click(button("Leave"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("says what it still needs rather than posting half an ask", async () => {
    await render({ tile: "broken" });
    await post();
    expect(document.body.textContent).toContain("Pick the machine.");
    expect(document.body.textContent).toContain("Say what's wrong.");
    expect(state.adds).toEqual([]);
    expect(state.sets).toEqual([]);
  });
});
