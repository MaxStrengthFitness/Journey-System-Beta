/**
 * ADD A STUDIO — the registry's create form.
 *
 * Moved from the All locations screen in the Admins room (Sep 28 2026),
 * unchanged but for one thing: it joins the leave question now
 * (features/unsaved-changes), so a half-typed studio is not lost to a tap on
 * another page without being asked.
 *
 * A Site ID is all it takes — or none at all, for a floor that is not on
 * Mindbody yet (an offline studio can be created, staffed and run today, and
 * linked later). validateStudioIdentity is the same rule the details form
 * uses, so the two cannot drift apart.
 */
import { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { Plus } from "lucide-react";
import { db } from "../../../firebase";
import type { Studio, Trainer } from "../../../types";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import { useToast } from "../../../contexts/ToastContext";
import { useUnsavedChanges } from "../../unsaved-changes";
import { AdminButton, AdminField, AdminGrid, AdminInput, AdminPanel, AdminSelect } from "../primitives";
import { validateStudioIdentity } from "./registry";
import { useMindbodyLocations } from "./useMindbodyLocations";

export function NewStudioPanel({
  authTrainer,
  studios,
  onCreated,
}: {
  authTrainer: Trainer;
  studios: Studio[];
  onCreated: (id: string) => Promise<void> | void;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [name, setName] = useState("");
  const [siteId, setSiteId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [mode, setMode] = useState<"linked" | "offline">("linked");
  const [saving, setSaving] = useState(false);

  const clear = () => {
    setName("");
    setSiteId("");
    setLocationId("");
  };
  const typed = Boolean(name.trim() || siteId.trim() || locationId.trim());
  useUnsavedChanges(typed && !saving, "the new studio", { onDiscard: clear });

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
      clear();
      toastSuccess("Studio created. Add the standard machine set from its Floor.");
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
      title="Add a studio"
      icon={<Plus className="w-3.5 h-3.5" />}
      subtitle="A Site ID is all it takes — or none at all, for a floor that is not on Mindbody yet. The standard twenty machines can be added straight after, from the studio's Floor."
    >
      <AdminGrid>
        <AdminField label="Studio name" required htmlFor="new-studio-name">
          <AdminInput id="new-studio-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Max Strength Chardon" />
        </AdminField>
        <AdminField label="Time zone">
          <AdminSelect value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            <option value="America/New_York">Eastern — America/New_York</option>
            <option value="America/Chicago">Central — America/Chicago</option>
            <option value="America/Denver">Mountain — America/Denver</option>
            <option value="America/Phoenix">Arizona — America/Phoenix</option>
            <option value="America/Los_Angeles">Pacific — America/Los_Angeles</option>
          </AdminSelect>
        </AdminField>
        <AdminField label="Mindbody" hint="Offline studios can be created, staffed and run today, and linked later.">
          <AdminSelect value={mode} onChange={(e) => setMode(e.target.value as "linked" | "offline")}>
            <option value="linked">Linked to Mindbody</option>
            <option value="offline">Offline — pre-launch or demo floor</option>
          </AdminSelect>
        </AdminField>
        <AdminField label="Mindbody Site ID" required={mode === "linked"} error={problem?.code === "no-site" && siteId ? problem.message : null}>
          <AdminInput inputMode="numeric" value={siteId} onChange={(e) => setSiteId(e.target.value)} placeholder="e.g. 29068" />
        </AdminField>
        <AdminField
          label="Mindbody location"
          hint={locations.status || "Only needed when a site holds more than one studio."}
          error={problem && problem.code !== "no-site" ? problem.message : null}
        >
          {locations.locations.length > 0 ? (
            <AdminSelect value={locationId} onChange={(e) => setLocationId(e.target.value)}>
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

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <AdminButton variant="hero" disabled={!canSubmit} busy={saving} onClick={() => void create()}>
          Create studio
        </AdminButton>
        {problem && siteId && <span className="adm-hint adm-hint--error">{problem.message}</span>}
      </div>
    </AdminPanel>
  );
}
