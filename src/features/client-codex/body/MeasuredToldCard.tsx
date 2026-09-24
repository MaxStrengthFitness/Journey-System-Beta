/**
 * MEASURED, AND WHAT SHE TOLD US — each measured fact beside what she said,
 * each side with its own source and date, never merged into a score.
 *
 * Client codex, Sep 2026 (phase 12). The rows are pairs.ts's; this draws them
 * as a three-column table (key · measured · told), which stacks into one
 * column when the card is narrow. A told side with no answer reads the row's
 * `toldMissing` — "Not asked yet" only once the Pulse answered, never while it
 * loads or after it failed; the Dial's word is bold, the statement in her
 * words is quoted.
 */
import { Card, cap, type Pronouns } from "../kit";
import type { PairRow } from "./pairs";

export function MeasuredToldCard({
  rows,
  pronouns,
}: {
  rows: readonly PairRow[];
  pronouns: Pick<Pronouns, "subject">;
}) {
  const told = `${cap(pronouns.subject)} told us`;
  return (
    <Card
      eyebrow={`Measured, and what ${pronouns.subject} told us`}
      id="body-measured"
      meta="each side keeps its own source and date, and they are never merged into a score"
    >
      <div className="bp-pairs" role="table" aria-label={`Measured, and what ${pronouns.subject} told us`}>
        <div className="bp-pair" data-head="" role="row">
          <div role="columnheader">
            <span className="bp-pair__k">Area</span>
          </div>
          <div role="columnheader">
            <span className="bp-pair__k">
              <i className="bp-lg-s" aria-hidden="true" />
              Measured / on file
            </span>
          </div>
          <div role="columnheader">
            <span className="bp-pair__k">
              <i className="bp-lg-r" aria-hidden="true" />
              {told}
            </span>
          </div>
        </div>
        {rows.map((r) => (
          <div key={r.key} className="bp-pair" role="row">
            <div role="rowheader">
              <span className="bp-pair__k">{r.label}</span>
            </div>
            <div role="cell">
              <p className="bp-pair__text">{r.measured.text}</p>
              {r.measured.source ? <span className="cx-source">{r.measured.source}</span> : null}
            </div>
            <div role="cell">
              {r.told ? (
                <>
                  <p className="bp-pair__text">
                    {r.told.text} <span className="bp-pair__word">{r.told.word}</span>
                  </p>
                  <span className="cx-source">{r.told.source}</span>
                </>
              ) : (
                <p className="bp-quiet">{r.toldMissing}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
