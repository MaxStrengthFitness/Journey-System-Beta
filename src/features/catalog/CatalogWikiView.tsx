import { useEffect, useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import type { Machine, Trainer } from "../../types";
import { auth } from "../../firebase";
import { useActiveStudio } from "../../ActiveStudioContext";
import { useToast } from "../../contexts/ToastContext";
import { useStudioMachineSettings } from "../../hooks/useStudioMachineSettings";
import { isStudioLeader } from "../../lib/permissions";
import {
  WikiContents,
  WikiGroup,
  WikiIndexHeader,
  WikiRow,
  WikiSearch,
  WikiShell,
  WikiBadge,
  StudioWikiPanel,
  useStudioWiki,
  accentForGroupKey,
  accentForPattern,
  groupElementId,
  type WikiContentsCard,
  type WikiCrumb,
  type WikiSearchGroup,
} from "../wiki";
import {
  MachineUpkeepCard,
  MachinePlaybookCard,
  TaskNoteDialog,
  notifyTaskCompletion,
  searchPlaybook,
  setTaskStatus,
  studioLocation,
  useMachineUpkeep,
  usePlaybook,
  useStudioTasks,
  type TaskRow,
} from "../studio-tasks";
import { useAcademyCards, useAcademyScripts } from "../academy/useAcademyContent";
import { canWriteStudioPages, leadsStudioPerRules } from "../learning/permissions";
import { CommentsPanel } from "../comments";
import {
  MachineDatabase,
  NetworkNotes,
  ScopeSwitch,
  ShareToggle,
  setMachineShared,
  setNoteShared,
  setTipShared,
  sharedKeysFor,
  type CatalogScope,
} from "../machine-db";
import { abbr } from "../routine-builder/academy";
import { machinesForBodySlug } from "./anatomy";
import {
  dayKey,
  groupKeyOf,
  groupLabelOf,
  groupMachines,
  searchMachines,
  upkeepByMachine,
  upkeepEventsFrom,
} from "./grouping";
import { MachineArticle } from "./MachineArticle";
import { MachineFigure } from "./MachineFigure";
import { StudioNotesCard } from "./StudioNotesCard";
import { StudioSetupCard } from "./StudioSetupCard";
import { useCatalogMachines } from "./useCatalogMachines";
import { useSectionState } from "./useSectionState";
import type { GroupingMode } from "./types";

/**
 * THE CATALOG, as a wiki.
 *
 * Round: Wiki Redesign, Sep 2026. Replaces CatalogView.
 *
 * WHAT THE BRIEF WAS
 * ------------------
 * "The catalog just doesn't really match [the Hub and the client profiles],
 * and it also just feels really disorganised. Popping up the keyboard and
 * popping up the catalog selector from the bottom really makes the screen
 * jumbled on the iPad. It needs to be a good resource page that almost feels
 * equivalent to a high quality video game resource wiki."
 *
 * THREE CAUSES, AND WHAT EACH ONE BECAME
 * --------------------------------------
 * 1. It did not match. Not colour — --cat-* and --st-* (the Hub) were already
 *    the same hex values token for token. It was COMPOSITION: three panes and
 *    a bottom sheet against the Hub's one padded column of cards. So this
 *    view is one column of cards, built on features/wiki, which borrows the
 *    Hub's own conventions down to the italic uppercase title.
 *
 * 2. It felt disorganised. There were five modes — landing, group filter,
 *    picker, detail, Academy takeover — and three differently-worded ways
 *    back, none of which said where you were. There are now two screens and
 *    one breadcrumb.
 *
 * 3. The iPad jumble. `leaveLanding` called `setSheetOpen(true)` on stack
 *    layouts and the sheet mounted the picker with `autoFocusSearch`, so
 *    choosing a body group produced a sheet over the content plus a keyboard
 *    over the sheet. There is no sheet in this file at all. Search is a
 *    screen you deliberately go to.
 *
 * ROUTING
 * -------
 * `index` and `machine` are the two real screens; `search` and `academy` are
 * places you go from them. All four are plain state rather than a router,
 * because AppContent owns navigation for the whole app and adding a second
 * routing system inside one tab is how a back button ends up meaning two
 * different things.
 *
 * ONE LAYOUT, NOT TWO
 * -------------------
 * `useLayoutMode` is gone. The old file kept a `split` tree and a `stack`
 * tree, which is exactly the drift the round before it was written to fix,
 * and it came back anyway as two different pickers. The wiki has one tree;
 * the only thing that changes at 1024px is CSS grid moving the infobox into a
 * sticky column. Nothing renders differently, so nothing can drift.
 */

/** Machines shown under "Related" on an article. Six is two rows of chips. */
const MAX_RELATED = 6;

/**
 * The index's grouping switch, in the wiki's own order and words.
 *
 * Category first, because it is the default and the vocabulary a trainer
 * plans in. It was labelled "Academy", which put a second "Academy" a few
 * pixels under the Learning tab's Academy section — one word, two meanings.
 * The legacy picker keeps GROUPING_MODES / GROUPING_LABEL as they were.
 */
const WIKI_GROUPINGS: { mode: GroupingMode; label: string }[] = [
  { mode: "academy", label: "Category" },
  { mode: "movement", label: "Kinematics" },
  { mode: "region", label: "Region" },
];

/** The primary muscles, without the parenthetical detail, for the wide row. */
function musclesLine(targetMuscles: string[]): string {
  return targetMuscles
    .slice(0, 3)
    .map((t) => t.replace(/\s*\([^)]*\)\s*/g, " ").trim())
    .filter(Boolean)
    .join(" · ");
}

type Route =
  | { kind: "index" }
  | { kind: "machine"; id: string }
  | { kind: "search" };

/**
 * Which list the Catalog shows — this studio's floor, or every MSF machine
 * (Learning + Planner round, features/machine-db). Remembered for the
 * session, like the Planner's tab; a fresh load starts on the floor.
 */
let rememberedScope: CatalogScope = "floor";

export interface CatalogWikiViewProps {
  /** The global list. Used only until this studio's roster is populated. */
  machines: Machine[];
  authTrainer?: Trainer | null;
  /**
   * Open this machine on arrival. Set by AppContent when a cross-link in the
   * Academy tab points at a machine — the Catalog owns its own route, so the
   * only way in from outside is to ask.
   */
  openMachineId?: string | null;
  /** Called once `openMachineId` has been honoured, so it cannot re-fire. */
  onOpenedMachine?: () => void;
  /**
   * Open the index scrolled to this category (an Academy category key). Set
   * by the Learning front page's category tiles. Cleared the same way.
   */
  openGroupKey?: string | null;
  onOpenedGroup?: () => void;
  /** Open the index in this scope — the front page's "All MSF machines" card. */
  openScope?: CatalogScope | null;
  onOpenedScope?: () => void;
  /**
   * Jump to the Academy tab at this machine's card or script. Owned by
   * AppContent because it is a tab switch. When absent, the Academy
   * cross-links are simply not offered — this screen never renders the
   * Academy itself, which is the whole point of them being two tabs.
   */
  onOpenAcademy?: (
    machineId: string,
    focus: "card" | "script",
    machineName: string,
  ) => void;
}

export function CatalogWikiView({
  machines,
  authTrainer,
  openMachineId,
  onOpenedMachine,
  openGroupKey,
  onOpenedGroup,
  openScope,
  onOpenedScope,
  onOpenAcademy,
}: CatalogWikiViewProps) {
  const { activeStudioId, activeStudio } = useActiveStudio();
  const {
    machines: catalogMachines,
    source: floorSource,
    loading: floorLoading,
  } = useCatalogMachines(activeStudioId, machines);

  const [scope, setScopeState] = useState<CatalogScope>(rememberedScope);
  const setScope = (next: CatalogScope) => {
    rememberedScope = next;
    setScopeState(next);
  };
  const [route, setRoute] = useState<Route>({ kind: "index" });
  const [grouping, setGrouping] = useState<GroupingMode>("academy");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"front" | "back">("front");
  const [gender, setGender] = useState<"male" | "female">("male");

  const { isOpen, setOpen } = useSectionState();
  const { success: toastSuccess, error: toastError } = useToast();

  /*
   * These four are read ONCE here and passed down, exactly as the old view
   * did: each is a snapshot over the whole studio, and mounting them inside
   * the article would tear down and rebuild every listener on every tap in
   * the index — twenty-two teardowns while a trainer scrolls.
   */
  const { byMachineId: upkeepById } = useMachineUpkeep(activeStudioId);
  const { settingsByMachineId } = useStudioMachineSettings(activeStudioId);
  const { entries: playbookEntries } = usePlaybook(activeStudioId);
  const { rows: todayTaskRows } = useStudioTasks(activeStudioId);
  const { overlayFor } = useStudioWiki(activeStudioId);

  const [noteRow, setNoteRow] = useState<TaskRow | null>(null);
  const [upkeepBusy, setUpkeepBusy] = useState(false);

  const canEditStudioSetup = isStudioLeader(authTrainer ?? null);
  const author = authTrainer?.id
    ? { id: authTrainer.id, name: authTrainer.fullName ?? "" }
    : null;

  /* ── the MSF machine database: scope, and sharing ─────────────── */

  const studioName = activeStudio?.name ?? "this studio";
  // firestore.rules: roster writes are isSuperAdmin() || the studio's leaders.
  const canManageFloor = canWriteStudioPages(authTrainer ?? null, activeStudioId);
  const uid = auth.currentUser?.uid ?? null;
  const [sharing, setSharing] = useState<string | null>(null);

  const runShare = async (key: string, on: boolean, work: () => Promise<void>) => {
    setSharing(key);
    try {
      await work();
      toastSuccess(on ? "Shared with every MSF studio." : "No longer shared with other studios.");
    } catch (err) {
      console.error("Failed to change sharing:", err);
      toastError("Could not change sharing. Check your connection.");
    } finally {
      setSharing(null);
    }
  };

  const scopeSwitch = (
    <ScopeSwitch
      scope={scope}
      studioName={activeStudio?.name ?? "this studio"}
      onChange={(next) => {
        setScope(next);
        setRoute({ kind: "index" });
      }}
    />
  );

  /* Grouping is a property of the INDEX, not of a picker inside a sheet.
     Changing it re-labels the contents and re-sorts the list in place;
     nothing opens, closes or filters. Shared by both scopes. */
  const groupingControl = (
    <div className="wk__seg" role="group" aria-label="Group machines by">
      {WIKI_GROUPINGS.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          className="wk__seg-btn"
          aria-pressed={grouping === mode}
          onClick={() => setGrouping(mode)}
        >
          {label}
        </button>
      ))}
    </div>
  );

  /* ── derived state ─────────────────────────────────────────────── */

  const selected = useMemo(
    () =>
      route.kind === "machine"
        ? (catalogMachines.find((m) => m.id === route.id) ?? null)
        : null,
    [catalogMachines, route],
  );

  /*
   * A selection can go stale — a machine leaves the roster, or the trainer
   * switches studio. Fall back to the index rather than to the first machine:
   * silently showing a DIFFERENT machine than the one you were reading is
   * worse than showing the list you can choose from.
   */
  /*
   * Learning + Planner round: a machine that is not on this floor — a link
   * from the bell, an announcement or the Academy, or one that just left the
   * roster — opens in All MSF machines, where every machine has a page,
   * rather than dead-ending on the index.
   */
  const [dbJump, setDbJump] = useState<string | null>(null);
  useEffect(() => {
    if (route.kind !== "machine") return;
    // Until the floor has loaded, the list is the global fallback (which has
    // none of the studio's own machines) or a roster short of its catalog
    // machines, so "not on this floor" can't be concluded yet.
    if (floorLoading || catalogMachines.length === 0) return;
    if (catalogMachines.some((m) => m.id === route.id)) return;
    setDbJump(route.id);
    // Not remembered: the next visit opens on the floor, as the reader left it.
    setScopeState("msf");
    setRoute({ kind: "index" });
  }, [catalogMachines, route, floorLoading]);

  /*
   * A cross-link from the Academy tab. Honoured once and then cleared, so a
   * re-render cannot yank a trainer who has since navigated away back to the
   * machine they arrived on twenty taps ago.
   */
  useEffect(() => {
    if (!openMachineId) return;
    setScope("floor");
    setRoute({ kind: "machine", id: openMachineId });
    onOpenedMachine?.();
  }, [openMachineId, onOpenedMachine]);

  /*
   * A category to scroll the index to: from the front page's tiles, or from
   * the category crumb on a machine page. Held until the index has rendered,
   * because the group's element does not exist before it has.
   */
  const [pendingGroup, setPendingGroup] = useState<string | null>(null);

  useEffect(() => {
    if (!openScope) return;
    setScope(openScope);
    setRoute({ kind: "index" });
    onOpenedScope?.();
  }, [openScope, onOpenedScope]);

  useEffect(() => {
    if (!openGroupKey) return;
    setScope("floor");
    setGrouping("academy");
    setRoute({ kind: "index" });
    setPendingGroup(openGroupKey);
    onOpenedGroup?.();
  }, [openGroupKey, onOpenedGroup]);

  // Turn the figure to the side that actually shows the activation, on every
  // path that can change the selection. Doing this in a click handler is what
  // let the old carousel leave Hip Abduction on the anterior view, where none
  // of its target muscles are visible.
  const preferredView = selected?.anatomy.preferredView;
  useEffect(() => {
    if (preferredView) setView(preferredView);
  }, [selected?.id, preferredView]);

  const upkeepEvents = useMemo(() => upkeepEventsFrom(upkeepById), [upkeepById]);
  const upkeepStatusById = useMemo(
    () => upkeepByMachine(catalogMachines, upkeepEvents, dayKey()),
    [catalogMachines, upkeepEvents],
  );
  const flaggedIds = useMemo(
    () => new Set(Object.keys(upkeepById).filter((id) => upkeepById[id]?.flagged)),
    [upkeepById],
  );

  const groups = useMemo(
    () => groupMachines(catalogMachines, grouping),
    [catalogMachines, grouping],
  );

  useEffect(() => {
    // Held until the floor has loaded: the group may exist only in the
    // studio's own list ("Not in the Academy categories").
    if (!pendingGroup || route.kind !== "index" || floorLoading) return;
    const target = groupElementId(pendingGroup);
    // After paint: the index has only just been rendered in place of the page.
    // Cleared INSIDE the frame: clearing it here would re-render, run this
    // effect's cleanup and cancel the frame before it ever fired.
    const frame = requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ block: "start" });
      setPendingGroup(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingGroup, route, groups, floorLoading]);

  const machineTaskRows = useMemo(() => {
    const map: Record<string, TaskRow[]> = {};
    for (const r of todayTaskRows) {
      if (!r.machineId) continue;
      (map[r.machineId] ??= []).push(r);
    }
    return map;
  }, [todayTaskRows]);

  /*
   * The Academy's per-machine cards and scripts, loaded only once a machine
   * page is open. Two chunks, cached for the session — this is what turns
   * "the Academy exists somewhere" into a link on the page you are reading.
   */
  const onMachine = route.kind === "machine";
  const academyCards = useAcademyCards(onMachine);
  const academyScripts = useAcademyScripts(onMachine);

  /* ── actions ───────────────────────────────────────────────────── */

  const openMachine = (id: string) => setRoute({ kind: "machine", id });
  const openIndex = () => setRoute({ kind: "index" });

  const runUpkeep = async (
    row: TaskRow,
    status: "done" | "open",
    note?: string,
    flagged?: boolean,
  ) => {
    if (!activeStudioId) return;
    setUpkeepBusy(true);
    try {
      await setTaskStatus({
        // Machine upkeep is always the studio's shared checklist, never a
        // trainer's private list: the machine belongs to the location.
        location: studioLocation(activeStudioId),
        planned: row,
        status,
        author,
        note,
        flagged,
      });
      // The Catalog is where a broken pad actually gets noticed, so this path
      // matters more than the board's: a trainer standing at the machine flags
      // it here and the studio leader hears about it without anyone walking to
      // the To-Do screen.
      if (status === "done") {
        await notifyTaskCompletion({ row, author, studioId: activeStudioId, flagged, note });
      }
      toastSuccess(status === "done" ? "Marked done." : "Re-opened.");
    } catch (err) {
      console.error("Failed to update machine upkeep:", err);
      toastError("Could not save. Check your connection.");
    } finally {
      setUpkeepBusy(false);
    }
  };

  /* ── all MSF machines ───────────────────────────────────────────── */

  if (scope === "msf") {
    return (
      <MachineDatabase
        legacyMachines={machines}
        floor={catalogMachines}
        floorSource={floorSource}
        floorLoading={floorLoading}
        studioId={activeStudioId}
        studioName={studioName}
        authTrainer={authTrainer ?? null}
        scopeSwitch={scopeSwitch}
        grouping={grouping}
        groupingControl={groupingControl}
        onOpenFloorMachine={(id) => {
          setScope("floor");
          setRoute({ kind: "machine", id });
        }}
        onOpenAcademy={onOpenAcademy}
        openMachineId={dbJump}
        onOpenedMachine={() => setDbJump(null)}
      />
    );
  }

  /* ── empty roster ──────────────────────────────────────────────── */

  if (catalogMachines.length === 0) {
    // Inside the shell, so the Learning masthead (and with it the way to the
    // other sections) is still there on an empty studio.
    return (
      <WikiShell crumbs={[{ label: "Catalog" }]}>
        <div className="wk__index-head">{scopeSwitch}</div>
        <div className="wk__placeholder">
          <p className="wk__placeholder-title">No machines yet</p>
          <p className="wk__placeholder-body">
            {activeStudioId
              ? `${activeStudio?.name ?? "This studio"} has no machines on its roster. Add equipment from Hub → Machine Settings.`
              : "Select a studio to see its equipment."}
          </p>
        </div>
      </WikiShell>
    );
  }

  /* ── search ────────────────────────────────────────────────────── */

  if (route.kind === "search") {
    const hits = searchMachines(catalogMachines, query);
    const searchGroups: WikiSearchGroup[] = [
      {
        key: "machines",
        label: "Machines",
        items: hits.map((m) => ({
          id: m.id,
          title: m.name,
          code: abbr(m.id),
          meta: m.movementPattern || m.anatomicalRegion,
          accent: accentForPattern(m.movementPattern),
        })),
      },
    ];

    return (
      <WikiSearch
        value={query}
        onChange={setQuery}
        onClose={openIndex}
        onPick={(id) => {
          setQuery("");
          openMachine(id);
        }}
        groups={searchGroups}
        placeholder={`Search ${catalogMachines.length} machines…`}
        idle={
          <p className="wk__empty">
            Search by name, movement pattern, region or muscle — “row”,
            “posterior”, “glute”.
          </p>
        }
      />
    );
  }

  /* ── a machine ─────────────────────────────────────────────────── */

  if (route.kind === "machine" && selected) {
    const groupKey = groupKeyOf(selected, grouping);
    const groupLabel = groupLabelOf(groupKey, grouping);

    const crumbs: WikiCrumb[] = [
      { label: "Catalog", onClick: openIndex },
      {
        label: groupLabel,
        onClick: () => {
          openIndex();
          setPendingGroup(groupKey);
        },
      },
      { label: selected.name },
    ];

    /*
     * Related machines: the rest of this machine's movement pattern first,
     * topped up from its wider group if that is thin. A machine on its own in
     * a pattern is exactly the case where a lateral link is most useful, so
     * falling back rather than showing nothing matters.
     */
    const samePattern = catalogMachines.filter(
      (m) => m.id !== selected.id && m.movementPattern === selected.movementPattern,
    );
    const sameGroup = catalogMachines.filter(
      (m) =>
        m.id !== selected.id &&
        !samePattern.some((s) => s.id === m.id) &&
        groupKeyOf(m, grouping) === groupKey,
    );
    const related = [...samePattern, ...sameGroup]
      .slice(0, MAX_RELATED)
      .map((m) => ({
        id: m.id,
        label: m.name,
        accent: accentForPattern(m.movementPattern),
      }));

    const card = academyCards?.find((c) => c.machineId === selected.id) ?? null;
    const script = academyScripts?.find((s) => s.machineId === selected.id) ?? null;

    const playbookHits = searchPlaybook(playbookEntries, "", { machineId: selected.id });
    const overlay = overlayFor("machine", selected.id);
    // Sharing a tip: its author, or a leader — the playbook update rule.
    const canShareTip = (authorId: string) =>
      Boolean(uid && authorId === uid) || leadsStudioPerRules(authTrainer ?? null, activeStudioId);

    return (
      <WikiShell
        crumbs={crumbs}
        onOpenSearch={() => setRoute({ kind: "search" })}
      >
        <MachineArticle
          machine={selected}
          isOpen={isOpen}
          setOpen={setOpen}
          isFlagged={Boolean(upkeepById[selected.id]?.flagged)}
          upkeepStatus={upkeepStatusById[selected.id]}
          onOpenMachine={openMachine}
          related={related}
          academy={{
            onOpenCard:
              card && onOpenAcademy
                ? () => onOpenAcademy(selected.id, "card", selected.name)
                : undefined,
            onOpenScript:
              script && onOpenAcademy
                ? () => onOpenAcademy(selected.id, "script", selected.name)
                : undefined,
          }}
          figure={
            <MachineFigure
              anatomy={selected.anatomy}
              view={view}
              gender={gender}
              onViewChange={setView}
              onGenderChange={setGender}
              onRegionClick={(slug) => {
                // Tapping a muscle group on the figure is a cross-link: it
                // goes to a machine on THIS roster that trains it, or does
                // nothing rather than dead-ending on one that isn't here.
                const owned = new Set(catalogMachines.map((m) => m.id));
                const target = machinesForBodySlug(slug).find((id) => owned.has(id));
                if (target) openMachine(target);
              }}
            />
          }
          playbook={
            playbookHits.length > 0 ? (
              <MachinePlaybookCard
                entries={playbookHits.map((h) => h.entry)}
                currentUserId={authTrainer?.id ?? null}
                renderAction={(entry) =>
                  activeStudioId && canShareTip(entry.authorId) ? (
                    <ShareToggle
                      shared={entry.shared === true}
                      busy={sharing === `t:${entry.id}`}
                      onToggle={() =>
                        runShare(`t:${entry.id}`, entry.shared !== true, () =>
                          setTipShared(activeStudioId, entry.id, entry.shared !== true, {
                            keys: sharedKeysFor(entry.machineIds, catalogMachines),
                            studioName,
                          }),
                        )
                      }
                    />
                  ) : entry.shared ? (
                    <span className="pbm__tag">Shared with all MSF studios</span>
                  ) : null
                }
              />
            ) : undefined
          }
          studioSetup={
            <StudioSetupCard
              machineId={selected.id}
              machineName={selected.name}
              studioId={activeStudioId}
              setting={settingsByMachineId[selected.id]}
              canEdit={canEditStudioSetup}
              authorId={authTrainer?.id ?? null}
            />
          }
          upkeep={
            <MachineUpkeepCard
              machineId={selected.id}
              rows={machineTaskRows[selected.id] ?? []}
              upkeep={upkeepById[selected.id]}
              busy={upkeepBusy}
              onComplete={(row) => {
                if (row.status !== "done" && row.template?.requiresNote) {
                  setNoteRow(row);
                  return;
                }
                runUpkeep(row, row.status === "done" ? "open" : "done");
              }}
              onAddNote={setNoteRow}
            />
          }
          studioWiki={
            <StudioWikiPanel
              studioId={activeStudioId}
              studioName={activeStudio?.name}
              targetType="machine"
              targetId={selected.id}
              targetName={selected.name}
              overlay={overlay}
              author={author}
              headerAction={
                overlay && author && activeStudioId ? (
                  <ShareToggle
                    shared={overlay.shared === true}
                    busy={sharing === `n:${overlay.id}`}
                    onToggle={() =>
                      runShare(`n:${overlay.id}`, overlay.shared !== true, () =>
                        setNoteShared(activeStudioId, overlay.id, overlay.shared !== true, {
                          keys: sharedKeysFor([selected.id], catalogMachines),
                          studioName,
                        }),
                      )
                    }
                  />
                ) : undefined
              }
              emptyLabel={`Add ${activeStudio?.name ?? "this studio"}'s note on this machine`}
              placeholder="How we set this one up, who it does not suit, what to watch for. Ours sits two notches lower than the card says — that sort of thing."
            />
          }
          studioNotes={
            <StudioNotesCard
              machineId={selected.id}
              studioId={activeStudioId}
              studioName={activeStudio?.name}
              value={selected.studioNotes}
              author={author}
            />
          }
          network={
            <NetworkNotes
              lineageKey={selected.comparisonKey || selected.id}
              ownStudioId={activeStudioId}
              machineName={selected.name}
            />
          }
          comments={<CommentsPanel target={{ kind: "machine", id: selected.id }} title={selected.name} />}
          notice={
            // A machine this studio made: its leaders can list it in the
            // database. A copy of another studio's is listed by its original.
            selected.isStudioCustom && !selected.adoptedFrom && canManageFloor && activeStudioId ? (
              <section className="mdb-adopt" aria-label="Share this machine">
                <p className="mdb-adopt__line">
                  <Building2 size={14} aria-hidden />
                  {studioName}'s own machine.
                </p>
                <ShareToggle
                  shared={selected.shared === true}
                  busy={sharing === `m:${selected.id}`}
                  onToggle={() =>
                    runShare(`m:${selected.id}`, selected.shared !== true, () =>
                      setMachineShared(activeStudioId, selected.id, selected.shared !== true, studioName),
                    )
                  }
                />
                <p className="mdb-adopt__why">
                  {selected.shared
                    ? "Listed in All MSF machines: every studio can read it, and add a copy to their floor."
                    : "Share it to list it in All MSF machines, where every studio can read it and add a copy to their floor."}
                </p>
              </section>
            ) : undefined
          }
        />

        <TaskNoteDialog
          row={noteRow}
          open={Boolean(noteRow)}
          onOpenChange={(o) => !o && setNoteRow(null)}
          onSubmit={(note, flagged) =>
            noteRow ? runUpkeep(noteRow, "done", note, flagged) : undefined
          }
        />
      </WikiShell>
    );
  }

  /* ── the index ─────────────────────────────────────────────────── */

  const needsUpkeep = catalogMachines.filter(
    (m) => upkeepStatusById[m.id] === "due" || upkeepStatusById[m.id] === "overdue",
  ).length;
  const flaggedCount = catalogMachines.filter((m) => flaggedIds.has(m.id)).length;
  const outOfService = catalogMachines.filter(
    (m) => m.rosterStatus === "maintenance",
  ).length;

  const contents: WikiContentsCard[] = groups.map((g) => {
    const due = g.machines.filter(
      (m) => upkeepStatusById[m.id] === "due" || upkeepStatusById[m.id] === "overdue",
    ).length;
    const flagged = g.machines.filter((m) => flaggedIds.has(m.id)).length;
    const notes: { label: string; tone: "warn" | "alert" }[] = [];
    if (due > 0) notes.push({ label: `${due} due`, tone: "warn" });
    if (flagged > 0) notes.push({ label: `${flagged} flagged`, tone: "alert" });
    return {
      key: g.key,
      label: g.label,
      accent: accentForGroupKey(g.key, grouping),
      count: g.machines.length,
      countLabel: `${g.machines.length} machine${g.machines.length === 1 ? "" : "s"}`,
      notes,
      target: groupElementId(g.key),
    };
  });

  return (
    <WikiShell
      crumbs={[{ label: "Catalog" }]}
      onOpenSearch={() => setRoute({ kind: "search" })}
    >
      <WikiIndexHeader
        lead={scopeSwitch}
        title={activeStudio?.name ? `Machines at ${activeStudio.name}` : "Machines"}
        subtitle={`${catalogMachines.length} machine${catalogMachines.length === 1 ? "" : "s"}, each with its Academy code. What every machine on this floor trains, how ${activeStudio?.name ?? "this studio"} sets it up, and how it is running today.`}
        stats={[
          { label: "On the roster", value: catalogMachines.length },
          {
            label: "Needs cleaning",
            value: needsUpkeep,
            tone: needsUpkeep > 0 ? "warn" : undefined,
          },
          {
            label: "Flagged",
            value: flaggedCount,
            tone: flaggedCount > 0 ? "alert" : undefined,
          },
          { label: "Out of service", value: outOfService },
        ]}
      >
        {groupingControl}
      </WikiIndexHeader>

      <WikiContents cards={contents} label="Contents" />

      {groups.map((g) => (
        <WikiGroup
          key={g.key}
          id={groupElementId(g.key)}
          label={g.label}
          accent={accentForGroupKey(g.key, grouping)}
          count={g.machines.length}
        >
          {g.machines.map((m) => {
            const status = upkeepStatusById[m.id];
            const flagged = flaggedIds.has(m.id);
            const showBadges =
              m.isStudioCustom ||
              m.rosterStatus === "maintenance" ||
              flagged ||
              status === "due" ||
              status === "overdue";
            return (
              <WikiRow
                key={m.id}
                title={m.name}
                code={abbr(m.id)}
                meta={
                  grouping === "movement"
                    ? m.anatomicalRegion
                    : m.movementPattern || m.anatomicalRegion
                }
                detail={musclesLine(m.targetMuscles)}
                onClick={() => openMachine(m.id)}
                badges={
                  showBadges ? (
                    <>
                      {m.isStudioCustom && (
                        <WikiBadge tone={m.shared ? "live" : "neutral"}>{m.shared ? "Studio · shared" : "Studio"}</WikiBadge>
                      )}
                      {(m.rosterStatus === "maintenance" || flagged) && (
                        <WikiBadge tone={flagged ? "alert" : "warn"}>
                          {flagged ? "Flagged" : "Out of service"}
                        </WikiBadge>
                      )}
                      {(status === "due" || status === "overdue") && (
                        <WikiBadge tone="warn">
                          {status === "overdue" ? "Overdue" : "Due"}
                        </WikiBadge>
                      )}
                    </>
                  ) : undefined
                }
              />
            );
          })}
        </WikiGroup>
      ))}
    </WikiShell>
  );
}
