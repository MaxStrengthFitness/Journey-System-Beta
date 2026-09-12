import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, ExternalLink, Info, Plus } from "lucide-react";
import type { Machine, Trainer } from "../../types";
import { useToast } from "../../contexts/ToastContext";
import { resolveMachineOrder } from "../../data/machine-display-order";
import { useStudioMachines } from "../../hooks/useStudioMachines";
import {
  WikiBadge,
  WikiContents,
  WikiGroup,
  WikiIndexHeader,
  WikiRow,
  WikiSearch,
  WikiShell,
  accentForGroupKey,
  accentForPattern,
  groupElementId,
  type WikiContentsCard,
  type WikiCrumb,
  type WikiSearchGroup,
} from "../wiki";
import { abbr } from "../routine-builder/academy";
import { fromLegacyMachine } from "../catalog/adapters";
import { dedupeMachines } from "../catalog/machine-identity";
import { MachineArticle } from "../catalog/MachineArticle";
import { MachineFigure } from "../catalog/MachineFigure";
import { useSectionState } from "../catalog/useSectionState";
import type { CatalogMachine, GroupingMode } from "../catalog/types";
import { useAcademyCards, useAcademyScripts } from "../academy/useAcademyContent";
import { canWriteStudioPages } from "../learning/permissions";
import {
  buildDatabase,
  databaseCounts,
  databaseGroupKey,
  groupDatabase,
  planAdoption,
  searchDatabase,
  type DatabaseEntry,
  type RosterEntryLite,
} from "./database";
import { useSharedMachines } from "./hooks";
import { adoptMachine } from "./mutations";
import { NetworkNotes } from "./NetworkNotes";
import { CommentsPanel } from "../comments";
import "./machine-db.css";

/**
 * ALL MSF MACHINES — the database, as the Catalog's second scope.
 *
 * Round: Learning + Planner, Sep 2026. The rules of the list are in
 * ./database.ts and the why in ./README.md. This is the screen: an index in
 * the wiki's own shape (contents, groups, one row per machine with its code),
 * a page per machine, and a search — the same three screens as the studio's
 * own Catalog, so the two scopes read as one reference.
 *
 * A machine page here is the machine as the network knows it: the MSF
 * definition (or the sharing studio's), what other studios shared about it,
 * and whether this studio has it — with the way to add it for the studio's
 * leaders. The studio's own setup, upkeep and notes live on the studio's
 * page, one tap away when it has the machine.
 */

type Route = { kind: "index" } | { kind: "machine"; key: string } | { kind: "search" };

const MAX_RELATED = 6;

export interface MachineDatabaseProps {
  /** The app's machine list — the MSF catalog, with the in-repo content. */
  legacyMachines: Machine[];
  /** This studio's floor, as the Catalog holds it. */
  floor: CatalogMachine[];
  /** "global": the studio has no roster yet, and the floor is the whole catalog. */
  floorSource: "roster" | "global";
  /** The floor is still loading: nothing can be said yet about what is on it. */
  floorLoading?: boolean;
  studioId: string | null;
  studioName: string;
  authTrainer: Trainer | null;
  /** The At-this-studio | All-MSF switch, rendered above the index title. */
  scopeSwitch: ReactNode;
  grouping: GroupingMode;
  groupingControl: ReactNode;
  /** Open this studio's own page for a machine (switches scope). */
  onOpenFloorMachine: (machineId: string) => void;
  onOpenAcademy?: (machineId: string, focus: "card" | "script", machineName: string) => void;
  /** Open this machine's page on arrival — a link to a machine not on the floor. */
  openMachineId?: string | null;
  onOpenedMachine?: () => void;
}

export function MachineDatabase({
  legacyMachines,
  floor,
  floorSource,
  floorLoading = false,
  studioId,
  studioName,
  authTrainer,
  scopeSwitch,
  grouping,
  groupingControl,
  onOpenFloorMachine,
  onOpenAcademy,
  openMachineId,
  onOpenedMachine,
}: MachineDatabaseProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [route, setRoute] = useState<Route>({ kind: "index" });
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"front" | "back">("front");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [adopting, setAdopting] = useState(false);
  const [pendingGroup, setPendingGroup] = useState<string | null>(null);
  const { isOpen, setOpen } = useSectionState();

  const { machines: shared, error: sharedError, loading: sharedLoading } = useSharedMachines(true);
  // Every id on the roster, whatever its status, so a copy never collides.
  const { rosterEntries, loading: rosterLoading } = useStudioMachines(studioId, { includeInactive: true });
  const takenIds = useMemo(() => new Set(rosterEntries.map((e) => e.machineId)), [rosterEntries]);
  // Switched-off entries too: adding one of those back switches it on (planAdoption).
  const roster = useMemo<RosterEntryLite[]>(
    () =>
      rosterEntries.map((r) => ({
        machineId: r.machineId,
        status: r.status,
        adoptedFrom: (r as { adoptedFrom?: RosterEntryLite["adoptedFrom"] }).adoptedFrom ?? null,
      })),
    [rosterEntries],
  );
  // Until both have loaded, "on your floor" and "not on your floor" are both guesses.
  const floorKnown = !floorLoading && !rosterLoading;

  const msf = useMemo(() => {
    const { machines } = dedupeMachines(legacyMachines);
    return machines
      .map((m) => ({
        machine: fromLegacyMachine(m),
        retired: (m as { status?: string }).status === "retired",
      }))
      .sort(
        (a, b) =>
          resolveMachineOrder(a.machine.id, undefined) - resolveMachineOrder(b.machine.id, undefined) ||
          a.machine.name.localeCompare(b.machine.name),
      );
  }, [legacyMachines]);

  const entries = useMemo(
    () => buildDatabase({ msf, shared, floor: floorKnown ? floor : [], studioId }),
    [msf, shared, floor, floorKnown, studioId],
  );
  const counts = useMemo(() => databaseCounts(entries), [entries]);
  const groups = useMemo(() => groupDatabase(entries, grouping), [entries, grouping]);

  // A link from outside: wait for the shared list before deciding it is not there.
  useEffect(() => {
    if (!openMachineId) return;
    const hit = entries.find((e) => e.key === openMachineId || e.shared?.machineId === openMachineId);
    if (!hit && sharedLoading) return;
    setRoute(hit ? { kind: "machine", key: hit.key } : { kind: "index" });
    onOpenedMachine?.();
  }, [openMachineId, entries, sharedLoading, onOpenedMachine]);

  const selected = route.kind === "machine" ? entries.find((e) => e.key === route.key) ?? null : null;
  // A shared machine its studio stopped sharing: back to the index.
  useEffect(() => {
    if (route.kind === "machine" && !sharedLoading && entries.length > 0 && !selected) setRoute({ kind: "index" });
  }, [route, selected, entries.length, sharedLoading]);

  const preferredView = selected?.machine.anatomy.preferredView;
  useEffect(() => {
    if (preferredView) setView(preferredView);
  }, [selected?.key, preferredView]);

  useEffect(() => {
    if (!pendingGroup || route.kind !== "index") return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(groupElementId(`db-${pendingGroup}`))?.scrollIntoView({ block: "start" });
      setPendingGroup(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingGroup, route, groups]);

  const onMachine = route.kind === "machine";
  const academyCards = useAcademyCards(onMachine);
  const academyScripts = useAcademyScripts(onMachine);

  const canAdopt = canWriteStudioPages(authTrainer, studioId);
  const openIndex = () => setRoute({ kind: "index" });
  const openEntry = (key: string) => setRoute({ kind: "machine", key });

  const adopt = async (e: DatabaseEntry) => {
    const plan = planAdoption(e, { studioId, studioName, floorSource, takenIds, roster });
    if (!plan.ok || !studioId || !floorKnown) return;
    setAdopting(true);
    try {
      await adoptMachine(studioId, plan);
      toastSuccess(
        plan.reactivates
          ? `${e.machine.name} is back on ${studioName}'s floor.`
          : `${e.machine.name} is on ${studioName}'s floor.`,
      );
    } catch (err) {
      console.error("[machine-db] adopt failed:", err);
      toastError("Could not add it. Adding machines is for studio leaders.");
    } finally {
      setAdopting(false);
    }
  };

  const badgesFor = (e: DatabaseEntry) => (
    <>
      {e.floorMachineId && <WikiBadge tone="ok">On your floor</WikiBadge>}
      {e.sharedBy && (
        <WikiBadge tone="accent">{e.sharedBy.studioId === studioId ? "Shared by you" : e.sharedBy.studioName}</WikiBadge>
      )}
      {e.retired && <WikiBadge tone="neutral">Retired</WikiBadge>}
    </>
  );

  /* ── search ────────────────────────────────────────────────────── */

  if (route.kind === "search") {
    const hits = searchDatabase(entries, query);
    const searchGroups: WikiSearchGroup[] = [
      {
        key: "machines",
        label: "All MSF machines",
        items: hits.map((e) => ({
          id: e.key,
          title: e.machine.name,
          code: e.origin === "msf" ? abbr(e.machine.id) : null,
          meta: [e.sharedBy?.studioName, e.machine.movementPattern || e.machine.anatomicalRegion]
            .filter(Boolean)
            .join(" · "),
          accent: accentForPattern(e.machine.movementPattern),
        })),
      },
    ];
    return (
      <WikiSearch
        value={query}
        onChange={setQuery}
        onClose={openIndex}
        onPick={(key) => {
          setQuery("");
          openEntry(key);
        }}
        groups={searchGroups}
        placeholder={`Search ${entries.length} machines…`}
        idle={
          <p className="wk__empty">
            Search every MSF machine and every machine a studio has shared — by name, movement, region,
            muscle or studio.
          </p>
        }
      />
    );
  }

  /* ── a machine ─────────────────────────────────────────────────── */

  if (route.kind === "machine" && selected) {
    const e = selected;
    const groupKey = databaseGroupKey(e, grouping);
    const groupLabel = groups.find((g) => g.key === groupKey)?.label ?? "Machines";
    const crumbs: WikiCrumb[] = [
      { label: "All MSF machines", onClick: openIndex },
      {
        label: groupLabel,
        onClick: () => {
          openIndex();
          setPendingGroup(groupKey);
        },
      },
      { label: e.machine.name },
    ];
    const related = (groups.find((g) => g.key === groupKey)?.entries ?? [])
      .filter((o) => o.key !== e.key)
      .slice(0, MAX_RELATED)
      .map((o) => ({ id: o.key, label: o.machine.name, accent: accentForPattern(o.machine.movementPattern) }));

    const card = e.origin === "msf" ? academyCards?.find((c) => c.machineId === e.machine.id) : null;
    const script = e.origin === "msf" ? academyScripts?.find((s) => s.machineId === e.machine.id) : null;
    const plan = planAdoption(e, { studioId, studioName, floorSource, takenIds, roster });

    const notice = !floorKnown ? (
      <section className="mdb-adopt" aria-label={`${e.machine.name} at ${studioName}`}>
        <p className="mdb-adopt__line">
          <Building2 size={14} aria-hidden />
          Checking {studioName}'s floor…
        </p>
      </section>
    ) : (
      <section className="mdb-adopt" aria-label={`${e.machine.name} at ${studioName}`}>
        <p className="mdb-adopt__line">
          <Building2 size={14} aria-hidden />
          {e.floorMachineId ? `On ${studioName}'s floor.` : `Not on ${studioName}'s floor.`}
          {e.sharedBy && e.sharedBy.studioId !== studioId && (
            <span className="mdb-adopt__from"> Made and shared by {e.sharedBy.studioName}.</span>
          )}
        </p>
        {e.floorMachineId ? (
          <button type="button" className="mdb-btn" onClick={() => onOpenFloorMachine(e.floorMachineId!)}>
            <ExternalLink size={14} aria-hidden />
            Open {studioName}'s page
          </button>
        ) : canAdopt && plan.ok ? (
          <>
            <button
              type="button"
              className="mdb-btn mdb-btn--primary"
              disabled={adopting}
              onClick={() => adopt(e)}
            >
              <Plus size={14} aria-hidden />
              {adopting
                ? "Adding…"
                : plan.reactivates
                  ? `Put it back on ${studioName}'s floor`
                  : `Add to ${studioName}'s floor`}
            </button>
            {plan.reactivates ? (
              <p className="mdb-adopt__why">
                {studioName} switched this machine off. Putting it back brings its local setup with it.
              </p>
            ) : e.origin === "studio" && e.sharedBy && (
              <p className="mdb-adopt__why">
                Adds {studioName}'s own copy of {e.sharedBy.studioName}'s machine. Changes they make later won't
                follow it, and anything either studio shares about it shows on both.
              </p>
            )}
          </>
        ) : (
          <p className="mdb-adopt__why">
            {canAdopt && !plan.ok ? plan.reason : "A studio leader can add it to the floor from this page."}
          </p>
        )}
      </section>
    );

    return (
      <WikiShell crumbs={crumbs} onOpenSearch={() => setRoute({ kind: "search" })}>
        <MachineArticle
          machine={e.machine}
          isOpen={isOpen}
          setOpen={setOpen}
          onOpenMachine={openEntry}
          related={related}
          extraBadges={
            <>
              <WikiBadge tone={e.origin === "msf" ? "neutral" : "accent"}>
                {e.origin === "msf" ? "MSF catalog" : `Shared by ${e.sharedBy?.studioName ?? "a studio"}`}
              </WikiBadge>
              {e.retired && <WikiBadge tone="warn">Retired from the catalog</WikiBadge>}
            </>
          }
          notice={notice}
          academy={{
            onOpenCard: card && onOpenAcademy ? () => onOpenAcademy(e.machine.id, "card", e.machine.name) : undefined,
            onOpenScript:
              script && onOpenAcademy ? () => onOpenAcademy(e.machine.id, "script", e.machine.name) : undefined,
          }}
          figure={
            <MachineFigure
              anatomy={e.machine.anatomy}
              view={view}
              gender={gender}
              onViewChange={setView}
              onGenderChange={setGender}
            />
          }
          network={<NetworkNotes lineageKey={e.lineageKey} ownStudioId={studioId} machineName={e.machine.name} />}
          comments={<CommentsPanel target={{ kind: "machine", id: e.machine.id }} title={e.machine.name} />}
        />
      </WikiShell>
    );
  }

  /* ── the index ─────────────────────────────────────────────────── */

  const contents: WikiContentsCard[] = groups.map((g) => ({
    key: g.key,
    label: g.label,
    accent: accentForGroupKey(g.key, grouping),
    count: g.entries.length,
    countLabel: `${g.entries.length} machine${g.entries.length === 1 ? "" : "s"}`,
    notes: [],
    target: groupElementId(`db-${g.key}`),
  }));

  return (
    <WikiShell
      crumbs={[{ label: "Catalog" }]}
      scrollKey="Catalog / All MSF machines"
      onOpenSearch={() => setRoute({ kind: "search" })}
    >
      <WikiIndexHeader
        lead={scopeSwitch}
        title="All MSF machines"
        subtitle={`Every machine in the MSF catalog, and the machines studios have made and shared. Open one to read it, see what other studios wrote about it, and ${canAdopt ? `add it to ${studioName}'s floor` : `see whether ${studioName} has it`}.`}
        stats={[
          { label: "MSF catalog", value: counts.msf },
          { label: "Shared by studios", value: sharedLoading ? "…" : counts.studio },
          { label: `On ${studioName}'s floor`, value: floorKnown ? counts.onFloor : "…" },
        ]}
      >
        {groupingControl}
      </WikiIndexHeader>

      {sharedError && (
        <p className="mdb-note">
          <Info size={14} aria-hidden />
          {sharedError} The MSF catalog below is complete.
        </p>
      )}

      <WikiContents cards={contents} label="Contents" />

      {groups.map((g) => (
        <WikiGroup
          key={g.key}
          id={groupElementId(`db-${g.key}`)}
          label={g.label}
          accent={accentForGroupKey(g.key, grouping)}
          count={g.entries.length}
        >
          {g.entries.map((e) => (
            <WikiRow
              key={e.key}
              title={e.machine.name}
              code={e.origin === "msf" ? abbr(e.machine.id) : null}
              meta={
                grouping === "movement"
                  ? e.machine.anatomicalRegion
                  : e.machine.movementPattern || e.machine.anatomicalRegion
              }
              detail={musclesLine(e.machine.targetMuscles)}
              onClick={() => openEntry(e.key)}
              badges={e.floorMachineId || e.sharedBy || e.retired ? badgesFor(e) : undefined}
            />
          ))}
        </WikiGroup>
      ))}

      {canAdopt && (
        <p className="mdb-note">
          <Info size={14} aria-hidden />
          A machine the catalog doesn't have? Add it under Operations → Studios → {studioName} → Equipment, then open
          its page in {studioName}'s Catalog and switch on Share to list it here for every studio.
        </p>
      )}
    </WikiShell>
  );
}

/** The primary muscles, without the parenthetical detail. Same as the studio index. */
function musclesLine(targetMuscles: string[]): string {
  return targetMuscles
    .slice(0, 3)
    .map((t) => t.replace(/\s*\([^)]*\)\s*/g, " ").trim())
    .filter(Boolean)
    .join(" · ");
}
