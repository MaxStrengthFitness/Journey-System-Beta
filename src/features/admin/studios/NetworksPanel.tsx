/**
 * FRANCHISES — who owns which studios.
 *
 * Moved from the All locations screen in the Admins room (Sep 28 2026) to a
 * page of its own (Admins → Studios → Franchises), unchanged. A franchise
 * groups locations under one owner; a studio belongs to at most one.
 * Deleting a franchise unlinks its studios first, then deletes it, so a
 * failure half way leaves studios pointing at a franchise that still exists
 * rather than at nothing — and deleting one asks first.
 */
import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../../../firebase";
import type { FranchiseNetwork, Studio, Trainer } from "../../../types";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import { useToast } from "../../../contexts/ToastContext";
import { useUnsavedChanges } from "../../unsaved-changes";
import {
  AdminButton,
  AdminEmpty,
  AdminField,
  AdminGrid,
  AdminInput,
  AdminPanel,
  AdminRow,
  AdminRows,
  AdminSelect,
  ConfirmDialog,
} from "../primitives";
import { applyPlan } from "./registry-writes";

type Refresh = (c: "studios" | "networks" | "trainers") => Promise<void>;

export function NetworksPanel({
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
  onRefresh?: Refresh;
}) {
  const { success: toastSuccess } = useToast();
  const [name, setName] = useState("");
  const [state, setState] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<FranchiseNetwork | null>(null);

  const typed = Boolean(name.trim() || state.trim());
  useUnsavedChanges(typed && !saving, "the new franchise", {
    onDiscard: () => {
      setName("");
      setState("");
      setOwnerId("");
    },
  });

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
      const writes = (toDelete.studioIds || []).filter(Boolean).map((sid) => ({
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

  const owners = trainers.filter((t) => ["Admin", "Founder", "Owner", "FranchiseOwner", "StudioOwner", "Overseer"].includes(t.role));

  return (
    <AdminPanel title="Franchises" subtitle="A franchise groups locations under one owner. A studio belongs to at most one." flush>
      {networks.length === 0 ? (
        <div className="p-4">
          <AdminEmpty title="No franchises yet">
            Locations work fine without one — a franchise only groups them for reporting and access.
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
                    {n.state || "No state set"} · {members.length === 0 ? "no locations" : members.map((s) => s.name).join(", ")}
                  </>
                }
                trailing={
                  isAdmin && (
                    <AdminButton variant="ghost" size="sm" onClick={() => setToDelete(n)}>
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
              <AdminInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Max Strength Ohio" />
            </AdminField>
            <AdminField label="State">
              <AdminInput value={state} onChange={(e) => setState(e.target.value)} placeholder="e.g. Ohio" />
            </AdminField>
            <AdminField label="Owner">
              <AdminSelect value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
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
            <AdminButton variant="primary" disabled={!name.trim()} busy={saving} onClick={() => void create()}>
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
