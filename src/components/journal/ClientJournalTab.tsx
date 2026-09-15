/**
 * THE JOURNAL — a safety rail, then four named areas.
 *
 *   BEFORE YOU START     — critical notes only, and only if there are any.
 *                          Not an area: a rail, above everything, because it
 *                          must be read before the client is touched.
 *   1. PROGRESS REPORTS  — the shelf of finalized evaluations.
 *   2. CLIENT CHECK-IN   — the modular assessment, filled a piece at a time.
 *   3. FOCUS             — what each coach is working on, with pass/extend.
 *   4. NOTES             — quick-add, then the date-grouped timeline, with
 *                          the filter rail in a sidebar on wide screens.
 *
 * It used to be one column with the reports demoted to a sidebar card, and
 * nobody found them. Four titled bands and a sticky jump rail instead: a
 * 20-minute session has no time to scroll looking for the right one.
 *
 * On iPad portrait everything stacks into one column and the filter rail
 * becomes a horizontal chip bar; on landscape (xl) the sidebar splits off.
 *
 * SINCE THE PROFILE MERGE (Sep 2026) THIS IS NOT A TAB
 * ---------------------------------------------------
 * Details and Journal became one spine, and the four areas were dealt out to
 * three of its sections: Focus, Notes, and Reports (which holds the report
 * shelf and the assessment together). So this component is now mounted three
 * times, each with an `areas` list naming what to draw.
 *
 * Two things follow from that, and both are load-bearing:
 *
 *   - When `areas` is given, the internal jump nav and the critical-notes rail
 *     are NOT drawn. The spine has its own nav, and the snapshot bar already
 *     carries the critical count. Drawing either again would be the exact
 *     duplication the merge set out to remove. Mounted with no `areas` it is
 *     the original standalone tab, rail and all.
 *   - `journal` lets the caller pass an already-loaded useClientJournal result
 *     in. The dossier loads it once and hands the same object to all three
 *     mounts, so three sections of journal UI cost one set of listeners. Left
 *     out, the component loads its own — which is what the standalone tab and
 *     any future caller get for free.
 */
import React, { useMemo, useState } from "react";
import { auth } from "../../firebase";
import {
  BookOpen,
  ChevronDown,
  Clock,
  Filter,
  Loader2,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useToast } from "../../contexts/ToastContext";
import {
  archiveJournalEntry,
  createClientFocus,
  createJournalEntry,
  extendFocus,
  resolveJournalEntry,
  setFocusStatus,
  useClientJournal,
  type UseClientJournalResult,
} from "../../hooks/useClientJournal";
import {
  COMPOSER_KINDS,
  dateBucket,
  getEntryVisual,
  toDate,
  type ClientFocus,
  type JournalDraft,
  type JournalEntry,
  type JournalKind,
} from "../../types/journal";
import type {
  Client,
  Machine,
  ProgressReport,
  Trainer,
} from "../../types";
import { CriticalStrip } from "./CriticalStrip";
import { FocusBoard } from "./FocusBoard";
import { JournalComposer } from "./JournalComposer";
import { JournalEntryCard } from "./JournalEntryCard";
import { ProgressReportArchive } from "./ProgressReportArchive";
import { ClientCheckInPanel } from "./ClientCheckInPanel";

type WindowFilter = "7d" | "30d" | "90d" | "all";

const WINDOW_DAYS: Record<WindowFilter, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

/** The four areas, by id. */
export type JournalAreaId = "progress-reports" | "check-in" | "focus" | "notes";

export interface ClientJournalTabProps {
  clientId: string | null;
  client: Client | null;
  machines: Machine[];
  trainers: Trainer[];
  authTrainer?: Trainer | null;
  progressReports: ProgressReport[];
  onSelectReport: (id: string) => void;
  onDeleteReport: (report: ProgressReport) => void;
  onNewReport: () => void;
  hasQuotaError?: boolean;
  /**
   * Which areas to draw. Omit for all four plus the jump nav and the critical
   * rail — the original standalone tab. Give it a subset and those two
   * chrome pieces are suppressed, because whoever is composing the areas owns
   * the navigation. See the header.
   */
  areas?: JournalAreaId[];
  /** An already-loaded journal, so several mounts share one set of listeners. */
  journal?: UseClientJournalResult;
}

export function ClientJournalTab({
  clientId,
  client,
  machines,
  trainers,
  authTrainer,
  progressReports,
  onSelectReport,
  onDeleteReport,
  onNewReport,
  hasQuotaError,
  areas,
  journal,
}: ClientJournalTabProps) {
  const { success: toastSuccess, error: toastError } = useToast();

  // Hooks cannot be called conditionally, so when a journal is handed in the
  // internal one is disabled rather than skipped. A disabled useClientJournal
  // opens no listeners, so this costs nothing but a few empty arrays.
  const ownJournal = useClientJournal({
    clientId,
    client,
    trainers,
    enabled: !hasQuotaError && !journal,
  });
  const { entries, focuses, criticalEntries, isLoading, needsIndex, capped } =
    journal ?? ownJournal;

  /** Composed into a spine? Then the caller owns the nav and the rail. */
  const composed = Boolean(areas);
  const shows = (id: JournalAreaId) => !areas || areas.includes(id);

  const [kindFilter, setKindFilter] = useState<JournalKind | "all">("all");
  const [coachFilter, setCoachFilter] = useState<string>("all");
  const [windowFilter, setWindowFilter] = useState<WindowFilter>("all");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const author = useMemo(
    () => ({
      // The Auth uid: the journalEntries rule pins authorId to it, and it
      // differs from authTrainer.id on older accounts.
      id: auth.currentUser?.uid || authTrainer?.id || "unknown",
      initials: (authTrainer?.initials || "TR").toUpperCase(),
      fullName: authTrainer?.fullName || "Coach",
    }),
    [authTrainer],
  );

  /** Coaches who have actually written something here, for the coach filter. */
  const coaches = useMemo(() => {
    const map = new Map<string, { id: string; initials: string; name: string; count: number }>();
    entries.forEach((e) => {
      if (!e.authorId || e.authorId === "unknown") return;
      const existing = map.get(e.authorId);
      if (existing) existing.count += 1;
      else
        map.set(e.authorId, {
          id: e.authorId,
          initials: e.authorInitials,
          name: e.authorName,
          count: 1,
        });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [entries]);

  /** All filtering happens in memory over the loaded window — instant, no reads. */
  const visible = useMemo(() => {
    const days = WINDOW_DAYS[windowFilter];
    const cutoff = days ? Date.now() - days * 86400000 : null;
    const needle = search.trim().toLowerCase();

    return entries.filter((e) => {
      if (kindFilter !== "all" && e.kind !== kindFilter) return false;
      if (coachFilter !== "all" && e.authorId !== coachFilter) return false;
      if (cutoff) {
        const t = toDate(e.occurredAt)?.getTime() ?? 0;
        if (t < cutoff) return false;
      }
      if (needle) {
        const hay = `${e.body} ${e.category ?? ""} ${e.authorInitials} ${e.legacySource ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [entries, kindFilter, coachFilter, windowFilter, search]);

  /** Date buckets, preserving the newest-first order the stream arrives in. */
  const grouped = useMemo(() => {
    const buckets: { label: string; items: JournalEntry[] }[] = [];
    visible.forEach((e) => {
      const label = dateBucket(toDate(e.occurredAt));
      const last = buckets[buckets.length - 1];
      if (last && last.label === label) last.items.push(e);
      else buckets.push({ label, items: [e] });
    });
    return buckets;
  }, [visible]);

  /**
   * Intake material — Mindbody's imported account notes, the consultation
   * wizard's discovery notes. Chronologically these sit at the very start of
   * the client's history, so the stream alone would bury them. They are pinned
   * to a reference shelf as well, which is the difference between the Journal
   * being a timeline and it being the hub the brief asks for.
   */
  const referenceEntries = useMemo(
    () => entries.filter((e) => e.kind === "consultation"),
    [entries],
  );

  const filtersActive =
    kindFilter !== "all" || coachFilter !== "all" || windowFilter !== "all" || !!search.trim();

  const clearFilters = () => {
    setKindFilter("all");
    setCoachFilter("all");
    setWindowFilter("all");
    setSearch("");
  };

  /* ------------------------------ actions ------------------------------ */

  const handleCreate = async (draft: JournalDraft) => {
    if (!clientId) return;
    try {
      await createJournalEntry(clientId, client?.homeStudioId || "", author, draft);
      toastSuccess(draft.focusId ? "Check-in logged." : "Journal entry saved.");
    } catch {
      toastError("Could not save that entry. Check your connection and try again.");
    }
  };

  const handleArchive = async (entry: JournalEntry) => {
    try {
      await archiveJournalEntry(entry.id);
      toastSuccess("Entry archived.");
    } catch {
      toastError("Could not archive that entry.");
    }
  };

  const handleResolve = async (entry: JournalEntry, resolved: boolean) => {
    try {
      await resolveJournalEntry(entry.id, resolved);
      toastSuccess(resolved ? "Marked resolved." : "Reopened.");
    } catch {
      toastError("Could not update that entry.");
    }
  };

  const handleCreateFocus = async (input: {
    category: any;
    intent: string;
    targetMachineId: string | null;
  }) => {
    if (!clientId) return;
    try {
      await createClientFocus(clientId, client?.homeStudioId || "", author, input);
      toastSuccess(`Focus set: ${input.category}.`);
    } catch {
      toastError("Could not set that focus.");
    }
  };

  const handleAchieve = async (focus: ClientFocus, rewardNote: string) => {
    try {
      await setFocusStatus(focus.id, "passed", { rewardNote });
      toastSuccess(`${focus.category} focus achieved. Nice work.`);
    } catch {
      toastError("Could not update that focus.");
    }
  };

  const handleExtend = async (focus: ClientFocus) => {
    try {
      await extendFocus(focus.id);
      toastSuccess("Focus extended by three weeks.");
    } catch {
      toastError("Could not extend that focus.");
    }
  };

  const handleRetire = async (focus: ClientFocus) => {
    try {
      await setFocusStatus(focus.id, "retired");
      toastSuccess("Focus retired.");
    } catch {
      toastError("Could not retire that focus.");
    }
  };

  /**
   * A check-in is filed right here, from the focus card, carrying the focus
   * id. It used to set state in THIS mount and scroll to the composer in the
   * Notes mount — a different component instance that never saw the focus —
   * so the note saved without `focusId` and the thread stayed empty.
   */
  const handleCheckIn = async (focus: ClientFocus, body: string): Promise<boolean> => {
    if (!clientId || !body.trim()) return false;
    try {
      await createJournalEntry(clientId, client?.homeStudioId || "", author, {
        kind: "coaching",
        category: focus.category,
        body: body.trim(),
        importance: "standard",
        machineId: focus.targetMachineId ?? null,
        focusId: focus.id,
        origin: "manual",
      });
      toastSuccess("Check-in logged.");
      return true;
    } catch {
      toastError("Could not save that check-in. Check your connection and try again.");
      return false;
    }
  };

  /** Every id the signed-in coach may be stored under on a focus. */
  const viewerIds = useMemo(
    () =>
      [auth.currentUser?.uid, authTrainer?.id].filter(
        (v): v is string => typeof v === "string" && v.length > 0,
      ),
    [authTrainer],
  );

  /* ------------------------------- filters ----------------------------- */

  const filterRail = (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search this journal…"
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-medium text-slate-700 outline-none focus:border-slate-400 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200"
        />
      </div>

      <div>
        <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Type
        </p>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip on={kindFilter === "all"} onClick={() => setKindFilter("all")}>
            All
          </FilterChip>
          {COMPOSER_KINDS.map(({ kind, label }) => {
            const v = getEntryVisual(kind, kind === "coaching" ? "Posture" : null);
            return (
              <FilterChip
                key={kind}
                on={kindFilter === kind}
                onClick={() => setKindFilter(kindFilter === kind ? "all" : kind)}
                activeClass={v.chip}
              >
                {label}
              </FilterChip>
            );
          })}
          <FilterChip
            on={kindFilter === "consultation"}
            onClick={() =>
              setKindFilter(kindFilter === "consultation" ? "all" : "consultation")
            }
          >
            Consult
          </FilterChip>
        </div>
      </div>

      {coaches.length > 1 && (
        <div>
          <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Coach
          </p>
          <div className="flex flex-wrap gap-1.5">
            <FilterChip on={coachFilter === "all"} onClick={() => setCoachFilter("all")}>
              All
            </FilterChip>
            {coaches.map((c) => (
              <FilterChip
                key={c.id}
                on={coachFilter === c.id}
                onClick={() => setCoachFilter(coachFilter === c.id ? "all" : c.id)}
                title={`${c.name} · ${c.count} entries`}
              >
                {c.initials}
              </FilterChip>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          When
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(["7d", "30d", "90d", "all"] as WindowFilter[]).map((w) => (
            <FilterChip key={w} on={windowFilter === w} onClick={() => setWindowFilter(w)}>
              {w === "all" ? "All time" : w}
            </FilterChip>
          ))}
        </div>
      </div>

      {filtersActive && (
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="h-3 w-3" /> Clear filters
        </button>
      )}
    </div>
  );

  /* -------------------------------- render ----------------------------- */

  return (
    <div className="space-y-6">
      {capped && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            This record is unusually large: one of its collections has more than
            200 items, and only the first 200 are loaded. Counts on this page may
            run short.
          </span>
        </div>
      )}
      {needsIndex && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-snug text-amber-700 dark:text-amber-300">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Reading the journal unsorted because its Firestore index has not been
            deployed yet. Entries are sorted in the browser instead, so nothing is
            missing. Run{" "}
            <code className="rounded bg-amber-500/15 px-1 font-mono">
              firebase deploy --only firestore:indexes
            </code>{" "}
            to switch to the fast path.
          </span>
        </div>
      )}

      {/* Before you start. Not one of the four areas: it is a safety rail,
          and it stays above them because a critical note is the one thing
          that must be read before the client is touched. In the spine the
          snapshot bar carries this instead. */}
      {!composed && <CriticalStrip entries={criticalEntries} machines={machines} />}

      {/* The four areas, and a rail to jump between them. A 20-minute
          session does not have time to scroll looking for the right one. */}
      {!composed && (
      <nav
        aria-label="Journal areas"
        className="sticky top-0 z-20 -mx-2 flex gap-1.5 overflow-x-auto border-b border-slate-200 bg-slate-50/95 px-2 py-2 backdrop-blur-sm no-scrollbar dark:border-slate-800 dark:bg-slate-950/95"
      >
        {JOURNAL_AREAS.map((area) => (
          <a
            key={area.id}
            href={`#${area.id}`}
            className="shrink-0 rounded-xl border border-slate-200 bg-card px-3 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground transition-colors hover:border-[#F06C22]/40 hover:text-[#F06C22] dark:border-slate-800"
          >
            {area.label}
          </a>
        ))}
      </nav>
      )}

      {/* ------------------ 1 · CLIENT PROGRESS REPORTS ------------------ */}
      {shows("progress-reports") && (
      <JournalArea
        id="progress-reports"
        bare={composed}
        title="Client Progress Reports"
        blurb="Finalized evaluations, newest first. The shelf a coach reads before a review conversation."
      >
        <ProgressReportArchive
          reports={progressReports}
          onSelect={onSelectReport}
          onDelete={onDeleteReport}
          onNew={onNewReport}
        />
      </JournalArea>
      )}

      {/* ----------------------- 2 · ASSESSMENT -------------------------- */}
      {shows("check-in") && (
      <JournalArea
        id="check-in"
        bare={false}
        title="Assessment"
        blurb="A living record, filled in a piece at a time and saved as you go. Open one topic, answer it, come back next session."
      >
        <ClientCheckInPanel client={client} trainer={authTrainer ?? null} machines={machines} />
      </JournalArea>
      )}

      {/* ---------------------------- 3 · FOCUS -------------------------- */}
      {shows("focus") && (
      <JournalArea
        id="focus"
        bare={composed}
        title="Focus"
        blurb="What each coach is working on with this client, and whether it was achieved."
      >
        <FocusBoard
          focuses={focuses}
          entries={entries}
          machines={machines}
          viewerIds={viewerIds}
          viewerRole={authTrainer?.role ?? null}
          onCreate={handleCreateFocus}
          onAchieve={handleAchieve}
          onExtend={handleExtend}
          onRetire={handleRetire}
          onCheckIn={handleCheckIn}
        />
      </JournalArea>
      )}

      {/* ---------------------------- 4 · NOTES -------------------------- */}
      {shows("notes") && (
      <JournalArea
        id="notes"
        bare={composed}
        title="Notes"
        blurb="Everything logged about this client, newest first. Write it while it is fresh."
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-4">
            <div id="journal-composer">
              <JournalComposer
                clientFirstName={client?.firstName || ""}
                machines={machines}
                onSubmit={handleCreate}
                disabled={!clientId}
              />
            </div>

            {/* Filter rail collapses into a toggle below xl. */}
            <div className="xl:hidden">
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-[11px] font-black uppercase tracking-wider transition-colors",
                  filtersActive
                    ? "border-[#F06C22]/30 bg-[#F06C22]/10 text-[#F06C22]"
                    : "border-slate-200 bg-slate-50 text-muted-foreground dark:border-slate-800 dark:bg-slate-800/40",
                )}
              >
                <Filter className="h-3.5 w-3.5" />
                Filters
                {filtersActive && <span className="ml-0.5">· on</span>}
              </button>
              {showFilters && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
                  {filterRail}
                </div>
              )}
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <h4 className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Timeline
              </h4>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {visible.length} of {entries.length}
              </span>
            </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 py-16 text-muted-foreground dark:border-slate-800">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs font-bold uppercase tracking-wider">Loading journal</span>
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-800">
            {entries.length === 0 ? (
              <>
                <BookOpen className="mb-3 h-9 w-9 text-slate-300 dark:text-slate-700" />
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Nothing logged yet
                </p>
                <p className="mt-1 max-w-xs text-[11px] text-muted-foreground">
                  Write the first entry above. Consultation notes, incidents and
                  session notes from elsewhere in the app land here automatically.
                </p>
              </>
            ) : (
              <>
                <Clock className="mb-3 h-9 w-9 text-slate-300 dark:text-slate-700" />
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  No entries match these filters
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 h-10 rounded-xl border border-border px-4 text-[11px] font-black uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map((group) => (
              <section key={group.label}>
                <div className="mb-2 flex items-center gap-3">
                  <h4 className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                    {group.label}
                  </h4>
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                  <span className="font-mono text-[10px] text-slate-300 dark:text-slate-600">
                    {group.items.length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {group.items.map((entry) => (
                    <JournalEntryCard
                      key={entry.id}
                      entry={entry}
                      machines={machines}
                      onArchive={entry.isLegacy ? undefined : handleArchive}
                      onResolve={entry.isLegacy ? undefined : handleResolve}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

          </div>

          <aside className="hidden min-w-0 space-y-4 xl:block">
            <div className="sticky top-16 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
                {filterRail}
              </div>
              <ReferenceShelf entries={referenceEntries} machines={machines} />
            </div>
          </aside>

          <div className="xl:hidden">
            <ReferenceShelf entries={referenceEntries} machines={machines} />
          </div>
        </div>
      </JournalArea>
      )}
    </div>
  );
}

const JOURNAL_AREAS = [
  { id: "progress-reports", label: "Reports" },
  { id: "check-in", label: "Assessment" },
  { id: "focus", label: "Focus" },
  { id: "notes", label: "Notes" },
] as const;

/**
 * One of the four areas. A titled band with a one-line brief, so the tab
 * reads as four rooms rather than one long column of cards — which is what
 * it was, and why nobody could find the reports.
 */
function JournalArea({
  id,
  title,
  blurb,
  bare = false,
  children,
}: {
  id: string;
  title: string;
  blurb: string;
  /** Inside the profile spine the section shell already printed a heading. */
  bare?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16">
      {!bare && (
        <>
          <div className="mb-3 flex items-baseline gap-3">
            <h3 className="font-display text-lg font-black uppercase italic tracking-tight text-foreground">
              {title}
            </h3>
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>
          <p className="mb-3 text-[11px] font-medium text-muted-foreground">{blurb}</p>
        </>
      )}
      {children}
    </section>
  );
}

/**
 * Always-available intake material. Collapsed by default: it is reference, not
 * news, and a coach opens it when onboarding themselves to a client rather
 * than before every session.
 */
function ReferenceShelf({
  entries,
  machines,
}: {
  entries: JournalEntry[];
  machines: Machine[];
}) {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span>
          <span className="block font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Intake &amp; imported
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {entries.length} read-only {entries.length === 1 ? "note" : "notes"}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {entries.map((e) => (
            <JournalEntryCard key={e.id} entry={e} machines={machines} dense />
          ))}
        </div>
      )}
    </section>
  );
}

function FilterChip({
  on,
  onClick,
  children,
  activeClass,
  title,
}: {
  key?: React.Key;
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  activeClass?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "h-10 rounded-xl border px-3 text-[11px] font-black uppercase tracking-wider transition-all",
        on
          ? activeClass ||
              "border-[#F06C22]/30 bg-[#F06C22]/10 text-[#F06C22]"
          : "border-slate-200 bg-slate-50 text-muted-foreground hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800",
      )}
    >
      {children}
    </button>
  );
}
