// @vitest-environment jsdom
/**
 * Compare mounts, reads every studio's copy once, and shows the removed
 * safety lines first with their reasons; a failed read says so rather than
 * "nobody changed anything" (Codex R5, the Sep 21 rule).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "admin-elrond" } } }));

const feed = vi.hoisted(() => ({
  roster: [] as { path: string; data: Record<string, unknown> }[],
  fail: false,
  queries: [] as unknown[],
}));

vi.mock("firebase/firestore", () => ({
  collection: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  collectionGroup: (_db: unknown, id: string) => ({ group: id }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (...parts: unknown[]) => {
    feed.queries.push(parts);
    return { parts };
  },
  getDocs: async () => {
    if (feed.fail) throw new Error("offline");
    return { docs: feed.roster.map((r) => ({ data: () => r.data, ref: { path: r.path } })) };
  },
  onSnapshot: (_q: unknown, next: (s: { docs: unknown[] }) => void) => {
    next({ docs: [] });
    return () => {};
  },
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { MACHINE_DEFINITIONS } = await import("../../../../data/machine-definitions");
const { MachineCompare } = await import("./MachineCompare");

const legPress = MACHINE_DEFINITIONS["m-leg-press"];

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <MachineCompare machine={legPress} backLabel="LEG PRESS" onBack={() => {}} />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host!;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
  feed.roster = [];
  feed.fail = false;
  feed.queries = [];
});

describe("MachineCompare", () => {
  it("reads the copies whose lineage is this machine, and shows the removed safety lines first", async () => {
    feed.roster = [
      {
        path: "studios/solon/roster/m-leg-press",
        data: {
          machineId: "m-leg-press",
          source: "catalog",
          basedOn: "m-leg-press",
          status: "active",
          overrides: {
            removedSafety: [
              {
                field: "clinicalWarnings",
                line: legPress.clinicalWarnings[0],
                reason: "Our older unit has no end stop to lock against.",
                by: { uid: "uid-denethor", name: "Denethor" },
                at: "2026-09-27T14:00:00.000Z",
              },
            ],
          },
        },
      },
      {
        path: "studios/westlake/roster/m-leg-press",
        data: { machineId: "m-leg-press", source: "catalog", basedOn: "m-leg-press", status: "active", overrides: {} },
      },
    ];
    const el = await mount();
    // One collection-group query on basedOn.
    expect(JSON.stringify(feed.queries[0])).toContain('"field":"basedOn"');
    const text = el.textContent ?? "";
    expect(text).toContain("LEG PRESS · Compare");
    expect(text).toContain("Safety lines taken off");
    expect(text).toContain("Why: Our older unit has no end stop to lock against.");
    expect(text).toContain("Denethor");
    expect(text).toContain("2 units at 2 studios: 1 took a safety line off.");
    // Only the studio that differs, until Every studio is chosen.
    expect(text).not.toContain("westlake");
    const every = [...el.querySelectorAll("button")].find((b) => /Every studio/.test(b.textContent ?? ""))!;
    await act(async () => every.click());
    expect(el.textContent).toContain("Follows the standard exactly.");
  });

  it("says it couldn't check rather than that nothing changed", async () => {
    feed.fail = true;
    const el = await mount();
    expect(el.textContent).toContain("couldn't be read");
    expect(el.textContent).not.toContain("follows the standard");
  });

  it("says when no floor has the machine yet", async () => {
    const el = await mount();
    expect(el.textContent).toContain("No studio has LEG PRESS on its floor yet.");
  });
});
