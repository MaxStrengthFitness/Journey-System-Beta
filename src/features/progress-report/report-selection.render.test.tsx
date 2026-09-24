// @vitest-environment jsdom
/**
 * Which progress report opens, MOUNTED (Sep 24 2026).
 *
 * The bug: a report left any way but its own Back button stayed selected,
 * and the next "New report" opened it again under the current client's name
 * — and saved over it. The fix is an effect on the view plus a pin to the
 * client, and an effect is exactly what a pure test cannot see, so this
 * mounts `useReportSelection` in a harness wired the way AppContent wires it:
 * the same view names, a bottom bar that sets the view directly (as
 * AppContent's NavButtons do), the profile's two report buttons, a Relay
 * task, and the bell landing on the report view with no intent of its own.
 * The editor is a stub keyed exactly as AppContent keys the real one, with
 * one piece of local state so a carried-over editor would show.
 *
 * AppContent itself is not mounted (it needs the whole app); the real
 * editor's own refusal is ClientProgressReportView.render.test.tsx.
 */
import { afterEach, describe, expect, it } from "vitest";
import { StrictMode, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { View } from "../../types";
import { reportEditorKey, reportToOpen, useReportSelection } from "./report-selection";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ANN = "client-ann";
const BO = "client-bo";

function StubEditor({ clientId, existingReportId }: { clientId: string; existingReportId?: string }) {
  const [edited, setEdited] = useState(false);
  return (
    <div
      data-testid="editor"
      data-client={clientId}
      data-report={existingReportId ?? "new"}
      data-edited={edited ? "1" : "0"}
    >
      <button type="button" data-action="type-in-editor" onClick={() => setEdited(true)}>
        type
      </button>
    </div>
  );
}

function Harness() {
  const [view, setView] = useState<View>("profile");
  const [clientId, setClientId] = useState<string | null>(ANN);
  const reports = useReportSelection({
    view,
    clientId,
    showReport: () => setView("progress-report"),
  });
  return (
    <div data-view={view}>
      {view === "profile" && clientId && (
        <div data-testid="profile" data-client={clientId}>
          <button
            type="button"
            data-action="open-filed"
            onClick={() => reports.openReport(`filed-report-of-${clientId}`)}
          >
            Open the filed report
          </button>
          <button type="button" data-action="new-report" onClick={reports.newReport}>
            New report
          </button>
        </div>
      )}
      {view === "progress-report" && clientId && (
        <StubEditor
          key={reportEditorKey(clientId, reports.existingReportId)}
          clientId={clientId}
          existingReportId={reports.existingReportId}
        />
      )}
      {view === "clients" && (
        <div data-testid="hub">
          {[ANN, BO].map((id) => (
            <button
              key={id}
              type="button"
              data-action={`pick-${id}`}
              onClick={() => {
                setClientId(id);
                setView("profile");
              }}
            >
              {id}
            </button>
          ))}
        </div>
      )}
      <nav>
        <button type="button" data-action="bar-hub" onClick={() => setView("clients")}>
          Hub
        </button>
        <button
          type="button"
          data-action="bar-client"
          onClick={() => setView(clientId ? "profile" : "client-directory")}
        >
          Client
        </button>
        <button type="button" data-action="bar-my-studio" onClick={() => setView("studio-tasks")}>
          My Studio
        </button>
      </nav>
      {view === "studio-tasks" && (
        // A Relay "Progress report" task, as AppContent's openClientTask runs it.
        <button
          type="button"
          data-action="relay-report-bo"
          onClick={() => {
            setClientId(BO);
            reports.newReport();
          }}
        >
          Progress report for Bo
        </button>
      )}
      {/* The bell can land on any view by name, with no report in mind. */}
      <button type="button" data-action="bell-to-report" onClick={() => setView("progress-report")}>
        Bell
      </button>
      {/* Something that changes the client without leaving the screen. */}
      <button type="button" data-action="switch-to-bo" onClick={() => setClientId(BO)}>
        Switch to Bo
      </button>
    </div>
  );
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
  });
}

function tap(action: string) {
  const el = host!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
  if (!el) throw new Error(`No button "${action}" on the ${view()} view`);
  act(() => {
    el.click();
  });
}

const view = () => host!.querySelector<HTMLElement>("[data-view]")!.dataset.view;
const editor = () => host!.querySelector<HTMLElement>('[data-testid="editor"]')?.dataset;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("which progress report opens", () => {
  it("leave via the bottom bar, then New report opens a fresh report for the right client", () => {
    mount();
    tap("open-filed");
    expect(editor()).toMatchObject({ client: ANN, report: `filed-report-of-${ANN}` });
    tap("type-in-editor");
    expect(editor()?.edited).toBe("1");

    // Out through the bottom bar — not the report's Back button.
    tap("bar-hub");
    expect(view()).toBe("clients");
    tap(`pick-${BO}`);
    tap("new-report");

    expect(view()).toBe("progress-report");
    expect(editor()).toMatchObject({ client: BO, report: "new", edited: "0" });
  });

  it("the same client's New report is fresh too, not the report left open", () => {
    mount();
    tap("open-filed");
    tap("type-in-editor");
    tap("bar-hub");
    tap(`pick-${ANN}`);
    tap("new-report");
    expect(editor()).toMatchObject({ client: ANN, report: "new", edited: "0" });
  });

  it("the Client tab back to the record, then New report, is fresh", () => {
    mount();
    tap("open-filed");
    tap("bar-client");
    expect(view()).toBe("profile");
    tap("new-report");
    expect(editor()).toMatchObject({ client: ANN, report: "new" });
  });

  it("a Relay 'Progress report' task starts a new report for the task's client", () => {
    mount();
    tap("open-filed");
    tap("bar-my-studio");
    tap("relay-report-bo");
    expect(editor()).toMatchObject({ client: BO, report: "new", edited: "0" });
  });

  it("landing on the report view with no intent (the bell) never reopens the old report", () => {
    mount();
    tap("open-filed");
    tap("bar-hub");
    tap("bell-to-report");
    expect(editor()).toMatchObject({ client: ANN, report: "new" });
  });

  it("a report is pinned to its client: switching client on the screen drops it", () => {
    mount();
    tap("open-filed");
    tap("type-in-editor");
    tap("switch-to-bo");
    expect(view()).toBe("progress-report");
    expect(editor()).toMatchObject({ client: BO, report: "new", edited: "0" });
  });

  it("opening a filed report still opens it", () => {
    mount();
    tap("open-filed");
    expect(editor()).toMatchObject({ client: ANN, report: `filed-report-of-${ANN}` });
  });
});

describe("reportToOpen", () => {
  const pick = { clientId: ANN, reportId: "r1" };
  it("answers the report for the client it was chosen for", () => {
    expect(reportToOpen(pick, ANN)).toBe("r1");
  });
  it("answers 'a new one' for any other client, or none", () => {
    expect(reportToOpen(pick, BO)).toBeUndefined();
    expect(reportToOpen(pick, null)).toBeUndefined();
    expect(reportToOpen(null, ANN)).toBeUndefined();
  });
  it("keys a different client or report as a different editor", () => {
    expect(reportEditorKey(ANN, "r1")).not.toBe(reportEditorKey(BO, "r1"));
    expect(reportEditorKey(ANN, "r1")).not.toBe(reportEditorKey(ANN, undefined));
  });
});
