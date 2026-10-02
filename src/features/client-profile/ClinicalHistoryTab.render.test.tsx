// @vitest-environment jsdom
/**
 * Activity Archive → Reports, MOUNTED (Atlas answers, Oct 2 2026): the due
 * cue is the profile's one rule (`progressReportDue`), and the per-client
 * "No progress reports" switch turns it off for her.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, ProgressReport } from "../../types";

vi.mock("../client-history", () => ({ ClientHistoryTab: () => <div className="stub-history" /> }));
vi.mock("../clinical-review", () => ({ ClinicalReviewTab: () => <div className="stub-review" /> }));
vi.mock("../../components/journal/ProgressReportArchive", () => ({ ProgressReportArchive: () => <div className="stub-archive" /> }));
vi.mock("../../hooks/useClientCoverage", () => ({ useClientCoverage: () => ({ coverage: "partial" }) }));

import { ClinicalHistoryTab } from "./ClinicalHistoryTab";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(ui));
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

const client = (over: Partial<Client> = {}) =>
  ({ id: "c1", firstName: "Mary", lastName: "Smith", isActive: true, remainingSessions: 0, firstStudioDay: "2019-01-01", ...over }) as Client;

const oldReport = { id: "r1", clientId: "c1", date: "2025-01-10", status: "Finalized" } as ProgressReport;

function Tab({ who, onSet }: { who: Client; onSet?: (off: boolean) => void }) {
  return (
    <ClinicalHistoryTab
      clientId="c1"
      client={who}
      machines={[]}
      trainers={[]}
      progressReports={[oldReport]}
      onSelectReport={() => {}}
      onDeleteReport={() => {}}
      onNewReport={() => {}}
      onSetNoProgressReports={onSet}
      view="reports"
      onViewChange={() => {}}
    />
  );
}

describe("Activity Archive → Reports: when a progress report is due", () => {
  it("says it is due three months after the last full report, and offers the switch", async () => {
    const onSet = vi.fn();
    const host = await mount(<Tab who={client()} onSet={onSet} />);
    expect(host.querySelector(".ptab-cue")?.textContent).toContain("three months since the last full report (Jan 10, 2025)");
    const sw = host.querySelector<HTMLButtonElement>('[data-action="no-progress-reports"]');
    expect(sw?.textContent).toBe("No progress reports");
    await act(async () => sw!.click());
    expect(onSet).toHaveBeenCalledWith(true);
  });

  it("says nothing is due for a client with the switch on, and offers to turn it back on", async () => {
    const onSet = vi.fn();
    const host = await mount(<Tab who={client({ noProgressReports: true })} onSet={onSet} />);
    expect(host.querySelector(".ptab-cue")).toBeNull();
    const sw = host.querySelector<HTMLButtonElement>('[data-action="no-progress-reports"]');
    expect(sw?.textContent).toBe("Turn reminders back on");
    await act(async () => sw!.click());
    expect(onSet).toHaveBeenCalledWith(false);
  });

  it("offers no switch to someone who may not edit her", async () => {
    const host = await mount(<Tab who={client()} />);
    expect(host.querySelector('[data-action="no-progress-reports"]')).toBeNull();
  });
});
