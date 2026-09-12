import React, { useMemo, useState } from "react";
import {
  deleteDoc,
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
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
import { db, auth } from "../../firebase";
import { isStandardSetMachine } from "../../features/admin/studios/registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus, Search, Loader2, Wrench, CheckCircle2, Sparkles, ShieldAlert,
  ArrowUpDown, GripVertical, RotateCcw, Check, X,
} from "lucide-react";
import { useStudioMachines } from "../../hooks/useStudioMachines";
import { useToast } from "../../contexts/ToastContext";
import {
  MachineDefinition, RosterStatus, studioMachineId,
} from "../../types/machines";
import { MachineDefinitionForm, emptyMachineDefinition } from "./MachineDefinitionForm";

/**
 * STUDIO INVENTORY MANAGER — what THIS location actually has.
 *
 * Round: Machine Creator & Studio Roster, Sep 2026.
 *
 * Studio owners and studio leaders pick their equipment from the global
 * catalog and add machines the catalog has never heard of. Writes go to
 * studios/{studioId}/roster/{machineId}; tenancy is enforced by that path in
 * firestore.rules, so a trainer at one location cannot touch another's roster.
 *
 * A roster entry is either:
 *   source 'catalog' — inherits the catalog entry, overrides any field
 *   source 'custom'  — the studio's own definition, with `basedOn` lineage
 *
 * `basedOn` on a custom machine inherits nothing. It exists so a location's
 * bespoke leg press still rolls up against every other leg press in network
 * reporting instead of becoming its own incomparable island.
 */
/**
 * One draggable row in reorder mode.
 *
 * Deliberately plainer than the cards in the normal list: while you are
 * putting twenty machines in order, the badges, switches and maintenance
 * controls are noise, and every one of them is another tap target competing
 * with the drag. Position number on the left, name, handle on the right.
 */
function SortableFloorRow({
  machineId,
  name,
  position,
}: {
  machineId: string;
  name: string;
  position: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: machineId });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5",
        isDragging && "opacity-80 shadow-lg",
      )}
    >
      <span className="w-6 shrink-0 text-center text-xs font-black tabular-nums text-muted-foreground">
        {position}
      </span>
      <span className="min-w-0 flex-1 truncate font-bold uppercase">{name}</span>
      <button
        type="button"
        className="flex h-10 w-10 shrink-0 cursor-grab items-center justify-center rounded-lg text-muted-foreground active:cursor-grabbing"
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
}: {
  studioId: string | null;
  studioName?: string;
}) {
  const { machines, byId, catalog, rosterEntries, loading } = useStudioMachines(studioId, {
    includeInactive: true,
    includeUnrostered: true,
  });
  const { success: toastSuccess, error: toastError } = useToast();

  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [customDraft, setCustomDraft] = useState<MachineDefinition | null>(null);
  const [customBasedOn, setCustomBasedOn] = useState<string>("");
  const [savingCustom, setSavingCustom] = useState(false);
  /**
   * Reorder mode. Null when off; otherwise the machine ids in the order the
   * user is currently dragging them into. Held as a draft rather than written
   * per-drag so twenty small writes become one batch.
   */
  const [reorderIds, setReorderIds] = useState<string[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const rosteredIds = useMemo(
    () => new Set(rosterEntries.map((e) => e.machineId)),
    [rosterEntries],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return machines.filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [machines, search]);

  const ownedCount = machines.filter(
    (m) => rosteredIds.has(m.machineId) && m.rosterStatus !== "inactive",
  ).length;

  /**
   * The floor, in the order trainers will see it. `machines` arrives already
   * sorted by resolveMachineOrder, so this is the current effective order
   * whether or not anybody has ever set one explicitly.
   */
  const floorInOrder = useMemo(
    () =>
      machines.filter(
        (m) => rosteredIds.has(m.machineId) && m.rosterStatus !== "inactive",
      ),
    [machines, rosteredIds],
  );

  if (!studioId) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Select a studio to manage its equipment.
          </p>
        </CardContent>
      </Card>
    );
  }

  /** Add a catalog machine to this roster, or flip its status. */
  const setRosterStatus = async (machineId: string, status: RosterStatus) => {
    setBusy(machineId);
    try {
      const isCustom = rosterEntries.find(
        (e) => e.machineId === machineId && e.source === "custom",
      );
      await setDoc(
        doc(db, "studios", studioId, "roster", machineId),
        {
          machineId,
          studioId,
          status,
          ...(isCustom ? {} : { source: "catalog", basedOn: machineId }),
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid ?? null,
        },
        { merge: true },
      );
    } catch (err) {
      console.error(err);
      toastError("Could not update the roster. Studio leads and admins only.");
    } finally {
      setBusy(null);
    }
  };

  /** Remove entirely — only safe for equipment never used in a session. */
  const removeFromRoster = async (machineId: string) => {
    setBusy(machineId);
    try {
      await deleteDoc(doc(db, "studios", studioId, "roster", machineId));
    } catch (err) {
      console.error(err);
      toastError("Could not remove that machine.");
    } finally {
      setBusy(null);
    }
  };

  /** Onboarding shortcut: adopt everything flagged inStandardSet. */
  /**
   * Save the dragged order.
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

  const adoptStandardSet = async () => {
    setBusy("__standard__");
    try {
      /*
       * Was `c.inStandardSet && c.status === "active"`, which is the OPPOSITE
       * default to the Studios screen's version of the same button: a catalog
       * document written before the flag existed has no `inStandardSet`, so
       * this filter matched nothing and the button reported "Added 0 machines"
       * as a success. Both now share isStandardSetMachine().
       */
      const targets = catalog.filter(
        (c) => isStandardSetMachine(c) && !rosteredIds.has(c.id),
      );
      await Promise.all(
        targets.map((c) =>
          setDoc(
            doc(db, "studios", studioId, "roster", c.id),
            {
              machineId: c.id,
              studioId,
              source: "catalog",
              basedOn: c.id,
              status: "active",
              updatedAt: serverTimestamp(),
              updatedBy: auth.currentUser?.uid ?? null,
            },
            { merge: true },
          ),
        ),
      );
      toastSuccess(`Added ${targets.length} machines to ${studioName ?? "this studio"}.`);
    } catch (err) {
      console.error(err);
      toastError("Could not add the standard set.");
    } finally {
      setBusy(null);
    }
  };

  const saveCustom = async () => {
    if (!customDraft) return;
    const name = customDraft.name.trim();
    if (!name) { toastError("Give the machine a name first."); return; }

    const machineId = studioMachineId(studioId, name);
    if (rosteredIds.has(machineId)) {
      toastError("This studio already has a machine with that name.");
      return;
    }

    setSavingCustom(true);
    try {
      await setDoc(doc(db, "studios", studioId, "roster", machineId), {
        machineId,
        studioId,
        source: "custom",
        ...(customBasedOn ? { basedOn: customBasedOn } : {}),
        status: "active",
        definition: customDraft,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid ?? null,
      });
      toastSuccess(`${name} added to ${studioName ?? "this studio"}.`);
      setCustomDraft(null);
      setCustomBasedOn("");
    } catch (err) {
      console.error(err);
      toastError("Could not save the machine.");
    } finally {
      setSavingCustom(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight">
            Equipment {studioName ? `· ${studioName}` : ""}
          </h2>
          <p className="text-sm text-muted-foreground">
            {ownedCount} machine{ownedCount === 1 ? "" : "s"} in service. Trainers running a
            session here see exactly this list.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {reorderIds ? (
            <>
              <Button variant="ghost" onClick={resetOrder} disabled={savingOrder}>
                <RotateCcw className="mr-1.5 h-4 w-4" /> MSF standard
              </Button>
              <Button
                variant="outline"
                onClick={() => setReorderIds(null)}
                disabled={savingOrder}
              >
                <X className="mr-1.5 h-4 w-4" /> Cancel
              </Button>
              <Button onClick={saveOrder} disabled={savingOrder}>
                {savingOrder ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-4 w-4" />
                )}
                Save order
              </Button>
            </>
          ) : (
            <>
          {floorInOrder.length > 1 && (
            <Button
              variant="outline"
              onClick={() => setReorderIds(floorInOrder.map((m) => m.machineId))}
            >
              <ArrowUpDown className="mr-1.5 h-4 w-4" /> Reorder
            </Button>
          )}
          <Button
            variant="outline"
            onClick={adoptStandardSet}
            disabled={busy === "__standard__"}
          >
            {busy === "__standard__"
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <Sparkles className="mr-1.5 h-4 w-4" />}
            Add standard set
          </Button>
          <Button onClick={() => setCustomDraft(emptyMachineDefinition())}>
            <Plus className="mr-1.5 h-4 w-4" /> Custom machine
          </Button>
            </>
          )}
        </div>
      </div>

      {!reorderIds && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search equipment"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {reorderIds ? (
        /* REORDER MODE. Only machines actually in service, unfiltered and in
           order - dragging inside a filtered list moves a row to a position
           that does not exist once the filter clears. Search is hidden above
           for the same reason. */
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Drag to set the order trainers see. This is the sequence used by the
            Catalog, the client&rsquo;s Journey grid and the Active Session.
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
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading equipment…
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((m) => {
            const rostered = rosteredIds.has(m.machineId);
            const owned = rostered && m.rosterStatus !== "inactive";
            return (
              <Card
                key={m.machineId}
                className={owned ? "" : "opacity-60"}
              >
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold uppercase">{m.name}</span>
                      {m.source === "custom" && (
                        <Badge variant="secondary" className="text-[10px]">Ours</Badge>
                      )}
                      {m.rosterStatus === "maintenance" && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Wrench className="h-3 w-3" /> Maintenance
                        </Badge>
                      )}
                      {m.overriddenFields.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">
                          {m.overriddenFields.length} override
                          {m.overriddenFields.length === 1 ? "" : "s"}
                        </Badge>
                      )}
                      {m.catalogStatus === "retired" && (
                        <Badge variant="secondary" className="text-[10px]">
                          Retired from catalog
                        </Badge>
                      )}
                      {m.execution?.neverToFailure && (
                        <Badge variant="destructive" className="gap-1 text-[10px]">
                          <ShieldAlert className="h-3 w-3" /> Never to failure
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {m.movementPattern} · gap {m.universalBaseline?.startingWeightStackGap || "—"}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {owned && (
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Switch
                          checked={m.rosterStatus === "maintenance"}
                          onCheckedChange={(c) =>
                            setRosterStatus(m.machineId, c ? "maintenance" : "active")
                          }
                        />
                        Out of service
                      </label>
                    )}

                    {owned ? (
                      <Button
                        variant="ghost" size="sm"
                        disabled={busy === m.machineId}
                        onClick={() =>
                          m.source === "custom"
                            ? removeFromRoster(m.machineId)
                            : setRosterStatus(m.machineId, "inactive")
                        }
                      >
                        {busy === m.machineId
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : "We don't have this"}
                      </Button>
                    ) : (
                      <Button
                        variant="outline" size="sm"
                        disabled={busy === m.machineId}
                        onClick={() => setRosterStatus(m.machineId, "active")}
                      >
                        {busy === m.machineId
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> We have this</>}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!customDraft} onOpenChange={(o) => !o && setCustomDraft(null)}>
        <DialogContent className="max-h-[92dvh] sm:max-w-5xl lg:max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-tight">
              Add a custom machine
            </DialogTitle>
          </DialogHeader>

          {customDraft && (
            <>
              <div className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
                <span className="text-xs font-semibold">Which machine is this most like?</span>
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={customBasedOn}
                  onChange={(e) => setCustomBasedOn(e.target.value)}
                >
                  <option value="">None — genuinely novel equipment</option>
                  {catalog
                    .filter((c) => c.status === "active")
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Nothing is inherited from this. It only lets network reporting compare
                  your unit against the same movement at other locations — without it,
                  your leg press becomes its own one-studio leaderboard.
                </p>
              </div>

              <MachineDefinitionForm value={customDraft} onChange={setCustomDraft} />

              <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background pt-3">
                <Button variant="ghost" onClick={() => setCustomDraft(null)}>Cancel</Button>
                <Button onClick={saveCustom} disabled={savingCustom}>
                  {savingCustom && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Add to {studioName ?? "this studio"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
