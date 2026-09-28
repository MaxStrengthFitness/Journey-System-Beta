/**
 * THE STUDIO SETTINGS, READ AND WRITTEN — the only place either document is
 * touched.
 *
 *   system/studioDefaults          Max Strength's defaults: administrators write
 *   studios/{s}/config/settings    one studio's own: its leaders write
 *
 * Both hold one `values` map, `updatedAt` and `updatedBy` (the Auth uid, never
 * the trainer document's id: the two differ on older accounts, and the rules
 * pin it). A save sends only what changed: a new value, or a key taken back
 * to the layer beneath (deleteField). firestore.rules checks the shape and
 * who may write; resolve.ts decides what is usable.
 */
import { deleteField, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import type { SettingKey } from "./registry";
import type { SettingValue, SettingValues } from "./resolve";

export const companyDefaultsRef = () => doc(db, "system", "studioDefaults");
export const studioSettingsRef = (studioId: string) => doc(db, "studios", studioId, "config", "settings");

/** A change to one layer: a value to keep, or "clear" to take it back to the layer beneath. */
export type SettingsPatch = Partial<Record<SettingKey, SettingValue | "clear">>;

function writePatch(patch: SettingsPatch): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    values[key] = v === "clear" ? deleteField() : v;
  }
  return values;
}

async function save(ref: ReturnType<typeof companyDefaultsRef>, patch: SettingsPatch): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in again to save: the app can't tell who is changing this.");
  const values = writePatch(patch);
  if (Object.keys(values).length === 0) return;
  // merge: the other keys in `values` are kept, and a cleared key is removed.
  await setDoc(ref, { values, updatedAt: serverTimestamp(), updatedBy: uid }, { merge: true });
}

/** Administrators: Max Strength's defaults. */
export function saveCompanyDefaults(patch: SettingsPatch): Promise<void> {
  return save(companyDefaultsRef(), patch);
}

/** A studio's leaders: the studio's own. */
export function saveStudioSettings(studioId: string, patch: SettingsPatch): Promise<void> {
  return save(studioSettingsRef(studioId), patch);
}

export type LayerRead =
  | { status: "loading" }
  | { status: "ready"; values: SettingValues | null }
  | { status: "failed"; message: string };

/** Listen to one layer. A document that doesn't exist is "ready, nothing set"; a refused or failed read is "failed". */
export function listenLayer(ref: ReturnType<typeof companyDefaultsRef>, onRead: (read: LayerRead) => void): () => void {
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.exists() ? (snap.data() as { values?: unknown }) : null;
      const values = data && data.values && typeof data.values === "object" ? (data.values as SettingValues) : null;
      onRead({ status: "ready", values });
    },
    (err) => onRead({ status: "failed", message: err instanceof Error ? err.message : String(err) }),
  );
}
