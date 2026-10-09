/**
 * What the routine template editor's Save writes: the pure half of
 * `AdminRoutineTemplatesTab`'s save (the design round, Oct 8 2026, when the
 * editor gained its "For new clients" part).
 *
 * Until then an edit wrote every field with `setDoc(..., { merge: true })`.
 * A merge writes a map field key by key, so a part taken OUT of a map stayed
 * in the database: a starting routine's word taken out, its default switched
 * off, its day one shortened, or a machine's note deleted would all have come
 * back on the next read. An edit now writes only the fields that changed
 * (the admin kit's rule: "only the diff is written"), each one whole, through
 * `update`, and a starting routine switched off has its `start` part removed.
 *
 * The template is compared the way it is written: name and description
 * trimmed, the start part as `startPartForSave` makes it (day one and the
 * steps holding only the template's machines), so an editor opened and saved
 * without a change writes nothing.
 *
 * A starting routine switched off is not simply removed: its part, all but
 * head office's default, is kept beside the template (`startParked`,
 * `parkedStartOf`), because a seeded routine's steps, source and kind have no
 * control in the editor and would be lost for good. Switching it back on
 * brings the kept part back and removes the copy.
 */
import type { RoutinePreset } from "../../../types";
import { sameValue } from "../formState";
import { parkedStartOf, readStartPart, startPartForSave } from "../../routine-plan/start-part";
import type { RoutinePresetStart } from "../../routine-plan/starting-routines";

/** The editable fields, in the shape they are written. */
export interface TemplateContent {
  name: string;
  description: string;
  machineIds: string[];
  machineNotes: Record<string, string>;
  start: RoutinePresetStart | null;
}

const CONTENT_FIELDS = ["name", "description", "machineIds", "machineNotes"] as const;

/**
 * A stored template as the editor opens it (normalised by the caller with
 * `normalizeRoutinePreset`): its start part read and checked, and no `start`
 * key at all when it has none, so the draft and what it was opened from
 * compare equal until someone changes something. A part kept from when it
 * was switched off (`startParked`) is read the same way, for the switch to
 * bring back.
 */
export function editorDraftOf(preset: RoutinePreset): RoutinePreset {
  const start = readStartPart(preset.start);
  const parked = readStartPart(preset.startParked);
  const { start: _stored, startParked: _kept, ...rest } = preset;
  return { ...rest, ...(start ? { start } : null), ...(parked ? { startParked: parked } : null) };
}

/** The template's editable fields, as they would be written. */
export function templateContent(preset: RoutinePreset): TemplateContent {
  return {
    name: (preset.name ?? "").trim(),
    description: (preset.description ?? "").trim(),
    machineIds: preset.machineIds ?? [],
    machineNotes: preset.machineNotes ?? {},
    start: startPartForSave(preset.start, preset),
  };
}

/** Whether the draft differs from what the editor opened: the unsaved-changes question, and the Save button. */
export function templateChanged(draft: RoutinePreset, opened: RoutinePreset): boolean {
  return !sameValue(templateContent(draft), templateContent(opened));
}

export interface TemplateEdit {
  /** The changed fields, each whole. Empty when nothing changed. */
  fields: Partial<Omit<TemplateContent, "start">> & { start?: RoutinePresetStart };
  /** The template stopped being a starting routine: its stored `start` part is removed. */
  removeStart: boolean;
  /** With `removeStart`: the part kept beside the template (`startParked`), so switching it back on brings it back. */
  park?: RoutinePresetStart;
  /** The switch went back on: the part kept beside the template is removed, now that `start` holds it again. */
  unpark?: true;
}

/**
 * An edit's write: only what changed. When the switch went off, the start
 * part is removed and kept beside the template; when it went back on, the
 * kept copy is removed with the part's return.
 */
export function templateEdit(draft: RoutinePreset, opened: RoutinePreset): TemplateEdit {
  const next = templateContent(draft);
  const was = templateContent(opened);
  const fields: TemplateEdit["fields"] = {};
  for (const key of CONTENT_FIELDS) {
    if (!sameValue(next[key], was[key])) (fields as Record<string, unknown>)[key] = next[key];
  }
  let removeStart = false;
  let park: RoutinePresetStart | undefined;
  if (!sameValue(next.start, was.start)) {
    if (next.start) fields.start = next.start;
    else {
      removeStart = true;
      if (was.start) park = parkedStartOf(was.start);
    }
  }
  return {
    fields,
    removeStart,
    ...(park ? { park } : null),
    ...(fields.start && opened.startParked ? { unpark: true as const } : null),
  };
}

/** True when nothing would be written. */
export function isEmptyEdit(edit: TemplateEdit): boolean {
  return !edit.removeStart && !edit.unpark && Object.keys(edit.fields).length === 0;
}
