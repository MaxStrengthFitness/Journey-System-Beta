/**
 * THE PULSE — the living record of how the client's life is going, filled a
 * little at a time between and during sessions, never "done".
 *
 * It used to be a full-screen sheet with twelve topics in it, opened from
 * the briefing and expected to be finished in one sitting. Nobody has that
 * sitting. A coach has ninety seconds while the client works the lumbar
 * machine, and what they want to do with it is tick hydration and get back
 * on the floor.
 *
 * So this is a persistent panel over a draft that lives between sessions:
 * one topic open at a time, every edit autosaved, and a line that says
 * exactly where it got to. Pain and stress need an explicit "nothing to
 * report" because an empty list cannot otherwise be told apart from a
 * conversation that never happened.
 *
 * ASSESSMENT ROUND (Sep 2026) — the owner's audit:
 *  - The twelve areas are grouped into three pillars (Recovery & Fuel,
 *    Physical & Functional, Psychological & Behavioral), each with a line
 *    saying how many of its areas were updated in the last 90 days.
 *  - Every area shows what its two ends mean, in the question bank's words.
 *  - An area untouched for 90+ days carries a quiet marker.
 *  - The HISTORY LOG sits on the same screen: every change, was → now,
 *    when, who, and the note attached at the time. Nothing is overwritten
 *    any more (assessment-history.ts).
 *  - Every hook runs before the "no client" return. The search box's state
 *    and effect used to sit below it, which is a rules-of-hooks crash the
 *    moment the client goes from null to set.
 *
 * REPORTING ROUND (Sep 2026) — the name and the Dial:
 *  - It is called the Pulse on screen. Same draft, same fields, same log.
 *  - Every statement is answered on the Dial with the document's five
 *    frequency words; pain and stress intensity on Worst → None. No 0–10
 *    grid anywhere, and no number for anything a trainer rates.
 *  - Per-statement notes are gone; one note per topic stays.
 *  - "Hand to client" opens client mode (PulseClientMode): the client taps
 *    the words themselves, with nothing of the coach's showing. Answers
 *    made there mark the draft `enteredBy: "client"`; the coach's next edit
 *    marks it "coach" again.
 *  - The chrome (header, search, footer) draws from the feature's tokens so
 *    light and dark both read inside the record spine; every tappable ≥ 44px.
 *
 * The profile's Pulse section and the Active Session's slide-over pass none
 * of the props below and behave as before.
 *
 * CLIENT CODEX (Sep 2026) — three optional props, each changing nothing when
 * it is left out:
 *  - `draft`: an already-loaded useCheckInDraft result. The Body & Pulse page
 *    owns the ONE draft for the client (its read grid and this editor show
 *    the same answers), so the panel's own hook is DISABLED when one is
 *    handed in — no second progressReports read, and never two drafts of one
 *    client autosaving side by side.
 *  - `startInClientMode`: open client mode as soon as the draft is in (and
 *    again each time the prop turns true), so "Hand to client" on the page
 *    lands on the client's sheet in one tap.
 *  - `onClientModeClose`: told when client mode closes, so that page can go
 *    back to where it was.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  HeartPulse,
  Loader2,
  RotateCcw,
  Search,
  Users,
} from "lucide-react";
import { sectionMatches } from "../../features/subjective-report/search";
import { fmtDate } from "../../features/subjective-report/ui";
import { formatStudioDateTime } from "../../lib/studio-time";
import { clientFirstName } from "../../lib/client-name";
import type { Client, Machine, Trainer } from "../../types";
import {
  CategoryCard,
  HydrationCard,
  PainMapCard,
  ProteinCard,
  StressCard,
  SUBJECTIVE_CATEGORIES,
  scoreCategory,
  useCheckInDraft,
  type CheckInDraftState,
  type CheckInSectionState,
} from "../../features/subjective-report";
import {
  CHANGE_NOTE_MAX,
  STALE_AFTER_DAYS,
  buildHistoryLog,
  deltaKind,
  formatMeasure,
  freshnessOf,
  hasOwnValue,
  lastUpdated,
  latestChangeFor,
  measureSection,
  pillarFreshness,
  pillarFreshnessSentence,
  sectionTouches,
  type Freshness,
} from "../../features/subjective-report/assessment-history";
import { groupByPillar, sectionScale } from "../../features/subjective-report/pillars";
import {
  AssessmentHistoryLog,
  DeltaChip,
} from "../../features/subjective-report/AssessmentHistoryLog";
import { PulseClientMode } from "../../features/subjective-report/PulseClientMode";
import type { AssessmentChange, SubjectiveAssessment } from "../../features/subjective-report/types";
import "../../features/subjective-report/subjective-report.css";

export interface ClientCheckInPanelProps {
  client: Client | null;
  trainer: Trainer | null;
  machines: Machine[];
  /**
   * The client's draft, already loaded by the screen that owns it. When
   * given, the panel loads nothing itself (see the header). It must be the
   * draft of THIS `client`.
   */
  draft?: CheckInDraftState;
  /** Open client mode once the draft is in, and whenever this turns true. */
  startInClientMode?: boolean;
  /** Called when client mode closes. */
  onClientModeClose?: () => void;
}

const relative = (ms: number | null): string | null => {
  if (!ms) return null;
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
};

function StatusDot({ section }: { section: CheckInSectionState }) {
  if (section.isComplete)
    return <CircleCheck className="h-4 w-4 shrink-0" style={{ color: "var(--sr-green)" }} aria-label="answered" />;
  if (section.isReviewed)
    return <Check className="h-4 w-4 shrink-0" style={{ color: "var(--sr-green)" }} aria-label="reviewed, nothing to report" />;
  if (section.isPartial)
    return <CircleAlert className="h-4 w-4 shrink-0" style={{ color: "var(--sr-yellow)" }} aria-label="part answered" />;
  return <CircleDashed className="h-4 w-4 shrink-0" style={{ color: "var(--sr-border-strong)" }} aria-label="not started" />;
}

/** What the two ends of an area's scale mean, in the question bank's words. */
function ScaleEnds({ sectionId }: { sectionId: string }) {
  const s = sectionScale(sectionId);
  const lowTone = s.lowerIsBetter ? "good" : "bad";
  const highTone = s.lowerIsBetter ? "bad" : "good";
  return (
    <div className="sra-ends" aria-label="What the scale means">
      <div className={`sra-ends__cell sra-ends__cell--${lowTone}`}>
        <span className="sra-ends__label">Low end · 0</span>
        <span className="sra-ends__text">{s.low}</span>
      </div>
      <div className={`sra-ends__cell sra-ends__cell--${highTone}`}>
        <span className="sra-ends__label">High end · {s.max}</span>
        <span className="sra-ends__text">{s.high}</span>
      </div>
      <p className="sra-ends__hint">
        Tracked as {s.unit === "days a week" ? "days a week" : `a score ${s.unit}`}
        {s.lowerIsBetter ? " — lower is better." : " — higher is better."}
      </p>
    </div>
  );
}

/**
 * The change the coach just made to this area, with room for the reason.
 * Drawn BELOW the editor on purpose: appearing above it would push the
 * Dial down under a finger that is still tapping.
 */
function JustChanged({
  change,
  onNote,
}: {
  /** Declared explicitly: JSX does not supply `key` here (house convention, see ui.tsx Chip). */
  key?: string;
  change: AssessmentChange;
  onNote: (categoryId: string, at: string, note: string) => void;
}) {
  const [text, setText] = useState(change.note ?? "");
  const row = {
    sectionId: change.categoryId,
    from: change.from,
    to: change.to,
    kind: change.fromUnknown ? ("updated" as const) : deltaKind(change.from, change.to),
  };
  const unit = sectionScale(change.categoryId).unit;
  return (
    <div className="sra-justnow">
      <DeltaChip row={row} />
      <p className="sra-justnow__text">
        {formatMeasure(change.from)} → {formatMeasure(change.to)} {unit} · {relativeIso(change.at)}
      </p>
      <input
        className="sra-note-input"
        value={text}
        maxLength={CHANGE_NOTE_MAX}
        placeholder="Why? (optional) — e.g. bought a new mattress"
        aria-label="Why this changed"
        onChange={(e) => {
          setText(e.target.value);
          onNote(change.categoryId, change.at, e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </div>
  );
}

const relativeIso = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (relative(t) ?? "") : "";
};

export function ClientCheckInPanel({
  client,
  trainer,
  machines,
  draft: sharedDraft,
  startInClientMode = false,
  onClientModeClose,
}: ClientCheckInPanelProps) {
  // Hooks cannot be called conditionally, so when a draft is handed in the
  // panel's own is disabled rather than skipped: a disabled useCheckInDraft
  // reads nothing and never writes.
  const ownDraft = useCheckInDraft({ client, trainer, machines, enabled: !sharedDraft });
  const draft = sharedDraft ?? ownDraft;
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [clientMode, setClientMode] = useState(startInClientMode);
  // Each time the host asks again (its "Hand to client" tapped a second
  // time), open client mode again. Closing is the panel's: it tells the host
  // through onClientModeClose, and the host sets the prop back.
  useEffect(() => {
    if (startInClientMode) setClientMode(true);
  }, [startInClientMode]);
  const closeClientMode = useCallback(() => {
    setClientMode(false);
    onClientModeClose?.();
  }, [onClientModeClose]);
  /**
   * Auto-open happens ONCE. Keyed on `openId === null` it fought the user:
   * collapsing a section sets openId to null, which was also the re-open
   * condition, so the accordion snapped straight back open.
   */
  const autoOpened = useRef(false);

  // Land on the first thing still owed, once the draft is in.
  useEffect(() => {
    if (autoOpened.current || draft.loading || !draft.hasDraft) return;
    autoOpened.current = true;
    setOpenId(draft.firstOpenSection);
  }, [draft.loading, draft.hasDraft, draft.firstOpenSection]);

  /* FIND THE AREA (tracker round, Sep 2026). "Search 'sleep' and see every
     area related to it." The list filters as you type; the first match
     opens so the answer is one tap away. Clearing the box restores all.
     These hooks used to sit below the `!client` return — see the header. */
  const [query, setQuery] = useState("");
  const visibleSections = useMemo(
    () =>
      query.trim()
        ? draft.sections.filter((sec) => sectionMatches(sec.id, query))
        : draft.sections,
    [draft.sections, query],
  );
  useEffect(() => {
    if (!query.trim()) return;
    const first = visibleSections[0];
    if (first && !visibleSections.some((sec) => sec.id === openId)) setOpenId(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  /* A coach's edit marks the draft as the coach's again. Client mode writes
     through `draft.update` directly and marks it "client" itself. */
  const { update } = draft;
  const coachUpdate = useCallback(
    (next: SubjectiveAssessment) => update(next.enteredBy === "coach" ? next : { ...next, enteredBy: "coach" }),
    [update],
  );

  /* ---- the history, and what it says about each area ---------------- */
  const changeLog = draft.assessment.changeLog;
  const rows = useMemo(
    () => buildHistoryLog({ history: draft.history, draftId: draft.draftId, draftChangeLog: changeLog }),
    [draft.history, draft.draftId, changeLog],
  );
  const doneIds = useMemo(
    () => draft.sections.filter((s) => s.isDone).map((s) => s.id),
    [draft.sections],
  );
  const touches = useMemo(
    () =>
      sectionTouches({
        history: draft.history,
        draftChangeLog: changeLog,
        draftDoneIds: doneIds,
        draftSavedAtMs: draft.savedAt,
      }),
    [draft.history, changeLog, doneIds, draft.savedAt],
  );
  const nowMs = Date.now();
  const freshness = (id: string): Freshness => freshnessOf(id, touches, draft.history, nowMs);

  if (!client) return null;

  const first = clientFirstName(client);
  const pct = draft.totalSections
    ? Math.round((draft.doneCount / draft.totalSections) * 100)
    : 0;
  const started = relative(draft.startedAt);
  const saved = relative(draft.savedAt);
  const canFinalize = draft.hasDraft && draft.doneCount > 0;

  const last = lastUpdated(rows, draft.previous);
  const lastLine = last
    ? `Last updated ${last.hasTime ? formatStudioDateTime(last.at) : fmtDate(last.at)}${last.byName ? ` by ${last.byName}` : ""}`
    : draft.historyStatus === "error"
      ? "The saved history couldn't be loaded"
      : draft.historyStatus === "loading"
        ? null
        : "Nothing recorded yet";
  const clientOwn =
    draft.previous?.enteredBy === "client" && last && !last.hasTime
      ? " (client's own answers)"
      : "";
  const draftByClient = draft.hasDraft && draft.assessment.enteredBy === "client";

  const renderBody = (section: CheckInSectionState) => {
    const common = { value: draft.assessment, onChange: coachUpdate };
    if (section.id === "protein")
      return <ProteinCard {...common} bodyWeightLbs={draft.bodyWeightLbs} />;
    if (section.id === "hydration")
      return <HydrationCard {...common} bodyWeightLbs={draft.bodyWeightLbs} />;
    if (section.id === "pain")
      return (
        <PainMapCard
          {...common}
          previous={draft.previous}
          machines={machines}
          clientId={client.id}
        />
      );
    if (section.id === "stress")
      return <StressCard {...common} clientFirstName={first} />;

    const def = SUBJECTIVE_CATEGORIES.find((c) => c.key === section.id);
    if (!def) return null;
    return (
      <CategoryCard
        def={def}
        value={draft.assessment}
        onChange={coachUpdate}
        score={scoreCategory(def.key, draft.assessment.answers, draft.assessment.scaleVersion)}
        previousScore={
          draft.previous
            ? scoreCategory(
                def.key,
                draft.previous.assessment.answers,
                draft.previous.assessment.scaleVersion,
              )
            : null
        }
      />
    );
  };

  /** "9 of 12 · was 6", "No score yet". */
  const nowLine = (sectionId: string): string => {
    const unit = sectionScale(sectionId).unit;
    const now = measureSection(sectionId, draft.assessment, draft.reviewed, draft.baseline);
    const was = measureSection(sectionId, null, [], draft.baseline);
    if (now === null) return "No score yet";
    const moved =
      hasOwnValue(sectionId, draft.assessment, draft.reviewed) && was !== null && was !== now;
    return `${now} ${unit}${moved ? ` · was ${was}` : ""}`;
  };

  const groups = groupByPillar(visibleSections);

  const renderSection = (section: CheckInSectionState) => {
    const open = openId === section.id;
    const stale = freshness(section.id) === "stale";
    const latest = draft.hasDraft ? latestChangeFor(changeLog, section.id) : null;
    return (
      <li key={section.id}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`checkin-${section.id}`}
          onClick={() => setOpenId(open ? null : section.id)}
          className="sra-area-btn"
        >
          <StatusDot section={section} />
          <span className="min-w-0 flex-1">
            <span className="sra-area__title">
              {section.title}
              {stale && (
                <span
                  className="sra-stale"
                  title={`Not updated in over ${STALE_AFTER_DAYS} days`}
                  aria-label={`not updated in over ${STALE_AFTER_DAYS} days`}
                >
                  {STALE_AFTER_DAYS}+ days
                </span>
              )}
            </span>
            <span className="sra-area__now">{nowLine(section.id)}</span>
          </span>
          <ChevronDown className="sra-area__chev" data-open={open} aria-hidden />
        </button>

        {open && (
          <div id={`checkin-${section.id}`} className="sra-area__body">
            <ScaleEnds sectionId={section.id} />
            {renderBody(section)}
            {latest && (
              <JustChanged key={`${latest.categoryId}:${latest.at}`} change={latest} onNote={draft.setChangeNote} />
            )}
            {/* Pain and stress need this; the rest can use it to say
                "we talked, nothing moved". */}
            <button
              type="button"
              className="sra-reviewed"
              aria-pressed={section.isReviewed}
              onClick={() => draft.toggleReviewed(section.id)}
            >
              {section.isReviewed ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden /> Reviewed
                </>
              ) : (
                <>
                  <CircleDashed className="h-3.5 w-3.5" aria-hidden /> Mark reviewed
                </>
              )}
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <section id="client-check-in" className="sra" aria-label="Pulse">
      {/* ---------------------------- header ---------------------------- */}
      <div className="sra-head">
        <span className="sr-mark">
          <HeartPulse className="h-5 w-5" aria-hidden />
        </span>
        <div className="sra-head__text">
          <h3 className="sra-head__title">Pulse</h3>
          <p className="sra-living">How life is going — filled a little at a time, never done.</p>
          <p className="sra-head__meta">
            {draft.loading
              ? "Loading…"
              : [
                  lastLine && `${lastLine}${clientOwn}`,
                  draft.hasDraft
                    ? [
                        `${draft.doneCount} of ${draft.totalSections} areas in this round`,
                        draftByClient && `${first}'s own answers`,
                        started && `started ${started}`,
                        draft.saveState === "saving"
                          ? "saving…"
                          : draft.saveState === "error"
                            ? "not saved — retry an answer"
                            : saved && `saved ${saved}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : "Nothing open. Answer anything below and it starts saving.",
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </p>
        </div>

        <div className="sra-head__actions">
          {draft.hasDraft && (
            <span className="sra-progress" aria-label={`${pct}% of this round's areas updated`}>
              <span className="sra-progress__bar" aria-hidden>
                <span className="sra-progress__fill" style={{ width: `${pct}%` }} />
              </span>
              <span className="sra-progress__pct">{pct}%</span>
            </span>
          )}
          <button
            type="button"
            className="sra-hand"
            disabled={draft.loading}
            onClick={() => setClientMode(true)}
            title={`Hand the iPad to ${first}: they tap the words themselves`}
          >
            <Users className="h-4 w-4" aria-hidden /> Hand to client
          </button>
        </div>
      </div>

      <div className="sra-layout">
        <div className="min-w-0">
          {/* --------------------------- find an area ----------------------- */}
          <div className="sra-search">
            <Search className="sra-search__icon" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find an area — sleep, meals, knee, stress…"
              aria-label="Find a Pulse area"
              className="sra-search__input"
            />
            {query.trim() && visibleSections.length === 0 && (
              <p className="sra-search__none">No area matches "{query.trim()}". Try another word, or clear the box.</p>
            )}
          </div>

          {/* ------------------------- pillars + areas ---------------------- */}
          {groups.map(({ pillar, items }) => {
            if (!items.length) return null;
            const status = pillar
              ? pillarFreshnessSentence(pillarFreshness(pillar, freshness), draft.historyStatus)
              : null;
            return (
              <div key={pillar?.id ?? "other"} className="sra-pillar" data-pillar={pillar?.id ?? "other"}>
                <div className="sra-pillar__head">
                  <h4 className="sra-pillar__title">{pillar?.title ?? "Other"}</h4>
                  {pillar && <p className="sra-pillar__blurb">{pillar.blurb}</p>}
                  {status && <p className="sra-pillar__status">{status}</p>}
                </div>
                <ul className="sra-areas">{items.map(renderSection)}</ul>
              </div>
            );
          })}
        </div>

        {/* ---------------------------- history ---------------------------- */}
        <aside className="sra-layout__log">
          <AssessmentHistoryLog
            rows={rows}
            status={draft.historyStatus}
            complete={draft.history?.complete ?? true}
            onNote={(row, note) => draft.setChangeNote(row.sectionId, row.at, note)}
          />
        </aside>
      </div>

      {/* ---------------------------- footer ---------------------------- */}
      {draft.hasDraft && (
        <div className="sra-foot">
          {/* Two taps: this deletes answers that may represent several
              sessions of conversation, and it sits beside Save. */}
          {confirmDiscard ? (
            <span className="sra-foot__spacer">
              <span className="sra-foot__ask sra-foot__ask--danger">Delete this draft and its answers?</span>
              <button type="button" className="sra-btn" onClick={() => setConfirmDiscard(false)}>
                Keep
              </button>
              <button
                type="button"
                className="sra-btn sra-btn--danger"
                onClick={async () => {
                  await draft.discard();
                  setConfirmDiscard(false);
                  setOpenId(null);
                  autoOpened.current = false;
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Discard
              </button>
            </span>
          ) : (
            <span className="sra-foot__spacer">
              <button type="button" className="sra-btn sra-btn--quiet" onClick={() => setConfirmDiscard(true)}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Discard draft
              </button>
            </span>
          )}

          {confirmFinalize ? (
            <>
              <span className="sra-foot__ask">
                {draft.doneCount < draft.totalSections
                  ? `Save this round with ${draft.totalSections - draft.doneCount} area${
                      draft.totalSections - draft.doneCount === 1 ? "" : "s"
                    } not updated?`
                  : "Save this round to the history?"}
              </span>
              <button type="button" className="sra-btn" onClick={() => setConfirmFinalize(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="sra-btn sra-btn--primary"
                disabled={draft.finalizing}
                onClick={async () => {
                  const ok = await draft.finalize();
                  if (ok) {
                    setConfirmFinalize(false);
                    setOpenId(null);
                    autoOpened.current = false;
                  }
                }}
              >
                {draft.finalizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                Save this round
              </button>
            </>
          ) : (
            <button
              type="button"
              className="sra-btn sra-btn--outline"
              disabled={!canFinalize}
              onClick={() => setConfirmFinalize(true)}
            >
              <Check className="h-3.5 w-3.5" aria-hidden /> Save this round
            </button>
          )}
        </div>
      )}

      {/* ---------------------------- client mode ------------------------ */}
      {/* Never over a draft still loading: the client would be tapping onto
          a blank round that the loaded draft then replaces. The panel's own
          button is disabled until then; a host asking to start in client
          mode waits here for the same thing. */}
      <PulseClientMode
        open={clientMode && !draft.loading}
        client={client}
        assessment={draft.assessment}
        onUpdate={draft.update}
        onClose={closeClientMode}
      />
    </section>
  );
}
