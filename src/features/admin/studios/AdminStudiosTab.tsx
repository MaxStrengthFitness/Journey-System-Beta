/**
 * Studios — the whole registry on one screen.
 *
 * Replaces AdminStudioManager (1,723 lines, two sub-tabs, uncontrolled forms,
 * and copy like "Cross-Studio Infrastructure & Role Mapping Matrix"). The
 * rules it enforced are now in registry.ts with tests; this file is the
 * screen and the writes.
 *
 * Three defects it carried are fixed here rather than moved:
 *   · every save wrote ownerId and headTrainerId as null (see registry.ts)
 *   · deleting a studio left its id in its network's array
 *   · saving a studio silently rewrote a trainer's role
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { Building2, Plus, ShieldCheck, Wrench } from "lucide-react";
import { auth, db } from "../../../firebase";
import type { Client, FranchiseNetwork, Studio, Trainer } from "../../../types";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import { useToast } from "../../../contexts/ToastContext";
import { getStudioClientCounts } from "../../../lib/studio-client-count";
import { useMachineCatalog } from "../../../hooks/useMachineCatalog";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminField,
  AdminGrid,
  AdminHeader,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminRow,
  AdminRows,
  AdminScreen,
  AdminSelect,
  ConfirmDialog,
} from "../primitives";
import {
  deleteStudioPlan,
  findOrphans,
  hasOrphans,
  linkPlan,
  mindbodyLinkState,
  repairPlan,
  standardSetSeed,
  unlinkPlan,
  validateStudioIdentity,
  type RegistryWrite,
} from "./registry";
import { useMindbodyLocations } from "./useMindbodyLocations";
import { LINK_BADGE, StudioDetailPanel, type StudioForm } from "./StudioDetailPanel";
import { ProvisionalPanel } from "../provisional/ProvisionalPanel";

export interface AdminStudiosTabProps {
  authTrainer: Trainer;
  studios: Studio[];
  networks: FranchiseNetwork[];
  trainers: Trainer[];
  clients: Client[];
  isAdmin: boolean;
  onRefresh?: (
    collectionName: "studios" | "networks" | "trainers",
  ) => Promise<void>;
}

/** Applies a plan from registry.ts as one atomic batch. */
async function applyPlan(writes: RegistryWrite[]): Promise<void> {
  if (writes.length === 0) return;
  const batch = writeBatch(db);
  for (const w of writes) {
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(w.data)) {
      // null in a plan means "remove this field" — the plans are pure and
      // must not import Firestore sentinels to say so.
      payload[key] = value === null ? deleteField() : value;
    }
    batch.update(doc(db, w.collection, w.id), payload);
  }
  await batch.commit();
}

export function AdminStudiosTab({
  authTrainer,
  studios,
  networks,
  trainers,
  clients,
  isAdmin,
  onRefresh,
}: AdminStudiosTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    studios[0]?.id ?? null,
  );
  const [clientCounts, setClientCounts] = useState<Record<string, number | null>>({});
  const [seedSummary, setSeedSummary] = useState<string | null>(null);
  const { catalog } = useMachineCatalog();
  const { success: toastSuccess } = useToast();

  // Keep a selection even after the selected studio is deleted or filtered out.
  useEffect(() => {
    if (selectedId && studios.some((s) => s.id === selectedId)) return;
    setSelectedId(studios[0]?.id ?? null);
  }, [studios, selectedId]);

  /**
   * Client counts come from a server aggregation, not the in-memory roster.
   * The old Overview counted them out of AppContent's client list, which only
   * holds the ACTIVE studio's people — so every other studio read as zero on a
   * screen for comparing studios.
   */
  useEffect(() => {
    let cancelled = false;
    const ids = studios.map((s) => s.id!).filter(Boolean);
    if (ids.length === 0) return;
    void getStudioClientCounts(ids).then((counts) => {
      if (!cancelled) setClientCounts(counts);
    });
    return () => {
      cancelled = true;
    };
  }, [studios]);

  const selected = studios.find((s) => s.id === selectedId) ?? null;
  const orphans = useMemo(() => findOrphans(networks, studios), [networks, studios]);

  /* ---------------- studio writes ---------------- */

  const saveStudio = async (patch: Partial<StudioForm>) => {
    if (!selected?.id) return;
    // Only the fields the form actually rendered and the user actually
    // changed reach this object — which is the whole point of the diff.
    const payload: Record<string, unknown> = { ...patch };
    if ("mindbodyLocationId" in payload) {
      const v = String(payload.mindbodyLocationId ?? "").trim();
      payload.mindbodyLocationId = v ? v : deleteField();
    }
    if ("mindbodySiteId" in payload) {
      payload.mindbodySiteId = String(payload.mindbodySiteId ?? "").trim();
    }
    await updateDoc(doc(db, "studios", selected.id), payload);
    await onRefresh?.("studios");
  };

  const deleteSelectedStudio = async () => {
    if (!selected?.id) return;
    const id = selected.id;
    try {
      // Networks first: if the studio document went first and this failed,
      // the registry would hold a reference to a document that no longer
      // exists — the exact orphan this ordering prevents.
      await applyPlan(deleteStudioPlan(networks, id));
      await deleteDoc(doc(db, "studios", id));
      setSelectedId(null);
      await onRefresh?.("networks");
      await onRefresh?.("studios");
      toastSuccess("Studio deleted, and removed from every franchise listing it.");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `studios/${id}`);
    }
  };

  const changeNetwork = async (networkId: string | null) => {
    if (!selected?.id) return;
    try {
      const current = networks.find((n) => n.id === selected.networkId);
      const writes: RegistryWrite[] = [];
      if (current) writes.push(...unlinkPlan(current, selected.id));
      if (networkId) {
        const next = networks.find((n) => n.id === networkId);
        if (next) writes.push(...linkPlan(next, selected.id));
      }
      await applyPlan(writes);
      await onRefresh?.("networks");
      await onRefresh?.("studios");
      toastSuccess(networkId ? "Studio moved." : "Studio is now independent.");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "networks");
    }
  };

  const seedStandardSet = async () => {
    if (!selected?.id) return;
    const studioId = selected.id;
    try {
      // Read the roster at seed time rather than trusting a stream: this is
      // the one place where being a few seconds stale would write a duplicate.
      const rosterSnap = await getDocs(
        collection(db, "studios", studioId, "roster"),
      );
      const rostered = rosterSnap.docs.map((d) => d.id);
      const { seed, duplicates, alreadyPresent } = standardSetSeed(
        catalog as any[],
        rostered,
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

      const dupCount = Object.values(duplicates).flat().length;
      setSeedSummary(
        `${seed.length} added${alreadyPresent ? `, ${alreadyPresent} already there` : ""}${
          dupCount
            ? `. ${dupCount} duplicate catalog ${dupCount === 1 ? "entry" : "entries"} collapsed — delete ${Object.values(duplicates).flat().join(", ")} from the catalog.`
            : "."
        }`,
      );
      toastSuccess(`Added ${seed.length} machines to ${selected.name}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `studios/${studioId}/roster`);
    }
  };

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Building2 className="w-5 h-5" />}
        title="Studios"
        subtitle="Every location, its Mindbody link and its franchise. Set the Site ID here and bookings file themselves against the right studio."
        actions={
          <AdminBadge tone="neutral">
            {studios.length} {studios.length === 1 ? "location" : "locations"}
          </AdminBadge>
        }
      />

      {hasOrphans(orphans) && (
        <RegistryHealthPanel
          orphans={orphans}
          onRepair={async () => {
            try {
              await applyPlan(repairPlan(networks, studios));
              await onRefresh?.("networks");
              await onRefresh?.("studios");
              toastSuccess("Registry repaired.");
            } catch (err) {
              handleFirestoreError(err, OperationType.UPDATE, "networks");
            }
          }}
        />
      )}

      <div className="adm-ov__cols">
        <div className="adm-ov__stack">
          <AdminPanel
            title="Locations"
            subtitle="Pick a studio to edit it."
            flush
          >
            {studios.length === 0 ? (
              <div className="p-4">
                <AdminEmpty title="No studios yet">
                  Add the first location below. You will need its Mindbody Site
                  ID.
                </AdminEmpty>
              </div>
            ) : (
              <AdminRows>
                {studios.map((s) => {
                  const state = mindbodyLinkState(s, studios);
                  const badge = LINK_BADGE[state];
                  const count = clientCounts[s.id ?? ""];
                  return (
                    <AdminRow
                      key={s.id}
                      onClick={() => setSelectedId(s.id ?? null)}
                      className={s.id === selectedId ? "adm-row--tappable" : undefined}
                      name={
                        <span className="flex items-center gap-2">
                          {s.name}
                          {s.id === selectedId && (
                            <AdminBadge tone="hero">Editing</AdminBadge>
                          )}
                        </span>
                      }
                      meta={
                        <>
                          {networks.find((n) => n.id === s.networkId)?.name ??
                            "Independent"}
                          {" · "}
                          {count === undefined
                            ? "counting…"
                            : count === null
                              ? "clients unknown"
                              : `${count} active clients`}
                        </>
                      }
                      trailing={<AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>}
                    />
                  );
                })}
              </AdminRows>
            )}
          </AdminPanel>

          {isAdmin && (
            <NewStudioPanel
              authTrainer={authTrainer}
              studios={studios}
              onCreated={async (id) => {
                setSelectedId(id);
                await onRefresh?.("studios");
              }}
            />
          )}

          <NetworksPanel
            networks={networks}
            studios={studios}
            trainers={trainers}
            isAdmin={isAdmin}
            onRefresh={onRefresh}
          />
        </div>

        <div className="adm-ov__stack">
          {selected ? (
            <>
            <StudioDetailPanel
              studio={selected}
              studios={studios}
              networks={networks}
              trainers={trainers}
              clientCount={clientCounts[selected.id ?? ""] ?? null}
              canDelete={isAdmin}
              onSave={saveStudio}
              onDelete={deleteSelectedStudio}
              onChangeNetwork={changeNetwork}
              onSeedStandardSet={seedStandardSet}
              seedSummary={seedSummary}
            />
            <ProvisionalPanel
              studio={selected}
              clients={clients}
              trainers={trainers}
              authTrainer={authTrainer}
              onCreated={async () => {
                await onRefresh?.("trainers");
              }}
            />
            </>
          ) : (
            <AdminPanel title="Studio details">
              <AdminEmpty title="Nothing selected">
                Pick a location on the left.
              </AdminEmpty>
            </AdminPanel>
          )}
        </div>
      </div>
    </AdminScreen>
  );
}

/* ==================================================================== *
 * Registry health
 * ==================================================================== */

function RegistryHealthPanel({
  orphans,
  onRepair,
}: {
  orphans: ReturnType<typeof findOrphans>;
  onRepair: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const total =
    orphans.danglingStudioIds.reduce((n, d) => n + d.studioIds.length, 0) +
    orphans.strandedStudios.length +
    orphans.oneSidedLinks.length;

  return (
    <AdminPanel
      title="Registry needs attention"
      icon={<ShieldCheck className="w-3.5 h-3.5" />}
      subtitle="Franchise links where the two sides disagree. Left alone these quietly break studio filters."
      actions={
        <AdminButton
          variant="primary"
          size="sm"
          busy={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onRepair();
            } finally {
              setBusy(false);
            }
          }}
        >
          <Wrench className="w-3.5 h-3.5" />
          Repair {total}
        </AdminButton>
      }
    >
      <div className="flex flex-col gap-2">
        {orphans.danglingStudioIds.map((d) => (
          <AdminNotice key={d.networkId} tone="warn">
            <b>{d.networkName}</b> lists {d.studioIds.length} studio
            {d.studioIds.length === 1 ? "" : "s"} that no longer exist.
          </AdminNotice>
        ))}
        {orphans.strandedStudios.map((s) => (
          <AdminNotice key={s.studioId} tone="warn">
            <b>{s.studioName}</b> belongs to a franchise that no longer exists.
          </AdminNotice>
        ))}
        {orphans.oneSidedLinks.map((l) => (
          <AdminNotice key={`${l.networkId}-${l.studioId}`} tone="info">
            {l.side === "studio-only" ? (
              <>
                <b>{l.studioName}</b> says it is in {l.networkName}, but the
                franchise does not list it.
              </>
            ) : (
              <>
                <b>{l.networkName}</b> lists {l.studioName}, which says it
                belongs elsewhere.
              </>
            )}
          </AdminNotice>
        ))}
      </div>
    </AdminPanel>
  );
}

/* ==================================================================== *
 * Creating a studio
 * ==================================================================== */

function NewStudioPanel({
  authTrainer,
  studios,
  onCreated,
}: {
  authTrainer: Trainer;
  studios: Studio[];
  onCreated: (id: string) => Promise<void>;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [name, setName] = useState("");
  const [siteId, setSiteId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [mode, setMode] = useState<"linked" | "offline">("linked");
  const [saving, setSaving] = useState(false);

  const locations = useMindbodyLocations(siteId);
  const problem = validateStudioIdentity({ siteId, locationId, studios, mode });
  const canSubmit = !!name.trim() && !problem && !saving;

  const create = async () => {
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "studios"), {
        name: name.trim(),
        timezone,
        createdAt: serverTimestamp(),
        ownerId: authTrainer.id,
        mindbodyMode: mode,
        ...(siteId.trim() ? { mindbodySiteId: siteId.trim() } : {}),
        ...(locationId.trim() ? { mindbodyLocationId: locationId.trim() } : {}),
      });
      setName("");
      setSiteId("");
      setLocationId("");
      toastSuccess(
        "Studio created. Add the standard machine set from its Equipment panel.",
      );
      await onCreated(ref.id);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "studios");
      toastError("Could not create the studio.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPanel
      title="Add a location"
      icon={<Plus className="w-3.5 h-3.5" />}
      subtitle="A Site ID is all it takes — or none at all, for a floor that is not on Mindbody yet. The standard twenty machines can be added straight after."
    >
      <AdminGrid>
        <AdminField label="Studio name" required>
          <AdminInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Max Strength Chardon"
          />
        </AdminField>
        <AdminField label="Time zone">
          <AdminSelect
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            <option value="America/New_York">Eastern — America/New_York</option>
            <option value="America/Chicago">Central — America/Chicago</option>
            <option value="America/Denver">Mountain — America/Denver</option>
            <option value="America/Phoenix">Arizona — America/Phoenix</option>
            <option value="America/Los_Angeles">Pacific — America/Los_Angeles</option>
          </AdminSelect>
        </AdminField>
        <AdminField
          label="Mindbody"
          hint="Offline studios can be created, staffed and run today, and linked later."
        >
          <AdminSelect
            value={mode}
            onChange={(e) => setMode(e.target.value as "linked" | "offline")}
          >
            <option value="linked">Linked to Mindbody</option>
            <option value="offline">Offline — pre-launch or demo floor</option>
          </AdminSelect>
        </AdminField>
        <AdminField
          label="Mindbody Site ID"
          required={mode === "linked"}
          error={problem?.code === "no-site" && siteId ? problem.message : null}
        >
          <AdminInput
            inputMode="numeric"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            placeholder="e.g. 29068"
          />
        </AdminField>
        <AdminField
          label="Mindbody location"
          hint={locations.status || "Only needed when a site holds more than one studio."}
          error={problem && problem.code !== "no-site" ? problem.message : null}
        >
          {locations.locations.length > 0 ? (
            <AdminSelect
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              <option value="">No location — this site has one studio</option>
              {locations.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.id})
                </option>
              ))}
            </AdminSelect>
          ) : (
            <AdminInput
              inputMode="numeric"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              placeholder={locations.loading ? "Loading…" : "Location ID"}
            />
          )}
        </AdminField>
      </AdminGrid>

      <div className="mt-3 flex items-center gap-3">
        <AdminButton
          variant="hero"
          disabled={!canSubmit}
          busy={saving}
          onClick={() => void create()}
        >
          Create studio
        </AdminButton>
        {problem && siteId && (
          <span className="adm-hint adm-hint--error">{problem.message}</span>
        )}
      </div>
    </AdminPanel>
  );
}

/* ==================================================================== *
 * Franchise networks
 * ==================================================================== */

function NetworksPanel({
  networks,
  studios,
  trainers,
  isAdmin,
  onRefresh,
}: {
  networks: FranchiseNetwork[];
  studios: Studio[];
  trainers: Trainer[];
  isAdmin: boolean;
  onRefresh?: (c: "studios" | "networks" | "trainers") => Promise<void>;
}) {
  const { success: toastSuccess } = useToast();
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<FranchiseNetwork | null>(null);

  const create = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "networks"), {
        name: name.trim(),
        state: state.trim(),
        ownerIds: ownerId ? [ownerId] : [],
        studioIds: [],
        createdAt: serverTimestamp(),
      });
      setName("");
      setState("");
      setOwnerId("");
      await onRefresh?.("networks");
      toastSuccess("Franchise created.");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "networks");
    } finally {
      setSaving(false);
    }
  };

  const performDelete = async () => {
    if (!toDelete) return;
    try {
      // Unlink first, delete second — so a failure half way leaves studios
      // pointing at a franchise that still exists rather than at nothing.
      const writes = (toDelete.studioIds || [])
        .filter(Boolean)
        .map((sid) => ({
          collection: "studios" as const,
          id: sid,
          data: { networkId: null },
        }));
      await applyPlan(writes);
      await deleteDoc(doc(db, "networks", toDelete.id));
      await onRefresh?.("networks");
      await onRefresh?.("studios");
      toastSuccess(`${toDelete.name} deleted. Its studios are now independent.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `networks/${toDelete.id}`);
    } finally {
      setToDelete(null);
    }
  };

  const owners = trainers.filter((t) =>
    ["Admin", "Founder", "Owner", "FranchiseOwner", "StudioOwner", "Overseer"].includes(
      t.role,
    ),
  );

  return (
    <AdminPanel
      title="Franchises"
      subtitle="A franchise groups locations under one owner. A studio belongs to at most one."
      flush
    >
      {networks.length === 0 ? (
        <div className="p-4">
          <AdminEmpty title="No franchises yet">
            Locations work fine without one — a franchise only groups them for
            reporting and access.
          </AdminEmpty>
        </div>
      ) : (
        <AdminRows>
          {networks.map((n) => {
            const members = studios.filter((s) => s.networkId === n.id);
            return (
              <AdminRow
                key={n.id}
                name={n.name}
                meta={
                  <>
                    {n.state || "No state set"} ·{" "}
                    {members.length === 0
                      ? "no locations"
                      : members.map((s) => s.name).join(", ")}
                  </>
                }
                trailing={
                  isAdmin && (
                    <AdminButton
                      variant="ghost"
                      size="sm"
                      onClick={() => setToDelete(n)}
                    >
                      Delete
                    </AdminButton>
                  )
                }
              />
            );
          })}
        </AdminRows>
      )}

      {isAdmin && (
        <div className="p-3.5" style={{ borderTop: "1px solid var(--adm-border)" }}>
          <AdminGrid>
            <AdminField label="Franchise name">
              <AdminInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Max Strength Ohio"
              />
            </AdminField>
            <AdminField label="State">
              <AdminInput
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="e.g. Ohio"
              />
            </AdminField>
            <AdminField label="Owner">
              <AdminSelect
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
              >
                <option value="">Choose later</option>
                {owners.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
          </AdminGrid>
          <div className="mt-3">
            <AdminButton
              variant="primary"
              disabled={!name.trim()}
              busy={saving}
              onClick={() => void create()}
            >
              Create franchise
            </AdminButton>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        destructive
        title={`Delete ${toDelete?.name}?`}
        body={`Its ${toDelete?.studioIds?.length ?? 0} location(s) become independent. The studios themselves are not deleted.`}
        confirmLabel="Delete franchise"
        onCancel={() => setToDelete(null)}
        onConfirm={() => void performDelete()}
      />
    </AdminPanel>
  );
}
