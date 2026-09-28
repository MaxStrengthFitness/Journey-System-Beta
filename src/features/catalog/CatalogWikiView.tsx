import { useEffect, useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import type { Machine, Trainer } from "../../types";
import { auth } from "../../firebase";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { useToast } from "../../contexts/ToastContext";
import { useStudioMachineSettings } from "../../hooks/useStudioMachineSettings";
import { isStudioLeader } from "../../lib/permissions";
import { LoadingMark } from "../../components/LoadingMark";
import {
  WikiIndexHeader,
  WikiShell,
  StudioWikiPanel,
  useStudioWiki,
  accentForPattern,
  type WikiCrumb,
} from "../wiki";
// Direct sub-module imports, not the studio-tasks barrel - see ClientsView.
import { MachinePlaybookCard } from "../studio-tasks/MachinePlaybookCard";
import { searchPlaybook } from "../studio-tasks/playbook";
import { usePlaybook } from "../studio-tasks/usePlaybook";
// Relay's care record, READ ONLY: the one record for flags (Catalog R2, q4).
import { useMachineCare } from "../relay/board/machine-care-store";
import { useAcademyCards, useAcademyScripts } from "../academy/useAcademyContent";
import { canWriteStudioPages, leadsStudioPerRules } from "../learning/permissions";
import { CommentsPanel } from "../comments";
import {
  MachineDatabase,
  NetworkNotes,
  ShareToggle,
  setMachineOffer,
  setNoteOffer,
  setTipOffer,
  sharedKeysFor,
  tapOffers,
  type CatalogScope,
} from "../machine-db";
import { CATEGORY_LABEL, categoryOf, type AcademyCategory } from "../routine-builder/academy";
import { machinesForBodySlug } from "./anatomy";
import { UNCATEGORISED_KEY, UNCATEGORISED_LABEL, academyCategoryOf } from "./grouping";
import { MachineTrendsPanel } from "../machine-trends/MachineTrendsPanel";
import { BODY_REGIONS, mainCounts, regionNames } from "./body-lens";
import { BodyLens } from "./BodyLens";
import { CatalogFind } from "./CatalogFind";
import { CatalogLenses, type CatalogLens } from "./CatalogLenses";
import { findOnFloor, findUnitsFrom, type FindHit } from "./find";
import { FloorRow } from "./FloorRow";
import { flagLineOf, floorSentence, presetOf } from "./floor-index";
import { MachineArticle, type FoundOnPage } from "./MachineArticle";
import { MachineFigure } from "./MachineFigure";
import { movementOf } from "./names";
import { StudioNotesCard } from "./StudioNotesCard";
import { StudioSetupCard } from "./StudioSetupCard";
import { useCatalogMachines } from "./useCatalogMachines";
import { useSectionState } from "./useSectionState";
import type { CatalogMachine } from "./types";
import { forgetOnSignOut } from "../sign-out/memory";

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
 * `index` and `machine` are the two real screens. Both are plain state rather
 * than a router, because AppContent owns navigation for the whole app and
 * adding a second routing system inside one tab is how a back button ends up
 * meaning two different things. (A `search` screen of its own went in the
 * Machine Catalog round: Learning's masthead search had always covered it,
 * and Find is on the index.)
 *
 * ONE LAYOUT, NOT TWO
 * -------------------
 * `useLayoutMode` is gone. The old file kept a `split` tree and a `stack`
 * tree, which is exactly the drift the round before it was written to fix,
 * and it came back anyway as two different pickers. The wiki has one tree;
 * the only thing that changes at 1024px is CSS grid moving the infobox into a
 * sticky column. Nothing renders differently, so nothing can drift.
 *
 * FLOOR FIRST (the Machine Catalog round, Sep 28 2026)
 * ----------------------------------------------------
 * AJ picked "Floor first, codex behind". The index is the studio's floor in
 * the leader's walking order (one order everywhere, q3), each row carrying
 * its preset, switches and status (FloorRow), with Find on top (CatalogFind).
 * It says so plainly when the floor is loading, empty or cannot be read, and
 * never draws the MSF standard in its place (floor-index.ts). Flags are
 * Relay's (studios/{s}/machineCare, read only); the Catalog counts no
 * cleaning of its own (q4). Head office opens on All MSF machines (q2).
 *
 * THREE WAYS IN (Catalog R3)
 * --------------------------
 * The floor, the body and All MSF machines (CatalogLenses). The body is the
 * app's own anatomy model with its parts also as a list (BodyLens); All MSF
 * machines is grouped by the Academy's five families, and its old grouping
 * switch (Category · Kinematics · Region) is gone with the text AJ asked to
 * cut.
 */

/** Machines shown under "Related" on an article. Six is two rows of chips. */
const MAX_RELATED = 6;

type Route =
  | { kind: "index" }
  /** `found`: Find opened this page on a line inside it, and the page says where. */
  | { kind: "machine"; id: string; found?: FoundOnPage };

/** The Academy family a floor machine belongs to, through its lineage. */
function familyOf(machine: CatalogMachine): AcademyCategory | null {
  return academyCategoryOf(machine) ?? categoryOf(movementOf(machine)?.id ?? "");
}

/**
 * The floor narrowed by Find (a switch, a maker, a movement the floor has
 * more than one of). Shown with its name and a way back to the whole floor.
 */
interface FloorFilter {
  label: string;
  unitIds: string[];
}

/**
 * Which way in the Catalog shows — this studio's floor, the body, or every
 * MSF machine (features/machine-db). Remembered for the session, like the
 * Planner's tab. Null until the reader chooses: a trainer then opens on the
 * floor and head office (administrators and the founder) on All MSF machines
 * (the Machine Catalog round, q2).
 */
let rememberedLens: CatalogLens | null = null;

// A sign-out is a fresh load for the next person (Sep 24 2026).
forgetOnSignOut(() => {
  rememberedLens = null;
});

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
  openScope?: CatalogScope | CatalogLens | null;
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
  const { activeStudioId, activeStudio, isAdmin } = useActiveStudio();
  const {
    machines: catalogMachines,
    source: floorSource,
    makers,
    floor: floorState,
  } = useCatalogMachines(activeStudioId, machines);
  /*
   * The FLOOR, which is not always the list above: when the studio's machine
   * list is empty the list is the MSF catalog standing in, and when it could
   * not be read it is nothing to go on. Either way the floor shows nothing in
   * its place (floor-index.ts). Everything on the floor side reads this.
   */
  const floorMachines = floorState === "ready" ? catalogMachines : NO_MACHINES;

  const [scope, setScopeState] = useState<CatalogLens>(
    () => rememberedLens ?? (isAdmin ? "msf" : "floor"),
  );
  const setScope = (next: CatalogLens) => {
    rememberedLens = next;
    setScopeState(next);
  };
  const [route, setRoute] = useState<Route>({ kind: "index" });
  // The part of the body the body lens is on (Catalog R3).
  const [regionId, setRegionId] = useState<string | null>(null);
  // Find, on top of the floor (Catalog R1), and what it narrowed the floor to.
  const [find, setFind] = useState("");
  const [floorFilter, setFloorFilter] = useState<FloorFilter | null>(null);
  const [view, setView] = useState<"front" | "back">("front");
  const [gender, setGender] = useState<"male" | "female">("male");

  const { isOpen, setOpen } = useSectionState();
  const { success: toastSuccess, error: toastError } = useToast();

  /*
   * These are read ONCE here and passed down, exactly as the old view did:
   * each is a snapshot over the whole studio, and mounting them inside the
   * article would tear down and rebuild every listener on every tap in the
   * index — twenty-two teardowns while a trainer scrolls.
   *
   * Relay's care record replaced two reads in the Machine Catalog round: the
   * studio's machine task instances (the old Upkeep card's history, which
   * grew without bound) and today's task rows.
   */
  const care = useMachineCare(activeStudioId);
  const { settingsByMachineId } = useStudioMachineSettings(activeStudioId);
  const { entries: playbookEntries } = usePlaybook(activeStudioId);
  const { overlayFor } = useStudioWiki(activeStudioId);

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
      // Sharing waits for an administrator since Sep 28 2026 (AJ).
      toastSuccess(
        on
          ? "Offered. An administrator reads it before other MSF studios see it."
          : "Taken back. Other studios don't see it.",
      );
    } catch (err) {
      console.error("Failed to change sharing:", err);
      toastError("Could not change sharing. Check your connection.");
    } finally {
      setSharing(null);
    }
  };

  const scopeSwitch = (
    // The three ways in (Catalog R3): the floor, the body, All MSF machines.
    <CatalogLenses
      lens={scope}
      studioName={studioName}
      onChange={(next) => {
        setScope(next);
        setRoute({ kind: "index" });
      }}
    />
  );

  /* ── derived state ─────────────────────────────────────────────── */

  const selected = useMemo(
    () =>
      route.kind === "machine"
        ? (floorMachines.find((m) => m.id === route.id) ?? null)
        : null,
    [floorMachines, route],
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
    // Until the floor has loaded, "not on this floor" can't be concluded.
    // Once it has, a machine that is not on it opens in All MSF — and so does
    // every machine when the floor is empty or unreadable: the MSF standard is
    // never drawn as this studio's (Machine Catalog round).
    if (floorState === "loading") return;
    if (floorMachines.some((m) => m.id === route.id)) return;
    setDbJump(route.id);
    // Not remembered: the next visit opens on the floor, as the reader left it.
    setScopeState("msf");
    setRoute({ kind: "index" });
  }, [floorMachines, route, floorState]);

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
   * An Academy family to show: the front page's category tiles. The floor is
   * the walking order now, not groups, so the family narrows the floor to its
   * machines (with a way back to the whole floor) once the floor has loaded.
   */
  const [pendingFamily, setPendingFamily] = useState<string | null>(null);

  useEffect(() => {
    if (!openScope) return;
    setScope(openScope);
    setRoute({ kind: "index" });
    onOpenedScope?.();
  }, [openScope, onOpenedScope]);

  useEffect(() => {
    if (!openGroupKey) return;
    setScope("floor");
    setRoute({ kind: "index" });
    setPendingFamily(openGroupKey);
    onOpenedGroup?.();
  }, [openGroupKey, onOpenedGroup]);

  useEffect(() => {
    if (!pendingFamily || floorState === "loading") return;
    const ids = floorMachines
      .filter((m) => (familyOf(m) ?? UNCATEGORISED_KEY) === pendingFamily)
      .map((m) => m.id);
    const label =
      pendingFamily === UNCATEGORISED_KEY
        ? UNCATEGORISED_LABEL
        : (CATEGORY_LABEL[pendingFamily as AcademyCategory] ?? pendingFamily);
    setFloorFilter(ids.length > 0 ? { label, unitIds: ids } : null);
    setPendingFamily(null);
  }, [pendingFamily, floorState, floorMachines]);

  // Turn the figure to the side that actually shows the activation, on every
  // path that can change the selection. Doing this in a click handler is what
  // let the old carousel leave Hip Abduction on the anterior view, where none
  // of its target muscles are visible.
  const preferredView = selected?.anatomy.preferredView;
  useEffect(() => {
    if (preferredView) setView(preferredView);
  }, [selected?.id, preferredView]);

  /*
   * Relay's flags, by machine. Null while the care record is loading or when
   * it could not be read: unknown, never "nothing flagged".
   */
  const flaggedIds = useMemo<ReadonlySet<string> | null>(() => {
    if (care.loading || care.error) return null;
    return new Set(Object.keys(care.byMachineId).filter((id) => care.byMachineId[id]?.flag));
  }, [care.loading, care.error, care.byMachineId]);

  /* Find (Catalog R1): every name a machine goes by, over this floor. */
  const findUnits = useMemo(
    () => findUnitsFrom(floorMachines, { makers, flagged: flaggedIds }),
    [floorMachines, makers, flaggedIds],
  );
  // The body's parts, for Find's "Muscles" (Catalog R3): "lats" opens the body lens.
  const findRegions = useMemo(() => {
    const counts = mainCounts(floorMachines);
    return BODY_REGIONS.map((r) => ({ id: r.id, label: r.label, names: regionNames(r), mainCount: counts[r.id] ?? 0 }));
  }, [floorMachines]);
  const findResult = useMemo(
    () =>
      find.trim()
        ? findOnFloor({ query: find, units: findUnits, studioName, regions: findRegions })
        : null,
    [find, findUnits, studioName, findRegions],
  );
  // Another studio's floor is another list: what was typed or filtered for
  // the last one means nothing here.
  useEffect(() => {
    setFind("");
    setFloorFilter(null);
  }, [activeStudioId]);

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

  /** Where a Find result leads: a page, a filtered floor, or All MSF. */
  const openFound = (hit: FindHit) => {
    setFind("");
    if (hit.kind === "unit") openMachine(hit.unitId);
    else if (hit.kind === "line") {
      setRoute({ kind: "machine", id: hit.unitId, found: { section: hit.section, text: hit.text } });
    } else if (hit.kind === "filter") setFloorFilter(hit.filter);
    else if (hit.kind === "muscle") {
      setRegionId(hit.regionId);
      setScope("body");
      setRoute({ kind: "index" });
    } else openMovement(hit.movementId);
  };

  /**
   * A movement this floor does not have: its page in All MSF machines. Not
   * remembered as the reader's scope, exactly like a link to a machine that
   * is not here.
   */
  const openMovement = (movementId: string) => {
    setDbJump(movementId);
    setScopeState("msf");
    setRoute({ kind: "index" });
  };

  /* ── all MSF machines ───────────────────────────────────────────── */

  if (scope === "msf") {
    return (
      <MachineDatabase
        legacyMachines={machines}
        // Only a floor that was read and has machines is the floor. An empty
        // one is "global" (adoption points to My Studio → Machines, as it
        // always has), and an unreadable one is still being checked, so no
        // page says a machine is on the floor, or off it, on a guess.
        floor={floorMachines}
        floorSource={floorState === "ready" ? floorSource : "global"}
        floorLoading={floorState === "loading" || floorState === "unreadable"}
        studioId={activeStudioId}
        studioName={studioName}
        authTrainer={authTrainer ?? null}
        scopeSwitch={scopeSwitch}
        // By the Academy's five families, and no switch to change it (R3).
        grouping="academy"
        groupingControl={null}
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

  /* ── a machine ─────────────────────────────────────────────────── */

  if (route.kind === "machine" && selected) {
    // The floor is one list in walking order, so the way up is the floor.
    const crumbs: WikiCrumb[] = [
      { label: "Catalog", onClick: openIndex },
      { label: selected.name },
    ];

    /*
     * Related machines: the rest of this machine's movement pattern first,
     * topped up from its Academy family if that is thin. A machine on its own
     * in a pattern is exactly the case where a lateral link is most useful, so
     * falling back rather than showing nothing matters.
     */
    const family = familyOf(selected);
    const samePattern = floorMachines.filter(
      (m) => m.id !== selected.id && m.movementPattern === selected.movementPattern,
    );
    const sameGroup = floorMachines.filter(
      (m) =>
        m.id !== selected.id &&
        !samePattern.some((s) => s.id === m.id) &&
        family !== null &&
        familyOf(m) === family,
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
    const careFlag = care.byMachineId[selected.id]?.flag ?? null;

    const playbookHits = searchPlaybook(playbookEntries, "", { machineId: selected.id });
    const overlay = overlayFor("machine", selected.id);
    // Sharing a tip: its author, or a leader — the playbook update rule.
    const canShareTip = (authorId: string) =>
      Boolean(uid && authorId === uid) || leadsStudioPerRules(authTrainer ?? null, activeStudioId);

    return (
      <WikiShell crumbs={crumbs}>
        <MachineArticle
          machine={selected}
          found={route.found}
          isOpen={isOpen}
          setOpen={setOpen}
          flag={careFlag ? flagLineOf(careFlag) : null}
          preset={presetOf(selected, settingsByMachineId[selected.id])}
          onOpenMachine={openMachine}
          related={related}
          /* The panel reads machineTrends/{id} only once the foldable is open,
             and the read is cached per machine for the session. */
          trends={<MachineTrendsPanel machineId={selected.id} active={isOpen("trends", false)} />}
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
                const owned = new Set(floorMachines.map((m) => m.id));
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
                      item={entry}
                      busy={sharing === `t:${entry.id}`}
                      onToggle={() =>
                        runShare(`t:${entry.id}`, tapOffers(entry), () =>
                          setTipOffer(activeStudioId, entry.id, tapOffers(entry), {
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
                    item={overlay}
                    busy={sharing === `n:${overlay.id}`}
                    onToggle={() =>
                      runShare(`n:${overlay.id}`, tapOffers(overlay), () =>
                        setNoteOffer(activeStudioId, overlay.id, tapOffers(overlay), {
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
              machineName={selected.name}
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
                  item={selected}
                  busy={sharing === `m:${selected.id}`}
                  onToggle={() =>
                    runShare(`m:${selected.id}`, tapOffers(selected), () =>
                      setMachineOffer(activeStudioId, selected.id, tapOffers(selected), studioName),
                    )
                  }
                />
                <p className="mdb-adopt__why">
                  {selected.shared
                    ? "Listed in All MSF machines: every studio can read it, and add a copy to their floor."
                    : selected.shareStatus === "pending"
                      ? "Offered to All MSF machines. An administrator reads it first; then every studio can read it and add a copy to their floor."
                      : "Offer it to All MSF machines, where every studio can read it and add a copy to their floor once an administrator has read it."}
                </p>
              </section>
            ) : undefined
          }
        />
      </WikiShell>
    );
  }

  /* ── the body (Catalog R3) ─────────────────────────────────────── */

  if (scope === "body") {
    return (
      <WikiShell crumbs={[{ label: "Catalog" }]} scrollKey="Catalog / The body">
        <WikiIndexHeader lead={scopeSwitch} title="The body" subtitle="What trains what, main movers first." />
        <BodyLens
          floor={floorMachines}
          floorState={floorState}
          studioName={studioName}
          regionId={regionId}
          onRegion={setRegionId}
          presetFor={(m) => presetOf(m, settingsByMachineId[m.id])}
          flaggedIds={flaggedIds}
          onOpenMachine={openMachine}
          onOpenMovement={openMovement}
        />
      </WikiShell>
    );
  }

  /* ── the index ─────────────────────────────────────────────────── */

  const outOfService = floorMachines.filter((m) => m.rosterStatus === "maintenance").length;
  const flaggedCount = flaggedIds ? floorMachines.filter((m) => flaggedIds.has(m.id)).length : null;
  // Find's filter narrows the floor to the machines it named, in walking order.
  const shown = floorFilter
    ? floorMachines.filter((m) => floorFilter.unitIds.includes(m.id))
    : floorMachines;

  const subtitle =
    floorState === "ready"
      ? floorSentence({
          count: floorMachines.length,
          outOfService,
          flagged: flaggedCount,
          flagsFailed: Boolean(care.error),
        })
      : undefined;

  const openAllMsf = () => {
    setScope("msf");
    setRoute({ kind: "index" });
  };

  return (
    <WikiShell crumbs={[{ label: "Catalog" }]}>
      <WikiIndexHeader lead={scopeSwitch} title={`${studioName}'s floor`} subtitle={subtitle} />

      {/* Find knows the MSF movements as well as this floor, so it stays on
          an empty floor (a movement there opens in All MSF). Not on an
          unreadable one: "not on this floor" would be a guess. */}
      {(floorState === "ready" || floorState === "empty") && (
        <CatalogFind value={find} onChange={setFind} result={findResult} onPick={openFound} />
      )}

      {/* While something is typed, Find's results stand in for the list. */}
      {!findResult && floorFilter && floorState === "ready" && (
        <div className="mcat-filter" role="status">
          <span className="mcat-filter__text">
            Showing <strong>{floorFilter.label}</strong> · {floorFilter.unitIds.length} on {studioName}'s floor
          </span>
          <button type="button" className="mcat-filter__clear" onClick={() => setFloorFilter(null)}>
            Show the whole floor
          </button>
        </div>
      )}

      {floorState === "loading" && (
        <div className="mcat-wait">
          <LoadingMark label={`Reading ${studioName}'s floor…`} />
        </div>
      )}

      {floorState === "unreadable" && (
        <div className="wk__placeholder" role="status">
          <p className="wk__placeholder-title">Can't read {studioName}'s floor right now</p>
          <p className="wk__placeholder-body">
            Its machine list didn't load, so nothing is shown in its place. All MSF machines still works.
          </p>
          <button type="button" className="mcat-door" onClick={openAllMsf}>
            Open All MSF machines
          </button>
        </div>
      )}

      {floorState === "empty" && !findResult && (
        <div className="wk__placeholder">
          <p className="wk__placeholder-title">
            {activeStudioId ? `No machines on ${studioName}'s floor yet` : "No studio chosen"}
          </p>
          <p className="wk__placeholder-body">
            {activeStudioId
              ? "A studio leader adds them on My Studio → Machines. Every MSF machine is in All MSF machines."
              : "Select a studio to see its equipment."}
          </p>
          {activeStudioId && (
            <button type="button" className="mcat-door" onClick={openAllMsf}>
              Open All MSF machines
            </button>
          )}
        </div>
      )}

      {floorState === "ready" && !findResult && (
        <ol className="mcat-floor" aria-label={`${studioName}'s floor, in walking order`}>
          {shown.map((m) => (
            <FloorRow
              key={m.id}
              walk={floorMachines.indexOf(m) + 1}
              machine={m}
              preset={presetOf(m, settingsByMachineId[m.id])}
              flagged={Boolean(flaggedIds?.has(m.id))}
              onOpen={() => openMachine(m.id)}
            />
          ))}
        </ol>
      )}
    </WikiShell>
  );
}

const NO_MACHINES: CatalogMachine[] = [];
