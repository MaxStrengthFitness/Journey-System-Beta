/**
 * ON OUR FLOOR — per machine she is prescribed: HER notes first, then the
 * Academy's set-up for a body her height; then what machine fit can say
 * about clients built like her, and a door to Setup.
 *
 * Client codex, Sep 2026 (phase 12). The rows come from floor.ts and the
 * last tile from built-like-her.ts; this draws them. Her notes are the
 * journal's own threads on the machine (a Critical one in the crimson box,
 * a Heads up in plum, a Note plain), each opening on Notes, then the machine
 * notes marked important in her settings. The Academy's words are quoted part
 * by part, verbatim, under a line that says her notes always sit on top.
 *
 * Nothing here is a value to use: no load, no "Use" — the evidence, and the
 * door to Programming → Setup, where a trainer decides.
 *
 * A read that has not answered is unknown (`reads`, floor.ts's floorReads):
 * while her routines, her settings or the catalog are out, the card says so
 * and holds back every line that depends on them.
 */
import { ChevronRight } from "lucide-react";
import { LoadingMark } from "../../../components/LoadingMark";
import { LOUDNESS_TONE } from "../../rating/Loudness";
import type { StatureBand } from "../../equipment/setting-suggestions";
import type { JournalLoad } from "../../../hooks/useClientJournal";
import { Btn, Card, LoudChip, Meta, Quote, Source, cap, type Pronouns } from "../kit";
import { floorEyebrow, noAcademyLine, type FloorReads, type FloorView, type HerNote } from "./floor";
import type { BuiltLikeHerView } from "./built-like-her";

export interface OnOurFloorCardProps {
  floor: FloorView;
  band: StatureBand | null;
  /** "14 of 16 machines set up" — shown only once machine fit's inputs are known. */
  setUpLine: string;
  builtLikeHer: BuiltLikeHerView;
  /** What the card may claim while its reads are out (floorReads). */
  reads: FloorReads;
  /** Machine fit's read: nothing is said while it loads, and a failed read says so. */
  fitStatus: "idle" | "loading" | "ready" | "failed";
  /** Machine fit's minimum sample (the match spec's `minClients`). */
  minClients: number;
  /** Whether her notes were read: a failed read may be missing a note. */
  notesState: JournalLoad;
  pronouns: Pronouns;
  onOpenSetup?: () => void;
  onOpenNote: (threadId: string) => void;
}

/** "3 more of her machines use the standard set-up." — the prescribed machines with nothing to add. */
export function restLine(floor: Pick<FloorView, "rows" | "rest">, pronouns: Pick<Pronouns, "possessive">): string {
  const her = pronouns.possessive;
  if (floor.rows.length > 0) return `${floor.rest} more of ${her} machines use the standard set-up.`;
  return floor.rest === 1
    ? `${cap(her)} one machine uses the standard set-up.`
    : `All ${floor.rest} of ${her} machines use the standard set-up.`;
}

function HerNoteItem({ note, onOpenNote }: { note: HerNote; onOpenNote: (threadId: string) => void }) {
  if (note.kind === "thread") {
    const tone =
      LOUDNESS_TONE[note.importance === "critical" || note.importance === "elevated" ? note.importance : "standard"];
    return (
      <button
        type="button"
        className="bp-hers"
        data-tone={tone === "alert" || tone === "warn" ? tone : undefined}
        onClick={() => onOpenNote(note.threadId)}
      >
        <LoudChip importance={note.importance} />
        <span className="bp-hers__body">{note.body}</span>
        <Meta>{note.meta}</Meta>
      </button>
    );
  }
  return (
    <div className="bp-hers">
      <span className="bp-hers__body">{note.body}</span>
      <Meta>{`Machine note · ${note.meta}`}</Meta>
    </div>
  );
}

export function OnOurFloorCard({
  floor,
  band,
  setUpLine,
  builtLikeHer,
  reads,
  fitStatus,
  minClients,
  notesState,
  pronouns,
  onOpenSetup,
  onOpenNote,
}: OnOurFloorCardProps) {
  const noAcademy = noAcademyLine(band, pronouns);
  const bandWords = band === "shorter" ? "a shorter body" : band === "taller" ? "a taller body" : null;
  const Her = cap(pronouns.possessive);
  // The rest line counts machines with no note and no Academy text: only once both are known.
  const restKnown = reads.programmeKnown && reads.academyKnown;

  return (
    <Card
      eyebrow={floorEyebrow(band, pronouns)}
      id="body-floor"
      meta={reads.fit === "ready" ? setUpLine : undefined}
      actions={
        onOpenSetup ? (
          <Btn iconEnd={ChevronRight} onClick={onOpenSetup}>
            Open Setup
          </Btn>
        ) : null
      }
    >
      {noAcademy ? <p className="bp-quiet">{noAcademy}</p> : null}
      {notesState === "failed" ? (
        <p className="bp-quiet">{`${Her} notes couldn't be loaded, so a note on a machine may be missing.`}</p>
      ) : notesState === "loading" ? (
        <p className="bp-quiet">{`Loading ${pronouns.possessive} notes…`}</p>
      ) : null}
      {reads.lines.map((line) => (
        <p key={line} className="bp-quiet">
          {line}
        </p>
      ))}
      <div className="bp-floor">
        {floor.rows.map((row) => (
          <div key={row.machineId} className="bp-tile">
            <p className="bp-tile__name">{row.name}</p>
            {row.hers.map((n) => (
              <HerNoteItem key={n.key} note={n} onOpenNote={onOpenNote} />
            ))}
            {row.academy.map((part, i) => (
              <Quote key={i} className="bp-tile__text">
                {part}
              </Quote>
            ))}
            {row.academy.length > 0 && bandWords ? (
              <Source>
                {`The Academy's set-up for ${bandWords}.${row.hers.length > 0 ? ` ${Her} own notes always sit on top of it.` : ""}`}
              </Source>
            ) : null}
            {row.prescribedIn.length === 0 && reads.programmeKnown ? (
              <Meta>{`Not in ${pronouns.possessive} routines`}</Meta>
            ) : null}
          </div>
        ))}
        {reads.programmeKnown && floor.rows.length === 0 && floor.rest === 0 ? (
          <p className="bp-quiet">
            {notesState === "ready"
              ? `No machines in ${pronouns.possessive} routines yet, and no notes of ${pronouns.possessiveAlone} on any machine.`
              : `No machines in ${pronouns.possessive} routines yet.`}
          </p>
        ) : null}
        {restKnown && floor.rest > 0 ? <p className="bp-quiet">{restLine(floor, pronouns)}</p> : null}

        <div className="bp-tile" data-wide="">
          <p className="bp-tile__name">{`Clients built like ${pronouns.object}`}</p>
          {fitStatus === "loading" ? (
            <LoadingMark size="sm" label="Loading what similar clients use…" />
          ) : fitStatus === "failed" ? (
            <p className="bp-tile__text">
              {`Not known just now: ${pronouns.possessive} routines, machine settings or the machine catalog couldn't be loaded.`}
            </p>
          ) : (
            <>
              {builtLikeHer.verdict ? <p className="bp-tile__text">{builtLikeHer.verdict}</p> : null}
              {builtLikeHer.lines.map((l) => (
                <div key={l.machineId} className="bp-hers">
                  <span className="bp-hers__body">
                    <b>{l.machineName}</b>
                    {l.picks ? ` · ${l.picks}` : ""}
                  </span>
                  <Meta>{l.sentence}</Meta>
                </div>
              ))}
              {builtLikeHer.reason ? <p className="bp-tile__text">{builtLikeHer.reason}</p> : null}
            </>
          )}
          <Source>{`Machine fit · it says nothing until at least ${minClients} similar clients match`}</Source>
        </div>
      </div>
    </Card>
  );
}
