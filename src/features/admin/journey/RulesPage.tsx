/**
 * OPERATIONS → SETUP → RULES — the numbers behind every sentence.
 *
 * The redesign's Operations room, phase 3 (Sep 28 2026; research-operations
 * §6.2, "Rules — opens My Studio → Studio"). Every claim Operations makes
 * names the line it crossed ("past the studio's 14-day line"); this page is
 * where a leader reads each line in one place.
 *
 * Three kinds of number, said plainly as three:
 *
 *   the studio's renewal   read from the studio's renewal settings (one small
 *   settings               document, studios/{s}/config/renewals) and set on
 *                          My Studio → Studio → Renewals.
 *   the Journey's lines    the studio settings (wave 2, Sep 28 2026; AJ: "all
 *                          yes", and "let the admins assign the default within
 *                          the app"): Drifting's multiple and its least,
 *                          Lapsed, New and Settling in. Each is the studio's
 *                          own, else Max Strength's default set by head office
 *                          in the app, else the app's — and each row says
 *                          which (features/studio-settings, SOURCE_WORDS).
 *   the rest               named constants, the same at every studio (the
 *                          rhythm's minimum, the nightly record's trust).
 *
 * Operations looks; My Studio edits (AJ, Sep 18; "Studio settings are edited
 * here and nowhere else", Sep 28): this page only points there, and never
 * draws an editor of its own.
 */
import { ChevronRight, ScrollText } from "lucide-react";
import type { Studio } from "../../../types";
import { useRenewalSettings } from "../../renewals/useRenewalSettings";
import { SOURCE_WORDS, type SettingSource } from "../../studio-settings/resolve";
import { useStudioSettings } from "../../studio-settings/useStudioSettings";
import { AdminButton, AdminHeader, AdminNotice, AdminScreen } from "../primitives";
import { NIGHTLY_STALE_DAYS } from "../overview/brief";
import { MIN_RHYTHM_VISITS, MIN_RHYTHM_WEEKS } from "./rhythm";
import { LINE_KEYS, linesOf, multipleWords, type LineKey } from "./states";
import "../shell/ops.css";

export interface RulesPageProps {
  studio: Studio;
  /** Opens My Studio → Studio, where the studio's own numbers are set. */
  onOpenMyStudio?: () => void;
}

interface RuleRow {
  key: string;
  name: string;
  line: string;
  where: string;
  /** Where the number came from, when it is a studio setting. */
  source?: SettingSource;
}

/** Each line's name on the page (the registry's labels are written for the editors). */
const LINE_NAMES: Record<LineKey, string> = {
  driftMultiple: "Drifting",
  driftMinDays: "Drifting's least",
  lapsedDays: "Lapsed",
  inactiveDays: "Inactive",
  newMax: "New",
  settlingMax: "Settling in",
};

/** Where a line came from, in a sentence a leader can act on. */
export function sourceSentence(source: SettingSource, studioName: string, failed: boolean): string {
  const said =
    source === "studio"
      ? `${SOURCE_WORDS.studio}: ${studioName}'s leaders set it on My Studio → Studio.`
      : source === "company"
        ? `${SOURCE_WORDS.company}, set by head office. ${studioName}'s leaders can set their own on My Studio → Studio.`
        : `${SOURCE_WORDS.app}: neither ${studioName} nor head office has set one.`;
  return failed ? `${said} Part of the settings couldn't be read just now, so this is the best answer so far.` : said;
}

export function RulesPage({ studio, onOpenMyStudio }: RulesPageProps) {
  const { settings, loading, error, saved } = useRenewalSettings(studio.id ?? null);
  const studioSettings = useStudioSettings(studio.id ?? null, studio);
  const lines = linesOf(studioSettings.all);
  const studioNote = error ? "Couldn't be read just now, so Max Strength's default is shown." : saved ? `${studio.name}'s own number, set on My Studio → Studio.` : "Max Strength's default: the studio hasn't set its own on My Studio → Studio.";
  const constant = "The same at every studio: a named rule in the app, not a setting.";

  const own: RuleRow[] = [
    { key: "at-risk", name: "At risk", line: `Warn me when a client has not visited for ${settings.breakDays} days, with nothing booked.`, where: studioNote },
    {
      key: "talk",
      name: "Renewal talk",
      line: `Start the conversation at ${settings.conversationAtSessionsLeft} sessions left, and plan ${settings.horizonMonths} months ahead.`,
      where: studioNote,
    },
    {
      key: "charge",
      name: "Before the charge",
      line: `Warn ${settings.chargeWarnDays} days before an auto-renew charge when ${settings.chargeWarnMinBanked} or more sessions will still be banked.`,
      where: studioNote,
    },
    { key: "lost", name: "Lost", line: `A client is lost ${settings.lostAfterDays} days after billing ends with no new package.`, where: studioNote },
  ];

  const lineSentence: Record<LineKey, string> = {
    driftMultiple: `Drifting: ${multipleWords(lines.driftMultiple).toLowerCase()} the usual gap between visits, with nothing booked.`,
    driftMinDays: `However short the usual gap, Drifting waits at least ${lines.driftMinDays} days.`,
    lapsedDays: `Lapsed: ${lines.lapsedDays} days since the last visit, with nothing booked. A client Journey can't judge yet is never Lapsed.`,
    inactiveDays: `Inactive: ${lines.inactiveDays} days since the last visit, with nothing booked, or marked inactive by a leader. A booking makes the client active again; a client Journey can't judge yet becomes Inactive only by a leader's mark.`,
    newMax: `New: sessions 1 to ${lines.newMax}, and only from a total that may be quoted — a client whose history is before Journey is never called new.`,
    settlingMax: `Settling in: sessions ${lines.newMax + 1} to ${lines.settlingMax}.`,
  };
  const journeyLines: RuleRow[] = LINE_KEYS.map((key) => {
    const source = studioSettings.source(key);
    return {
      key,
      name: LINE_NAMES[key],
      line: lineSentence[key],
      where: sourceSentence(source, studio.name, studioSettings.failed),
      source,
    };
  });

  const ours: RuleRow[] = [
    {
      key: "gap",
      name: "A usual gap",
      line: `Needs ${MIN_RHYTHM_VISITS} visits over ${MIN_RHYTHM_WEEKS} weeks. Below that a client is "too new to judge", never steady or slipping.`,
      where: "The research's minimum, the same at every studio. Measured each night from the client's visits, or on the page from last night's pace until the night's states arrive.",
    },
    { key: "nightly", name: "The nightly record", line: `Trusted until ${NIGHTLY_STALE_DAYS} days pass with no client's record changing; then nobody's rhythm is judged from it.`, where: constant },
  ];

  return (
    <AdminScreen>
      <AdminHeader
        icon={<ScrollText className="w-5 h-5" />}
        title="Rules"
        subtitle="The numbers behind every sentence on Operations. Each sentence names the line it crossed, and each line says where it came from."
        actions={
          onOpenMyStudio ? (
            <AdminButton variant="quiet" onClick={onOpenMyStudio}>
              Open My Studio → Studio <ChevronRight className="w-4 h-4" aria-hidden />
            </AdminButton>
          ) : undefined
        }
      />
      {(loading || studioSettings.loading) && <AdminNotice tone="info">Reading {studio.name}'s settings…</AdminNotice>}
      <section className="ops-sec" aria-labelledby="rules-own">
        <header className="ops-sec__h">
          <h2 className="ops-sec__t" id="rules-own">
            {studio.name}'s renewal numbers
          </h2>
          <span className="ops-sec__sub">set on My Studio → Studio → Renewals</span>
        </header>
        <RuleList rows={own} />
      </section>
      <section className="ops-sec" aria-labelledby="rules-journey">
        <header className="ops-sec__h">
          <h2 className="ops-sec__t" id="rules-journey">
            Where a client is
          </h2>
          <span className="ops-sec__sub">the Journey's lines · a studio's own, else Max Strength's default, else the app's</span>
        </header>
        <RuleList rows={journeyLines} />
        {onOpenMyStudio && (
          <div className="ops-sec__foot">
            <span className="ops-quiet">{studio.name}'s leaders change these on My Studio → Studio → This studio's settings. Operations only shows them.</span>
            <AdminButton size="sm" variant="quiet" onClick={onOpenMyStudio}>
              Change them on My Studio <ChevronRight className="w-3.5 h-3.5" aria-hidden />
            </AdminButton>
          </div>
        )}
      </section>
      <section className="ops-sec" aria-labelledby="rules-ours">
        <header className="ops-sec__h">
          <h2 className="ops-sec__t" id="rules-ours">
            Max Strength's rules
          </h2>
          <span className="ops-sec__sub">the same at every studio</span>
        </header>
        <RuleList rows={ours} />
      </section>
    </AdminScreen>
  );
}

function RuleList({ rows }: { rows: RuleRow[] }) {
  return (
    <dl className="ops-sec__card ops-rules">
      {rows.map((r) => (
        <div key={r.key} className="ops-rule" data-source={r.source}>
          <dt className="ops-rule__name">{r.name}</dt>
          <dd className="ops-rule__line">{r.line}</dd>
          <dd className="ops-rule__where">{r.where}</dd>
        </div>
      ))}
    </dl>
  );
}
