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
  // The floor on day one (the first-session design round, Oct 8 2026, §4.6).
  { file: "features/phone/phone.css", cls: "ph-card__next", what: "\"Next: Leg Press\" and \"Next in the plan: Hip Abduction · Add\" on the phone's card in hand" },
  // The FileMaker floor on a phone (the open session round, Oct 9 2026).
  { file: "features/phone/phone.css", cls: "ph-floor__name", what: "a machine on the rest of the floor, under a phone's session cards" },
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
  // The machine menu (Oct 2026): the chart block's heading, its sentences,
  // the tapped session's readout and the two lists.
  { file: "features/machine-menu/machine-menu.css", cls: "mm-chart__title", what: "the client's name in \"How Avery has done here\"" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-chart__state", what: "the client's and the machine's names in the chart's state line" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-ro__a-text", what: "the tapped session's trainer and studio in the readout" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-ro__event", what: "a note's author and a machine's name in the readout's event line" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-sess__c", what: "a trainer and a set-up in Every session's rows" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-run-div__t", what: "the machine's name in a fold between Weight by weight's runs" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-cmp__title", what: "the client's, the machine's and the studio's names over the open note box" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-cmp__other", what: "another machine's name over a session draft about it (\"About Chest Press\")" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-seg__opt", what: "the client's name on the note box's About switch" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-btn", what: "a machine's name on \"Make it about Leg Press\"" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-add", what: "the studio's name on \"Add to Westlake's notes\"" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-status", what: "the studio's and the machine's names in a floor note's confirmation" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-note__meta", what: "a note's author in the machine's notes" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-up__meta", what: "an update's author in a note's thread" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-chg__detail", what: "the trainer who saved a setting change" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-head__machine", what: "the machine's floor name in the menu's header" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-head__client", what: "the client's display name in the menu's header" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-head__rest", what: "a studio (\"at Solon\") and a trainer (\"Watching Sam's session\") on the header's Last time line" },
  { file: "features/machine-menu/machine-menu.css", cls: "mm-safe__line", what: "a Critical note's author in the safety strip" },
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
  { file: "features/trainer-profile/trainer-profile.css", cls: "tp-identity__name", what: "the trainer's name on My Profile (Saira 22-30, upright)" },
  // The renewals dashboard (Oct 7 2026): the client and the primary trainer
  // on a renewals row (Operations → Clients → Renewals, and My renewals).
  { file: "features/renewals/renewal-row.css", cls: "rr__name", what: "the client on a renewals dashboard row" },
  { file: "features/renewals/renewal-row.css", cls: "rr__trainer", what: "the primary trainer on a renewals dashboard row" },
  { file: "features/renewals/renewal-row.css", cls: "rr-plan__sentence", what: "who set the renewal plan, on its row" },
  // Starting routines (the first-session design round, Oct 8 2026): the
  // template editor's "For new clients" part, the template list's line, and
  // My Studio → Studio → Starting routines.
  { file: "features/admin/admin.css", cls: "adm-tpl__start", what: "\"Starting routine · day one: Leg Press · Compound Row\" on a template's card" },
  { file: "features/routine-plan/ui/starting-routines.css", cls: "srt-pick__name", what: "a template's machine on the editor's Day one" },
  { file: "features/routine-plan/ui/starting-routines.css", cls: "srt-line", what: "\"Day one: Leg Press · Compound Row · Lumbar Extension\" under the editor's picks" },
  { file: "features/routine-plan/ui/starting-routines.css", cls: "srt-row__name", what: "a starting routine's name on My Studio → Studio" },
  { file: "features/routine-plan/ui/starting-routines.css", cls: "srt-row__meta", what: "a starting routine's day one, by its machines, on My Studio → Studio" },
  { file: "features/routine-plan/ui/starting-routines.css", cls: "srt-opt__text", what: "head office's default, by name, on No default of our own" },
  { file: "features/routine-plan/ui/starting-routines.css", cls: "srt-read", what: "head office's default, by name, on No default of our own, as a reader sees it" },
  { file: "features/routine-plan/ui/starting-routines.css", cls: "srt__hint", what: "head office's default, by name, under the editor's Head office's default switch" },
  { file: "features/routine-plan/ui/starting-routines.css", cls: "srt-source", what: "\"Westlake's own choice\" on My Studio → Studio, the studio by name" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-cell__name", what: "a machine in Routine A's lineup (day one, on deck)" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-cell__sub", what: "\"instead of Seated Dip\" and a step's label under a machine in the lineup" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-bench__name", what: "a machine on the bench, \"Not for {First}\"" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-bench__line", what: "what stands in for a machine on the bench, by name" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-said__text", what: "what a plan change did: \"Chest Flye instead of Seated Dip\"" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-source", what: "the starting routine a plan came from, by name" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-start__machines", what: "a start's first machines on Another start" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-start__meta", what: "a starting routine's name on Another start" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-tile__name", what: "a machine on This studio's floor" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-road__name", what: "a station's machine on the Road's one-line route" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-road__label", what: "\"Not for {First}\" over the Road's crossed stations" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-change__what", what: "a plan change, with the machines it names" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-change__meta", what: "who made a plan change, and the reason" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-replan__tag", what: "\"Re-planned · Oct 8 · {reason}\" in the Changes" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-replan__meta", what: "who re-planned" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-effect__text", what: "an order effect's two machines" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-sheet__title", what: "a machine's name heading its row sheet" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-panel__title", what: "\"{First}'s starting lineup\" and \"{First}'s Routine A\"" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-group__label", what: "\"Not for {First}\" over the bench" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-progress__line", what: "\"0 of 6 · day one: Leg Press, Compound Row and Lumbar\"" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-purpose", what: "a plan's purpose, in the trainer's words" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-line", what: "a sentence naming the client or a starting routine" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-meta", what: "a quiet line naming machines, the studio or a starting routine" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-chip", what: "a machine or a substitute set on a plan sheet's chips" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-door__line", what: "a door's line on Start a plan" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-road__progress", what: "the Road's progress line, \"0 of 6 · day one: Leg Press, Compound Row and Lumbar\"" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-sheet__label", what: "a sheet's label naming the client, \"Not for {First} for now · optional\"" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-well", what: "why a start was suggested, naming the studio or the intake's word" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-effect__why", exact: ".rpl-effect__why p", what: "an order effect's why, naming its two machines" },
  // The briefing's plan card (the first-session design round, Oct 8 2026, §4.5).
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-brief__title", what: "\"{First}'s starting lineup\" and \"How does {First} start?\" on the briefing" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-brief__lead", what: "\"{First} has a routine from before Journey\" on the briefing" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-tick__label", what: "a machine on Change today's ticks, and on the Wrap-up's Next time" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-next__ask", what: "\"Tick the ones that start Routine A.\" on the Wrap-up's Next time, the routine by name" },
  // B, molded in (Round 2 of the design round, item 6): the A | B lineup and Plan B.
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-bcell__name", what: "a machine in Routine B's column, and a swap on Plan B (\"Leg Extension for Leg Press\")" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-bcell__sub", what: "\"B's own · for Leg Press\" and \"Follows A · next swap: Simple Row\" under a B cell" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-bstrip__title", what: "\"In B, instead of {machine}\" over a B place's choices" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-bacademy__text", what: "the Academy's line about B beside Routine A's runs" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-bstart__title", what: "\"B starts as a copy of A with one machine different\" down B's column" },
  // A weak area (Round 2 of the design round, item 7): the three answers.
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-focus__line", what: "a routine's line on a weak area, \"Helpers only: Compound Row, Seated Dip and Pulldown\"" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-focus__sub", what: "\"instead of Seated Dip\" under a weak area's Keep in B" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-focus__what", what: "a weak area's suggestion, \"Overhead Press for Seated Dip\" and \"Add Lateral Raise\"" },
  { file: "features/routine-plan/ui/routine-plan.css", cls: "rpl-focus__text", what: "the Academy's setting before a machine, naming the Triceps Extension" },
  { file: "features/briefing/briefing.css", cls: "br-routine__touch", what: "\"Mind the limits on {machines}\" under the routine line and the plan card's Road" },
  { file: "features/routines/routines.css", cls: "rt-row__name", what: "a machine in Routine A or B on Programming" },
  { file: "features/routines/routines.css", cls: "rt-row__plan", what: "the plan's word under a Routine A machine in the Lineup (\"instead of Seated Dip\")" },
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
