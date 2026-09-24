// @vitest-environment jsdom
/**
 * Mounts the Goals panel and the focus board.
 *
 * The Goals panel does its work in click handlers that fire several
 * `updateField` calls in a row (mark achieved = four field edits), and the
 * record's Save bar decides what to write from those calls. Only a mount
 * proves the sequence leaves the form in the state the Save bar needs. The
 * harness below drives the panel with the record's real form (the client
 * codex's useRecordForm), so the test checks what would actually be written.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client } from "../../types";
import type { ClientFocus, JournalEntry } from "../../types/journal";
import { GoalsPanel } from "./GoalsPanel";
import { FocusBoard } from "../../components/journal/FocusBoard";
import { useRecordForm } from "../client-codex/useRecordForm";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-jane" } } }));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ success: () => {}, error: () => {}, info: () => {}, warning: () => {}, toast: () => {} }),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  mounted.push({ root, host });
  return host;
}

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

const click = (el: Element | null | undefined) =>
  act(async () => {
    if (!el) throw new Error("element not found");
    (el as HTMLElement).click();
  });

function typeInto(el: Element | null, value: string) {
  if (!el) throw new Error("field not found");
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  return act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const buttonByText = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text));

/* ------------------------------------------------------------------ */
/* Goals                                                               */
/* ------------------------------------------------------------------ */

type Probe = { formData: Partial<Client>; dirty: ReadonlySet<string> };

/**
 * The record's real form (the client codex's useRecordForm): the same
 * dirty rules and the same Save bar payload the Goals page saves with.
 */
function GoalsHarness({ client, probe }: { client: Client; probe: Probe }) {
  const form = useRecordForm({ client, trainerId: "t1" });
  probe.formData = form.formData;
  probe.dirty = form.dirty;
  return (
    <GoalsPanel
      client={client}
      formData={form.formData}
      updateField={form.updateField}
      authTrainer={{ id: "t1", fullName: "Jane Coach" } as any}
    />
  );
}

const baseClient = (over: Partial<Client> = {}): Client =>
  ({
    id: "c1",
    firstName: "Judy",
    lastName: "Client",
    globalNotes: "Wants to garden again",
    smartGoal: "Carry the grandkids up the stairs",
    ...over,
  }) as Client;

describe("GoalsPanel mounts", () => {
  it("anchors on the original why and badges a raw goal", async () => {
    const probe = {} as Probe;
    const host = await mount(<GoalsHarness client={baseClient()} probe={probe} />);
    expect((host.querySelector("#gf-why") as HTMLTextAreaElement).value).toBe("Wants to garden again");
    expect(host.querySelector('[data-testid="smart-badge"]')?.textContent).toBe("Raw goal · 0 of 5");
    // Five toggles, each a real button with its definition.
    const toggles = host.querySelectorAll(".gf-smart-toggle");
    expect(toggles).toHaveLength(5);
    expect(toggles[0].textContent).toContain("Specific");
  });

  it("ticks all five to a SMART goal, and a toggle back is not an edit", async () => {
    const probe = {} as Probe;
    const host = await mount(<GoalsHarness client={baseClient()} probe={probe} />);
    const toggles = () => Array.from(host.querySelectorAll(".gf-smart-toggle"));
    for (const t of toggles()) await click(t);
    expect(host.querySelector('[data-testid="smart-badge"]')?.textContent).toBe("SMART goal");
    expect(probe.formData.smartChecks).toEqual({ s: true, m: true, a: true, r: true, t: true });
    expect(probe.dirty.has("smartChecks")).toBe(true);

    for (const t of toggles()) await click(t);
    expect(host.querySelector('[data-testid="smart-badge"]')?.textContent).toBe("Raw goal · 0 of 5");
    expect(probe.dirty.has("smartChecks")).toBe(false);
  });

  it("a target date ticks Time-bound", async () => {
    const probe = {} as Probe;
    const host = await mount(<GoalsHarness client={baseClient()} probe={probe} />);
    await typeInto(host.querySelector("#gf-target"), "2026-11-26");
    expect(probe.formData.goalTargetDate).toBe("2026-11-26");
    expect(probe.formData.smartChecks?.t).toBe(true);
  });

  it("marks a goal achieved into the history and clears it for the next one", async () => {
    const probe = {} as Probe;
    const client = baseClient({
      smartChecks: { s: true, m: true, a: true, r: true, t: true },
      goalTargetDate: "2026-11-26",
      goalHistory: [{ goal: "Older goal", achievedAt: "2025-05-01T12:00:00.000Z" }],
    });
    const host = await mount(<GoalsHarness client={client} probe={probe} />);
    expect(host.querySelector('[data-testid="smart-badge"]')?.textContent).toBe("SMART goal");

    await click(buttonByText(host, "Mark achieved"));
    await typeInto(host.querySelector("#gf-reward"), "Kaizen pin");
    await click(buttonByText(host, "Goal achieved"));

    const history = probe.formData.goalHistory!;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      goal: "Carry the grandkids up the stairs",
      targetDate: "2026-11-26",
      reward: "Kaizen pin",
      byTrainerId: "t1",
      byName: "Jane Coach",
    });
    expect(Object.values(history[0]).every((v) => v !== undefined)).toBe(true);
    expect(probe.formData.smartGoal).toBe("");
    expect(probe.formData.goalTargetDate).toBe("");
    expect(probe.formData.smartChecks).toBeNull();
    // Everything the Save bar has to write, and nothing else.
    expect([...probe.dirty].sort()).toEqual(
      ["goalHistory", "goalTargetDate", "smartChecks", "smartGoal"].sort(),
    );

    // The badge and the achieve button go with the goal; the history shows both.
    expect(host.querySelector('[data-testid="smart-badge"]')).toBeNull();
    expect(buttonByText(host, "Mark achieved")).toBeUndefined();
    const shelf = host.querySelector('[data-testid="goal-history"]')!;
    expect(shelf.textContent).toContain("Achieved goals · 2");
    expect(shelf.textContent).toContain("Kaizen pin");
    expect(shelf.textContent).toContain("Older goal");
  });

  it("a client with no checklist on record gets none written when a goal is achieved", async () => {
    const probe = {} as Probe;
    const host = await mount(<GoalsHarness client={baseClient()} probe={probe} />);
    await click(buttonByText(host, "Mark achieved"));
    await click(buttonByText(host, "Goal achieved"));
    expect(probe.dirty.has("smartChecks")).toBe(false);
    expect(probe.dirty.has("goalTargetDate")).toBe(false);
    expect(probe.formData.goalHistory).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* Focus                                                               */
/* ------------------------------------------------------------------ */

const day = (d: number) => new Date(2026, 7, d, 10);

function focus(over: Partial<ClientFocus>): ClientFocus {
  return {
    id: "f1",
    clientId: "c1",
    studioId: "s1",
    trainerId: "uid-jane",
    trainerName: "Jane Coach",
    trainerInitials: "JC",
    category: "Pace",
    intent: "No dumping at the ends",
    targetMachineId: null,
    status: "active",
    startedAt: day(1),
    reviewDueAt: null,
    passedAt: null,
    lastExtendedAt: null,
    extensionCount: 0,
    checkInCount: 0,
    lastCheckInAt: null,
    createdAt: day(1),
    updatedAt: day(1),
    ...over,
  };
}

const checkIn = (id: string, focusId: string): JournalEntry =>
  ({
    id,
    clientId: "c1",
    studioId: "s1",
    kind: "coaching",
    category: "Pace",
    body: `note ${id}`,
    importance: "standard",
    machineId: null,
    focusId,
    sessionId: null,
    origin: "manual",
    authorId: "uid-jane",
    authorInitials: "JC",
    authorName: "Jane Coach",
    occurredAt: day(3),
    createdAt: day(3),
    updatedAt: day(3),
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
  }) as JournalEntry;

describe("FocusBoard mounts", () => {
  const focuses = [
    focus({ id: "a" }),
    focus({ id: "b", trainerId: "uid-sam", trainerName: "Sam Kim", trainerInitials: "SK", category: "Path" }),
    focus({ id: "c", status: "passed", achievedAt: day(22), rewardNote: "Kaizen pin" }),
    focus({ id: "d", status: "retired", retiredAt: day(8), trainerId: "uid-sam", trainerName: "Sam Kim" }),
  ];
  const handlers = () => ({
    onCreate: vi.fn(async () => {}),
    onAchieve: vi.fn(async () => {}),
    onExtend: vi.fn(async () => {}),
    onRetire: vi.fn(async () => {}),
    onCheckIn: vi.fn(async () => true),
  });

  it("shows several active focuses, a Set-a-focus button, and the history", async () => {
    const h = handlers();
    const host = await mount(
      <FocusBoard
        focuses={focuses}
        entries={[checkIn("e1", "a"), checkIn("e2", "a"), checkIn("e3", "c")]}
        machines={[]}
        viewerIds={["uid-jane"]}
        {...h}
      />,
    );
    expect(host.querySelectorAll('[data-testid="active-focus"]')).toHaveLength(2);
    expect(buttonByText(host, "Set a focus")).toBeTruthy();
    const cards = host.querySelectorAll('[data-testid="active-focus"]');
    expect(cards[0].textContent).toContain("Set by Jane Coach (JC)");
    expect(cards[0].textContent).toContain("2 check-ins");
    // Someone else's focus: check in yes, close no.
    expect(cards[1].textContent).toContain("Check in");
    expect(cards[1].textContent).not.toContain("Achieved");
    expect(cards[1].textContent).toContain("Only Sam Kim");

    const history = host.querySelector('[data-testid="focus-history"]')!;
    expect(history.textContent).toContain("Focus history · 2");
    expect(history.textContent).toContain("Achieved");
    expect(history.textContent).toContain("Reward: Kaizen pin");
    expect(history.textContent).toContain("3 weeks");
    expect(history.textContent).toContain("Retired");
    // Two coaches in the history: the filter is offered, and it filters.
    await click(buttonByText(history as HTMLElement, "Sam Kim"));
    expect(history.querySelectorAll('[data-testid="past-focus"]')).toHaveLength(1);
  });

  it("files a check-in with the focus, from the card itself", async () => {
    const h = handlers();
    const host = await mount(
      <FocusBoard focuses={focuses} entries={[]} machines={[]} viewerIds={["uid-jane"]} {...h} />,
    );
    const card = host.querySelector('[data-testid="active-focus"]') as HTMLElement;
    await click(buttonByText(card, "Check in"));
    await typeInto(card.querySelector("textarea"), "Held the bottom today");
    await click(buttonByText(card, "Log check-in"));
    expect(h.onCheckIn).toHaveBeenCalledTimes(1);
    const [f, body] = h.onCheckIn.mock.calls[0] as unknown as [ClientFocus, string];
    expect(f.id).toBe("a");
    expect(body).toBe("Held the bottom today");
  });

  it("marks a focus achieved with a reward", async () => {
    const h = handlers();
    const host = await mount(
      <FocusBoard focuses={focuses} entries={[]} machines={[]} viewerIds={["uid-jane"]} {...h} />,
    );
    const card = host.querySelector('[data-testid="active-focus"]') as HTMLElement;
    await click(buttonByText(card, "Achieved"));
    await typeInto(card.querySelector("input"), "Kaizen pin");
    await click(buttonByText(card, "Mark achieved"));
    expect(h.onAchieve).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "Kaizen pin");
  });
});
