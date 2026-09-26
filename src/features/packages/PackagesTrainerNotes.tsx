/**
 * PACKAGES — the trainer notes: what the trainer reads for themselves, never
 * on the client's view at the same time (the sheet swaps one for the other).
 *
 * The recommendation (it starts on 12 months, AJ Sep 24), the money
 * fallbacks in AJ's order, a once-a-week or other-frequency package the
 * trainer may put on the client's screen, the Academy's own lines, and whose
 * prices these are, with anything the table could not show honestly.
 */

import type { Dispatch } from "react";
import { ArrowLeft } from "lucide-react";
import { Btn, Card, ChipButton, Source } from "../client-codex/kit/primitives";
import { Picks } from "../client-codex/kit/fields";
import {
  ACADEMY_AFTER,
  ACADEMY_LINES,
  ACADEMY_SOURCE,
  moneyFallbacks,
  monthsText,
  NOTHING_SAVED,
  recommendationNote,
  tableNote,
  tableWarnings,
  timesAWeek,
} from "./package-copy";
import {
  defaultRecommendationKey,
  figuresFor,
  formatMoney,
  lowestRateOnShortest,
  type Lineup,
} from "./package-table";
import type { PackageTier } from "../renewals/types";
import type { PackagesAction, PackagesView } from "./packages-view";
import "./packages.css";

export interface PackagesTrainerNotesProps {
  lineup: Lineup;
  view: PackagesView;
  dispatch: Dispatch<PackagesAction>;
  studioName: string | null;
  /** False: Max Strength's standard prices (the studio has no table of its own). */
  ownTable: boolean;
}

const NO_RECOMMENDATION = "none";

function tierLine(t: PackageTier): string {
  const f = figuresFor(t);
  const how = timesAWeek(f.visitsPerWeek);
  const price = f.rate !== null ? `${formatMoney(f.rate)} a session` : "no price set";
  return [`${t.label}, ${monthsText(t.months)}`, `${t.sessions} sessions`, how, price].filter(Boolean).join(" · ");
}

export function PackagesTrainerNotes({ lineup: l, view, dispatch, studioName, ownTable }: PackagesTrainerNotesProps) {
  const defaultKey = defaultRecommendationKey(l.headline);
  const defaultLabel = l.headline.find((t) => t.key === defaultKey)?.label ?? null;
  const fallbacks = moneyFallbacks({ offer: lowestRateOnShortest(l.headline), once: l.once, studioName });
  const warnings = tableWarnings([...l.headline, ...l.once, ...l.other].map(figuresFor));

  return (
    <div className="cx-kit pk-notes" data-testid="pk-trainer-notes">
      <Btn
        variant="quiet"
        icon={ArrowLeft}
        className="pk-notes__back"
        onClick={() => dispatch({ type: "notes", value: false })}
      >
        Back to the packages
      </Btn>

      <Card eyebrow="Your recommendation">
        <Picks
          label="Recommend a length"
          options={[
            ...l.headline.map((t) => ({ value: t.key, label: `${t.label}, ${monthsText(t.months)}` })),
            { value: NO_RECOMMENDATION, label: "No recommendation" },
          ]}
          value={view.recommendedKey ?? NO_RECOMMENDATION}
          onChange={(v) => dispatch({ type: "recommend", key: v === NO_RECOMMENDATION ? null : v })}
        />
        <Source>{recommendationNote(defaultLabel)}</Source>
      </Card>

      <Card eyebrow="If money is the worry">
        <ol className="pk-fallbacks">
          {fallbacks.map((n) => (
            <li key={n.key}>
              <b>{n.title}</b>
              <p className="pk-note">{n.body}</p>
              {n.key === "once" && l.once.length > 0 ? (
                <>
                  <ul className="pk-rows">
                    {l.once.map((t) => (
                      <li key={t.key}>{tierLine(t)}</li>
                    ))}
                  </ul>
                  <ChipButton
                    pressed={view.showOnce}
                    onClick={() => dispatch({ type: "showOnce", value: !view.showOnce })}
                  >
                    {view.showOnce ? "On their screen" : "Show once a week on their screen"}
                  </ChipButton>
                </>
              ) : null}
            </li>
          ))}
        </ol>
      </Card>

      {l.other.length > 0 ? (
        <Card eyebrow={studioName ? `Also on ${studioName}’s table` : "Also on the table"}>
          <ul className="pk-rows">
            {l.other.map((t) => (
              <li key={t.key}>{tierLine(t)}</li>
            ))}
          </ul>
          <ChipButton pressed={view.showOther} onClick={() => dispatch({ type: "showOther", value: !view.showOther })}>
            {view.showOther ? "On their screen" : "Show these on their screen"}
          </ChipButton>
        </Card>
      ) : null}

      <Card eyebrow="From the Academy">
        <ul className="pk-rows">
          {ACADEMY_LINES.map((line) => (
            <li key={line}>{`“${line}”`}</li>
          ))}
        </ul>
        <p className="pk-note">{ACADEMY_AFTER}</p>
        <Source>{ACADEMY_SOURCE}</Source>
      </Card>

      <Card eyebrow="These prices">
        <p className="pk-note">{tableNote(studioName, ownTable)}</p>
        {warnings.map((w) => (
          <p key={w} className="pk-note">
            {w}
          </p>
        ))}
        <Source>{NOTHING_SAVED}</Source>
      </Card>
    </div>
  );
}
