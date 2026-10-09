// @vitest-environment jsdom
/**
 * HOW A STUDIO STARTS A NEW CLIENT, read as the profile reads it (the studio
 * setting `newClientsStart`, the first-session round, item 8; AJ, Oct 7
 * 2026: "Some studios may start building an A and B routine immediately for
 * a client. So we need to be able to have that customization").
 *
 * The review of item 8: every Start a plan test handed `aAndBTogether` to
 * the host by hand, so a profile reading the wrong studio, the wrong key, or
 * nothing at all would have passed. Here the real `useNewClientsStart` over
 * the real `useStudioSettings` reads `studios/{s}/config/settings` from a
 * Firestore this test answers, the host is built as ClientProfileView builds
 * it, and the real Programming → Routine A (`RoutinesTab` → Start a plan)
 * draws B's part, or not. The profile's own wiring (which studio, which
 * field) is held by reading its source, as `machine-totals/
 * profile-draws.render.test.tsx` holds its grid's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useMemo } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* The two settings documents, as this test answers them: values, "fail", or "hang" (never answers). */
const docs = vi.hoisted(() => ({ answers: {} as Record<string, Record<string, unknown> | "fail" | "hang"> }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/"), id: segments[segments.length - 1] }),
    onSnapshot: (ref: { path: string }, next: (snap: unknown) => void, error: (e: unknown) => void) => {
      const answer = docs.answers[ref.path];
      if (answer === "hang") return () => {};
      if (answer === "fail") {
        error(new Error("refused"));
        return () => {};
      }
      next({ exists: () => !!answer, data: () => (answer ? { values: answer } : undefined) });
      return () => {};
    },
  };
});
vi.mock("../../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-sam" } } }));
vi.mock("../starting-store", () => ({
  readStartingRoutines: () => Promise.resolve({ routines: [], known: true }),
  readStartingChoice: () => Promise.resolve({ use: null, defaultId: null }),
}));

if (!("PointerEvent" in globalThis)) (globalThis as Record<string, unknown>).PointerEvent = MouseEvent;
const g = globalThis as unknown as Record<string, unknown>;
if (!("ResizeObserver" in g)) {
  g.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import type { Machine } from "../../../types";
import { ACADEMY_MOVEMENT_NAME } from "../../catalog/names";
import { UnsavedChangesProvider } from "../../unsaved-changes";
import { RoutinesTab } from "../../routines/RoutinesTab";
import { startingKindOf } from "../client-kind";
import type { PlanHost } from "./host";
import { newClientsStartOf, useNewClientsStart } from "./useNewClientsStart";

const IDS = [
  "m-leg-press", "m-ext", "m-leg-curl", "m-compound-row", "m-pulldown", "m-pullover", "m-simple-row",
  "m-chest-press", "m-overhead-press", "m-dip", "m-chest-fly", "m-lateral-raise", "m-bicep", "m-tricep-ext",
  "m-lumbar", "m-abs", "m-torso-rotation", "m-neck", "m-hip-abd", "m-hip-add",
];
const FLOOR: Machine[] = IDS.map((id) => ({ id, name: ACADEMY_MOVEMENT_NAME[id] ?? id }) as Machine);
const NEW_TO_STUDIO = { known: true, hasRoutine: false, hasPlan: false, journeySessions: 0, coverage: "complete", provisionalNewClient: false } as const;
const STUDIO = "studios/westlake/config/settings";
const COMPANY = "system/studioDefaults";

/** Programming → Routine A for a client starting out, its host built as ClientProfileView builds it. */
function ProfileLike({ activeStudioId }: { activeStudioId: string }) {
  const planAandB = useNewClientsStart(activeStudioId);
  const host = useMemo<PlanHost>(
    () => ({
      status: "ready",
      kind: startingKindOf(NEW_TO_STUDIO),
      floor: FLOOR,
      studioId: activeStudioId,
      studioName: "Westlake",
      who: { uid: "uid-sam", name: "Sam Lee" },
      todayYmd: "2026-10-09",
      intakeText: "Sciatica down the left leg",
      aAndBTogether: planAandB,
      actions: { start: () => {}, save: () => {}, healthNote: () => {}, readChanges: () => Promise.resolve([]) },
    }),
    [activeStudioId, planAandB],
  );
  return (
    <RoutinesTab
      client={{ id: "c1", firstName: "Dana", homeStudioId: "westlake" } as never}
      clientId="c1"
      machines={FLOOR}
      clientSettings={{}}
      allLogs={[]}
      sessions={[]}
      adjustments={[]}
      trainers={[]}
      selectedRoutineTodayId={null}
      isBActive={false}
      onEdit={vi.fn()}
      onToggleB={vi.fn()}
      view="Routine A"
      routines={[]}
      plan={host}
    />
  );
}

let root: Root | null = null;
let el: HTMLElement | null = null;
async function mount(node: React.ReactNode) {
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => {
    root!.render(<UnsavedChangesProvider>{node}</UnsavedChangesProvider>);
  });
  await act(async () => {});
}
const text = () => document.body.textContent ?? "";
const keep = () => [...document.body.querySelectorAll("button")].find((b) => /Keep this lineup/.test(b.textContent ?? "")) as HTMLButtonElement;

beforeEach(() => {
  docs.answers = {};
});
afterEach(() => {
  act(() => root?.unmount());
  el?.remove();
  root = null;
  el = null;
  document.body.innerHTML = "";
});

describe("the profile reads how its studio starts a new client", () => {
  it("A and B together at this studio: Start a plan plans Routine B beside the lineup", async () => {
    docs.answers[STUDIO] = { newClientsStart: 2 };
    await mount(<ProfileLike activeStudioId="westlake" />);
    expect(text()).toContain("Routine B, planned with A");
    expect(keep().disabled).toBe(false);
  });

  it("A alone, Max Strength's default: nothing about B appears", async () => {
    await mount(<ProfileLike activeStudioId="westlake" />);
    expect(text()).not.toContain("Routine B, planned with A");
    expect(text()).not.toContain("starts new clients");
  });

  it("head office's default answers for a studio with none of its own", async () => {
    docs.answers[COMPANY] = { newClientsStart: 2 };
    await mount(<ProfileLike activeStudioId="westlake" />);
    expect(text()).toContain("Routine B, planned with A");
  });

  it("another studio's setting is never this one's", async () => {
    docs.answers["studios/solon/config/settings"] = { newClientsStart: 2 };
    await mount(<ProfileLike activeStudioId="westlake" />);
    expect(text()).not.toContain("Routine B, planned with A");
  });

  it("while the studio's setting hasn't answered, it says so and Keep waits", async () => {
    docs.answers[STUDIO] = "hang";
    await mount(<ProfileLike activeStudioId="westlake" />);
    expect(text()).toContain("Reading how this studio starts new clients…");
    expect(keep().disabled).toBe(true);
  });

  it("when the studio's setting couldn't be read, B is offered, never quietly A alone", async () => {
    docs.answers[STUDIO] = "fail";
    await mount(<ProfileLike activeStudioId="westlake" />);
    expect(text()).toContain("Couldn't read how this studio starts new clients");
    expect(keep().disabled).toBe(false);
  });
});

describe("newClientsStartOf: answered, still reading, or not read", () => {
  const settings = (over: { value?: number; source?: "studio" | "company" | "app"; loading?: boolean; failed?: boolean }) => ({
    value: () => over.value ?? 1,
    source: () => over.source ?? "app",
    loading: over.loading ?? false,
    failed: over.failed ?? false,
  });
  it("is the value once both layers answered, or the studio's own whatever head office's read did", () => {
    expect(newClientsStartOf(settings({ value: 2, source: "company" }))).toBe(true);
    expect(newClientsStartOf(settings({ value: 1 }))).toBe(false);
    expect(newClientsStartOf(settings({ value: 2, source: "studio", failed: true }))).toBe(true);
    expect(newClientsStartOf(settings({ value: 2, source: "studio", loading: true }))).toBe(true);
  });
  it("is never A alone off a read that hasn't answered", () => {
    expect(newClientsStartOf(settings({ loading: true }))).toBe("loading");
    expect(newClientsStartOf(settings({ failed: true }))).toBe("failed");
    expect(newClientsStartOf(settings({ value: 2, source: "company", loading: true }))).toBe("loading");
    expect(newClientsStartOf(settings({ loading: true, failed: true }))).toBe("loading");
  });
});

/* ClientProfileView itself is too large to mount here; its two lines that matter are held by reading them. */
describe("ClientProfileView hands its studio's answer to Programming", () => {
  const profile = readFileSync(join(__dirname, "../../../components/ClientProfileView.tsx"), "utf8");
  it("reads newClientsStart for the studio on screen, through useNewClientsStart", () => {
    expect(profile).toMatch(/const planAandB = useNewClientsStart\(activeStudioId \?\? null\);/);
  });
  it("puts it into the plan host Start a plan reads", () => {
    const start = profile.indexOf("const planHost = useMemo<PlanHost>(");
    expect(start).toBeGreaterThan(-1);
    const hostBody = profile.slice(start, profile.indexOf("actions: planActions", start));
    expect(hostBody).toMatch(/aAndBTogether: planAandB,/);
  });
});
