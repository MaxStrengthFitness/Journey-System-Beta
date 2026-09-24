/**
 * WHERE IT MATTERS — the body figure, the region list under it, and her open
 * injury notes.
 *
 * Client codex, Sep 2026 (phase 12). Two sources, side by side and never
 * merged: the watch-outs on file (plum diamonds, from her clinical flags) and
 * what she told us in the Pulse's pain map (ink rings, on the side she named).
 * The figure is a glance; the REGION LIST is the answer — each region a 44px
 * button that opens its sentences (source and date in every one) and lights
 * its marks on the figure. Flags that belong to no spot are listed under
 * "Whole body", and arm flags are listed rather than drawn (figure-map.ts).
 *
 * Her injury notes are LISTED, not drawn: a note records no body spot. A
 * Critical one the critical line under the bar is already carrying is left
 * out here (one that does not matter yet — its window starts next week — is
 * not on that line, so it stays); each opens on Notes.
 *
 * A read that did not come back is unknown, never "nothing": while the Pulse
 * loads or after it failed the card says so instead of "nothing she's told
 * us", and the same for the notes.
 */
import { useId, useMemo, useState } from "react";
import type { JournalLoad } from "../../../hooks/useClientJournal";
import type { ProgressReportsStatus } from "../../client-profile/client-answer";
import { threadCardMeta, type InjuryThreads } from "../../client-notes/record-selectors";
import type { NoteThread } from "../../client-notes/threads";
import { Btn, Card, EmptyLine, Eyebrow, LoudChip, Meta, Source, agree, cap, type Pronouns } from "../kit";
import { BodyFigure } from "./BodyFigure";
import { figureMarks, regionRows, type DoorTaps, type FigureRegion } from "./figure-map";
import type { PainReading } from "./pulse-read";

/** How many of her injury notes show before "N more on Notes". */
export const INJURY_NOTES_SHOWN = 3;

export interface WhereItMattersCardProps {
  flagIds: readonly string[] | null | undefined;
  /** The pain map as she last told it; null when she has never been asked (or it is unknown). */
  pain: PainReading | null;
  /** Whether the Pulse history answered (what she told us depends on it). */
  pulseStatus: ProgressReportsStatus;
  /** Her injury and incident threads (Notes' `injuryThreads`), with the notes' read state. */
  injury: InjuryThreads;
  notesState: JournalLoad;
  /** The root ids the critical line under the bar is carrying (`journal.criticalEntries`). */
  onCriticalLine: ReadonlySet<string>;
  machinesById: ReadonlyMap<string, { name?: string | null }>;
  /** How often each region was tapped at the door (the arrive/leave track, phase 13). */
  door?: ReadonlyMap<FigureRegion, DoorTaps> | null;
  onOpenNote: (threadId: string) => void;
  /** Notes, for "N more on Notes". */
  onOpenNotes: () => void;
  pronouns: Pronouns;
  /** The studio's day key and now. */
  today: string;
  now: Date;
}

export function WhereItMattersCard({
  flagIds,
  pain,
  pulseStatus,
  injury,
  notesState,
  onCriticalLine,
  machinesById,
  door,
  onOpenNote,
  onOpenNotes,
  pronouns,
  today,
  now,
}: WhereItMattersCardProps) {
  const [open, setOpen] = useState<string | null>(null);
  const idBase = useId();
  const marks = useMemo(
    () => figureMarks({ flagIds, painSpots: (pain?.spots ?? []).map((s) => s.point) }),
    [flagIds, pain],
  );
  const rows = useMemo(
    () => regionRows({ flagIds, pain, machinesById, door, pronouns, now }),
    [flagIds, pain, machinesById, door, pronouns, now],
  );
  const highlight = (rows.find((r) => r.region === open && r.drawn)?.region ?? null) as FigureRegion | null;

  // A critical note the line under the bar carries is not repeated here.
  const live = useMemo(() => [...injury.open, ...injury.standing], [injury]);
  const listed: NoteThread[] = useMemo(
    () => live.filter((t) => !onCriticalLine.has(t.root.id)),
    [live, onCriticalLine],
  );
  const onLine = live.length - listed.length;
  const shown = listed.slice(0, INJURY_NOTES_SHOWN);
  const more = listed.length - shown.length;

  const told = `${cap(pronouns.subject)} told us`;
  const pulseUnknown = pulseStatus === "loading" ? "loading" : pulseStatus === "failed" ? "failed" : null;

  return (
    <Card eyebrow="Where it matters" id="body-figure">
      <div className="bp-figs">
        <figure>
          <BodyFigure view="front" marks={marks} highlight={highlight} pronouns={pronouns} />
          <figcaption>Front</figcaption>
        </figure>
        <figure>
          <BodyFigure view="back" marks={marks} highlight={highlight} pronouns={pronouns} />
          <figcaption>Back</figcaption>
        </figure>
      </div>
      <p className="bp-legend">
        <span>
          <i className="bp-lg-d" aria-hidden="true" />
          On file: studio watch-outs
        </span>
        <span>
          <i className="bp-lg-r" aria-hidden="true" />
          {told}: Pulse
        </span>
      </p>

      {rows.length > 0 ? (
        <div className="bp-regions">
          {rows.map((r) => {
            const expanded = open === r.region;
            const detailId = `${idBase}-${r.region}`;
            // The sentences sit BESIDE the button, not in it: inside, a screen
            // reader would read every sentence as the button's name.
            return (
              <div key={r.region} className="bp-region" data-open={expanded ? "" : undefined}>
                <button
                  type="button"
                  className="bp-region__btn"
                  aria-expanded={expanded}
                  aria-controls={detailId}
                  onClick={() => setOpen(expanded ? null : r.region)}
                >
                  <span className="bp-region__name">{r.label}</span>
                  <span className="bp-region__meta">{r.meta}</span>
                </button>
                <div id={detailId} className="bp-region__detail" hidden={!expanded}>
                  {r.sentences.map((s, i) => (
                    <p key={i}>{s}</p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : pulseUnknown === null ? (
        <EmptyLine>
          {`Nothing on file and nothing ${pronouns.subject}${agree(pronouns, "'s", "'ve")} told us about. Flags are set under Watch-outs; the pain map is part of the Pulse.`}
        </EmptyLine>
      ) : null}
      {/* A pain map from the open round is drawn even while the saved rounds
          are out (the open round's wins), so the line says only what is missing. */}
      {pulseUnknown === "loading" ? (
        <Source>
          {pain ? "Loading the saved Pulse…" : `Loading what ${pronouns.subject} told us in the Pulse…`}
        </Source>
      ) : null}
      {pulseUnknown === "failed" ? (
        <Source>
          {pain
            ? "The saved Pulse couldn't be read just now; only the open round is drawn."
            : `The Pulse couldn't be read just now, so what ${pronouns.subject} told us isn't drawn.`}
        </Source>
      ) : null}

      <div className="bp-inj">
        <Eyebrow as="h4">{`${cap(pronouns.possessive)} injury notes`}</Eyebrow>
        {notesState === "failed" ? (
          <p className="bp-quiet">Injury and incident notes couldn't be loaded, so some may be missing.</p>
        ) : notesState === "loading" ? (
          <p className="bp-quiet">Loading the injury notes…</p>
        ) : listed.length === 0 ? (
          <p className="bp-quiet">
            {onLine > 1
              ? "Only the critical notes on the line at the top of the page."
              : onLine === 1
                ? "Only the critical note on the line at the top of the page."
                : injury.resolved > 0
                  ? `No open injury or incident notes. ${injury.resolved} resolved ${injury.resolved === 1 ? "note is" : "notes are"} on Notes.`
                  : "No injury or incident notes logged."}
          </p>
        ) : (
          <>
            {shown.map((t) => (
              <button
                key={t.id}
                type="button"
                className="bp-hers bp-inj__item"
                data-tone={t.root.importance === "elevated" ? "warn" : undefined}
                onClick={() => onOpenNote(t.id)}
              >
                <LoudChip importance={t.root.importance} />
                <span className="bp-hers__body">{t.root.body}</span>
                <Meta>{threadCardMeta(t, today)}</Meta>
              </button>
            ))}
            {more > 0 ? (
              <Btn variant="quiet" onClick={onOpenNotes}>
                {`${more} more on Notes ›`}
              </Btn>
            ) : null}
            <Source>Notes don't record a body spot, so they're listed here rather than drawn.</Source>
          </>
        )}
      </div>
    </Card>
  );
}
