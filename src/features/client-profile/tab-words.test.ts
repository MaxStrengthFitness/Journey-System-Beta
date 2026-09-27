/**
 * Words on screen name places that exist (voice review follow-up, Sep 27
 * 2026: AJ, "clean all wording you wish").
 *
 * The profile was six tabs until Sep 15 and four since, and the old names
 * (the Equipment tab, the History tab, the Journal) lingered in messages a
 * trainer reads after something went wrong, which is exactly when a wrong
 * direction costs the most. Each message below now says where the thing
 * really is. These screens are too large to mount here, so the words are held
 * in their source.
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

  it("the Hub card's button says it opens past sessions", () => {
    const source = read("components/ClientsView.tsx");
    expect(source).not.toMatch(/>History<\/span>/);
    expect(source).toMatch(/>Past sessions<\/span>/);
  });

  it("the progress report's closing box does not borrow the Wrap-up's name", () => {
    const source = read("components/ClientProgressReportView.tsx");
    expect(source).not.toContain("Lead Practitioner Wrap-Up");
    expect(source).toContain("Your closing note, printed at the end of the report");
  });
});

describe("the Activity Archive's tooltip", () => {
  it("names the Deep Dive, the segment's name since the reporting round", () => {
    const archive = PROFILE_TABS.find((t) => t.id === "clinical");
    expect(archive?.blurb).toBe("Every visit, the Deep Dive, and the filed reports");
  });
});
