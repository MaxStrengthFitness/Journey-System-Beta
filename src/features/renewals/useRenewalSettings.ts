/**
 * A studio's renewal settings, live, already cleaned (see settings.ts).
 *
 * One listener on one small document: studios/{studioId}/config/renewals.
 * A studio that never saved anything reads as the defaults, flagged with
 * `saved: false` so the settings screen can say so.
 */

import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { DEFAULT_RENEWAL_SETTINGS, normalizeRenewalSettings } from "./settings";
import type { RenewalNamesSeen, RenewalSettings } from "./types";

export interface RenewalSettingsState {
  settings: RenewalSettings;
  /** False until the studio has saved its own settings at least once. */
  saved: boolean;
  loading: boolean;
  /** A read that failed. The defaults are shown meanwhile — say so, don't hide it. */
  error: string | null;
}

export function renewalSettingsRef(studioId: string) {
  return doc(db, "studios", studioId, "config", "renewals");
}

export function useRenewalSettings(studioId: string | null | undefined): RenewalSettingsState {
  const [state, setState] = useState<RenewalSettingsState>({
    settings: DEFAULT_RENEWAL_SETTINGS,
    saved: false,
    loading: Boolean(studioId),
    error: null,
  });

  useEffect(() => {
    if (!studioId) {
      setState({ settings: DEFAULT_RENEWAL_SETTINGS, saved: false, loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    return onSnapshot(
      renewalSettingsRef(studioId),
      (snap) => {
        setState({
          settings: normalizeRenewalSettings(snap.exists() ? snap.data() : undefined),
          saved: snap.exists(),
          loading: false,
          error: null,
        });
      },
      (err) => {
        console.warn("[renewals] settings read failed:", err);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "Couldn't load this studio's renewal settings. Showing the defaults.",
        }));
      },
    );
  }, [studioId]);

  return state;
}

/**
 * Writes only the fields that changed, plus who changed them. `packages` and
 * the name lists are whole arrays: an array is one field in Firestore, and a
 * merge replaces it rather than splicing.
 */
export async function saveRenewalSettings(
  studioId: string,
  patch: Partial<RenewalSettings>,
): Promise<void> {
  // The rules require updatedBy to be the signed-in user, so it comes from the
  // sign-in itself, never from a trainer document that may predate a claim.
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("You're signed out. Sign in again to save.");
  await setDoc(
    renewalSettingsRef(studioId),
    { ...patch, updatedAt: serverTimestamp(), updatedBy: uid },
    { merge: true },
  );
}

/** The names the nightly job met at this studio (config/renewalsSeen). */
export function useRenewalNamesSeen(studioId: string | null | undefined): RenewalNamesSeen | null {
  const [seen, setSeen] = useState<RenewalNamesSeen | null>(null);
  useEffect(() => {
    setSeen(null);
    if (!studioId) return;
    return onSnapshot(
      doc(db, "studios", studioId, "config", "renewalsSeen"),
      (snap) => setSeen(snap.exists() ? (snap.data() as RenewalNamesSeen) : null),
      () => setSeen(null),
    );
  }, [studioId]);
  return seen;
}
