/**
 * Admin surface — the one save pattern, as pure functions.
 *
 * WHY THIS EXISTS
 *
 * The prep audit found three different saving models across twenty admin
 * screens: instant-on-change, explicit Save, and dirty-tracked. Only one
 * screen in the whole surface (StudioSetupCard) did the third, and it was
 * also the only screen that ever told a user their edit had committed.
 *
 * Worse, AdminStudioManager read its values back out of `FormData` at save
 * time and wrote the WHOLE object. Two fields — ownerId and headTrainerId —
 * had been removed from the JSX in an earlier round, so every studio save
 * quietly wrote them as null. An uncontrolled form that writes everything
 * cannot tell "the user cleared this" from "this input does not exist".
 *
 * So the model here is: keep a baseline, keep a draft, and save the DIFF.
 * A field the form does not render is not in the draft, is therefore never
 * in the diff, and cannot be nulled by a screen that forgot about it.
 *
 * Pure on purpose — no React in this file — because this repo has no DOM
 * test environment and this logic is the part worth testing.
 */

export type SaveStatus = "clean" | "dirty" | "saving" | "saved" | "error";

export interface FormState<T extends object> {
  /** The last value we believe is committed to the database. */
  baseline: T;
  /** What the user currently sees. */
  draft: T;
  status: SaveStatus;
  error: string | null;
}

/**
 * Value equality for form fields.
 *
 * null and undefined compare EQUAL. Firestore omits absent fields, so a doc
 * read back after a save has `undefined` where the form put `null`, and
 * without this every screen would flip to "unsaved changes" the moment its
 * own write echoed back through onSnapshot.
 *
 * Arrays compare element-wise and ORDER-SENSITIVELY: accessibleStudioIds and
 * routine machine order are both arrays where order is meaningful, and a
 * set-comparison would silently drop a reorder.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((item, i) => sameValue(item, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    // Keys present but undefined must not count as a difference, for the
    // same Firestore reason as above.
    const keys = new Set([...ka, ...kb]);
    for (const k of keys) {
      if (
        !sameValue(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
        )
      ) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * Start a form. The SAME object becomes baseline and draft, so a freshly
 * loaded form is never dirty. Callers must normalise the database document
 * into form shape (`phone: studio.phone ?? ""`) BEFORE calling this, and use
 * the same normaliser for adoptExternal, or the form reports edits nobody
 * made.
 */
export function initForm<T extends object>(initial: T): FormState<T> {
  return { baseline: initial, draft: initial, status: "clean", error: null };
}

export function editFields<T extends object>(
  state: FormState<T>,
  patch: Partial<T>,
): FormState<T> {
  const draft = { ...state.draft, ...patch };
  const dirty = !sameValue(draft, state.baseline);
  return {
    ...state,
    draft,
    // Editing a value back to what it was returns the form to clean. Without
    // this, a typo and its correction leave a permanent "unsaved changes"
    // warning that trains people to ignore the warning.
    status: dirty ? "dirty" : "clean",
    error: dirty ? state.error : null,
  };
}

export function editField<T extends object, K extends keyof T>(
  state: FormState<T>,
  key: K,
  value: T[K],
): FormState<T> {
  return editFields(state, { [key]: value } as unknown as Partial<T>);
}

export function isDirty<T extends object>(state: FormState<T>): boolean {
  return !sameValue(state.draft, state.baseline);
}

/** The keys the user actually changed, in declaration order. */
export function changedKeys<T extends object>(state: FormState<T>): (keyof T)[] {
  const keys = new Set<string>([
    ...Object.keys(state.draft),
    ...Object.keys(state.baseline),
  ]);
  return [...keys].filter(
    (k) =>
      !sameValue(
        (state.draft as Record<string, unknown>)[k],
        (state.baseline as Record<string, unknown>)[k],
      ),
  ) as (keyof T)[];
}

/**
 * The object to send to the database: only what changed. This is the whole
 * point of the module — see the ownerId story at the top.
 */
export function changedPatch<T extends object>(state: FormState<T>): Partial<T> {
  const patch: Partial<T> = {};
  for (const key of changedKeys(state)) {
    patch[key] = state.draft[key];
  }
  return patch;
}

export function beginSave<T extends object>(state: FormState<T>): FormState<T> {
  return { ...state, status: "saving", error: null };
}

/**
 * The write landed. The draft becomes the new baseline, so a second save with
 * no further edits sends nothing.
 */
export function saveSucceeded<T extends object>(
  state: FormState<T>,
): FormState<T> {
  return {
    baseline: state.draft,
    draft: state.draft,
    status: "saved",
    error: null,
  };
}

/**
 * The write failed. The draft is KEPT — throwing away someone's typing
 * because the network blinked is the worst possible response — and the form
 * stays saveable so the retry is one tap.
 */
export function saveFailed<T extends object>(
  state: FormState<T>,
  message: string,
): FormState<T> {
  return { ...state, status: "error", error: message };
}

/** Drops the "Saved" flash back to a quiet clean form. */
export function acknowledgeSaved<T extends object>(
  state: FormState<T>,
): FormState<T> {
  if (state.status !== "saved") return state;
  return { ...state, status: "clean" };
}

/** Throw away the user's edits and go back to the last committed value. */
export function discardEdits<T extends object>(
  state: FormState<T>,
): FormState<T> {
  return {
    baseline: state.baseline,
    draft: state.baseline,
    status: "clean",
    error: null,
  };
}

/**
 * A new value arrived from the database while the form was open — an
 * onSnapshot tick, or another admin editing the same studio.
 *
 * This is a three-way merge, not a replace, and it has to be:
 *
 *   - a field the user HAS edited keeps their draft, because live-updating a
 *     field under someone's cursor is how typing gets lost;
 *   - a field the user has NOT touched takes the incoming value, because
 *     otherwise our eventual diff would carry a stale copy of it and quietly
 *     revert the other person's edit;
 *   - the baseline always moves, so the diff is measured against what is
 *     really in the database.
 *
 * The second rule is the one worth stating aloud. Keeping the whole draft
 * frozen while dirty looks safer and is not: two admins on one studio would
 * take turns undoing each other, and neither would see an error.
 */
export function adoptExternal<T extends object>(
  state: FormState<T>,
  next: T,
): FormState<T> {
  // Mid-write the database is in an unknown state; moving the baseline here
  // could step past the write we are about to confirm.
  if (state.status === "saving") return state;

  if (!isDirty(state)) {
    return { ...state, baseline: next, draft: next };
  }

  const merged = { ...next } as T;
  for (const key of changedKeys(state)) {
    merged[key] = state.draft[key];
  }
  const stillDirty = !sameValue(merged, next);
  return {
    baseline: next,
    draft: merged,
    // The incoming value can happen to match what the user typed — someone
    // else made the same edit first. That is a clean form, not a conflict.
    status: stillDirty ? "dirty" : "clean",
    error: stillDirty ? state.error : null,
  };
}

/** True when leaving the screen would lose work. */
export function hasUnsavedWork<T extends object>(
  state: FormState<T>,
): boolean {
  return state.status !== "saving" && isDirty(state);
}
