/**
 * Admin surface — the shared kit every rebuilt admin screen composes.
 *
 * Read README.md in this folder before adding a screen: it is the list of
 * decisions this round settled, and re-deciding one of them locally is how
 * the surface fragmented the first time.
 */

export {
  AdminScreen,
  AdminHeader,
  AdminPanel,
  AdminRows,
  AdminRow,
  AdminGrid,
  AdminField,
  AdminInput,
  AdminTextarea,
  AdminSelect,
  AdminReadOnly,
  AdminButton,
  AdminBadge,
  AdminTiles,
  AdminStatTile,
  AdminNotice,
  AdminEmpty,
  ConfirmDialog,
  SaveBar,
} from "./primitives";

export { useDirtyForm, type DirtyForm } from "./useDirtyForm";

export {
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
  sameValue,
  saveFailed,
  saveSucceeded,
  type FormState,
  type SaveStatus,
} from "./formState";
