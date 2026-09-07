/**
 * Admin surface — the React wrapper around formState.
 *
 * All the logic worth testing lives in formState.ts, which is pure. This file
 * is only the plumbing: state, an effect that adopts external values, and a
 * save() that sequences beginSave -> the caller's write -> success/failure.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  acknowledgeSaved,
  adoptExternal,
  beginSave,
  changedKeys,
  changedPatch,
  discardEdits,
  editField,
  editFields,
  hasUnsavedWork,
  initForm,
  isDirty,
  saveFailed,
  saveSucceeded,
  type FormState,
  type SaveStatus,
} from "./formState";

/** How long the green "Saved" confirmation stays up before going quiet. */
const SAVED_FLASH_MS = 2200;

export interface DirtyForm<T extends object> {
  /** What to bind inputs to. Always controlled. */
  value: T;
  setField: <K extends keyof T>(key: K, value: T[K]) => void;
  setFields: (patch: Partial<T>) => void;
  discard: () => void;
  save: () => Promise<boolean>;
  status: SaveStatus;
  error: string | null;
  dirty: boolean;
  /** Only the fields the user changed — what save() sends. */
  patch: Partial<T>;
  changed: (keyof T)[];
  /** True when navigating away would lose typing. */
  unsaved: boolean;
}

export function useDirtyForm<T extends object>(
  /**
   * The committed value, already normalised into form shape. Build it with
   * useMemo from the document so its identity is stable, or this adopts on
   * every render.
   */
  external: T,
  /**
   * Writes the diff. Throwing rejects the save and keeps the user's edits;
   * the thrown message is surfaced in the save bar.
   */
  onSave: (patch: Partial<T>) => Promise<void>,
): DirtyForm<T> {
  const [state, setState] = useState<FormState<T>>(() => initForm(external));

  // Adopt whatever the database says, three-way merged against unsaved edits.
  useEffect(() => {
    setState((prev) => adoptExternal(prev, external));
  }, [external]);

  // Let the green confirmation fade on its own. A timer, not a click, because
  // the alternative is a "Saved" chip that sits there until the next edit and
  // stops meaning anything.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (state.status !== "saved") return;
    timer.current = setTimeout(
      () => setState((prev) => acknowledgeSaved(prev)),
      SAVED_FLASH_MS,
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state.status]);

  const setField = useCallback(
    <K extends keyof T>(key: K, value: T[K]) =>
      setState((prev) => editField(prev, key, value)),
    [],
  );

  const setFields = useCallback(
    (patch: Partial<T>) => setState((prev) => editFields(prev, patch)),
    [],
  );

  const discard = useCallback(() => setState((prev) => discardEdits(prev)), []);

  const save = useCallback(async () => {
    // Read the live state rather than the closed-over one so two quick taps
    // cannot send the same diff twice.
    let patch: Partial<T> = {};
    let proceed = false;
    setState((prev) => {
      if (prev.status === "saving" || !isDirty(prev)) return prev;
      patch = changedPatch(prev);
      proceed = true;
      return beginSave(prev);
    });
    if (!proceed) return false;

    try {
      await onSave(patch);
      setState((prev) => saveSucceeded(prev));
      return true;
    } catch (err) {
      setState((prev) =>
        saveFailed(
          prev,
          err instanceof Error && err.message
            ? err.message
            : "Could not save. Check your connection and try again.",
        ),
      );
      return false;
    }
  }, [onSave]);

  return {
    value: state.draft,
    setField,
    setFields,
    discard,
    save,
    status: state.status,
    error: state.error,
    dirty: isDirty(state),
    patch: changedPatch(state),
    changed: changedKeys(state),
    unsaved: hasUnsavedWork(state),
  };
}
