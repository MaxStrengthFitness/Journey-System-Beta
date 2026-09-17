/**
 * MACHINE FIT — the Setup screen's drafts.
 *
 * Everything a trainer does on the Setup screen is a DRAFT until Save: a
 * typed value, an accepted suggestion, thirty accepted suggestions, a line of
 * FileMaker shorthand. Nothing here touches Firestore. That is what makes
 * "accept strong suggestions" safe to offer — it fills the screen, the
 * trainer reads it, and one Save (or one Undo) decides.
 *
 * The reducer takes two arguments, lives at module scope and closes over
 * nothing (CLAUDE.md: a reducer React may call mid-render must not read
 * anything declared below its `useReducer`). Everything it needs is in the
 * action.
 */

import type { SettingSource } from "../types";

export type SetupMode = "check" | "setup" | "quick";

export interface MachineDraft {
  /** Storage key → the value on screen. Only fields that differ from what is saved. */
  values: Record<string, string>;
  /** Where each drafted value came from. */
  sources: Record<string, SettingSource>;
  weight?: string;
  note?: string;
}

export interface SetupDraftState {
  drafts: Record<string, MachineDraft>;
  /** The fields the last "accept" filled, with the value it put there — what Undo takes back. */
  lastAccept: { machineId: string; key: string; value: string }[] | null;
}

export const EMPTY_DRAFTS: SetupDraftState = { drafts: {}, lastAccept: null };

export type SetupDraftAction =
  | { type: "set"; machineId: string; key: string; value: string; saved: string; source: SettingSource }
  | { type: "accept"; rows: { machineId: string; values: Record<string, string>; saved: Record<string, string> }[] }
  | { type: "undoAccept" }
  | {
      type: "shorthand";
      machineId: string;
      values: Record<string, string>;
      saved: Record<string, string>;
      weight?: string;
      note?: string;
    }
  | { type: "weight"; machineId: string; value: string; saved: string }
  | { type: "revert"; machineId: string }
  | { type: "reset" };

const EMPTY_DRAFT: MachineDraft = { values: {}, sources: {} };

function isEmpty(d: MachineDraft): boolean {
  return Object.keys(d.values).length === 0 && d.weight === undefined && !d.note;
}

function put(state: SetupDraftState, machineId: string, draft: MachineDraft): Record<string, MachineDraft> {
  const drafts = { ...state.drafts };
  if (isEmpty(draft)) delete drafts[machineId];
  else drafts[machineId] = draft;
  return drafts;
}

/** One field set to one value. A value equal to what is saved is not a draft at all. */
function withValue(draft: MachineDraft, key: string, value: string, saved: string, source: SettingSource): MachineDraft {
  const values = { ...draft.values };
  const sources = { ...draft.sources };
  if (value.trim() === saved.trim()) {
    delete values[key];
    delete sources[key];
  } else {
    values[key] = value;
    sources[key] = source;
  }
  return { ...draft, values, sources };
}

export function setupDraftReducer(state: SetupDraftState, action: SetupDraftAction): SetupDraftState {
  switch (action.type) {
    case "set": {
      const current = state.drafts[action.machineId] ?? EMPTY_DRAFT;
      const next = withValue(current, action.key, action.value, action.saved, action.source);
      return { drafts: put(state, action.machineId, next), lastAccept: state.lastAccept };
    }
    case "accept": {
      let drafts = state.drafts;
      const filled: NonNullable<SetupDraftState["lastAccept"]> = [];
      for (const row of action.rows) {
        let draft = drafts[row.machineId] ?? EMPTY_DRAFT;
        for (const [key, value] of Object.entries(row.values)) {
          // Never over a value the trainer can already see: saved, or typed.
          const showing = key in draft.values ? draft.values[key] : (row.saved[key] ?? "");
          if (showing.trim() !== "") continue;
          draft = withValue(draft, key, value, row.saved[key] ?? "", "suggested");
          filled.push({ machineId: row.machineId, key, value });
        }
        drafts = put({ drafts, lastAccept: null }, row.machineId, draft);
      }
      return filled.length === 0 ? state : { drafts, lastAccept: filled };
    }
    case "undoAccept": {
      if (!state.lastAccept) return state;
      let drafts = state.drafts;
      for (const { machineId, key, value } of state.lastAccept) {
        const draft = drafts[machineId];
        // Only what the accept put there and nobody has touched since.
        if (!draft || draft.values[key] !== value || draft.sources[key] !== "suggested") continue;
        const values = { ...draft.values };
        const sources = { ...draft.sources };
        delete values[key];
        delete sources[key];
        drafts = put({ drafts, lastAccept: null }, machineId, { ...draft, values, sources });
      }
      return { drafts, lastAccept: null };
    }
    case "shorthand": {
      let draft = state.drafts[action.machineId] ?? EMPTY_DRAFT;
      for (const [key, value] of Object.entries(action.values)) {
        draft = withValue(draft, key, value, action.saved[key] ?? "", "legacy");
      }
      if (action.weight !== undefined) draft = { ...draft, weight: action.weight };
      if (action.note) draft = { ...draft, note: draft.note ? `${draft.note}; ${action.note}` : action.note };
      return { drafts: put(state, action.machineId, draft), lastAccept: state.lastAccept };
    }
    case "weight": {
      const current = state.drafts[action.machineId] ?? EMPTY_DRAFT;
      const next: MachineDraft = { ...current };
      if (action.value.trim() === action.saved.trim()) delete next.weight;
      else next.weight = action.value;
      return { drafts: put(state, action.machineId, next), lastAccept: state.lastAccept };
    }
    case "revert": {
      if (!state.drafts[action.machineId]) return state;
      const drafts = { ...state.drafts };
      delete drafts[action.machineId];
      return { drafts, lastAccept: state.lastAccept };
    }
    case "reset":
      return EMPTY_DRAFTS;
    default:
      return state;
  }
}

/** What a field shows: the draft when there is one, else what is saved. */
export function shownOf(draft: MachineDraft | undefined, saved: Record<string, string>, key: string): string {
  if (draft && key in draft.values) return draft.values[key];
  return saved[key] ?? "";
}

export interface DraftCounts {
  fields: number;
  machines: number;
  suggested: number;
}

export function countDrafts(state: SetupDraftState): DraftCounts {
  let fields = 0;
  let suggested = 0;
  for (const d of Object.values(state.drafts)) {
    fields += Object.keys(d.values).length + (d.weight !== undefined ? 1 : 0) + (d.note ? 1 : 0);
    suggested += Object.values(d.sources).filter((s) => s === "suggested").length;
  }
  return { fields, machines: Object.keys(state.drafts).length, suggested };
}
