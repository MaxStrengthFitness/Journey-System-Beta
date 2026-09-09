/**
 * One studio's floor, on the Studios screen.
 *
 * Section 5 asked for the studio equipment editor to move into Studio
 * Management, and it belongs there: what a location physically owns is a
 * property of that location, not a separate area of the app you navigate to
 * and then pick a studio inside.
 *
 * The existing StudioInventoryManager is rendered here rather than rebuilt —
 * it already handles adding from the catalog, retiring, and authoring a
 * machine the catalog has never heard of, and a second implementation of any
 * of those is the exact duplication this round is removing. What is new is
 * the local-metadata layer above it: cloning a template and saying what is
 * different about THIS unit.
 */

import React, { useMemo, useState } from "react";
import { collection, doc, getDocs, serverTimestamp, setDoc, writeBatch } from "firebase/firestore";
import { Dumbbell, Sparkles, Wrench } from "lucide-react";
import { auth, db } from "../../../firebase";
import type { Studio, Trainer } from "../../../types";
import { useStudioMachines } from "../../../hooks/useStudioMachines";
import { useMachineCatalog } from "../../../hooks/useMachineCatalog";
import { useToast } from "../../../contexts/ToastContext";
import {
  OperationType,
  handleFirestoreError,
} from "../../../lib/firestore-errors";
import { StudioInventoryManager } from "../../../components/machines/StudioInventoryManager";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminNotice,
  AdminPanel,
  AdminRow,
  AdminRows,
} from "../primitives";
import { standardSetSeed } from "../studios/registry";
import { describeOverrides, overriddenSafetyFields } from "./clone";
import { LocalSetupDialog } from "./LocalSetupDialog";
import { UpkeepDialog } from "../upkeep/UpkeepDialog";
import { useStudioUpkeep } from "../upkeep/useStudioUpkeep";
import { DEFAULT_UPKEEP_POLICY, tallyUpkeep, worstStatus } from "../upkeep/upkeepLog";
import { studioDateKey } from "../../../lib/studio-time";

export interface StudioEquipmentPanelProps {
  studio: Studio;
  authTrainer?: Trainer | null;
}

export function StudioEquipmentPanel({
  studio,
  authTrainer,
}: StudioEquipmentPanelProps) {
  const studioId = studio.id ?? "";
  const { success: toastSuccess } = useToast();
  /*
   * `catalogLoading` was NOT read before, and that is the other half of "the
   * standard set fails to load".
   *
   * useMachineCatalog is an onSnapshot subscription: on first render it
   * returns an EMPTY array and only fills in when Firestore answers. The
   * button was enabled from the first paint, so a tap in that window ran
   * standardSetSeed over `[]`, wrote nothing, threw nothing, and printed
   * "0 added" as though that were the answer. On studio wifi that window is
   * comfortably long enough to click through.
   */
  const { catalog, loading: catalogLoading } = useMachineCatalog();
  const { rosterEntries, loading } = useStudioMachines(studioId, {
    includeInactive: true,
  });
  const [seeding, setSeeding] = useState(false);
  const [seedSummary, setSeedSummary] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [upkeepFor, setUpkeepFor] = useState<string | null>(null);
  const [showInventory, setShowInventory] = useState(false);
  const { events: upkeepEvents } = useStudioUpkeep(studioId);
  const todayKey = studioDateKey(new Date()) ?? "";

  const catalogById = useMemo(
    () => Object.fromEntries(catalog.map((c) => [c.id, c])),
    [catalog],
  );

  const rows = useMemo(
    () =>
      [...rosterEntries]
        .map((entry) => {
          const base = catalogById[entry.machineId];
          const overrides =
            entry.source === "catalog" ? entry.overrides : undefined;
          return {
            entry,
            name:
              (overrides?.name as string | undefined) ??
              (entry.source === "custom"
                ? entry.definition?.name
                : base?.name) ??
              entry.machineId,
            summary:
              entry.source === "custom"
                ? "This studio's own machine"
                : describeOverrides(overrides),
            risky: overriddenSafetyFields(overrides),
            notes: entry.studioNotes,
            serial: entry.unit?.serialNumber,
            upkeep: worstStatus(
              tallyUpkeep(upkeepEvents, entry.machineId, todayKey),
              DEFAULT_UPKEEP_POLICY,
            ),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rosterEntries, catalogById, upkeepEvents, todayKey],
  );

  const seedStandardSet = async () => {
    if (!studioId) return;
    // Refuse rather than write nothing and call it success. An empty catalog
    // is a real state (a fresh database, or rules refusing /machines), and it
    // needs to say so — "0 added" reads as "this studio already has them".
    if (catalogLoading) {
      setSeedSummary("Still loading the machine catalog — try again in a moment.");
      return;
    }
    if (catalog.length === 0) {
      setSeedSummary(
        "The machine catalog is empty, so there is nothing to copy. Seed it from Admin -> Machines first, or check that your account can read /machines.",
      );
      return;
    }
    setSeeding(true);
    try {
      const snap = await getDocs(collection(db, "studios", studioId, "roster"));
      const { seed, duplicates, alreadyPresent } = standardSetSeed(
        catalog as any[],
        snap.docs.map((d) => d.id),
      );
      const batch = writeBatch(db);
      for (const machine of seed) {
        batch.set(
          doc(db, "studios", studioId, "roster", machine.id),
          {
            machineId: machine.id,
            studioId,
            source: "catalog",
            basedOn: machine.id,
            status: "active",
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.uid ?? null,
          },
          { merge: true },
        );
      }
      await batch.commit();
      const dupes = Object.values(duplicates).flat();
      if (seed.length === 0 && alreadyPresent === 0) {
        // Catalog had entries but none qualified. Almost always a status
        // value the filter does not recognise, so name the cause instead of
        // reporting a bare zero.
        setSeedSummary(
          `None of the ${catalog.length} catalog machines qualified for the standard set. ` +
            `Check that they are marked active and not excluded with inStandardSet: false.`,
        );
        return;
      }
      setSeedSummary(
        `${seed.length} added${alreadyPresent ? `, ${alreadyPresent} already on the floor` : ""}.${
          dupes.length
            ? ` ${dupes.length} duplicate catalog ${dupes.length === 1 ? "entry" : "entries"} collapsed — delete ${dupes.join(", ")} from the catalog.`
            : ""
        }`,
      );
      if (seed.length > 0) {
        toastSuccess(`Added ${seed.length} machines to ${studio.name}.`);
      }
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `studios/${studioId}/roster`,
      );
    } finally {
      setSeeding(false);
    }
  };

  const editingRow = rows.find((r) => r.entry.machineId === editing) ?? null;

  return (
    <AdminPanel
      title="Equipment"
      icon={<Dumbbell className="w-3.5 h-3.5" />}
      subtitle="What this location physically has. Machines follow the catalog unless this studio says otherwise, so an Academy correction still reaches every field nobody overrode."
      actions={
        <AdminBadge tone="neutral">
          {loading ? "…" : `${rows.length} on the floor`}
        </AdminBadge>
      }
    >
      <div className="flex flex-wrap items-center gap-3">
        <AdminButton
          variant="primary"
          busy={seeding || catalogLoading}
          onClick={() => void seedStandardSet()}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Add the standard set
        </AdminButton>
        <AdminButton variant="quiet" onClick={() => setShowInventory((v) => !v)}>
          <Wrench className="w-3.5 h-3.5" />
          {showInventory ? "Hide" : "Add, retire or build a machine"}
        </AdminButton>
        {seedSummary && (
          <span className="adm-hint" style={{ margin: 0 }}>
            {seedSummary}
          </span>
        )}
      </div>

      {rows.length === 0 && !loading && (
        <div className="mt-4">
          <AdminEmpty title="No equipment yet">
            Most locations run the same twenty machines. Adding them is safe to
            repeat — anything already on the floor is skipped.
          </AdminEmpty>
        </div>
      )}

      {rows.length > 0 && (
        <div className="mt-4">
          <AdminRows>
            {rows.map((row) => (
              <AdminRow
                key={row.entry.machineId}
                name={row.name}
                meta={
                  <>
                    {row.summary}
                    {row.serial ? ` · ${row.serial}` : ""}
                    {row.notes ? ` · ${row.notes}` : ""}
                  </>
                }
                trailing={
                  <span className="flex items-center gap-2">
                    {row.risky.length > 0 && (
                      <AdminBadge tone="warn">
                        {row.risky.length} safety field
                        {row.risky.length === 1 ? "" : "s"} overridden
                      </AdminBadge>
                    )}
                    {row.entry.status !== "active" && (
                      <AdminBadge tone="neutral">
                        {row.entry.status}
                      </AdminBadge>
                    )}
                    {row.upkeep === "overdue" && (
                      <AdminBadge tone="alert">Upkeep overdue</AdminBadge>
                    )}
                    {row.upkeep === "due" && (
                      <AdminBadge tone="warn">Upkeep due</AdminBadge>
                    )}
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setUpkeepFor(row.entry.machineId)}
                    >
                      Upkeep
                    </AdminButton>
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(row.entry.machineId)}
                    >
                      Local setup
                    </AdminButton>
                  </span>
                }
              />
            ))}
          </AdminRows>
        </div>
      )}

      {showInventory && (
        <div className="mt-5" style={{ borderTop: "1px solid var(--adm-border)", paddingTop: 16 }}>
          <StudioInventoryManager studioId={studioId} studioName={studio.name} />
        </div>
      )}

      {upkeepFor && (
        <UpkeepDialog
          studioId={studioId}
          machineId={upkeepFor}
          machineName={
            rows.find((r) => r.entry.machineId === upkeepFor)?.name ?? upkeepFor
          }
          events={upkeepEvents}
          authTrainer={authTrainer}
          onClose={() => setUpkeepFor(null)}
        />
      )}

      {editingRow && (
        <LocalSetupDialog
          studioId={studioId}
          machineId={editingRow.entry.machineId}
          catalogName={catalogById[editingRow.entry.machineId]?.name ?? editingRow.name}
          catalog={catalogById[editingRow.entry.machineId] as any}
          entry={editingRow.entry as any}
          onClose={() => setEditing(null)}
        />
      )}
    </AdminPanel>
  );
}
