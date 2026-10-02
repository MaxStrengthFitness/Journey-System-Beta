import { useMemo, useState } from "react";
import {
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { db, auth } from "../../../firebase";
import { seedStandardSet } from "../equipment/seed";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Plus, Search, Loader2, Wrench, ShieldAlert, Library,
  ArrowUpDown, ArrowUp, ArrowDown, GripVertical, RotateCcw, Check, X, Pencil,
} from "lucide-react";
import { useStudioMachines } from "../../../hooks/useStudioMachines";
import { useToast } from "../../../contexts/ToastContext";
import { StudioMachineEditor } from "./StudioMachineEditor";
import type { EditScope } from "../../../lib/machine-template";
import { AdminBadge, AdminButton, AdminNotice } from "../primitives";
import { outOfServiceLineOf, outOfServiceOfEntry } from "../../catalog/out-of-service";
import { OutOfServiceDialog } from "./OutOfServiceDialog";
import { AddFromMsfDialog } from "./AddFromMsfDialog";
import { addableFromMsf, moveInOrder, onFloor, orderForNewMachine, orderReach } from "./floor-editor";
import "../admin.css";

/**
 * THE FLOOR EDITOR — what THIS location actually has, in the order it is
 * walked. (Its file name is older than the name.)
 *
 * Round: Machine Creator & Studio Roster, Sep 2026; wave 2 of the Machine
 * Catalog room, Sep 28 2026 (Catalog R5, AJ's "all yes").
 *
 * ONE FLOOR EDITOR. Learning → Catalog → {studio}'s floor → Edit our floor,
 * My Studio → Machines and Operations → Floor open the same screen
 * (my-studio/MachinesSection, which draws this list), and the Admins
 * dashboard's studio page reaches the same list at admin scope. Never a
 * second editor (CLAUDE.md).
 *
 * What a studio's leaders do here:
 *
 *   the walking order   Walking order: move a machine up or down, or drag
 *                       it; one batch of `order` 1..n on Save, the sequence
 *                       the Catalog, the Journey grid and the session walk
 *   out of service      asks why (OutOfServiceDialog), and Back in service
 *   add from MSF        the MSF machines not on the floor (AddFromMsfDialog):
 *                       the standard's first; a machine added joins the end
 *                       of a walking order the studio keeps
 *   a new machine       the studio machine editor (StudioMachineEditor)
 *                       until the Machine Codex's Guided forge exists
 *   each machine        Open (the caller's door), its set-up, We don't have
 *                       this
 *
 * The list is the FLOOR: what is on the roster and not switched off. What
 * could join it is in Add from MSF, not dimmed in the list (it used to be,
 * with "We have this").
 *
 * Writes go to studios/{studioId}/roster/{machineId}; tenancy is enforced by
 * that path in firestore.rules, so a trainer at one location cannot touch
 * another's roster. A roster entry is either:
 *   source 'catalog' — inherits the catalog entry, overrides any field
 *   source 'custom'  — the studio's own definition, with `basedOn` lineage
 *
 * `basedOn` on a custom machine inherits nothing. It exists so a location's
 * bespoke leg press still rolls up against every other leg press in network
 * reporting instead of becoming its own incomparable island.
 */

/**
 * One row in walking-order mode.
 *
 * Deliberately plainer than the rows in the normal list: while you are
 * putting twenty machines in order, the badges, switches and maintenance
 * controls are noise, and every one of them is another tap target competing
 * with the drag. Position number on the left, the name, then up, down and the
 * drag handle — the buttons for a finger that would rather tap than drag
 * (wave 2), each 40px.
 */
function SortableFloorRow({
  machineId,
  name,
  position,
  count,
  onMove,
}: {
  machineId: string;
  name: string;
  position: number;
  count: number;
  onMove: (delta: -1 | 1) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: machineId });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-[10px] border border-[var(--adm-border)] bg-[var(--adm-surface)] px-3 py-1",
        isDragging && "opacity-80 shadow-lg",
      )}
    >
      <span className="w-6 shrink-0 text-center text-xs font-black tabular-nums text-[var(--adm-ink-muted)]">
        {position}
      </span>
      <span className="adm-row__name min-w-0 flex-1 break-words">{name}</span>
      <AdminButton
        size="sm"
        variant="quiet"
        iconOnly
        aria-label={`Move ${name} up`}
        disabled={position === 1}
        onClick={() => onMove(-1)}
      >
        <ArrowUp className="h-4 w-4" aria-hidden />
      </AdminButton>
      <AdminButton
        size="sm"
        variant="quiet"
        iconOnly
        aria-label={`Move ${name} down`}
        disabled={position === count}
        onClick={() => onMove(1)}
      >
        <ArrowDown className="h-4 w-4" aria-hidden />
      </AdminButton>
      <button
        type="button"
        className="flex h-10 w-10 shrink-0 cursor-grab items-center justify-center rounded-lg text-[var(--adm-ink-muted)] active:cursor-grabbing"
        aria-label={`Reorder ${name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function StudioInventoryManager({
  studioId,
  studioName,
  readOnly = false,
  flags,
  onOpenMachine,
  hideHeading = false,
  scope = "studio",
  authorName,
}: {
  studioId: string | null;
  studioName?: string;
  /**
   * My Studio round (Sep 2026): the same list for a trainer — the floor as
   * it is, with nothing that writes (no walking order, no Add from MSF, no
   * new machine, no We don't have this). The rules refuse those writes to a
   * trainer anyway; this keeps the button off the screen.
   */
  readOnly?: boolean;
  /** A line under a machine's name: "No longer in the MSF standard", a submission's state. */
  flags?: Record<string, string>;
  /** Every row gets an Open button that hands the machine to the caller (My Studio's door). */
  onOpenMachine?: (machineId: string) => void;
  /** The caller draws its own panel title. */
  hideHeading?: boolean;
  /**
   * What the person at this door may change.
   *
   * "studio" is a studio leader on their own floor: the hardware is theirs,
   * Max Strength's method is read-only. "admin" is corporate reaching into a
   * location from the Admins dashboard, with no locks. See lib/machine-template.
   */
  scope?: EditScope;
  /**
   * The name a reason on Out of service is signed with (wave 2, Sep 28 2026):
   * the person at the iPad, as trainers will read it. The uid beside it is
   * always the Auth uid, which the rules pin.
   */
  authorName?: string | null;
}) {
  const { machines, byId, catalog, rosterEntries, loading } = useStudioMachines(studioId, {
    includeInactive: true,
    includeUnrostered: true,
  });
  const { success: toastSuccess, error: toastError } = useToast();

  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * Which machine is open in the full-page editor: a brand-new custom one, or
   * an existing roster entry. Null when the list is showing.
   */
  const [editing, setEditing] = useState<
    { kind: "new" } | { kind: "entry"; machineId: string } | null
  >(null);
  /**
   * Walking-order mode. Null when off; otherwise the machine ids in the order
   * the leader is putting them into. Held as a draft rather than written per
   * move so twenty small writes become one batch.
   */
  const [reorderIds, setReorderIds] = useState<string[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  /** The machine whose reason for being out of service is being asked for. */
  const [askingOut, setAskingOut] = useState<{ machineId: string; name: string } | null>(null);
  /** Add from MSF is open (wave 2). */
  const [adding, setAdding] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const rosteredIds = useMemo(
    () => new Set(rosterEntries.map((e) => e.machineId)),
    [rosterEntries],
  );

  /**
   * The floor, in the order trainers will see it. `machines` arrives already
   * sorted by resolveMachineOrder, so this is the current effective order
   * whether or not anybody has ever set one explicitly.
   */
  const floorInOrder = useMemo(() => onFloor(machines, rosteredIds), [machines, rosteredIds]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return floorInOrder.filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [floorInOrder, search]);

  const ownedCount = floorInOrder.length;

  const addable = useMemo(
    () => addableFromMsf({ machines, rosterEntries, catalog }),
    [machines, rosterEntries, catalog],
  );

  if (!studioId) {
    return <AdminNotice tone="info">Select a studio to manage its equipment.</AdminNotice>;
  }

  const floorName = studioName ?? "this studio";

  /**
   * Take a machine off the floor (switched off, "retired"), keeping its local
   * set-up. The same for a studio's OWN machine as for a copy of an MSF one
   * (AJ, Oct 2 2026: removing a studio's own machine always retires it, never
   * deletes it): past sessions keep its name because the entry is still
   * there, and Add from MSF → "Switched off at {studio}" brings it back.
   * Nothing on this screen deletes a roster entry any more.
   * The entry is already there, so only its status changes, as a path with
   * updateDoc: what the machine IS (`source`, `basedOn`) is written when an
   * entry is created and never by an edit (docs/KNOWN-TRAPS.md, the Local
   * set-up trap; wave 2 stopped this button re-writing them). Any reason it
   * was out of service goes with it.
   */
  const switchOff = async (machineId: string) => {
    setBusy(machineId);
    try {
      await updateDoc(doc(db, "studios", studioId, "roster", machineId), {
        status: "inactive",
        outOfService: deleteField(),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid ?? null,
      });
      toastSuccess(
        `${byId[machineId]?.name ?? "The machine"} is off ${floorName}'s floor. Past sessions keep its name, and Add from MSF puts it back.`,
      );
    } catch (err) {
      console.error(err);
      toastError("Could not update the roster. Studio leads and admins only.");
    } finally {
      setBusy(null);
    }
  };

  /**
   * Put an MSF machine on the floor, or one this studio switched off back on
   * (Add from MSF, wave 2). It joins the end of a walking order the studio
   * keeps (floor-editor.ts). A machine the roster has never had is created,
   * identity and all; one it switched off only has its status changed, and
   * comes back with its local set-up.
   */
  const addToFloor = async (machineId: string) => {
    setBusy(machineId);
    const order = orderForNewMachine(rosterEntries);
    const place = order !== null ? { order } : {};
    const stamp = { updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid ?? null };
    try {
      const ref = doc(db, "studios", studioId, "roster", machineId);
      if (rosteredIds.has(machineId)) {
        await updateDoc(ref, { status: "active", outOfService: deleteField(), ...place, ...stamp });
      } else {
        await setDoc(
          ref,
          { machineId, studioId, source: "catalog", basedOn: machineId, status: "active", ...place, ...stamp },
          { merge: true },
        );
      }
      toastSuccess(`${byId[machineId]?.name ?? "The machine"} is on ${floorName}'s floor.`);
    } catch (err) {
      console.error(err);
      toastError("Could not add it. Studio leads and admins only.");
    } finally {
      setBusy(null);
    }
  };

  /**
   * Out of service, with the reason a leader gave (wave 2, Sep 28 2026; AJ:
   * "a short note and who set it, on the studio's machine entry, so the row
   * can say why"). The status and the signed reason together, as paths with
   * updateDoc on the entry that is already there: what the machine IS is
   * never written from here (docs/KNOWN-TRAPS.md, the Local set-up trap).
   * Signed with the Auth uid, which the rules pin, and the server's time.
   */
  const takeOutOfService = async (machineId: string, reason: string) => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toastError("Sign in again before taking a machine out of service.");
      return;
    }
    setBusy(machineId);
    try {
      await updateDoc(doc(db, "studios", studioId, "roster", machineId), {
        status: "maintenance",
        outOfService: {
          reason,
          by: { uid, name: (authorName ?? "").trim() || auth.currentUser?.displayName?.trim() || "A leader" },
          at: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
      setAskingOut(null);
      toastSuccess(`${byId[machineId]?.name ?? "The machine"} is out of service. Trainers see why.`);
    } catch (err) {
      console.error(err);
      toastError("Could not take it out of service. Studio leads and admins only.");
    } finally {
      setBusy(null);
    }
  };

  /** Back in service: the status, and the reason off with it. */
  const putBackInService = async (machineId: string) => {
    setBusy(machineId);
    try {
      await updateDoc(doc(db, "studios", studioId, "roster", machineId), {
        status: "active",
        outOfService: deleteField(),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid ?? null,
      });
      toastSuccess(`${byId[machineId]?.name ?? "The machine"} is back in service.`);
    } catch (err) {
      console.error(err);
      toastError("Could not put it back in service. Studio leads and admins only.");
    } finally {
      setBusy(null);
    }
  };

  /**
   * Save the walking order.
   *
   * Writes `order` on each roster document, 1..n, in one batch. This is the
   * ONE ordering mechanism as of Sep 12 2026: the Catalog, the client
   * profile's Journey grid and the Active Session all resolve through
   * studios/{id}/roster.order now. Before this there was no UI that wrote an
   * order anywhere, and the field two of those screens read
   * (studioMachineSettings.order) had zero documents in production.
   */
  const saveOrder = async () => {
    if (!reorderIds || !studioId) return;
    setSavingOrder(true);
    try {
      const batch = writeBatch(db);
      reorderIds.forEach((machineId, i) => {
        batch.set(
          doc(db, "studios", studioId, "roster", machineId),
          {
            order: i + 1,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.uid ?? null,
          },
          { merge: true },
        );
      });
      await batch.commit();
      toastSuccess(
        `Order saved. Every trainer at ${studioName ?? "this studio"} sees this sequence.`,
      );
      setReorderIds(null);
    } catch (e: unknown) {
      toastError(
        `Could not save the order: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSavingOrder(false);
    }
  };

  /**
   * Drop this studio's custom order and fall back to the MSF standard.
   *
   * deleteField() rather than writing the default numbers: resolveMachineOrder
   * already falls back to DEFAULT_MACHINE_DISPLAY_ORDER when `order` is
   * absent, so removing the field means this studio automatically follows any
   * future change to the standard instead of being pinned to today's copy.
   */
  const resetOrder = async () => {
    if (!studioId) return;
    setSavingOrder(true);
    try {
      const batch = writeBatch(db);
      for (const entry of rosterEntries) {
        batch.set(
          doc(db, "studios", studioId, "roster", entry.machineId),
          { order: deleteField(), updatedAt: serverTimestamp() },
          { merge: true },
        );
      }
      await batch.commit();
      toastSuccess("Back to the MSF standard order.");
      setReorderIds(null);
    } catch (e: unknown) {
      toastError(
        `Could not reset the order: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSavingOrder(false);
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !reorderIds) return;
    const from = reorderIds.indexOf(String(active.id));
    const to = reorderIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    setReorderIds(arrayMove(reorderIds, from, to));
  };

  /** Every machine of the MSF standard not on the floor, in one tap (Add from MSF). */
  const adoptStandardSet = async () => {
    setBusy("__standard__");
    try {
      // One implementation for every "Add the standard set" (My Studio round,
      // Sep 2026): features/admin/equipment/seed.ts. This button and the
      // Studios tab's used to be two copies that once disagreed about the
      // default for a missing inStandardSet flag.
      const { added, alreadyPresent } = await seedStandardSet(studioId, catalog);
      toastSuccess(
        added > 0
          ? `Added ${added} machines to ${floorName}.`
          : alreadyPresent > 0
            ? `${studioName ?? "This studio"} already has every standard machine.`
            : "Nothing in the catalog qualifies for the standard set.",
      );
    } catch (err) {
      console.error(err);
      toastError("Could not add the standard set.");
    } finally {
      setBusy(null);
    }
  };

  /**
   * The editor REPLACES this list rather than opening over it — the same
   * shape Operations -> Overview -> Changes uses. A machine is eight sections
   * and sixty fields; the dialog it used to live in was 768px of edge-to-edge
   * iPad with the Save button behind the keyboard.
   */
  if (editing && studioId) {
    const entry =
      editing.kind === "entry"
        ? rosterEntries.find((e) => e.machineId === editing.machineId)
        : undefined;
    const resolvedMachine =
      editing.kind === "entry"
        ? machines.find((m) => m.machineId === editing.machineId)
        : undefined;
    const catalogEntry =
      entry && entry.source === "catalog"
        ? catalog.find((c) => c.id === entry.basedOn)
        : editing.kind === "entry"
          ? catalog.find((c) => c.id === editing.machineId)
          : undefined;

    return (
      <StudioMachineEditor
        studioId={studioId}
        studioName={studioName}
        entry={entry}
        resolved={resolvedMachine}
        catalogEntry={catalogEntry}
        catalog={catalog}
        rosteredIds={rosteredIds}
        scope={scope}
        backLabel={studioName ? `${studioName}'s floor` : "The floor"}
        onBack={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {!hideHeading && (
            <h2 className="text-2xl font-black uppercase tracking-tight">
              Equipment {studioName ? `· ${studioName}` : ""}
            </h2>
          )}
          <p className="text-sm text-[var(--adm-ink-muted)]">
            {ownedCount} machine{ownedCount === 1 ? "" : "s"} in service. Trainers running a
            session here see exactly this list.
          </p>
        </div>
        {!readOnly && (
        <div className="flex flex-wrap gap-2">
          {reorderIds ? (
            <>
              <AdminButton variant="ghost" onClick={resetOrder} disabled={savingOrder}>
                <RotateCcw className="h-4 w-4" aria-hidden /> MSF standard
              </AdminButton>
              <AdminButton
                variant="quiet"
                onClick={() => setReorderIds(null)}
                disabled={savingOrder}
              >
                <X className="h-4 w-4" aria-hidden /> Cancel
              </AdminButton>
              <AdminButton variant="primary" onClick={saveOrder} busy={savingOrder}>
                {!savingOrder && <Check className="h-4 w-4" aria-hidden />}
                Save order
              </AdminButton>
            </>
          ) : (
            <>
          {floorInOrder.length > 1 && (
            <AdminButton
              variant="quiet"
              onClick={() => setReorderIds(floorInOrder.map((m) => m.machineId))}
            >
              <ArrowUpDown className="h-4 w-4" aria-hidden /> Walking order
            </AdminButton>
          )}
          <AdminButton variant="quiet" onClick={() => setAdding(true)}>
            <Library className="h-4 w-4" aria-hidden /> Add from MSF
          </AdminButton>
          {/* Through the studio machine editor until the Machine Codex's
              Guided forge exists (wave 2, Catalog R5). */}
          <AdminButton variant="primary" onClick={() => setEditing({ kind: "new" })}>
            <Plus className="h-4 w-4" aria-hidden /> New machine
          </AdminButton>
            </>
          )}
        </div>
        )}
      </div>

      {!reorderIds && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-9"
            placeholder="Search equipment"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {reorderIds ? (
        /* WALKING-ORDER MODE. Only machines actually in service, unfiltered
           and in order - moving inside a filtered list moves a row to a
           position that does not exist once the filter clears. Search is
           hidden above for the same reason. */
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--adm-ink-muted)]">
            Move each machine to where it is walked, or drag it. {orderReach(floorName)}
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={reorderIds} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1.5">
                {reorderIds.map((machineId, i) => (
                  <SortableFloorRow
                    key={machineId}
                    machineId={machineId}
                    name={byId[machineId]?.name ?? machineId}
                    position={i + 1}
                    count={reorderIds.length}
                    onMove={(delta) => setReorderIds((ids) => (ids ? moveInOrder(ids, i, delta) : ids))}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 p-8 text-sm text-[var(--adm-ink-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading equipment…
        </div>
      ) : visible.length === 0 ? (
        /* Nothing to list. A search that matches nothing says so, rather
           than leaving a blank page under the box; an empty floor is the
           caller's to explain (MachinesSection's empty state). */
        search.trim() ? (
          <p className="text-sm text-[var(--adm-ink-muted)]">
            No machine here matches &ldquo;{search.trim()}&rdquo;.
          </p>
        ) : null
      ) : (
        /* One list in the Operations kit's rows (a hairline between rows,
           one border round the list), the same as the other lists on
           Machines, instead of a stock card per machine inside the panel.
           Voice review follow-up, Sep 27 2026.
           A row stacks by the LIST's width, not the screen's (a container
           query): with the machine's door open beside it on a landscape
           iPad the list is about 420px wide, and the row's buttons (about
           480px) left the name no width at all, a letter per line, with the
           last button cut off. 42rem is the buttons plus a readable name. */
        <div className="adm-rows @container overflow-hidden rounded-[10px] border border-[var(--adm-border)] bg-[var(--adm-surface)]">
          {visible.map((m) => {
            const out = m.rosterStatus === "maintenance";
            // Why, and who set it: only on a machine that IS out of service,
            // and never guessed for one set out of service before reasons.
            const reason = out
              ? outOfServiceOfEntry(rosterEntries.find((e) => e.machineId === m.machineId))
              : null;
            const reasonLine = reason ? outOfServiceLineOf(reason) : null;
            return (
              <div
                key={m.machineId}
                className="flex flex-col gap-3 px-3.5 py-3 @2xl:flex-row @2xl:items-center @2xl:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="adm-row__name">{m.name}</span>
                    {m.source === "custom" && <AdminBadge tone="neutral">Ours</AdminBadge>}
                    {out && (
                      <AdminBadge tone="warn" icon={<Wrench className="h-3 w-3" aria-hidden />}>
                        Out of service
                      </AdminBadge>
                    )}
                    {m.overriddenFields.length > 0 && (
                      <AdminBadge tone="neutral">
                        {m.overriddenFields.length} override
                        {m.overriddenFields.length === 1 ? "" : "s"}
                      </AdminBadge>
                    )}
                    {m.catalogStatus === "retired" && (
                      <AdminBadge tone="neutral">Retired from catalog</AdminBadge>
                    )}
                    {m.execution?.neverToFailure && (
                      <AdminBadge tone="alert" icon={<ShieldAlert className="h-3 w-3" aria-hidden />}>
                        Never to failure
                      </AdminBadge>
                    )}
                  </div>
                  <p className="adm-row__meta break-words">
                    {m.movementPattern} · gap {m.universalBaseline?.startingWeightStackGap || "—"}
                  </p>
                  {reasonLine && (
                    <p className="adm-row__meta break-words" data-testid="out-of-service-reason">
                      <span className="font-semibold">Out of service:</span> {reasonLine.reason} · {reasonLine.who}
                      {reasonLine.when ? `, ${reasonLine.when}` : ""}
                    </p>
                  )}
                  {flags?.[m.machineId] && (
                    <p className="adm-row__meta font-semibold">{flags[m.machineId]}</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {onOpenMachine && (
                    <AdminButton size="sm" variant="quiet" onClick={() => onOpenMachine(m.machineId)}>
                      Open
                    </AdminButton>
                  )}
                  {/* The door that did not exist. A custom machine could
                      not be edited at all once saved, and a catalog
                      machine's local copy could only override its name. */}
                  {!readOnly && (
                    <AdminButton
                      variant="quiet"
                      size="sm"
                      onClick={() => setEditing({ kind: "entry", machineId: m.machineId })}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      {m.source === "custom" ? "Edit" : "Set up for us"}
                    </AdminButton>
                  )}
                  {/* Out of service asks why (wave 2, Sep 28 2026); back in
                      service is one tap and takes the reason off with it. */}
                  {!readOnly && (
                    out ? (
                      <AdminButton
                        variant="quiet"
                        size="sm"
                        busy={busy === m.machineId}
                        onClick={() => void putBackInService(m.machineId)}
                      >
                        {busy !== m.machineId && "Back in service"}
                      </AdminButton>
                    ) : (
                      <AdminButton
                        variant="quiet"
                        size="sm"
                        disabled={busy === m.machineId}
                        onClick={() => setAskingOut({ machineId: m.machineId, name: m.name })}
                      >
                        Out of service
                      </AdminButton>
                    )
                  )}
                  {!readOnly && (
                    <AdminButton
                      variant="ghost" size="sm"
                      busy={busy === m.machineId}
                      onClick={() => void switchOff(m.machineId)}
                    >
                      {busy !== m.machineId && "We don't have this"}
                    </AdminButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {askingOut && (
        <OutOfServiceDialog
          machineName={askingOut.name}
          busy={busy === askingOut.machineId}
          onCancel={() => setAskingOut(null)}
          onConfirm={(reason) => void takeOutOfService(askingOut.machineId, reason)}
        />
      )}

      {adding && (
        <AddFromMsfDialog
          studioName={floorName}
          addable={addable}
          busy={busy}
          onAdd={(machineId) => void addToFloor(machineId)}
          onAddStandard={() => void adoptStandardSet()}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
