/**
 * THE JOURNAL — one screen, three zones, read top to bottom the way a coach
 * actually approaches a client:
 *
 *   1. BEFORE YOU START  — critical notes only, and only if there are any.
 *   2. COACHING FOCUS    — what every coach is working on, with pass/extend.
 *   3. THE STREAM        — quick-add, then a date-grouped timeline, with the
 *                          filter rail and the progress-report shelf parked in
 *                          a sidebar on wide screens.
 *
 * On iPad portrait everything stacks into one column and the filter rail
 * becomes a horizontal chip bar; on landscape (xl) the sidebar splits off.
 */
import React, { useMemo, useState } from "react";
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

type WindowFilter = "7d" | "30d" | "90d" | "all";

const WINDOW_DAYS: Record<WindowFilter, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

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
}: ClientJournalTabProps) {
  const { success: toastSuccess, error: toastError } = useToast();

  const { entries, focuses, criticalEntries, isLoading, needsIndex } =
    useClientJournal({
      clientId,
      client,
      trainers,
      enabled: !hasQuotaError,
    });

  const [kindFilter, setKindFilter] = useState<JournalKind | "all">("all");
  const [coachFilter, setCoachFilter] = useState<string>("all");
  const [windowFilter, setWindowFilter] = useState<WindowFilter>("all");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [focusContext, setFocusContext] = useState<{ id: string; label: string } | null>(null);

  const author = useMemo(
    () => ({
      id: authTrainer?.id || "unknown",
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

  const handlePass = async (focus: ClientFocus) => {
    try {
      await setFocusStatus(focus.id, "passed");
      toastSuccess(`${focus.category} passed. Nice work.`);
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

  const handleCheckIn = (focus: ClientFocus) => {
    setFocusContext({ id: focus.id, label: `${focus.category} — ${focus.intent}` });
    document
      .getElementById("journal-composer")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  /* ------------------------------- filters ----------------------------- */

  const filterRail = (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search this journal…"
          className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-medium text-slate-700 outline-none focus:border-slate-400 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-200"
        />
      </div>

      <div>
        <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
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
          <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
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
        <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
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
          className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="h-3 w-3" /> Clear filters
        </button>
      )}
    </div>
  );

  /* -------------------------------- render ----------------------------- */

  return (
    <div className="space-y-5">
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        {/* ---------------------------- stream ---------------------------- */}
        <div className="min-w-0 space-y-4">
          {/* Composer first: the tab opens on the thing a trainer came to do —
              write the note while it is fresh. The critical strip is pinned
              directly beneath so "read this before you touch the client" is
              the first thing under the cursor, not something scrolled past.
              Both live in the stream column so the composer never stretches
              across the whole landscape screen. */}
          <div id="journal-composer">
            <JournalComposer
              clientFirstName={client?.firstName || ""}
              machines={machines}
              focusContext={focusContext}
              onClearFocusContext={() => setFocusContext(null)}
              onSubmit={handleCreate}
              disabled={!clientId}
            />
          </div>

          <CriticalStrip entries={criticalEntries} machines={machines} />

          <FocusBoard
            focuses={focuses}
            entries={entries}
            machines={machines}
            currentTrainerId={authTrainer?.id}
            onCreate={handleCreateFocus}
            onPass={handlePass}
            onExtend={handleExtend}
            onRetire={handleRetire}
            onCheckIn={handleCheckIn}
          />

          {/* Filter rail collapses into a toggle below xl. */}
          <div className="xl:hidden">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={cn(
                "inline-flex h-10 items-center gap-1.5 rounded-xl border px-3.5 text-[11px] font-black uppercase tracking-wider transition-colors",
                filtersActive
                  ? "border-[#F06C22]/30 bg-[#F06C22]/10 text-[#F06C22]"
                  : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400",
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
            <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Timeline
            </h3>
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
              {visible.length} of {entries.length}
            </span>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 py-16 text-slate-400 dark:border-slate-800">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs font-bold uppercase tracking-wider">Loading journal</span>
            </div>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-800">
              {entries.length === 0 ? (
                <>
                  <BookOpen className="mb-3 h-9 w-9 text-slate-300 dark:text-slate-700" />
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Nothing logged yet
                  </p>
                  <p className="mt-1 max-w-xs text-[11px] text-slate-400">
                    Write the first entry above. Consultation notes, incidents and
                    session notes from elsewhere in the app land here automatically.
                  </p>
                </>
              ) : (
                <>
                  <Clock className="mb-3 h-9 w-9 text-slate-300 dark:text-slate-700" />
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    No entries match these filters
                  </p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-3 h-10 rounded-xl border border-slate-200 px-4 text-[11px] font-black uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
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
                    <h4 className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
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

        {/* --------------------------- sidebar ---------------------------- */}
        <aside className="hidden min-w-0 space-y-4 xl:block">
          <div className="sticky top-4 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
              {filterRail}
            </div>
            <ReferenceShelf entries={referenceEntries} machines={machines} />
            <ProgressReportArchive
              reports={progressReports}
              onSelect={onSelectReport}
              onDelete={onDeleteReport}
              onNew={onNewReport}
            />
          </div>
        </aside>

        {/* Reference shelf and reports move below the stream on narrower screens. */}
        <div className="space-y-4 xl:hidden">
          <ReferenceShelf entries={referenceEntries} machines={machines} />
          <ProgressReportArchive
            reports={progressReports}
            onSelect={onSelectReport}
            onDelete={onDeleteReport}
            onNew={onNewReport}
          />
        </div>
      </div>
    </div>
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
          <span className="block font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Intake &amp; imported
          </span>
          <span className="block text-[11px] text-slate-400">
            {entries.length} read-only {entries.length === 1 ? "note" : "notes"}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
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
          : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400 dark:hover:bg-slate-800",
      )}
    >
      {children}
    </button>
  );
}
