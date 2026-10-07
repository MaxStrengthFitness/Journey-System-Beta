/**
 * One client on the renewals dashboard (the renewals dashboard, Oct 7 2026):
 * Operations → Clients → Renewals draws every lane's rows with it, and My
 * renewals (a trainer's own profile) draws their own clients with it, so the
 * two say the same thing in the same words.
 *
 * AJ, Oct 6 2026, at a glance per client: has anyone talked to them about
 * the renewal, the package, the exact day the commitment ends, the sessions
 * left in total, the sessions projected left when it ends, the primary
 * trainer, and the signals that matter. Each cell is a sentence from
 * row-facts.ts. The plan is a picker (RenewalPlanPicker).
 *
 * How it lies out (renewal-row.css, by the list's own width, so the same row
 * fits Operations, the sidebar or not, and My Profile):
 *   narrow (a phone)   one cell under another
 *   portrait iPad      two lines of cells, the plan on the right
 *   landscape iPad     one line of columns under a header
 * The working behind the numbers is on the row's (i), never printed on every
 * row (Operations says it once, and says less).
 */

import { useState, type ReactNode } from "react";
import { ChevronRight, Info } from "lucide-react";
import { RenewalPlanPicker } from "./RenewalPlanPicker";
import { renewalRowFacts } from "./row-facts";
import type { RenewalCycle, RenewalSettings, RenewalSnapshot } from "./types";
import "../admin/admin.css";
import "./renewal-row.css";

export interface RenewalRowProps {
  studioId: string;
  clientId: string;
  name: string;
  snapshot: RenewalSnapshot;
  cycle: RenewalCycle | null | undefined;
  /** Some read of the conversations failed: a missing one is unknown, never "nobody". */
  cyclesFailed?: boolean;
  settings: Pick<RenewalSettings, "packages">;
  today: string;
  /**
   * The primary trainer's name (the snapshot's primaryTrainerId, looked up).
   * Null when it couldn't be looked up: the line is then left out.
   */
  trainerName?: string | null;
  /** The proof line (sentences.ts proofSentence), for the (i). */
  proof?: string | null;
  /** The next step (pipeline.ts nextStep), said above the plan. */
  nextStep?: string | null;
  /** Badges beside the name: "Needs a leader", the situation. */
  badges?: ReactNode;
  /** Opens the client (the Renewal Brief, or the profile). */
  onOpen?: () => void;
  /** May the signed-in person set the plan here (canSetRenewalPlan)? */
  canPlan: boolean;
  /** The signed-in person's name, written on a plan. */
  authorName: string;
}

function Cell({ area, label, children }: { area: string; label: string; children: ReactNode }) {
  return (
    <div className={`rr__cell rr__cell--${area}`}>
      <span className="rr__label">{label}</span>
      <span className="rr__value">{children}</span>
    </div>
  );
}

/** The column heads a list of rows shows when it is wide enough for columns. */
const HEADS: Array<[string, string]> = [
  ["who", "Client"],
  ["pkg", "Package"],
  ["left", "Left now"],
  ["atend", "At the end"],
  ["talk", "Last talked"],
  ["sig", "Signals"],
  ["plan", "Plan"],
];

/** A list of rows: one container, so each row lays itself out by the list's width. */
export function RenewalRowList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="rr-list">
      <div className="rr-head" aria-hidden="true">
        {HEADS.map(([area, text]) => (
          <span key={area} className={`rr-head__cell rr-head__cell--${area}`}>
            {text}
          </span>
        ))}
      </div>
      <div role="list" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

export function RenewalRow(props: RenewalRowProps) {
  const { studioId, clientId, name, snapshot, cycle, settings, today, badges, onOpen, nextStep, canPlan, authorName } = props;
  const [whyOpen, setWhyOpen] = useState(false);
  const facts = renewalRowFacts({
    snapshot,
    cycle,
    cyclesFailed: props.cyclesFailed,
    settings,
    today,
    trainerName: props.trainerName,
    proof: props.proof,
  });

  // A trainer whose name isn't on this screen is left unsaid, never "nobody".
  const trainerLine = facts.trainer ?? (snapshot.primaryTrainerId ? null : "No primary trainer yet");

  return (
    <div className="rr" role="listitem">
      <div className="rr__cell rr__cell--who">
        {onOpen ? (
          <button type="button" className="rr__open" onClick={onOpen}>
            <span className="rr__name">{name}</span>
            <ChevronRight className="rr__chev" aria-hidden />
          </button>
        ) : (
          <span className="rr__name">{name}</span>
        )}
        {badges && <div className="rr__badges">{badges}</div>}
        {(trainerLine || facts.why.length > 0) && (
          <div className="rr__meta">
            {trainerLine && <span className="rr__trainer">{trainerLine}</span>}
            {facts.why.length > 0 && (
              <button
                type="button"
                className="rr__info"
                aria-expanded={whyOpen}
                aria-label={`How this was worked out: ${name}`}
                onClick={() => setWhyOpen((v) => !v)}
              >
                <Info className="w-4 h-4" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>

      <Cell area="pkg" label="Package">
        <span className="rr__line">{facts.packageLine}</span>
        {facts.endLine && <span className="rr__line rr__line--strong">{facts.endLine}</span>}
      </Cell>
      <Cell area="left" label="Left now">
        {facts.leftNow}
      </Cell>
      <Cell area="atend" label="At the end">
        {facts.atEnd ?? "Not known yet"}
      </Cell>
      <Cell area="talk" label="Last talked">
        {facts.talked}
      </Cell>
      <Cell area="sig" label="Signals">
        {facts.signals.length > 0 ? facts.signals.map((s) => <span key={s} className="rr__line">{s}</span>) : "None to mention"}
      </Cell>

      <div className="rr__cell rr__cell--plan">
        <span className="rr__label">Plan</span>
        {nextStep && <p className="rr__next">{nextStep}</p>}
        <RenewalPlanPicker
          studioId={studioId}
          clientId={clientId}
          clientName={name}
          snapshot={snapshot}
          cycle={cycle}
          settings={settings}
          sentence={facts.plan}
          canSet={canPlan}
          authorName={authorName}
        />
      </div>

      {whyOpen && facts.why.length > 0 && (
        <ul className="rr__why">
          {facts.why.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
