/**
 * CLIENT CHECK-IN — the Assessment on screen: a living record, updated a
 * piece at a time between and during sessions.
 *
 * It used to be a full-screen sheet with twelve topics in it, opened from
 * the briefing and expected to be finished in one sitting. Nobody has that
 * sitting. A coach has ninety seconds while the client works the lumbar
 * machine, and what they want to do with it is tick hydration and get back
 * on the floor.
 *
 * So this is a persistent panel over a draft that lives between sessions:
 * one topic open at a time, every edit autosaved, and a progress line that
 * says exactly how much is left. Pain and stress need an explicit "nothing
 * to report" because an empty list cannot otherwise be told apart from a
 * conversation that never happened.
 *
 * ASSESSMENT ROUND (Sep 2026) — the owner's audit:
 *  - The twelve areas are grouped into three pillars (Recovery & Fuel,
 *    Physical & Functional, Psychological & Behavioral), each with a line
 *    saying how many of its areas were updated in the last 90 days.
 *  - Every area shows what its two ends mean, in the question bank's words.
 *  - An area untouched for 90+ days carries a quiet marker.
 *  - The ASSESSMENT HISTORY LOG sits on the same screen: every change, was →
 *    now, when, who, and the note attached at the time. Nothing is
 *    overwritten any more (assessment-history.ts).
 *  - Every hook runs before the "no client" return. The search box's state
 *    and effect used to sit below it, which is a rules-of-hooks crash the
 *    moment the client goes from null to set.
 *
 * Props are unchanged: the profile's Assessment section and the Active
 * Session's slide-over both mount it as before.
 */
import { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { cn } from "../../lib/utils";
import { sectionMatches } from "../../features/subjective-report/search";
import { fmtDate } from "../../features/subjective-report/ui";
import { formatStudioDateTime } from "../../lib/studio-time";
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
import type { AssessmentChange } from "../../features/subjective-report/types";

export interface ClientCheckInPanelProps {
  client: Client | null;
  trainer: Trainer | null;
  machines: Machine[];
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
    return <CircleCheck className="h-4 w-4 shrink-0 text-emerald-500" aria-label="answered" />;
  if (section.isReviewed)
    return <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-label="reviewed, nothing to report" />;
  if (section.isPartial)
    return <CircleAlert className="h-4 w-4 shrink-0 text-amber-500" aria-label="part answered" />;
  return <CircleDashed className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-label="not started" />;
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
 * scale down under a finger that is still tapping.
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

export function ClientCheckInPanel({ client, trainer, machines }: ClientCheckInPanelProps) {
  const draft = useCheckInDraft({ client, trainer, machines });
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
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
        : "Not assessed yet";
  const clientOwn =
    draft.previous?.enteredBy === "client" && last && !last.hasTime
      ? " (client's own answers)"
      : "";

  const renderBody = (section: CheckInSectionState) => {
    const common = { value: draft.assessment, onChange: draft.update };
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
      return <StressCard {...common} clientFirstName={client.firstName || ""} />;

    const def = SUBJECTIVE_CATEGORIES.find((c) => c.key === section.id);
    if (!def) return null;
    return (
      <CategoryCard
        def={def}
        value={draft.assessment}
        onChange={draft.update}
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
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>

        {open && (
          <div id={`checkin-${section.id}`} className="px-4 pb-4">
            <ScaleEnds sectionId={section.id} />
            {renderBody(section)}
            {latest && (
              <JustChanged key={`${latest.categoryId}:${latest.at}`} change={latest} onNote={draft.setChangeNote} />
            )}
            {/* Pain and stress need this; the rest can use it to say
                "we talked, nothing moved". */}
            <button
              type="button"
              onClick={() => draft.toggleReviewed(section.id)}
              className={cn(
                "mt-3 inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-black uppercase tracking-wider transition-colors",
                section.isReviewed
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "border-border bg-slate-50 text-muted-foreground hover:bg-slate-100 dark:bg-slate-800/50",
              )}
            >
              {section.isReviewed ? (
                <>
                  <Check className="h-3 w-3" /> Reviewed
                </>
              ) : (
                <>
                  <CircleDashed className="h-3 w-3" /> Mark reviewed
                </>
              )}
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <section
      id="client-check-in"
      className="sra rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/70"
      aria-label="Assessment"
    >
      {/* ---------------------------- header ---------------------------- */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-cta/25 bg-cta/10 text-cta">
          <HeartPulse className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-black uppercase italic tracking-tight text-foreground">
            Assessment
          </h3>
          <p className="sra-living">
            A living assessment, not a one-time questionnaire. Update a little at a time —
            before, during or after a session. It is never finished.
          </p>
          <p className="mt-1 text-[11px] font-medium text-muted-foreground">
            {draft.loading
              ? "Loading…"
              : [
                  lastLine && `${lastLine}${clientOwn}`,
                  draft.hasDraft
                    ? [
                        `${draft.doneCount} of ${draft.totalSections} areas in this round`,
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

        {draft.hasDraft && (
          <div className="flex items-center gap-2">
            <span className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-slate-200 sm:block dark:bg-slate-800">
              <span
                className="block h-full rounded-full bg-cta transition-[width] duration-500"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="text-[11px] font-black tabular-nums text-muted-foreground">
              {pct}%
            </span>
          </div>
        )}
      </div>

      <div className="sra-layout">
        <div className="min-w-0">
          {/* --------------------------- find an area ----------------------- */}
          <div className="relative border-b border-slate-200 px-4 py-2 dark:border-slate-800">
            <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find an area — sleep, meals, knee, stress…"
              aria-label="Find an assessment area"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-cta focus:outline-none dark:border-slate-800 dark:bg-slate-800/50"
            />
            {query.trim() && visibleSections.length === 0 && (
              <p className="mt-2 text-[12px] text-muted-foreground">No area matches "{query.trim()}". Try another word, or clear the box.</p>
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
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {items.map(renderSection)}
                </ul>
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
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          {/* Two taps: this deletes answers that may represent several
              sessions of conversation, and it sits beside Finish. */}
          {confirmDiscard ? (
            <span className="mr-auto flex items-center gap-2">
              <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
                Delete this draft and its answers?
              </span>
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="h-10 rounded-xl border border-border px-3 text-[10px] font-black uppercase tracking-wider text-slate-500"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={async () => {
                  await draft.discard();
                  setConfirmDiscard(false);
                  setOpenId(null);
                  autoOpened.current = false;
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 text-[10px] font-black uppercase tracking-wider text-red-600 dark:text-red-400"
              >
                <RotateCcw className="h-3 w-3" /> Discard
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDiscard(true)}
              className="mr-auto inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            >
              <RotateCcw className="h-3 w-3" /> Discard draft
            </button>
          )}

          {confirmFinalize ? (
            <>
              <span className="text-[11px] font-medium text-muted-foreground">
                {draft.doneCount < draft.totalSections
                  ? `Save this round with ${draft.totalSections - draft.doneCount} area${
                      draft.totalSections - draft.doneCount === 1 ? "" : "s"
                    } not updated?`
                  : "Save this round to the history?"}
              </span>
              <button
                type="button"
                onClick={() => setConfirmFinalize(false)}
                className="h-10 rounded-xl border border-border px-3 text-[10px] font-black uppercase tracking-wider text-slate-500"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={draft.finalizing}
                onClick={async () => {
                  const ok = await draft.finalize();
                  if (ok) {
                    setConfirmFinalize(false);
                    setOpenId(null);
                    autoOpened.current = false;
                  }
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-cta-strong px-4 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:brightness-105 disabled:opacity-60"
              >
                {draft.finalizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Save assessment
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={!canFinalize}
              onClick={() => setConfirmFinalize(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-cta/40 bg-cta/10 px-4 text-[10px] font-black uppercase tracking-wider text-cta-strong transition-colors hover:bg-cta/20 disabled:opacity-40 dark:text-cta"
            >
              <Check className="h-3 w-3" /> Save assessment
            </button>
          )}
        </div>
      )}
    </section>
  );
}
