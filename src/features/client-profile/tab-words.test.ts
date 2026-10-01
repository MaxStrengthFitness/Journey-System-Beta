/**
 * Words on screen name places that exist (voice review follow-up, Sep 27
 * 2026: AJ, "clean all wording you wish").
 *
 * The profile was six tabs until Sep 15 and four since, and the old names
 * (the Equipment tab, the History tab, the Journal) lingered in messages a
 * trainer reads after something went wrong, which is exactly when a wrong
 * direction costs the most. Each message below now says where the thing
 * really is, and two buttons that landed on Journey (Relay's InBody task,
 * leaving a progress report) now land where they say. These screens are too
 * large to mount here, so the words and the handoffs are held in their
 * source; profile-nav.test.ts holds that each handoff lands.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROFILE_TABS } from "./profile-nav";

const src = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(src, path), "utf8");

describe("messages name today's places", () => {
  it("a setting saved from the machine sheet says it is in the machine's history", () => {
    const source = read("features/equipment/MachineSheet.tsx");
    expect(source).not.toContain("Logged to their Equipment tab");
    expect(source).toContain("Logged to the machine's history (Programming → All Machines).");
  });

  it("the renewals hint cites the Activity Archive's two-week rule", () => {
    const source = read("features/admin/renewals/RenewalSettingsPanel.tsx");
    expect(source).not.toContain("History tab's rule");
    expect(source).toContain("Two weeks is the Activity Archive's rule too.");
  });

  it("the clinical strip's button names the whole page it opens", () => {
    const source = read("features/client-profile/ClinicalHistoryTab.tsx");
    expect(source).toMatch(/>\s*Edit in Body & Pulse\s*</);
    expect(source).not.toMatch(/>\s*Edit in Body\s*</);
  });

  it("a lost consultation note is added from Notes & Profile, not the Journal", () => {
    const source = read("components/ConsultationWizard.tsx");
    expect(source).not.toContain("Add it from the Journal");
    expect(source).toContain("Add it from Notes & Profile → Notes.");
  });

  it("the Hub's search draws the Directory's rows, not cards with a History door of their own (hub fixes, Oct 1 2026)", () => {
    const source = read("components/ClientsView.tsx");
    expect(source).not.toMatch(/>History<\/span>/);
    expect(source).not.toMatch(/Previous Session/);
    expect(source).toContain("<SearchResults");
  });

  it("the progress report's closing box does not borrow the Wrap-up's name", () => {
    const source = read("components/ClientProgressReportView.tsx");
    expect(source).not.toContain("Lead Practitioner Wrap-Up");
    expect(source).toContain("Your closing note, printed at the end of the report");
  });
});

describe("buttons land where they say", () => {
  const app = read("AppContent.tsx");
  const between = (from: string, to: string) => {
    const start = app.indexOf(from);
    const end = app.indexOf(to, start);
    expect(start, from).toBeGreaterThan(-1);
    expect(end, to).toBeGreaterThan(start);
    return app.slice(start, end);
  };

  it("Relay's InBody task opens Body & Pulse at the InBody card, asked first", () => {
    const task = between("const openClientTask = (", "<MyStudioView");
    expect(task).toMatch(/action === "inbody"\s*\?\s*recordLocation\("body", "body-inbody"\)/);
    expect(task).toMatch(/action === "assessment"\s*\?\s*recordLocation\("body", "body-pulse"\)/);
    // Written only if the move goes ahead (the unsaved-changes gate holds it).
    expect(task).toContain("guardLeave(() => openProfileAt(clientId, at))");
    expect(task).not.toContain("has no screen of its own");
  });

  it("the peek's Log past session opens the Activity Archive, handed off only once the move is agreed (hub fixes, Oct 1 2026)", () => {
    const hub = read("components/ClientsView.tsx");
    expect(hub).toContain("const guardLeave = useLeaveGuard();");
    // The door that replaced the old search card's Past sessions: the peek's
    // Log past session, from its guard to its move.
    const at = hub.indexOf("onLogPast={(id) => {");
    expect(at).toBeGreaterThan(-1);
    const start = hub.indexOf("guardLeave(() => {", at);
    expect(start).toBeGreaterThan(at);
    const move = 'setView("profile");';
    const end = hub.indexOf(move, start);
    expect(end).toBeGreaterThan(start);
    const door = hub.slice(start, end + move.length);
    expect(door).toContain("onSelectClient(id);");
    expect(door).toContain('openProfileAt(id, { tab: "clinical", view: "calendar" });');
    // Nowhere else in the Hub writes a handoff outside the guard.
    expect(hub.split("openProfileAt(").length - 1).toBe(1);
  });
  it("leaving a progress report hands off to the Activity Archive's Reports", () => {
    const back = between("const backToRecord = () =>", "if (!reportClient)");
    expect(back).toContain("guardLeave(");
    expect(back).toContain('openProfileAt(selectedClientId, { tab: "clinical", view: "reports" })');
    expect(back).toContain('setCurrentView("profile")');
    // The handoff is written before the view changes: the profile mounts
    // fresh and takes it on mount.
    expect(back.indexOf("openProfileAt(")).toBeLessThan(back.indexOf('setCurrentView("profile")'));
  });

  it("and the report's words say Reports, never the record", () => {
    for (const path of ["components/ClientProgressReportView.tsx", "features/progress-report/ReportNotOpened.tsx"]) {
      const source = read(path);
      expect(source, path).not.toContain("Back to the record");
      expect(source, path).not.toContain("Go back to the record");
      expect(source, path).toContain("Back to Reports");
    }
    expect(read("components/ClientProgressReportView.tsx")).toContain(
      "Go back to Reports and start again from there.",
    );
  });

  it("every way out of a report is named Back to Reports, on screen or to a screen reader", () => {
    // The finished report's plain "Back" and the editor's arrow stay short on
    // screen; their names say where they land.
    const source = read("components/ClientProgressReportView.tsx");
    const exits = source.split("onClick={onBack}").slice(0, -1);
    expect(exits.length).toBeGreaterThanOrEqual(3);
    let from = 0;
    for (let i = 0; i < exits.length; i++) {
      const at = source.indexOf("onClick={onBack}", from);
      const open = source.lastIndexOf("<Button", at);
      const close = source.indexOf("</Button>", at);
      expect(source.slice(open, close), `exit ${i + 1}`).toContain("Back to Reports");
      from = at + 1;
    }
  });

  it("the setup-needed alert names Programming and Notes & Profile, not the Equipment tab", () => {
    const source = read("components/ClientProfileView.tsx");
    expect(source).not.toContain("'Equipment' tab");
    expect(source).toMatch(/Set up their routine in Programming, and their details\s+in Notes &amp; Profile\./);
  });
});

describe("the Activity Archive's tooltip", () => {
  it("names the Deep Dive, the segment's name since the reporting round", () => {
    const archive = PROFILE_TABS.find((t) => t.id === "clinical");
    expect(archive?.blurb).toBe("Every visit, the Deep Dive, and the filed reports");
  });
});
