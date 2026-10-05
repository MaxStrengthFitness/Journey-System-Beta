import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * NAMES ARE NEVER TRUNCATED (CLAUDE.md), HELD ACROSS THE APP — Sep 29 2026.
 *
 * An audit found sixteen places where a person's or a machine's name was
 * still cut short: one line, hidden overflow, an ellipsis (or Tailwind's
 * `truncate`, which is the same three declarations). Each now wraps
 * (`overflow-wrap: anywhere`, no nowrap, no clip) and the row it sits in
 * grows (`min-height`, never `height`). My Studio's own classes are held by
 * features/my-studio/look.test.ts in the same way; this file holds the rest.
 *
 * If one of these fails, the fix is the stylesheet or the element, not the
 * test.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");
const uncommented = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

type Rule = { selectors: string[]; body: string };

function rulesOf(file: string): Rule[] {
  const out: Rule[] = [];
  for (const m of uncommented(read(file)).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const prelude = m[1].trim();
    if (!prelude || prelude.startsWith("@") || /^(?:from|to|\d+%)/.test(prelude)) continue;
    out.push({ selectors: prelude.split(",").map((s) => s.trim()), body: m[2] });
  }
  return out;
}

/** The last compound of a selector: the element the rule styles. */
const subject = (selector: string) => selector.split(/[\s>+~]+/).filter(Boolean).pop() ?? "";
const namesClass = (compound: string, cls: string) => new RegExp(`\\.${cls}(?![\\w-])`).test(compound);

const declared = (body: string, prop: string): string[] =>
  [...body.matchAll(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`, "g"))].map((m) => m[1].trim());

/* ------------------------------------------------------------------ */

/**
 * A class that carries a name, in the stylesheet that defines it. `exact`
 * is for a rule whose subject is not a class (`.jg-order__add span`).
 */
const NAME_RULES: { file: string; cls: string; exact?: string; what: string }[] = [
  { file: "features/journey-grid/journey-grid.css", cls: "jg-sbar__name", what: "the client on the live session bar (WorkoutTrackerView, WatchingSession)" },
  { file: "features/journey-grid/journey-grid.css", cls: "jg-nb__name", what: "the current machine on the Now Bar" },
  { file: "features/journey-grid/journey-grid.css", cls: "jg-nb__nextname", what: "the next machine on the Now Bar" },
  { file: "features/journey-grid/journey-grid.css", cls: "jg-order__add", exact: ".jg-order__add span", what: "a machine in the routine-order sheet" },
  { file: "features/routine-builder/routine-builder.css", cls: "rb-row__name", what: "a machine in the routine builder's list" },
  { file: "features/routine-builder/routine-builder.css", cls: "rb-pick__name", what: "a machine in the routine builder's picker" },
  { file: "features/routine-builder/routine-builder.css", cls: "rb-warn__pair", what: "the two machines a sequencing warning names" },
  { file: "features/routine-builder/routine-builder.css", cls: "rb-head__title", what: "the routine's name in the builder's head" },
  { file: "features/calendar/calendar.css", cls: "cal-block__name", what: "the client on a calendar block" },
  { file: "features/calendar/calendar.css", cls: "cal-board__name", what: "a trainer on the calendar's board" },
  { file: "features/calendar/calendar.css", cls: "cal-lane__name", what: "a trainer's lane label on the day view" },
  { file: "features/client-history/client-history.css", cls: "hist-who__name", what: "the trainer on a history row" },
  { file: "features/client-history/client-history.css", cls: "hsd-set__name", what: "a machine in the session pop-up" },
  { file: "features/trainer-profile/trainer-profile.css", cls: "tp-row__name", what: "a person or client on a My Profile row" },
  { file: "features/client-profile/profile-nav.css", cls: "psub__label", what: "a profile sub-tab's label (two words wrap, as its comment says)" },
  { file: "features/hub-schedule/next-strip.css", cls: "hn-with", what: '"with {trainer}" on the Next 30 minutes strip' },
  // Type and depth, phase 6 (Oct 4 2026): the codex's page title, upright Saira
  // 30 in its own capitalisation now, wraps like every name.
  { file: "features/client-codex/kit/kit.css", cls: "cx-page-title", what: "a Notes & Profile page's title (Saira 30, upright)" },
  // Type and depth, phase 11 (Oct 4 2026): the Hub's names. A lane head and
  // the peek's title are Saira now (17 and 22, upright); a booking's name was
  // already whole and wrapping, and is held here with them.
  { file: "features/hub-schedule/hub-grid.css", cls: "hs-colname", exact: ".hs-colname strong", what: "a trainer's name heading a lane on the Hub (Saira 17)" },
  { file: "features/hub-schedule/peek.css", cls: "hp-name", what: "the client's name on the Hub's peek (Saira 22)" },
  { file: "features/hub-schedule/hub-card.css", cls: "hs-card-name", what: "the client's name on a Hub booking" },
  // Type and depth, phase 12 (Oct 4 2026): names set upright in the display
  // face, in their own capitalisation, wrap like every name.
  { file: "features/briefing/briefing.css", cls: "br__name", what: "the client's name on the briefing (Saira 22-30, upright)" },
  { file: "features/equipment/equipment.css", cls: "eq-detail__name", what: "a machine's name on its detail panel (Saira 22, upright)" },
  { file: "features/trainer-profile/trainer-profile.css", cls: "tp-identity__name", what: "the trainer's name on My Profile (Saira 22-30, upright)" },
];

const rulesFor = (entry: (typeof NAME_RULES)[number]) =>
  rulesOf(entry.file).filter((r) =>
    r.selectors.some((s) => (entry.exact ? s === entry.exact : namesClass(subject(s), entry.cls) && !subject(s).includes("::"))),
  );

describe("names in the stylesheets", () => {
  it("are all real rules", () => {
    for (const entry of NAME_RULES) expect(rulesFor(entry).length, `${entry.file}: ${entry.exact ?? entry.cls}`).toBeGreaterThan(0);
  });

  it("are never cut short: no ellipsis, no line clamp, no one line with hidden overflow", () => {
    for (const entry of NAME_RULES) {
      const label = `${entry.exact ?? "." + entry.cls} (${entry.what})`;
      const bodies = rulesFor(entry).map((r) => r.body).join(";");
      expect(declared(bodies, "text-overflow").filter((v) => /ellipsis/.test(v)), `${label}: ellipsis`).toEqual([]);
      expect(declared(bodies, "-webkit-line-clamp"), `${label}: line clamp`).toEqual([]);
      expect(declared(bodies, "line-clamp"), `${label}: line clamp`).toEqual([]);
      const nowrap = declared(bodies, "white-space").some((v) => /nowrap|pre\b/.test(v));
      const hidden = declared(bodies, "overflow(?:-x)?").some((v) => /hidden|clip/.test(v));
      expect(nowrap && hidden, `${label}: one line, clipped`).toBe(false);
    }
  });

  it("wrap anywhere, so a long single word breaks rather than overflows", () => {
    for (const entry of NAME_RULES) {
      const bodies = rulesFor(entry).map((r) => r.body).join(";");
      expect(declared(bodies, "overflow-wrap"), `${entry.exact ?? "." + entry.cls}`).toContain("anywhere");
    }
  });

  it("sit in rows that grow: the session bar, the Next button and the order sheet's row set a minimum, never a height", () => {
    const rules = rulesOf("features/journey-grid/journey-grid.css");
    for (const sel of [".jg-sbar", ".jg-nb__next", ".jg-order__add", ".jg-nb--bar .jg-nb__next", ".jg-nb--side .jg-nb__next"]) {
      const found = rules.filter((r) => r.selectors.includes(sel));
      expect(found.length, sel).toBeGreaterThan(0);
      for (const r of found) expect(declared(r.body, "height"), sel).toEqual([]);
    }
  });
});

/* ------------------------------------------------------------------ */

/**
 * Elements whose class list is written in the TSX. Each `find` matches the
 * element by what it renders (a name), tolerant of reformatting; the class
 * list it captures must not say `truncate`, `line-clamp-*` or
 * `whitespace-nowrap` with `overflow-hidden`.
 */
const NAME_ELEMENTS: { file: string; find: RegExp; what: string }[] = [
  { file: "components/AppHeader.tsx", find: /"(font-display italic[^"]*)"/, what: "the studio's name in the top strip" },
  // Type and depth, Oct 4 2026: the bottom bar's labels truncated; they wrap
  // now, and the session's tab carries the client's first name.
  { file: "components/NavButton.tsx", find: /<span className=\{`(w-full text-center[^`]*)`\}>\s*\{label\}/, what: "a bottom-bar label (the session's tab names the client)" },
  // Type and depth, phase 7 (Oct 4 2026): the client's name on the profile,
  // Saira 30 upright now, in the header's card. It wrapped at a space with
  // break-word before; anywhere also lets the one-band landscape's narrow
  // name column break a single long word rather than widen.
  { file: "features/client-profile/ProfileHeader.tsx", find: /className="(cp-head__name [^"]*)"/, what: "the client's name on the profile header" },
  { file: "components/WorkoutTrackerView.tsx", find: /<span className="([^"]*)">\{name\}<\/span>/, what: "a machine in the end-of-session list" },
  { file: "features/trainer-profile/EditTrainerModal.tsx", find: /<span className="([^"]*)">\s*\{s\.fullName\}/, what: "a staff member's full name" },
  { file: "features/trainer-profile/EditTrainerModal.tsx", find: /htmlFor=\{`access-\$\{s\.id\}`\}\s*className="([^"]*)"/, what: "a studio's name on the access checkbox" },
  { file: "features/trainer-profile/EditTrainerModal.tsx", find: /htmlFor=\{`guest-\$\{s\.id\}`\}\s*className="([^"]*)"/, what: "a studio's name on the guest checkbox" },
  { file: "components/EditRoutineDrawer.tsx", find: /<span className="([^"]*)">\{p\.name\}<\/span>/, what: "a routine preset's name" },
  { file: "components/AccessRequestView.tsx", find: /<span className="([^"]*)">\s*\{authenticatedUser\.displayName/, what: "the signed-in person's name" },
];

describe("names in the screens", () => {
  it("are all found", () => {
    for (const el of NAME_ELEMENTS) expect(read(el.file).match(el.find), `${el.file}: ${el.what}`).not.toBeNull();
  });

  it("never carry truncate, a line clamp, or nowrap with hidden overflow", () => {
    for (const el of NAME_ELEMENTS) {
      const classes = read(el.file).match(el.find)![1];
      const label = `${el.file}: ${el.what}`;
      expect(classes, label).not.toMatch(/(?:^|[\s:])truncate(?:\s|$)/);
      expect(classes, label).not.toMatch(/line-clamp/);
      const nowrap = /(?:^|[\s:])whitespace-nowrap(?:\s|$)/.test(classes);
      const hidden = /(?:^|[\s:])overflow-(?:x-)?(?:hidden|clip)(?:\s|$)/.test(classes);
      expect(nowrap && hidden, `${label}: one line, clipped`).toBe(false);
    }
  });

  it("wrap anywhere", () => {
    for (const el of NAME_ELEMENTS) {
      expect(read(el.file).match(el.find)![1], `${el.file}: ${el.what}`).toMatch(/\[overflow-wrap:anywhere\]/);
    }
  });

  it("keep the studio switch in the top strip tappable at 40px", () => {
    expect(read("components/AppHeader.tsx").match(NAME_ELEMENTS[0].find)![1]).toMatch(/(?:^|\s)min-h-10(?:\s|$)/);
  });
});
