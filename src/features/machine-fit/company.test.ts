import { describe, expect, it } from "vitest";
import { buildCompany, type CompanyClientRecord, type StudioFitDocs } from "./company";
import type { FitRowDoc } from "./fit-index";

const NOW = new Date(2026, 8, 20, 12, 0, 0);
const T = Date.UTC(2026, 8, 17, 16, 0, 0);

// Four builds, three clients of each at every studio: six per height and
// gender across the two studios, so every published cell clears the floor of five.
const BUILDS: [height: string, gender: string, seat: string][] = [
  ["5'2\"", "Female", "6"],
  ["5'4\"", "Female", "5"],
  ["5'10\"", "Male", "3"],
  ["6'0\"", "Male", "2"],
];

function studioOf(studioId: string, prefix: string): { clients: (CompanyClientRecord & { id: string })[]; rows: Record<string, FitRowDoc> } {
  const clients: (CompanyClientRecord & { id: string })[] = [];
  const rows: Record<string, FitRowDoc> = {};
  for (let i = 0; i < 12; i += 1) {
    const [height, gender, seat] = BUILDS[i % BUILDS.length];
    const id = `${prefix}-SECRET-${i}`;
    clients.push({ id, height, gender, homeStudioId: studioId });
    rows[id] = { s: { seat, gap: "0" }, t: T };
  }
  return { clients, rows };
}

describe("buildCompany — the weekly job's machine-fit step", () => {
  const solon = studioOf("solon", "s");
  const westlake = studioOf("westlake", "w");
  const studios: StudioFitDocs[] = [
    { studioId: "solon", docs: [{ machineId: "m-leg-press", rows: solon.rows }] },
    { studioId: "westlake", docs: [{ machineId: "m-leg-press", rows: westlake.rows }] },
  ];
  const clients = [...solon.clients, ...westlake.clients];

  it("pools every studio into one anonymous block per machine", () => {
    const { blocks } = buildCompany(studios, clients, NOW);
    const block = blocks["m-leg-press"];
    expect(block.clients).toBe(24);
    expect(block.studios).toBe(2);
    expect(block.cells["64|f"]).toEqual({ "gap=0;seat=5": 6 });
    // Every published group is five or more people.
    for (const cell of Object.values(block.cells)) expect(Object.values(cell).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(5);
    const text = JSON.stringify(block);
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("solon");
  });

  it("writes a report that names studios and never people", () => {
    const { reports, summary } = buildCompany(studios, clients, NOW);
    const report = reports["m-leg-press"];
    expect(report).toMatchObject({ machineId: "m-leg-press", onFile: 24, clients: 24, studios: 2, builtAt: NOW.toISOString() });
    expect(Object.keys(report.byStudio).sort()).toEqual(["solon", "westlake"]);
    expect(report.fieldKeys).toEqual(["gap", "seat"]);
    expect(JSON.stringify(report)).not.toContain("SECRET");
    expect(summary.machines["m-leg-press"]).toMatchObject({ onFile: 24, clients: 24, studios: 2 });
    expect(summary.studios).toBe(2);
  });

  it("counts a client once, at her home studio, when a stale row was left behind", () => {
    const moved = { ...solon.clients[0], homeStudioId: "westlake" };
    const movedClients = [moved, ...solon.clients.slice(1), ...westlake.clients];
    const withBoth: StudioFitDocs[] = [
      studios[0], // her old row is still in solon's index
      { studioId: "westlake", docs: [{ machineId: "m-leg-press", rows: { ...westlake.rows, [moved.id]: solon.rows[moved.id] } }] },
    ];
    const { reports, rowsSkipped } = buildCompany(withBoth, movedClients, NOW);
    expect(reports["m-leg-press"].onFile).toBe(24);
    expect(reports["m-leg-press"].byStudio.solon.clients).toBe(11);
    expect(reports["m-leg-press"].byStudio.westlake.clients).toBe(13);
    expect(rowsSkipped).toBe(1);
  });

  it("leaves an accepted suggestion out of the block until she has trained on it, but keeps it on file", () => {
    const rows = { ...solon.rows };
    const id = solon.clients[2].id;
    rows[id] = { s: { seat: "5" }, src: { seat: "suggested" }, t: T };
    const { blocks, reports } = buildCompany(
      [
        { studioId: "solon", docs: [{ machineId: "m", rows }] },
        { studioId: "westlake", docs: [{ machineId: "m", rows: westlake.rows }] },
      ],
      clients,
      NOW,
    );
    expect(blocks.m.clients).toBe(23);
    expect(reports.m.onFile).toBe(24);
    expect(reports.m.clients).toBe(23);
  });

  it("publishes no block for a machine whose every height is too thin to stay anonymous — the report still counts them", () => {
    const { blocks, reports } = buildCompany([{ studioId: "solon", docs: [{ machineId: "m", rows: solon.rows }] }], solon.clients, NOW);
    expect(blocks.m).toBeUndefined();
    expect(reports.m.onFile).toBe(12);
  });

  it("makes nothing of a studio with no readable rows", () => {
    const { blocks, reports, summary } = buildCompany([{ studioId: "new", docs: [{ machineId: "m", rows: {} }] }], clients, NOW);
    expect(blocks).toEqual({});
    expect(reports).toEqual({});
    expect(summary.machines).toEqual({});
  });
});
