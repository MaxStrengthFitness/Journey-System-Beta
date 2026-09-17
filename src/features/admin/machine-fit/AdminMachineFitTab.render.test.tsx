// @vitest-environment jsdom
/**
 * Operations → Machine fit, MOUNTED.
 *
 * What only a render shows: the studio scope reads the index once and names
 * the client worth a look; a tap sends her profile to Programming → Setup on
 * Check; the company scope is offered to administrators only and never reads
 * anything for anyone else; a failed read says so instead of "nobody".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, Machine, Studio } from "../../../types";

const spy = vi.hoisted(() => ({
  studioReads: [] as string[],
  docReads: [] as string[],
  fit: null as null | Record<string, unknown>,
  failStudio: false,
  docs: {} as Record<string, unknown>,
}));

vi.mock("../../../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  getDoc: async (ref: { path: string }) => {
    spy.docReads.push(ref.path);
    const data = spy.docs[ref.path];
    return { exists: () => data !== undefined, data: () => data };
  },
}));
vi.mock("../../../hooks/useMachineCatalog", () => ({ useMachineCatalog: () => ({ catalog: [], byId: {}, loading: false }) }));
vi.mock("../../machine-fit/fit-store", () => ({
  fetchStudioFit: async (studioId: string) => {
    spy.studioReads.push(studioId);
    return spy.failStudio ? null : spy.fit;
  },
}));

import { buildCompany } from "../../machine-fit/company";
import { compoundRowStudio } from "../../machine-fit/fixtures";
import { AdminMachineFitTab } from "./AdminMachineFitTab";
import { __resetCompanyFitCache } from "./useMachineFitReports";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MACHINES: Machine[] = [
  { id: "m-leg-press", name: "Leg Press", order: 6, settingOptions: ["Seat"] },
  { id: "m-compound-row", name: "Compound Row", order: 9, settingOptions: ["Gap", "Seat", "Chest", "Handles"] },
];
const STUDIOS = [
  { id: "solon", name: "Solon" },
  { id: "westlake", name: "Westlake" },
] as Studio[];

const T = Date.UTC(2026, 8, 17, 16, 0, 0);
const feet = (inches: number) => `${Math.floor(inches / 12)}'${inches % 12}"`;

/** The fixture studio as client records + an index document, plus one client sitting somewhere odd. */
function studioData(studioId: string, prefix: string, withOdd: boolean) {
  const samples = compoundRowStudio();
  const clients: Client[] = [];
  const rows: Record<string, unknown> = {};
  samples.forEach((s, i) => {
    const id = `${prefix}${i}`;
    clients.push({
      id,
      firstName: `First${i}`,
      lastName: `Last${prefix}${i}`,
      height: feet(s.factors.heightIn as number),
      gender: s.factors.gender === "m" ? "Male" : "Female",
      homeStudioId: studioId,
      isActive: true,
    } as Client);
    rows[id] = { s: s.settings, t: T };
  });
  if (withOdd) {
    clients.push({ id: `${prefix}-odd`, firstName: "Odette", lastName: "Outlier-Hyphenated-Longname", height: "5'7\"", gender: "Female", homeStudioId: studioId, isActive: true } as Client);
    rows[`${prefix}-odd`] = { s: { gap: "0", seat: "9", chest: "3", handles: "in" }, t: T };
  }
  return { clients, doc: { machineId: "m-compound-row", studioId, rows } };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const opened: string[] = [];

async function mount(props: { isAdmin?: boolean; clients: Client[] }) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <AdminMachineFitTab
        machines={MACHINES}
        clients={props.clients}
        studios={STUDIOS}
        activeStudioId="solon"
        isAdmin={!!props.isAdmin}
        onNavigateProfile={(id) => opened.push(id)}
      />,
    );
  });
  return host;
}

const text = () => host?.textContent ?? "";
const button = (label: RegExp) => [...host!.querySelectorAll("button")].find((b) => label.test(b.textContent ?? ""))!;

beforeEach(() => {
  spy.studioReads.length = 0;
  spy.docReads.length = 0;
  spy.failStudio = false;
  spy.docs = {};
  opened.length = 0;
  window.sessionStorage.clear();
  __resetCompanyFitCache();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("Machine fit — this studio", () => {
  it("reads the studio's index once and opens on the machine people are set up on", async () => {
    const solon = studioData("solon", "s", false);
    spy.fit = { "m-compound-row": solon.doc };
    await mount({ clients: solon.clients });
    expect(spy.studioReads).toEqual(["solon"]);
    expect(spy.docReads).toEqual([]);
    expect(host!.querySelector(".adm-fit-report__name")?.textContent).toBe("Compound Row");
    expect(text()).toContain("24 clients set up.");
    expect(text()).toContain("nobody is set somewhere unusual for their build");
    expect(text()).toContain("Seat follows height closely");
    // The floor's other machine is listed, and says so rather than hiding.
    expect(text()).toContain("Leg Press");
    expect(text()).toContain("Nobody set up yet");
  });

  it("shows where each height band sits, and 'not enough data yet' where it cannot say", async () => {
    const solon = studioData("solon", "s", false);
    spy.fit = { "m-compound-row": solon.doc };
    await mount({ clients: solon.clients });
    const byHeight = [...host!.querySelectorAll(".adm-fit-table")][0];
    expect(byHeight.querySelector("tbody th")?.textContent).toBe("5'1\"–5'3\"");
    expect(byHeight.textContent).toContain("4 of 5");
    expect(byHeight.textContent).toContain("not enough data yet");
  });

  it("names the client worth a look, never truncated, and opens her Setup on Check", async () => {
    const solon = studioData("solon", "s", true);
    spy.fit = { "m-compound-row": solon.doc };
    await mount({ clients: solon.clients });
    expect(text()).toContain("Odette Outlier-Hyphenated-Longname");
    expect(text()).toMatch(/Seat 9 — none of the \d+ clients 5'6"–5'8" at this studio use it/);
    await act(async () => button(/Odette/).click());
    expect(opened).toEqual(["s-odd"]);
    expect(JSON.parse(window.sessionStorage.getItem("msf_profile_loc:s-odd") ?? "null") ?? findStored("s-odd")).toMatchObject({
      tab: "programming",
      view: "setup",
    });
    expect(window.sessionStorage.getItem("msf_fit_open_mode:s-odd")).toBe("check");
  });

  it("leaves a reviewed setting alone", async () => {
    const solon = studioData("solon", "s", true);
    (solon.doc.rows["s-odd"] as { a?: Record<string, string> }).a = { seat: "9" };
    spy.fit = { "m-compound-row": solon.doc };
    await mount({ clients: solon.clients });
    expect(text()).not.toContain("Odette");
    expect(text()).toContain("nobody is set somewhere unusual");
  });

  it("says it could not load, not that nobody is set up", async () => {
    spy.failStudio = true;
    await mount({ clients: [] });
    expect(text()).toContain("could not be loaded");
    expect(text()).not.toContain("Nobody set up yet");
  });

  it("counts set-ups whose client is not on the studio's list instead of silently dropping them", async () => {
    const solon = studioData("solon", "s", false);
    spy.fit = { "m-compound-row": solon.doc };
    await mount({ clients: solon.clients.slice(0, 20) });
    expect(text()).toContain("4 saved set-ups belong to clients who are not on this studio's list");
  });

  it("does not offer the company report to a studio leader, and reads nothing for it", async () => {
    const solon = studioData("solon", "s", false);
    spy.fit = { "m-compound-row": solon.doc };
    await mount({ clients: solon.clients, isAdmin: false });
    expect(button(/All MSF studios/)).toBeUndefined();
    expect(spy.docReads).toEqual([]);
  });
});

describe("Machine fit — all MSF studios", () => {
  it("reads the summary, then one machine's report, and names studios but no clients", async () => {
    const solon = studioData("solon", "s", false);
    const westlake = studioData("westlake", "w", true);
    const built = buildCompany(
      [
        { studioId: "solon", docs: [solon.doc as never] },
        { studioId: "westlake", docs: [westlake.doc as never] },
      ],
      [...solon.clients, ...westlake.clients] as never,
      new Date(2026, 8, 20, 12),
    );
    spy.docs = { "kaizenReports/_summary": built.summary, "kaizenReports/m-compound-row": built.reports["m-compound-row"] };
    spy.fit = { "m-compound-row": solon.doc };
    await mount({ clients: solon.clients, isAdmin: true });
    await act(async () => button(/All MSF studios/).click());
    await act(async () => undefined);

    expect(spy.docReads).toEqual(["kaizenReports/_summary", "kaizenReports/m-compound-row"]);
    expect(text()).toContain("49 clients set up across 2 studios.");
    expect(text()).toContain("Westlake: 25 clients set up");
    expect(text()).toContain("1 set somewhere nobody similar is");
    expect(text()).not.toContain("Odette");
    expect(text()).not.toContain("Worth a look" + "Set somewhere"); // the named panel is studio-only
    expect(host!.querySelector(".adm-fit-finding")).toBeNull();
  });

  it("explains an absent report instead of showing an empty one", async () => {
    spy.fit = {};
    await mount({ clients: [], isAdmin: true });
    await act(async () => button(/All MSF studios/).click());
    await act(async () => undefined);
    expect(text()).toContain("No company report yet");
  });
});

/** The profile's store key is private to profile-nav; find whatever it wrote for this client. */
function findStored(clientId: string): unknown {
  for (let i = 0; i < window.sessionStorage.length; i += 1) {
    const key = window.sessionStorage.key(i) as string;
    if (key.endsWith(clientId) && !key.startsWith("msf_fit_open_mode")) return JSON.parse(window.sessionStorage.getItem(key) as string);
  }
  return null;
}
