/**
 * OPERATIONS → SETUP → RULES — the numbers behind every sentence.
 *
 * The redesign's Operations room, phase 3 (Sep 28 2026; research-operations
 * §6.2, "Rules — opens My Studio → Studio"). Every claim Operations makes
 * names the line it crossed ("past the studio's 14-day line"); this page is
 * where a leader reads each line in one place.
 *
 * Two kinds of number, said plainly as two:
 *
 *   the studio's own   read from the studio's renewal settings (one small
 *                      document, studios/{s}/config/renewals) and set on My
 *                      Studio → Studio. Operations looks; My Studio edits
 *                      (AJ, Sep 18), so this page only points there.
 *   Max Strength's     named constants in the code for now (journey/states.ts,
 *                      journey/rhythm.ts, overview/brief.ts). AJ's question 5
 *                      took the default "each a studio setting", and storing
 *                      one is a data change that waits for his OK, so until
 *                      then the page says so beside each.
 */
import { ChevronRight, ScrollText } from "lucide-react";
import type { Studio } from "../../../types";
import { useRenewalSettings } from "../../renewals/useRenewalSettings";
import { AdminButton, AdminHeader, AdminNotice, AdminScreen } from "../primitives";
import { NIGHTLY_STALE_DAYS } from "../overview/brief";
import { MIN_RHYTHM_VISITS, MIN_RHYTHM_WEEKS } from "./rhythm";
import { DRIFT_MIN_DAYS, DRIFT_MULTIPLE, LAPSED_DAYS, NEW_MAX, SETTLING_MAX } from "./states";
import "../shell/ops.css";

export interface RulesPageProps {
  studio: Studio;
  /** Opens My Studio → Studio, where the studio's own numbers are set. */
  onOpenMyStudio?: () => void;
}

interface RuleRow {
  name: string;
  line: string;
  where: string;
}

export function RulesPage({ studio, onOpenMyStudio }: RulesPageProps) {
  const { settings, loading, error, saved } = useRenewalSettings(studio.id ?? null);
  const studioNote = error ? "Couldn't be read just now, so Max Strength's default is shown." : saved ? `${studio.name}'s own number, set on My Studio → Studio.` : "Max Strength's default: the studio hasn't set its own on My Studio → Studio.";
  const constant = "Max Strength's line for now. It becomes a studio setting once storing it is approved.";

  const own: RuleRow[] = [
    { name: "At risk", line: `Warn me when a client has not visited for ${settings.breakDays} days, with nothing booked.`, where: studioNote },
    {
      name: "Renewal talk",
      line: `Start the conversation at ${settings.conversationAtSessionsLeft} sessions left, and plan ${settings.horizonMonths} months ahead.`,
      where: studioNote,
    },
    {
      name: "Before the charge",
      line: `Warn ${settings.chargeWarnDays} days before an auto-renew charge when ${settings.chargeWarnMinBanked} or more sessions will still be banked.`,
      where: studioNote,
    },
    { name: "Lost", line: `A client is lost ${settings.lostAfterDays} days after billing ends with no new package.`, where: studioNote },
  ];
  const ours: RuleRow[] = [
    { name: "Drifting", line: `${DRIFT_MULTIPLE === 2 ? "Twice" : `${DRIFT_MULTIPLE} times`} her usual gap, at least ${DRIFT_MIN_DAYS} days, with nothing booked.`, where: constant },
    { name: "Lapsed", line: `${LAPSED_DAYS} days since her last visit, with nothing booked.`, where: constant },
    { name: "New and Settling in", line: `Sessions 1 to ${NEW_MAX}, then ${NEW_MAX + 1} to ${SETTLING_MAX}, and only from a total that may be quoted: a client whose history is before Journey is never called new.`, where: constant },
    {
      name: "A usual gap",
      line: `Needs ${MIN_RHYTHM_VISITS} visits over ${MIN_RHYTHM_WEEKS} weeks. Below that a client is "too new to judge", never steady or slipping.`,
      where: "The research's minimum. Measured from last night's record of her visits, until the nightly job stores the gap itself (waiting for AJ's OK).",
    },
    { name: "The nightly record", line: `Trusted until ${NIGHTLY_STALE_DAYS} days pass with no client's record changing; then nobody's rhythm is judged from it.`, where: constant },
  ];

  return (
    <AdminScreen>
      <AdminHeader
        icon={<ScrollText className="w-5 h-5" />}
        title="Rules"
        subtitle="The numbers behind every sentence on Operations. Each sentence names the line it crossed."
        actions={
          onOpenMyStudio ? (
            <AdminButton variant="quiet" onClick={onOpenMyStudio}>
              Open My Studio → Studio <ChevronRight className="w-4 h-4" aria-hidden />
            </AdminButton>
          ) : undefined
        }
      />
      {loading && <AdminNotice tone="info">Reading {studio.name}'s settings…</AdminNotice>}
      <section className="ops-sec" aria-labelledby="rules-own">
        <header className="ops-sec__h">
          <h2 className="ops-sec__t" id="rules-own">
            {studio.name}'s own numbers
          </h2>
          <span className="ops-sec__sub">set on My Studio → Studio</span>
        </header>
        <RuleList rows={own} />
      </section>
      <section className="ops-sec" aria-labelledby="rules-ours">
        <header className="ops-sec__h">
          <h2 className="ops-sec__t" id="rules-ours">
            Max Strength's lines
          </h2>
          <span className="ops-sec__sub">the same at every studio, for now</span>
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
        <div key={r.name} className="ops-rule">
          <dt className="ops-rule__name">{r.name}</dt>
          <dd className="ops-rule__line">{r.line}</dd>
          <dd className="ops-rule__where">{r.where}</dd>
        </div>
      ))}
    </dl>
  );
}
