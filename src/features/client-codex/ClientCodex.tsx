/**
 * THE CLIENT CODEX — the Notes & Profile tab as seven pages.
 *
 * Client codex, Sep 2026. The tab was one long scroll (ClientInfoSheet →
 * ClientDossier): eight sections, a jump rail, a scroll spy and a snapshot
 * bar, with one critical note drawn up to four times. It is now an Overview
 * and six pages — Overview · Notes · FORD · Body & Pulse · Goals & Focus ·
 * Story · Account (AJ's order) — switched by the profile's own sub-toggle.
 * This is the shell; each page is its area's.
 *
 * WHERE THE TRAINER IS lives in the profile's one navigation reducer
 * (profile-nav.ts): the page and, optionally, a card on it (an anchor from
 * RECORD_ANCHORS). The shell keeps no copy: it gets `page` and `anchor` as
 * props and asks `onNavigate` to move. Entering the tab always opens the
 * Overview (AJ's decision 1).
 *
 * WHAT MOUNTS WHEN. The Overview mounts with the tab. Every other page mounts
 * the first time it is visited and then STAYS mounted, hidden, for as long as
 * this client's profile is open — the All Machines and Trends precedent
 * (KNOWN-TRAPS → The client profile). So a page's own reads (Goals' shared
 * notes, the Pulse draft) cost nothing until someone opens it, switching
 * back costs no fetch, and a composer, an open editor or an unsaved edit
 * survives a page switch. Every panel is in the page from the start, empty
 * until visited, so the sub-toggle's `aria-controls` always points at one.
 *
 * ONE LOAD, ONE FORM, ONE SAVE BAR. `useCodexData` opens the journal, FORD,
 * the InBody scans and the dismissals once for the whole tab; `useRecordForm`
 * holds every record field any page edits; the Save bar at the bottom says
 * how many are unsaved and where ("1 unsaved change · FORD · Occupation"),
 * with Show, Discard and Save changes. A reader who may not change the
 * record (a cross-train studio) gets the pages read only and no Save bar.
 *
 * THE CRITICAL LINE (Notes' `CriticalLine`) sits under the bar on every page
 * but the Overview and Notes, which draw the critical note themselves.
 *
 * MOVING. A page change with an anchor scrolls that card under the sticky
 * bar; without one, the new page starts right under the bar if the bar is
 * stuck, and nothing moves if it is not (the header is never yanked away).
 * Notes' own anchors (`notes-*`, `note-{id}`) are Notes' to interpret: the
 * shell hands them to the Notes page as a one-shot request (`notesIntentOf`),
 * which opens the thread, the composer or Resolved and brings it into view. A tap
 * on a neighbour, a Next card or Show moves focus to the new page's title;
 * the sub-toggle keeps its own focus. Everything in the layout effect is
 * feature-detected — a throw there takes the whole profile down.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Client, Machine, ProgressReport, Trainer } from "../../types";
import type { HistoryCoverage } from "../../lib/prior-history";
import { ProfileSubnav } from "../client-profile/ProfileSubnav";
import { scrollParentOf } from "../client-profile/use-scroller-pad";
import {
  RECORD_PAGES,
  isRecordAnchor,
  noteAnchor,
  type RecordAnchor,
  type RecordPage,
} from "../client-profile/profile-nav";
import type { ProgressReportsStatus } from "../client-profile/client-answer";
import { CriticalLine } from "../client-notes/CriticalLine";
import { comingUp } from "../ford/coming-up";
import { notesIntentOf } from "../client-notes/notes-intent";
import { SaveBar } from "./kit";
import { readOnlyLine } from "./access";
import { useCodexData } from "./useCodexData";
import { useRecordForm } from "./useRecordForm";
import { subnavItems } from "./page-meta";
import {
  fordCountOf,
  type CodexHosts,
  type CodexPageProps,
  type CodexProgramming,
  type SessionTotals,
} from "./codex-data";
import { newestPulseDay } from "./body/page-lines";
import { storyTabHint } from "../client-story/story";
import { OverviewPage } from "./pages/OverviewPage";
import { NotesPage } from "./pages/NotesPage";
import { FordPage } from "./pages/FordPage";
import { BodyPage } from "./pages/BodyPage";
import { GoalsPage } from "./pages/GoalsPage";
import { StoryPage } from "./pages/StoryPage";
import { AccountPage } from "./pages/AccountPage";
import "./codex.css";

export interface ClientCodexProps {
  client: Client;
  authTrainer: Trainer | null;
  /** The signed-in trainer as the trainers stream has them now (sees the grant live). */
  liveTrainer: Trainer | null;
  machines: Machine[];
  trainers: Trainer[];
  /** The page the nav is on (useProfileNav().recordPage). */
  page: RecordPage;
  /** The card a door asked for, if any (useProfileNav().recordAnchor). */
  anchor?: RecordAnchor;
  /**
   * The nav's location object. A new one on every move — including a second
   * "Show" to the same card — is what re-runs the scroll.
   */
  navStamp: unknown;
  /** Whether the tab is showing. Nothing is scrolled or focused while it is hidden. */
  active: boolean;
  onNavigate: (page: RecordPage, anchor?: RecordAnchor) => void;
  /** The profile's progress-reports listener (limit 50, newest first) and its state. */
  progressReports: ProgressReport[];
  progressReportsStatus: ProgressReportsStatus;
  sessionTotals: SessionTotals;
  coverage: HistoryCoverage;
  hosts: CodexHosts;
  /**
   * Her machine settings and routines, the studio roster and the studio the
   * iPad is at — what the profile already holds for Programming. Body &
   * Pulse's floor reads them; left out, it has her notes only.
   */
  programming?: CodexProgramming;
}

/** Notes interprets its own anchors (the composer, one thread); the shell leaves them be. */
const isNotesAnchor = (anchor: string) => anchor.startsWith("notes-") || anchor.startsWith("note-");

/**
 * Put the page's top right under the sticky bar — but only if the bar is
 * stuck (the codex's top has scrolled above the scroller's). Otherwise the
 * header is on screen and nothing should move.
 */
function alignPageTop(root: HTMLElement): void {
  const scroller = scrollParentOf(root);
  if (!scroller) return;
  const delta = root.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  if (delta < 0) scroller.scrollTop += delta;
}

export function ClientCodex({
  client,
  authTrainer,
  liveTrainer,
  machines,
  trainers,
  page,
  anchor,
  navStamp,
  active,
  onNavigate,
  progressReports,
  progressReportsStatus,
  sessionTotals,
  coverage,
  hosts,
  programming,
}: ClientCodexProps) {
  const data = useCodexData({
    client,
    authTrainer,
    liveTrainer,
    machines,
    trainers,
    progressReports,
    progressReportsStatus,
    sessionTotals,
    coverage,
    programming,
  });
  const { access, journal, notes } = data;
  const form = useRecordForm({
    client,
    canEdit: access.canEdit,
    trainerId: authTrainer?.id ?? null,
    homeStudioName: access.homeStudioName,
  });

  /*
   * Pages mount on first visit and stay. Worked out during render (not in an
   * effect), so the page a door opens is in the DOM by the time the layout
   * effect below scrolls to its card.
   */
  const [visited, setVisited] = useState<ReadonlySet<RecordPage>>(() => new Set<RecordPage>(["overview", page]));
  let mounted = visited;
  if (!visited.has(page)) {
    mounted = new Set([...visited, page]);
    setVisited(mounted);
  }

  const focusTitle = useRef(false);
  /** A move made from inside a page (a neighbour, a Next card, Show, a door). */
  const go = useCallback(
    (to: RecordPage, at?: RecordAnchor) => {
      focusTitle.current = !at;
      onNavigate(to, at);
    },
    [onNavigate],
  );
  const onTab = useCallback((to: RecordPage) => onNavigate(to), [onNavigate]);
  const openThread = useCallback(
    (threadId: string) => {
      const at = noteAnchor(threadId);
      go("notes", isRecordAnchor(at) ? at : undefined);
    },
    [go],
  );

  const items = useMemo(() => {
    const ready = data.fordStatus === "ready";
    return subnavItems({
      client,
      notes: { state: notes.state, summary: notes.summary },
      focuses: { state: journal.loadState?.focuses ?? "loading", running: data.focusesRunning },
      ford: {
        status: data.fordStatus,
        // Everything the FORD page shows: its details and the older life notes.
        count: fordCountOf({ readable: access.fordReadable, ford: data.ford, client }, notes),
        // Once FORD answered: the soonest date and the tray, for FORD's own line.
        comingUp: ready ? comingUp({ dateOfBirth: client.dateOfBirth, entries: data.ford.entries, todayKey: data.today }) : [],
        untagged: ready ? data.ford.untagged.length : 0,
      },
      // Body & Pulse's line: its watch-outs, else the newest saved Pulse.
      pulse: { day: newestPulseDay(data.pulse.history) },
      // Story's line: the year of the Story's own "since" (the record only).
      story: { hint: storyTabHint({ client, coverage: data.coverage, today: data.today }) },
    });
  }, [
    client,
    notes,
    journal.loadState,
    data.focusesRunning,
    data.fordStatus,
    data.ford,
    data.today,
    data.pulse,
    data.coverage,
    access.fordReadable,
  ]);

  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !active) return;
    try {
      const target =
        anchor && !isNotesAnchor(anchor) ? root.querySelector<HTMLElement>(`[id="${anchor}"]`) : null;
      if (target && typeof target.scrollIntoView === "function") {
        // scroll-margin-top (codex.css) clears the sticky bar.
        target.scrollIntoView({ block: "start" });
      } else {
        alignPageTop(root);
      }
      if (focusTitle.current) {
        focusTitle.current = false;
        const title = root.querySelector<HTMLElement>(`#cx-panel-${page} [data-cx-page-title]`);
        if (title && typeof title.focus === "function") title.focus({ preventScroll: true });
      }
    } catch {
      // A browser without one of these simply does not scroll. Never throw
      // from a layout effect: it takes the whole profile to the error screen.
    }
  }, [page, anchor, navStamp, active]);

  /*
   * Notes' own cards (a thread, the composer, Resolved) are a request for the
   * Notes page to act on, not a scroll: handed over only while Notes is the
   * page on show, keyed by the move so each is acted on once.
   */
  const notesIntent = useMemo(() => {
    if (page !== "notes" || !active || !anchor) return null;
    const request = notesIntentOf(anchor);
    return request ? { key: navStamp, request } : null;
  }, [page, active, anchor, navStamp]);

  const pageProps: CodexPageProps = { data, form, go, hosts };
  const renderPage = (id: RecordPage) => {
    switch (id) {
      case "overview":
        return <OverviewPage {...pageProps} />;
      case "notes":
        return <NotesPage {...pageProps} intent={notesIntent} />;
      case "ford":
        return <FordPage {...pageProps} />;
      case "body":
        return <BodyPage {...pageProps} />;
      case "goals":
        return <GoalsPage {...pageProps} />;
      case "story":
        return <StoryPage {...pageProps} />;
      case "account":
        return <AccountPage {...pageProps} />;
    }
  };

  const showCritical = page !== "overview" && page !== "notes";
  const firstPlace = form.where[0];

  return (
    <div className="cx" data-page={page} ref={rootRef}>
      <ProfileSubnav
        label="Notes and profile pages"
        items={items}
        value={page}
        onChange={onTab}
        wrap
        idPrefix="cx"
        context={readOnlyLine(access) ?? undefined}
      />

      {showCritical ? (
        <CriticalLine
          criticalEntries={journal.criticalEntries}
          threads={journal.threads}
          machines={machines}
          onOpen={openThread}
          failed={notes.state === "failed"}
        />
      ) : null}

      <div className="cx-pages">
        {RECORD_PAGES.map(({ id }) => (
          <section
            key={id}
            className="cx-page"
            role="tabpanel"
            id={`cx-panel-${id}`}
            aria-labelledby={`cx-tab-${id}`}
            hidden={page !== id}
          >
            {mounted.has(id) ? renderPage(id) : null}
          </section>
        ))}
      </div>

      <SaveBar
        count={access.canEdit ? form.count : 0}
        where={form.where}
        saving={form.isSaving}
        onShow={() => {
          if (firstPlace) go(firstPlace.page, firstPlace.anchor);
        }}
        onDiscard={form.discard}
        onSave={() => void form.save()}
      />
    </div>
  );
}
