/**
 * STORY — the page of Notes & Profile about a client's time with Max
 * Strength, moment by moment, newest first.
 *
 * Client codex, Sep 2026 (phase 15). A new page: the long scroll had none.
 * Every line on it is built by `buildStory` (story.ts) from something the
 * team already recorded — a package, the first visit, the years before
 * Journey, a goal or focus reached, a step in protocol mastery, a scan, a
 * Pulse round, a critical or injury note, a FORD moment or a gesture done —
 * so nothing is typed twice, and this page writes nothing.
 *
 * WHAT IT SHOWS, top to bottom:
 *   - the since line: since when, and the header's own session numbers
 *     ("With Max Strength since Mar 2019. 412 sessions in FileMaker before
 *     Journey, and 49 in Journey.");
 *   - the filters: Everything · Milestones · Body & Pulse · Life · Goals &
 *     focus (the years before Journey are a milestone);
 *   - what it could NOT read — "Still reading …", "Couldn't read … here",
 *     "FORD is kept by the home studio" — so a missing moment is never
 *     mistaken for one that didn't happen; a filter left empty while one of
 *     its reads is missing (`unreadUnder`) says "that could be read here",
 *     never "yet";
 *   - the years, newest first. The two newest are open; an older one is a
 *     40px "8 moments in 2019" button. The year is a label, not a sticky
 *     header (the sub-toggle is the one sticky thing on the tab).
 *   - each moment: its day, its words (a long note folds behind "Read all";
 *     the words are never reworded), a Pulse statement that moved quoted in
 *     full with its two words, and where it came from. A moment with a door
 *     is one 44px button that opens the card it came from.
 *   - the years before Journey as one dashed panel, where Journey took over.
 *
 * No reads, no writes: the story is the tab's one load, built once in the
 * shell (`useCodexData`) and shared with the Overview. Neutral throughout —
 * no crimson, no pillar hue, no hero orange: the moments are a record, and
 * the page ranks and scores nothing.
 */
import { useId, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Btn, EmptyLine, Lede, Meta, Page, Pick, cap, curly, dayKeyDate, monthDay, plural, type CodexGo, type Pronouns } from "../client-codex/kit";
import {
  STORY_FILTERS,
  STORY_READ_LABEL,
  filterStory,
  foldText,
  unreadUnder,
  type Story,
  type StoryBeat,
  type StoryFilter,
  type StoryRead,
  type StoryYear,
} from "./story";
import "./story.css";

export interface StoryPageProps {
  /** The tab's one story (`buildStory`, memoised in the shell). */
  story: Story;
  pronouns: Pronouns;
  go: CodexGo;
}

/** How many of the newest years are open when the page first draws. */
const OPEN_YEARS = 2;

/** "notes", "notes and FORD", "notes, FORD and InBody scans". */
function listWords(reads: readonly StoryRead[]): string {
  const words = reads.map((r) => STORY_READ_LABEL[r]);
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** "Mar 14" for a day key; "" for none. */
function dayLabel(day: string | null): string {
  const d = dayKeyDate(day);
  return d ? monthDay(d) : "";
}

export function StoryPage({ story, pronouns: p, go }: StoryPageProps) {
  const [filter, setFilter] = useState<StoryFilter>("all");
  const [openedYears, setOpenedYears] = useState<ReadonlySet<number>>(() => new Set());
  const [openBeats, setOpenBeats] = useState<ReadonlySet<string>>(() => new Set());
  const idBase = useId();

  const shown = useMemo(() => filterStory(story, filter), [story, filter]);
  // Which years start open is decided on the whole story, so a filter never
  // folds a year the trainer was reading.
  const openByDefault = useMemo(
    () =>
      new Set(
        story.years
          .map((y) => y.year)
          .filter((y): y is number => y !== null)
          .slice(0, OPEN_YEARS),
      ),
    [story.years],
  );
  const filterLabel = STORY_FILTERS.find((f) => f.id === filter)?.label ?? "";

  const toggleBeat = (key: string) =>
    setOpenBeats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const lede =
    `${cap(p.possessive)} time with Max Strength, newest first. Every line is built from something the team ` +
    "already recorded — a contract, a Pulse, a scan, a note, a goal, FORD — so nothing is typed twice.";

  const status: string[] = [];
  if (story.pending.length) status.push(`Still reading ${listWords(story.pending)}, so those moments aren't shown yet.`);
  if (story.failed.length) status.push(`Couldn't read ${listWords(story.failed)} here, so those moments aren't shown.`);
  if (story.off.includes("ford")) status.push("FORD is kept by the home studio, so FORD moments aren't shown here.");
  if (story.capped) {
    status.push("This record is unusually large: some older notes or focuses aren't loaded, so a moment may be missing.");
  }
  // What may be missing: under this filter (an empty filter is then unknown,
  // not "nothing yet"), and anywhere (an empty story is then not "nothing
  // recorded"). A read still loading or failed says so above; one this reader
  // may not make (FORD at a cross-train studio) is named above too.
  const unreadHere = unreadUnder(story, filter).length > 0;
  const stillOpen = story.pending.length > 0 || story.failed.length > 0;
  const unreadAnywhere = unreadUnder(story, "all").length > 0;

  let body;
  if (shown.beats.length > 0) {
    body = (
      <div className="st-years">
        {shown.years.map((y) => (
          <YearGroup
            key={y.year ?? "before"}
            group={y}
            headingId={`${idBase}-year-${y.year ?? "before"}`}
            open={y.year === null || openByDefault.has(y.year) || openedYears.has(y.year)}
            onOpen={() => {
              if (y.year !== null) setOpenedYears((prev) => new Set(prev).add(y.year as number));
            }}
            openBeats={openBeats}
            onToggleBeat={toggleBeat}
            go={go}
          />
        ))}
      </div>
    );
  } else if (filter !== "all" && story.beats.length > 0) {
    body = (
      <EmptyLine action={{ label: "Show everything", onClick: () => setFilter("all") }}>
        {unreadHere
          ? `Nothing under ${curly(filterLabel)} that could be read here.`
          : `Nothing under ${curly(filterLabel)} yet.`}
      </EmptyLine>
    );
  } else if (stillOpen) {
    // Said by the status line above; an empty story here is unknown, not empty.
    body = null;
  } else if (unreadAnywhere) {
    // Everything this reader may read is empty, but not everything could be
    // read (FORD is the home studio's): not "nothing recorded".
    body = <EmptyLine>Nothing recorded yet that can be read here.</EmptyLine>;
  } else {
    body = (
      <EmptyLine>
        Nothing recorded yet. A moment appears here when the team records one: a package, a first session, a
        Pulse, a scan, a note, a goal or a focus reached.
      </EmptyLine>
    );
  }

  return (
    <Page id="story" title="Story" lede={lede} go={go}>
      <div className="st-page" data-testid="story-page">
        {story.sinceLine ? <Lede className="st-since">{story.sinceLine}</Lede> : null}

        <div className="st-filters" role="group" aria-label="Show in the story">
          {STORY_FILTERS.map((f) => (
            <Pick key={f.id} pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </Pick>
          ))}
        </div>

        {status.length ? (
          <div className="st-status" role="status">
            {status.map((s) => (
              <Meta key={s}>{s}</Meta>
            ))}
          </div>
        ) : null}

        {body}
      </div>
    </Page>
  );
}

function YearGroup({
  group,
  headingId,
  open,
  onOpen,
  openBeats,
  onToggleBeat,
  go,
}: {
  group: StoryYear;
  headingId: string;
  open: boolean;
  onOpen: () => void;
  openBeats: ReadonlySet<string>;
  onToggleBeat: (key: string) => void;
  go: CodexGo;
}) {
  const { year, beats } = group;
  return (
    <section
      className="st-year"
      aria-labelledby={year !== null ? headingId : undefined}
      aria-label={year === null ? "Before Journey" : undefined}
    >
      {year !== null ? (
        <h3 className="st-year__title" id={headingId}>
          {year}
        </h3>
      ) : (
        <span className="st-year__title" aria-hidden="true" />
      )}
      {open ? (
        <ol className="st-beats">
          {beats.map((b) => (
            <BeatItem key={b.key} beat={b} open={openBeats.has(b.key)} onToggle={() => onToggleBeat(b.key)} go={go} />
          ))}
        </ol>
      ) : (
        <div className="st-year__folded">
          <Btn variant="quiet" aria-expanded={false} iconEnd={ChevronRight} onClick={onOpen}>
            {`${plural(beats.length, "moment")} in ${year}`}
          </Btn>
        </div>
      )}
    </section>
  );
}

function BeatItem({ beat, open, onToggle, go }: { beat: StoryBeat; open: boolean; onToggle: () => void; go: CodexGo }) {
  if (beat.isEra) {
    return (
      <li className="st-beat" data-kind={beat.kind} data-era="" data-testid="story-era">
        <div className="st-era">
          <span className="st-era__title">{beat.text}</span>
          {beat.eraDetail ? <span className="st-era__detail">{beat.eraDetail}</span> : null}
        </div>
      </li>
    );
  }

  const fold = foldText(beat.text);
  const words = (
    <span className="st-beat__words">
      <span className="st-beat__text">{fold.folded && !open ? fold.short : beat.text}</span>
      {beat.quotes?.map((q) => (
        <span className="st-quote" key={q.statementId}>
          {curly(q.text)} <b>{q.to}</b>, was {q.from}.
        </span>
      ))}
      <span className="st-beat__src">{beat.sourceLine}</span>
    </span>
  );
  const door = beat.door;

  return (
    <li className="st-beat" data-kind={beat.kind} data-source={beat.source}>
      <span className="st-beat__day">{dayLabel(beat.day)}</span>
      <div className="st-beat__main">
        {door ? (
          <button type="button" className="st-beat__door" onClick={() => go(door.page, door.anchor)}>
            {words}
            <ChevronRight className="st-beat__chevron" size={16} aria-hidden="true" />
          </button>
        ) : (
          <div className="st-beat__content">{words}</div>
        )}
        {fold.folded ? (
          <div className="st-beat__more">
            <Btn variant="quiet" aria-expanded={open} onClick={onToggle}>
              {open ? "Show less" : "Read all"}
            </Btn>
          </div>
        ) : null}
      </div>
    </li>
  );
}
