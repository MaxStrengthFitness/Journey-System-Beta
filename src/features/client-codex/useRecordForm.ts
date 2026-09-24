/**
 * THE RECORD'S ONE FORM — lifted out of ClientInfoSheet for the codex.
 *
 * Client codex, Sep 2026. Every client field a codex page edits goes through
 * here, and the ONE Save bar writes them together: an `updateDoc` of the
 * changed fields and `lastUpdatedBy`, never the whole client (the nightly job
 * owns `renewal`). The rules are the old form's, kept (record-form.ts): an
 * edit back to the saved value is not a change, and nothing equals nothing.
 *
 * What the old form got right and this keeps:
 *  - It re-seeds from the client document ONLY while nothing is unsaved. The
 *    client object is rebuilt on every Firestore snapshot, so re-seeding on
 *    every change would wipe a half-typed edit whenever anything about the
 *    client saved elsewhere.
 *  - A failed save keeps every edit: never block a save, never lose one.
 *
 * What is new:
 *  - Re-seeding happens during render (React's pattern for state that follows
 *    a prop), so no frame ever shows the new record with the old form.
 *  - `revision` counts saves and discards, so every open editor closes on
 *    either (the kit's ReadEdit).
 *  - The form outlives a page switch AND a trip to another profile tab: the
 *    codex never unmounts a page it has shown, and the profile keeps the tab
 *    mounted after its first visit. The Save bar says where each edit is.
 *
 * `save` and `discard` read the form through a ref synced at render, never
 * from inside a state updater (KNOWN-TRAPS → React: an updater may run on the
 * NEXT render, so a flag it sets is not there when you look).
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../firebase";
import type { Client } from "../../types";
import { useToast } from "../../contexts/ToastContext";
import type { SaveBarPlace } from "./kit/save-bar";
import {
  dirtyWhere,
  isRecordFormKey,
  nextDirty,
  sameValue,
  savePayload,
  seedForm,
  type RecordFormData,
  type RecordFormKey,
} from "./record-form";

export interface RecordForm {
  /** The editors' values: every editable field, seeded from the record. */
  formData: RecordFormData & Partial<Client>;
  /** The fields that differ from the saved record. */
  dirty: ReadonlySet<RecordFormKey>;
  count: number;
  /** Where the unsaved fields are, for the Save bar. */
  where: SaveBarPlace[];
  isSaving: boolean;
  /** Counts saves and discards; an editor closes when it changes. */
  revision: number;
  /**
   * An editor's change. A key that is not an editable field is ignored, and so
   * is every change while the reader may not edit the record.
   */
  updateField: (key: keyof Client, value: unknown) => void;
  /** The form's value when it has one, else the record's. */
  current: <K extends keyof Client>(key: K) => Client[K];
  /** True when any of these fields is unsaved. */
  isDirty: (...keys: RecordFormKey[]) => boolean;
  /** Write the unsaved fields. True when it saved. Never throws. */
  save: () => Promise<boolean>;
  /** Put every field back to the record. */
  discard: () => void;
}

interface FormState {
  /** The client object the form was last seeded from. */
  seededFrom: Client;
  formData: RecordFormData;
  dirty: ReadonlySet<RecordFormKey>;
  revision: number;
}

const NOTHING_DIRTY: ReadonlySet<RecordFormKey> = new Set();

export function useRecordForm({
  client,
  canEdit = true,
  trainerId,
  homeStudioName,
}: {
  client: Client;
  /**
   * Whether this reader may change the record (codexAccess().canEdit). When
   * false the form takes no edit at all: the pages lock their editors, and
   * this is the backstop for any control that escapes the lock (a popover
   * portaled out of it, an editor added later), so nothing is ever staged
   * with no Save bar to save or discard it.
   */
  canEdit?: boolean;
  /** Written as `lastUpdatedBy`, as the old form did (authTrainer.id). */
  trainerId?: string | null;
  /** Named in the sentence when the rules refuse a save. */
  homeStudioName?: string | null;
}): RecordForm {
  const { success: toastSuccess, error: toastError } = useToast();
  const [stored, setStored] = useState<FormState>(() => ({
    seededFrom: client,
    formData: seedForm(client),
    dirty: NOTHING_DIRTY,
    revision: 0,
  }));
  const [isSaving, setIsSaving] = useState(false);

  // A new snapshot of the record, and nothing unsaved: follow it. Adjusted
  // during render, so this render already shows the new values.
  let state = stored;
  if (stored.seededFrom !== client && stored.dirty.size === 0) {
    state = { ...stored, seededFrom: client, formData: seedForm(client) };
    setStored(state);
  }

  const stateRef = useRef(state);
  stateRef.current = state;
  const clientRef = useRef(client);
  clientRef.current = client;
  const trainerRef = useRef(trainerId);
  trainerRef.current = trainerId;
  const homeRef = useRef(homeStudioName);
  homeRef.current = homeStudioName;
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  const savingRef = useRef(false);

  const updateField = useCallback((key: keyof Client, value: unknown) => {
    if (!canEditRef.current) return;
    if (!isRecordFormKey(key)) {
      // Not a field any codex editor may write (recoveryMetric, a Mindbody
      // field): refused here, so it can never reach a save.
      console.warn(`[client codex] ignored an edit to ${String(key)}: not an editable record field`);
      return;
    }
    setStored((prev) => ({
      ...prev,
      formData: { ...prev.formData, [key]: value },
      dirty: nextDirty(prev.dirty, key, value, clientRef.current),
    }));
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    const { dirty, formData } = stateRef.current;
    const id = clientRef.current?.id;
    if (dirty.size === 0 || !id || savingRef.current || !canEditRef.current) return false;
    savingRef.current = true;
    setIsSaving(true);
    const keys = [...dirty];
    try {
      await updateDoc(doc(db, "clients", id), savePayload(keys, formData, trainerRef.current));
      // Clear what was saved. A field edited again while the save was in
      // flight holds a newer value, and stays unsaved.
      setStored((prev) => {
        let next = prev.dirty;
        for (const k of keys) {
          if (next.has(k) && sameValue((prev.formData as Record<string, unknown>)[k], (formData as Record<string, unknown>)[k])) {
            if (next === prev.dirty) next = new Set(prev.dirty);
            (next as Set<RecordFormKey>).delete(k);
          }
        }
        return { ...prev, dirty: next, revision: prev.revision + 1 };
      });
      toastSuccess(keys.length === 1 ? "Saved 1 change." : `Saved ${keys.length} changes.`);
      return true;
    } catch (err) {
      // Every edit stays, so nothing typed is lost; the trainer can try again.
      console.error("[client codex] save failed", err);
      const denied = (err as { code?: unknown } | null)?.code === "permission-denied";
      const where = homeRef.current ? homeRef.current : "the client's home studio";
      toastError(
        denied
          ? `Couldn't save. Nothing was changed. This record can only be changed at ${where}.`
          : "Couldn't save. Nothing was changed.",
      );
      return false;
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [toastSuccess, toastError]);

  const discard = useCallback(() => {
    const c = clientRef.current;
    setStored((prev) => ({ seededFrom: c, formData: seedForm(c), dirty: NOTHING_DIRTY, revision: prev.revision + 1 }));
  }, []);

  const { formData, dirty, revision } = state;
  const where = useMemo(() => dirtyWhere(dirty), [dirty]);

  return useMemo<RecordForm>(
    () => ({
      formData: formData as RecordFormData & Partial<Client>,
      dirty,
      count: dirty.size,
      where,
      isSaving,
      revision,
      updateField,
      current: <K extends keyof Client>(key: K) =>
        (key in formData ? (formData as Partial<Client>)[key] : client[key]) as Client[K],
      isDirty: (...keys: RecordFormKey[]) => keys.some((k) => dirty.has(k)),
      save,
      discard,
    }),
    [formData, dirty, where, isSaving, revision, updateField, client, save, discard],
  );
}
