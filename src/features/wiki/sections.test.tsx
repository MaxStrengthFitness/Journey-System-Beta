import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WikiShell } from "./WikiShell";
import {
  WikiSectionsProvider,
  activeSectionLabel,
  trailRepeatsSection,
  type WikiSectionsValue,
} from "./sections";

/**
 * The Learning tab (Sep 10 2026): Catalog and Academy share one bottom-bar
 * button, and the wiki's own top bar carries the switch between them. These
 * render the real shell to static markup — no DOM needed — and check the three
 * things that can go wrong: the switch missing, the index trail repeating it,
 * and anything changing for a shell rendered outside the tab.
 */

const LEARNING = (active: string): WikiSectionsValue => ({
  sections: [
    { id: "machine-anatomy", label: "Catalog" },
    { id: "academy", label: "Academy" },
  ],
  active,
  onSelect: () => {},
});

const noop = () => {};

function render(crumbs: { label: string; onClick?: () => void }[], value: WikiSectionsValue | null) {
  const shell = (
    <WikiShell crumbs={crumbs} onOpenSearch={noop}>
      <p>body</p>
    </WikiShell>
  );
  return renderToStaticMarkup(
    value ? <WikiSectionsProvider value={value}>{shell}</WikiSectionsProvider> : shell,
  );
}

describe("trailRepeatsSection / activeSectionLabel", () => {
  it("names the section on screen", () => {
    expect(activeSectionLabel(LEARNING("academy"))).toBe("Academy");
    expect(activeSectionLabel(null)).toBeNull();
  });

  it("is true only on the section's own index", () => {
    expect(trailRepeatsSection([{ label: "Catalog" }], LEARNING("machine-anatomy"))).toBe(true);
    expect(
      trailRepeatsSection([{ label: "Catalog", onClick: noop }, { label: "Chest Press" }], LEARNING("machine-anatomy")),
    ).toBe(false);
    // The Academy's index while the Catalog is the active section: not a repeat.
    expect(trailRepeatsSection([{ label: "Academy" }], LEARNING("machine-anatomy"))).toBe(false);
    expect(trailRepeatsSection([{ label: "Catalog" }], null)).toBe(false);
  });
});

describe("WikiShell inside the Learning tab", () => {
  it("puts the Catalog | Academy switch in the bar, with the current one pressed", () => {
    const html = render([{ label: "Catalog" }], LEARNING("machine-anatomy"));
    expect(html).toContain('aria-label="Learning"');
    expect(html).toMatch(/aria-pressed="true" aria-label="Catalog"/);
    expect(html).toMatch(/aria-pressed="false" aria-label="Academy"/);
  });

  it("leaves out an index trail that would only repeat the switch", () => {
    const html = render([{ label: "Catalog" }], LEARNING("machine-anatomy"));
    expect(html).not.toContain('aria-label="Breadcrumb"');
  });

  it("keeps the trail on deeper pages", () => {
    const html = render(
      [{ label: "Catalog", onClick: noop }, { label: "Upper Body" , onClick: noop }, { label: "Chest Press" }],
      LEARNING("machine-anatomy"),
    );
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain("Chest Press");
  });

  it("keeps the Academy's 'back to the machine' trail intact", () => {
    const html = render(
      [{ label: "Chest Press", onClick: noop }, { label: "Academy", onClick: noop }, { label: "Quick card" }],
      LEARNING("academy"),
    );
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain("Chest Press");
    expect(html).toMatch(/aria-pressed="true" aria-label="Academy"/);
  });
});

describe("WikiShell outside the Learning tab", () => {
  it("renders exactly as before: no switch, trail shown even on an index", () => {
    const html = render([{ label: "Catalog" }], null);
    expect(html).not.toContain('aria-label="Learning"');
    expect(html).toContain('aria-label="Breadcrumb"');
  });
});
