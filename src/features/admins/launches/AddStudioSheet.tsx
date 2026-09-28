/**
 * ADD A STUDIO — the three-screen sheet from the blueprint (the Admins room's
 * second wave, Sep 28 2026): Who and where → Mindbody → The floor.
 *
 *   1  Who and where   the name, the time zone, its franchise and location
 *                      type, whether it is opening soon or already open, and
 *                      its opening day (optional: AJ's q3, the studios "are
 *                      slowly opening", so a date nobody knows is left empty)
 *   2  Mindbody        linked (a Site ID, and a location on a shared site,
 *                      looked up from Mindbody) or not yet — it runs offline
 *                      until it is. validateStudioIdentity is the same rule
 *                      the details form uses
 *   3  The floor       start it on the MSF standard set (equipment/seed.ts,
 *                      the one writer of that), and what happens on Create
 *
 * Create writes the studio (with its stage), then its franchise link (both
 * sides, registry-writes.ts) and the standard machines; the studio's page
 * opens on Setup. If a later step fails the studio still exists, and its page
 * is where the rest is done. Nothing is recorded in the Activity record for
 * adding a studio: AJ, q1, "we dont need to track who set up a studio".
 *
 * Typing joins the leave question until it is created or cancelled.
 */
import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { ArrowLeft, Plus, X } from "lucide-react";
import { db } from "../../../firebase";
import type { FranchiseNetwork, Studio, Trainer } from "../../../types";
import type { MachineCatalogEntry } from "../../../types/machines";
import { useToast } from "../../../contexts/ToastContext";
import { AdminButton, AdminField, AdminInput, AdminNotice, AdminSelect } from "../../admin/primitives";
import { standardSetSeed, validateStudioIdentity } from "../../admin/studios/registry";
import { moveStudioToNetwork } from "../../admin/studios/registry-writes";
import { useMindbodyLocations } from "../../admin/studios/useMindbodyLocations";
import { seedStandardSet } from "../../admin/equipment/seed";
import { useUnsavedChanges } from "../../unsaved-changes";
import { dayLabel } from "../studios/stages";

const TIME_ZONES = [
  { id: "America/New_York", label: "Eastern" },
  { id: "America/Chicago", label: "Central" },
  { id: "America/Denver", label: "Mountain" },
  { id: "America/Phoenix", label: "Arizona (no DST)" },
  { id: "America/Los_Angeles", label: "Pacific" },
];

const STEP_TITLE = ["Who and where", "Mindbody", "The floor"] as const;

interface Draft {
  name: string;
  timezone: string;
  networkId: string;
  locationType: "franchise" | "corporate";
  opening: "soon" | "open";
  openingDay: string;
  mode: "linked" | "offline";
  siteId: string;
  locationId: string;
  seed: boolean;
}

const EMPTY: Draft = {
  name: "",
  timezone: "America/New_York",
  networkId: "",
  locationType: "franchise",
  opening: "soon",
  openingDay: "",
  mode: "linked",
  siteId: "",
  locationId: "",
  seed: true,
};

/** What Create will write for the studio itself: never an undefined, never a blank Site ID. */
export function newStudioDoc(draft: Draft, ownerId: string): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    name: draft.name.trim(),
    timezone: draft.timezone,
    ownerId,
    mindbodyMode: draft.mode,
    locationType: draft.locationType,
    stage: draft.opening === "open" ? "running" : "setting-up",
  };
  if (/^\d{4}-\d{2}-\d{2}$/.test(draft.openingDay)) doc.openingDay = draft.openingDay;
  if (draft.mode === "linked" && draft.siteId.trim()) doc.mindbodySiteId = draft.siteId.trim();
  if (draft.mode === "linked" && draft.locationId.trim()) doc.mindbodyLocationId = draft.locationId.trim();
  return doc;
}

export function AddStudioSheet({
  open,
  authTrainer,
  studios,
  networks,
  catalog,
  catalogLoading,
  onClose,
  onCreated,
}: {
  open: boolean;
  authTrainer: Trainer;
  studios: Studio[];
  networks: FranchiseNetwork[];
  catalog: MachineCatalogEntry[];
  catalogLoading: boolean;
  onClose: () => void;
  /** The new studio's id: the caller refreshes and opens its page. */
  onCreated: (studioId: string) => void | Promise<void>;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const reset = () => {
    setDraft(EMPTY);
    setStep(0);
    setFailure(null);
  };
  const typed = Boolean(draft.name.trim() || draft.siteId.trim() || draft.locationId.trim() || draft.openingDay);
  useUnsavedChanges(open && typed && !saving, "the new studio", { onDiscard: reset });

  const locations = useMindbodyLocations(open && draft.mode === "linked" ? draft.siteId : "");
  const problem = validateStudioIdentity({ siteId: draft.siteId, locationId: draft.locationId, studios, mode: draft.mode });
  const standard = useMemo(() => standardSetSeed(catalog, []).seed.length, [catalog]);
  const network = networks.find((n) => n.id === draft.networkId) ?? null;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  // Cancel (the button, or Escape) drops what was typed: the next Add a studio starts clean.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) {
        setDraft(EMPTY);
        setStep(0);
        setFailure(null);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  const cancel = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const canContinue = step === 0 ? Boolean(draft.name.trim()) : step === 1 ? !problem : true;
  const name = draft.name.trim() || "the studio";

  const create = async () => {
    setSaving(true);
    setFailure(null);
    let id: string;
    try {
      const ref = await addDoc(collection(db, "studios"), { ...newStudioDoc(draft, authTrainer.id), createdAt: serverTimestamp() });
      id = ref.id;
    } catch (err) {
      setFailure(`Couldn't create ${name}: ${err instanceof Error ? err.message : String(err)}`);
      setSaving(false);
      return;
    }
    const left: string[] = [];
    if (draft.networkId) {
      try {
        await moveStudioToNetwork({ id, networkId: undefined }, networks, draft.networkId);
      } catch {
        left.push("its franchise");
      }
    }
    if (draft.seed && standard > 0) {
      try {
        await seedStandardSet(id, catalog);
      } catch {
        left.push("the standard machines");
      }
    }
    if (left.length) toastError(`${name} was created, but ${left.join(" and ")} couldn't be added. Do it from its page.`);
    else toastSuccess(`${name} was created.`);
    setSaving(false);
    reset();
    await onCreated(id);
  };

  return (
    <div
      className="adm-scrim adm"
      role="presentation"
      onClick={(e) => {
        // A tap beside the sheet closes it only while nothing is typed: typing is never lost to a slip.
        if (e.target === e.currentTarget && !typed) cancel();
      }}
    >
      <div className="adm-dialog hq-sheet" role="dialog" aria-modal="true" aria-label="Add a studio">
        <div className="hq-sheet__head">
          <h3 className="adm-dialog__title">Add a studio</h3>
          <p className="hq-sheet__step">
            Step {step + 1} of 3 · {STEP_TITLE[step]}
          </p>
          <ol className="hq-sheet__steps" aria-label="Steps">
            {STEP_TITLE.map((t, i) => (
              <li key={t} className={i === step ? "hq-sheet__stepname hq-sheet__stepname--on" : "hq-sheet__stepname"} aria-current={i === step ? "step" : undefined}>
                {i + 1} {t}
              </li>
            ))}
          </ol>
        </div>

        <div className="hq-sheet__body">
          {step === 0 ? (
            <>
              <AdminField label="Studio name" required htmlFor="hq-new-name">
                <AdminInput
                  id="hq-new-name"
                  autoFocus
                  value={draft.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Max Strength Chardon"
                />
              </AdminField>
              <AdminField label="Time zone" htmlFor="hq-new-tz">
                <AdminSelect id="hq-new-tz" value={draft.timezone} onChange={(e) => set("timezone", e.target.value)}>
                  {TIME_ZONES.map((tz) => (
                    <option key={tz.id} value={tz.id}>
                      {tz.label} — {tz.id}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminField label="Franchise" htmlFor="hq-new-network">
                <AdminSelect id="hq-new-network" value={draft.networkId} onChange={(e) => set("networkId", e.target.value)}>
                  <option value="">Independent — no franchise</option>
                  {networks.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              <AdminField label="Location type" htmlFor="hq-new-type">
                <AdminSelect id="hq-new-type" value={draft.locationType} onChange={(e) => set("locationType", e.target.value as Draft["locationType"])}>
                  <option value="franchise">Franchise</option>
                  <option value="corporate">Corporate</option>
                </AdminSelect>
              </AdminField>
              <AdminField label="Is it open yet?" htmlFor="hq-new-open">
                <AdminSelect id="hq-new-open" value={draft.opening} onChange={(e) => set("opening", e.target.value as Draft["opening"])}>
                  <option value="soon">Opening soon — it gets a setup checklist</option>
                  <option value="open">Already open — running</option>
                </AdminSelect>
              </AdminField>
              {draft.opening === "soon" ? (
                <AdminField label="Opening day" htmlFor="hq-new-day" hint="Optional. The checklist's due dates count back from it.">
                  <AdminInput id="hq-new-day" type="date" value={draft.openingDay} onChange={(e) => set("openingDay", e.target.value)} />
                </AdminField>
              ) : null}
            </>
          ) : step === 1 ? (
            <>
              <AdminField label="Mindbody" htmlFor="hq-new-mode">
                <AdminSelect id="hq-new-mode" value={draft.mode} onChange={(e) => set("mode", e.target.value as Draft["mode"])}>
                  <option value="linked">Linked — its bookings come from Mindbody</option>
                  <option value="offline">Not yet — it runs offline until it's linked</option>
                </AdminSelect>
              </AdminField>
              {draft.mode === "linked" ? (
                <>
                  <AdminField label="Mindbody Site ID" required htmlFor="hq-new-site" error={problem?.code === "no-site" && draft.siteId ? problem.message : null}>
                    <AdminInput id="hq-new-site" inputMode="numeric" value={draft.siteId} onChange={(e) => set("siteId", e.target.value)} placeholder="e.g. 29068" />
                  </AdminField>
                  <AdminField
                    label="Mindbody location"
                    htmlFor="hq-new-location"
                    hint={locations.status || "Only needed when a site holds more than one studio."}
                    error={problem && problem.code !== "no-site" ? problem.message : null}
                  >
                    {locations.locations.length > 0 ? (
                      <AdminSelect id="hq-new-location" value={draft.locationId} onChange={(e) => set("locationId", e.target.value)}>
                        <option value="">No location — this site has one studio</option>
                        {locations.locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name} ({l.id})
                          </option>
                        ))}
                      </AdminSelect>
                    ) : (
                      <AdminInput
                        id="hq-new-location"
                        inputMode="numeric"
                        value={draft.locationId}
                        onChange={(e) => set("locationId", e.target.value)}
                        placeholder={locations.loading ? "Loading…" : "Location ID"}
                      />
                    )}
                  </AdminField>
                </>
              ) : (
                <p className="hq-standing">Everything works offline; nothing syncs. Link it in its details once its Mindbody account exists.</p>
              )}
            </>
          ) : (
            <>
              <label className="hq-sheet__check">
                <input
                  type="checkbox"
                  checked={draft.seed && standard > 0}
                  disabled={standard === 0}
                  onChange={(e) => set("seed", e.target.checked)}
                />
                <span>
                  {catalogLoading
                    ? "Reading the MSF standard set…"
                    : standard > 0
                      ? `Start ${name} on the MSF standard set: ${standard} ${standard === 1 ? "machine" : "machines"}. Its Floor tab takes off what it doesn't have.`
                      : "The machine catalog couldn't be read, so the standard set can be added later from its Floor tab."}
                </span>
              </label>
              <div className="hq-sheet__summary">
                <p className="hq-standing">When you create it:</p>
                <ul className="hq-consequences">
                  <li>
                    {name} is added{network ? ` to ${network.name}` : ""}, as{" "}
                    {draft.opening === "open"
                      ? "running"
                      : `setting up${/^\d{4}-\d{2}-\d{2}$/.test(draft.openingDay) ? `, opening ${dayLabel(draft.openingDay)}` : ", with no opening day yet"}`}
                    .
                  </li>
                  <li>
                    {draft.mode === "linked" ? `Its bookings come from Mindbody site ${draft.siteId.trim()}${draft.locationId.trim() ? `, location ${draft.locationId.trim()}` : ""}.` : "It runs offline until it's linked."}
                  </li>
                  <li>{draft.opening === "open" ? "Its page opens." : "Its page opens on Setup, with its checklist, and it shows on Launches."}</li>
                </ul>
              </div>
            </>
          )}
          {failure ? <AdminNotice tone="alert">{failure}</AdminNotice> : null}
        </div>

        <div className="adm-dialog__foot hq-sheet__foot">
          <AdminButton variant="ghost" onClick={cancel} disabled={saving}>
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            Cancel
          </AdminButton>
          {step > 0 ? (
            <AdminButton onClick={() => setStep((s) => s - 1)} disabled={saving}>
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              Back
            </AdminButton>
          ) : null}
          {step < 2 ? (
            <AdminButton variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
              Continue
            </AdminButton>
          ) : (
            <AdminButton variant="primary" onClick={() => void create()} busy={saving} disabled={!draft.name.trim() || Boolean(problem)}>
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Create {name}
            </AdminButton>
          )}
        </div>
      </div>
    </div>
  );
}
