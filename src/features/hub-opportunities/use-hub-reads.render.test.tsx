// @vitest-environment jsdom
/**
 * THE HUB'S TWO WAVE 2 READS, MOUNTED (wave 2 hub, Sep 28 2026). ClientsView's
 * test stands in for both hooks, so this mounts the real ones over a stood-in
 * fetch: each answers "loading" and then its answer, makes ONE read for a
 * studio visit (a second Hub on the same day reuses it), makes none for
 * someone who may not read the studio, and never loops.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const { fetchHubFord, getDoc } = vi.hoisted(() => ({ fetchHubFord: vi.fn(), getDoc: vi.fn() }));
vi.mock("../ford/hub-read", () => ({ fetchHubFord }));
vi.mock("../../firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({ doc: (...path: unknown[]) => ({ path: path.slice(1).join("/") }), getDoc }));

import { forgetPersonalMemory } from "../sign-out/memory";
import { useHubFord } from "./use-hub-ford";
import { useHubMarks } from "./use-hub-marks";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const NOW = new Date("2026-09-28T13:24:00Z");
const TODAY = "2026-09-28";

let root: Root | null = null;
let host: HTMLDivElement | null = null;
beforeEach(() => {
  fetchHubFord.mockReset();
  getDoc.mockReset();
  forgetPersonalMemory();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

/** What the Hub hands the engine, drawn as words. */
function Probe({ studioId }: { studioId: string | null }) {
  const ford = useHubFord(studioId, TODAY);
  const marks = useHubMarks(studioId, TODAY, NOW);
  const askFor = ford.fordFor?.("hamfast");
  const star = marks.allStarOf?.("hamfast");
  return (
    <p>
      {`ford:${ford.status} details:${askFor === undefined ? "-" : askFor === null ? "unknown" : askFor.length} marks:${marks.status} star:${star ? star.weeksIn : "-"}`}
    </p>
  );
}

async function mount(studioId: string | null) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <Probe studioId={studioId} />
      </StrictMode>,
    );
  });
  return host;
}

const settle = () => act(async () => {});

describe("the Hub's wave 2 reads, mounted", () => {
  it("answer after loading, with ONE read each for the visit", async () => {
    fetchHubFord.mockResolvedValue({ status: "ready", details: [{ id: "f1", clientId: "hamfast", body: "The recital" }], fromCache: false });
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ computedAt: new Date("2026-09-28T07:10:00Z"), allStars: [{ clientId: "hamfast", weeksWithVisit: 25, perWeek: 2 }] }),
      metadata: { fromCache: false },
    });
    const el = await mount("westlake");
    await settle();
    expect(el.textContent).toBe("ford:ready details:1 marks:ready star:25");
    expect(fetchHubFord).toHaveBeenCalledTimes(1);
    expect(getDoc).toHaveBeenCalledTimes(1);
    expect(getDoc).toHaveBeenCalledWith({ path: "studios/westlake/watch/hubMarks" });
  });

  it("a second Hub the same day starts from the answer held, and reads nothing", async () => {
    fetchHubFord.mockResolvedValue({ status: "ready", details: [], fromCache: false });
    getDoc.mockResolvedValue({ exists: () => false, data: () => undefined, metadata: { fromCache: false } });
    await mount("westlake");
    await settle();
    act(() => root?.unmount());
    host?.remove();
    const el = await mount("westlake");
    expect(el.textContent).toBe("ford:ready details:0 marks:none star:-");
    expect(fetchHubFord).toHaveBeenCalledTimes(1);
    expect(getDoc).toHaveBeenCalledTimes(1);
  });

  it("reads nothing for someone who may not read the studio", async () => {
    const el = await mount(null);
    await settle();
    expect(el.textContent).toBe("ford:off details:- marks:off star:-");
    expect(fetchHubFord).not.toHaveBeenCalled();
    expect(getDoc).not.toHaveBeenCalled();
  });

  it("a failed FORD read is unknown for every client, never 'nothing'", async () => {
    fetchHubFord.mockResolvedValue({ status: "failed", details: [], fromCache: false });
    getDoc.mockRejectedValue(new Error("unavailable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = await mount("westlake");
    await settle();
    expect(el.textContent).toBe("ford:failed details:unknown marks:unreadable star:-");
    warn.mockRestore();
  });
});
