/**
 * REACHED — every goal marked achieved and every focus achieved, newest
 * first: "what has she achieved".
 *
 * Client codex, Sep 2026 (phase 14). It replaces the long scroll's
 * "Achieved goals" list (GoalsPanel, deleted) and adds the focuses a coach
 * marked achieved, which were only in the focus board's history. Each row is
 * a green medal, the goal or the focus in the words it was written in, and
 * one line of when, how long, the reward and who marked it. A goal marked
 * achieved a moment ago is in the record form, not on the record, so it says
 * "Not saved yet" until the Save bar saves it.
 *
 * Only what was marked in Journey: for a client whose story began before
 * Journey the card says so, rather than implying this is everything she has
 * ever reached. Focuses that have not been read are said to be missing,
 * never counted as none.
 */
import { useState } from "react";
import { Check, Star } from "lucide-react";
import type { HistoryCoverage } from "../../lib/prior-history";
import type { JournalLoad } from "../../hooks/useClientJournal";
import { Btn, CardHead, Chip, EmptyLine, Meta, Source, anchorProps, cls } from "../client-codex/kit";
import type { RecordAnchor } from "../client-profile/profile-nav";
import { REACHED_SHOWN, reachedHeading, type ReachedRow } from "./goals-page";
import "./goals.css";

export interface ReachedShelfProps {
  rows: readonly ReachedRow[];
  /** Whether the focuses were read (`loadState.focuses`). */
  focusesState: JournalLoad;
  coverage: HistoryCoverage;
  id?: RecordAnchor;
  className?: string;
}

export function ReachedShelf({ rows, focusesState, coverage, id = "goals-reached", className }: ReachedShelfProps) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, REACHED_SHOWN);
  const focusesKnown = focusesState === "ready";

  return (
    <section className={cls("cx-card", className)} data-testid="goal-history" {...anchorProps(id)}>
      <CardHead eyebrow={reachedHeading(rows, focusesKnown)} icon={Star} />

      {rows.length === 0 ? (
        focusesKnown ? (
          <EmptyLine>Nothing marked reached yet. A goal or focus marked achieved is kept here.</EmptyLine>
        ) : (
          <Meta>No goal marked achieved yet.</Meta>
        )
      ) : (
        <div className="gf-shelf">
          {shown.map((r) => (
            <div key={r.key} className="gf-shelf__row" data-kind={r.kind}>
              <span className="gf-medal" aria-hidden="true">
                <Check size={16} />
              </span>
              <span className="gf-shelf__text">
                <span className="gf-shelf__title">{r.title}</span>
                <span className="gf-shelf__meta">{r.meta}</span>
                {r.unsaved ? (
                  <span>
                    <Chip tone="live">Not saved yet</Chip>
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      )}

      {rows.length > REACHED_SHOWN ? (
        <div className="gf-buttons">
          <Btn variant="quiet" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? "Show fewer" : `See all ${rows.length}`}
          </Btn>
        </div>
      ) : null}

      {focusesState === "loading" ? <Meta>Loading the focuses…</Meta> : null}
      {focusesState === "failed" ? (
        <Meta>The focuses couldn't be loaded, so a focus achieved may be missing here.</Meta>
      ) : null}
      {coverage !== "complete" ? (
        <Source>Only what was marked in Journey. Anything reached before Journey isn't recorded here.</Source>
      ) : null}
    </section>
  );
}
