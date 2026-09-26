/**
 * The profile's Discard question lives in the profile's frame, not inside a
 * tab panel (session record, Sep 26 2026). The tabs mount only the panel on
 * screen, so a question inside Programming did nothing from Journey, Notes &
 * Profile or the Activity Archive, then appeared later on Programming. The
 * profile is too large to mount here, so this holds the structure in place.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "ClientProfileView.tsx"), "utf8");

describe("the profile's Discard question", () => {
  it("is drawn after the tabs close, so every tab reaches it", () => {
    const dialog = source.indexOf("open={!!discardTarget}");
    const tabsEnd = source.indexOf("</Tabs>");
    expect(dialog).toBeGreaterThan(-1);
    expect(tabsEnd).toBeGreaterThan(-1);
    expect(dialog).toBeGreaterThan(tabsEnd);
  });

  it("is drawn once", () => {
    expect(source.split("open={!!discardTarget}").length - 1).toBe(1);
  });
});
