// @vitest-environment jsdom
/**
 * useStartingRoutines, mounted: one read of the routines and one of the
 * studio's choice per mount (no listener), the Academy's eleven while it
 * waits and when the read fails or finds none, the choice unknown (null)
 * until it answers and when its read fails, a read for another studio never
 * shown as this one's, and reload() reading again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const fake = vi.hoisted(() => ({
  routineReads: [] as Array<{ studioId: string | null | undefined; opts?: unknown; d: Deferred<unknown> }>,
  choiceReads: [] as Array<{ studioId: string; d: Deferred<unknown> }>,
}));

vi.mock("../../firebase", () => ({ db: { __fake: true } }));
vi.mock("./starting-store", () => ({
  readStartingRoutines: (_db: unknown, studioId: string | null | undefined, opts?: unknown) => {
    const d = deferred<unknown>();
    fake.routineReads.push({ studioId, opts, d });
    return d.promise;
  },
  readStartingChoice: (_db: unknown, studioId: string) => {
    const d = deferred<unknown>();
    fake.choiceReads.push({ studioId, d });
    return d.promise;
  },
}));

import { useStartingRoutines, type StartingRoutinesState } from "./useStartingRoutines";
import { academyStartingRoutines, type StartingRoutine } from "./starting-routines";

let result: StartingRoutinesState | null = null;
let enabled = true;
function Probe({ studioId }: { studioId: string | null }) {
  result = useStartingRoutines(studioId, { enabled });
  return null;
}

let root: Root | null = null;
let host: HTMLElement | null = null;

async function render(studioId: string | null, strict = false) {
  if (!root) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }
  const probe = <Probe studioId={studioId} />;
  await act(async () => {
    root!.render(strict ? <StrictMode>{probe}</StrictMode> : probe);
  });
}

const settle = () => act(async () => {});

const knee: StartingRoutine = {
  id: "academy-knee",
  name: "Knee issues",
  machineIds: ["m-leg-curl", "m-leg-press"],
  dayOne: ["m-leg-curl"],
  matchWords: ["knee"],
  isDefault: true,
  tier: "company",
  kind: "condition",
};

const academyIds = academyStartingRoutines().map((r) => r.id);

beforeEach(() => {
  fake.routineReads.length = 0;
  fake.choiceReads.length = 0;
  result = null;
  enabled = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

describe("useStartingRoutines", () => {
  it("reads each once per mount and draws the Academy's eleven while it waits", async () => {
    await render("westlake");
    expect(fake.routineReads.map((r) => r.studioId)).toEqual(["westlake"]);
    expect(fake.choiceReads.map((r) => r.studioId)).toEqual(["westlake"]);
    expect(result!.status).toBe("loading");
    expect(result!.fromCode).toBe(true);
    expect(result!.choice).toBeNull();
    expect(result!.routines.map((r) => r.id)).toEqual(academyIds);
  });

  it("gives the app's routines and the studio's choice once both answer", async () => {
    await render("westlake");
    fake.routineReads[0]!.d.resolve({ routines: [knee], known: true });
    fake.choiceReads[0]!.d.resolve({ use: ["academy-knee"], defaultId: null });
    await settle();
    expect(result).toMatchObject({ status: "ready", fromCode: false, choice: { use: ["academy-knee"], defaultId: null } });
    expect(result!.routines).toEqual([knee]);
  });

  it("falls back to the Academy's eleven before the seed has run, and says the read was fine", async () => {
    await render("westlake");
    fake.routineReads[0]!.d.resolve({ routines: [], known: true });
    fake.choiceReads[0]!.d.resolve({ use: null, defaultId: null });
    await settle();
    expect(result).toMatchObject({ status: "ready", fromCode: true, choice: { use: null, defaultId: null } });
    expect(result!.routines.map((r) => r.id)).toEqual(academyIds);
  });

  it("hands on the same read's routine templates, unknown (null) while it reads and when it failed or only an empty cache answered", async () => {
    const full = { id: "t-full", name: "Full body", machineIds: ["m-leg-press"], scope: "global", tier: "company" };
    await render("westlake");
    expect(result!.templates).toBeNull();
    fake.routineReads[0]!.d.resolve({ routines: [knee], known: true, templates: [full] });
    fake.choiceReads[0]!.d.resolve({ use: null, defaultId: null });
    await settle();
    expect(result!.templates).toEqual([full]);
    // An answer from before the field: none, said as none.
    await act(async () => result!.reload());
    expect(result!.templates).toBeNull();
    fake.routineReads[1]!.d.resolve({ routines: [knee], known: true });
    fake.choiceReads[1]!.d.resolve({ use: null, defaultId: null });
    await settle();
    expect(result!.templates).toEqual([]);
    await act(async () => result!.reload());
    fake.routineReads[2]!.d.resolve({ routines: [], known: false, templates: [] });
    fake.choiceReads[2]!.d.resolve({ use: null, defaultId: null });
    await settle();
    expect(result!.templates).toBeNull();
    await act(async () => result!.reload());
    fake.routineReads[3]!.d.reject(new Error("unavailable"));
    fake.choiceReads[3]!.d.resolve({ use: null, defaultId: null });
    await settle();
    expect(result!.templates).toBeNull();
    // The trainers' read failed (the review, Oct 9 2026): the templates unknown, the starting routines as read.
    await act(async () => result!.reload());
    fake.routineReads[4]!.d.resolve({ routines: [knee], known: true, templates: null });
    fake.choiceReads[4]!.d.resolve({ use: null, defaultId: null });
    await settle();
    expect(result!.templates).toBeNull();
    expect(result!.status).toBe("ready");
    expect(fake.routineReads.every((r) => r.opts === undefined), "the trainers' templates only when asked").toBe(true);
  });

  it("keeps a failed choice unknown, never 'hasn't chosen', and says it failed", async () => {
    await render("westlake");
    fake.routineReads[0]!.d.resolve({ routines: [knee], known: true });
    fake.choiceReads[0]!.d.reject(new Error("permission-denied"));
    await settle();
    expect(result).toMatchObject({ status: "failed", fromCode: false, choice: null });
  });

  it("offers the Academy's eleven when the routines' read fails or only the cache answered, and says so", async () => {
    await render("westlake");
    fake.routineReads[0]!.d.reject(new Error("unavailable"));
    fake.choiceReads[0]!.d.resolve({ use: null, defaultId: null });
    await settle();
    expect(result).toMatchObject({ status: "failed", fromCode: true });
    expect(result!.routines.map((r) => r.id)).toEqual(academyIds);

    await act(async () => result!.reload());
    fake.routineReads[1]!.d.resolve({ routines: [], known: false });
    fake.choiceReads[1]!.d.resolve({ use: null, defaultId: null });
    await settle();
    expect(result).toMatchObject({ status: "failed", fromCode: true });
  });

  it("never shows one studio's answer as another's, and a late answer for the old studio is dropped", async () => {
    await render("westlake");
    await render("solon");
    expect(result!.status).toBe("loading");
    // Westlake's answer arrives after the screen moved to Solon.
    fake.routineReads[0]!.d.resolve({ routines: [knee], known: true });
    fake.choiceReads[0]!.d.resolve({ use: ["academy-knee"], defaultId: "academy-knee" });
    await settle();
    expect(result!.status).toBe("loading");
    expect(result!.choice).toBeNull();
    fake.routineReads[1]!.d.resolve({ routines: [], known: true });
    fake.choiceReads[1]!.d.resolve({ use: null, defaultId: null });
    await settle();
    expect(result).toMatchObject({ status: "ready", choice: { use: null, defaultId: null } });
  });

  it("reads again on reload, after a leader saves the choice", async () => {
    await render("westlake");
    fake.routineReads[0]!.d.resolve({ routines: [knee], known: true });
    fake.choiceReads[0]!.d.resolve({ use: null, defaultId: null });
    await settle();
    await act(async () => result!.reload());
    expect(fake.choiceReads).toHaveLength(2);
    expect(result!.status).toBe("loading");
    fake.routineReads[1]!.d.resolve({ routines: [knee], known: true });
    fake.choiceReads[1]!.d.resolve({ use: ["academy-knee"], defaultId: "academy-knee" });
    await settle();
    expect(result!.choice).toEqual({ use: ["academy-knee"], defaultId: "academy-knee" });
  });

  it("with no studio, reads head office's alone and has no studio choice to read", async () => {
    await render(null);
    expect(fake.routineReads.map((r) => r.studioId)).toEqual([null]);
    expect(fake.choiceReads).toHaveLength(0);
    fake.routineReads[0]!.d.resolve({ routines: [knee], known: true });
    await settle();
    expect(result).toMatchObject({ status: "ready", choice: { use: null, defaultId: null } });
  });

  it("reads nothing while it isn't enabled (the briefing, for a client with a routine), and reads once it is", async () => {
    enabled = false;
    await render("westlake");
    expect(fake.routineReads).toHaveLength(0);
    expect(fake.choiceReads).toHaveLength(0);
    expect(result).toMatchObject({ status: "loading", fromCode: true, choice: null });
    enabled = true;
    await render("westlake");
    expect(fake.routineReads.map((r) => r.studioId)).toEqual(["westlake"]);
    fake.routineReads[0]!.d.resolve({ routines: [knee], known: true });
    fake.choiceReads[0]!.d.resolve({ use: null, defaultId: null });
    await settle();
    expect(result).toMatchObject({ status: "ready", fromCode: false });
  });

  it("mounts under StrictMode", async () => {
    await render("westlake", true);
    for (const r of fake.routineReads) r.d.resolve({ routines: [knee], known: true });
    for (const c of fake.choiceReads) c.d.resolve({ use: null, defaultId: null });
    await settle();
    expect(result).toMatchObject({ status: "ready", fromCode: false });
  });
});
