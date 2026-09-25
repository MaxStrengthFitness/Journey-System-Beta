/**
 * THE DOOR TO "SESSIONS BEFORE JOURNEY" (Sep 24 2026).
 *
 * `client.priorHistory` is what a client did before Journey — the FileMaker
 * years, the paper years (lib/prior-history.ts, and
 * docs/business/migration-and-prior-history.md). The editor for it was
 * written, mounted on the profile, and pointed at by Operations → Data, but
 * nothing on screen opened it. AJ: "Trainers absolutely need the ability to
 * view and edit this."
 *
 * The door is the line under the count on the header's Completed sessions
 * tile — the number it explains. Anyone who can edit the client edits it;
 * anyone else who can open the profile reads it.
 *
 * PURE — no React, no Firestore.
 */

import type { Trainer } from "../../types";
import { leadsStudio, worksAt } from "../renewals/permissions";
import { hasRunOfDemo } from "../demo-mode/access";
import { formatStudioDate, toDate, type DateLike } from "../../lib/studio-time";
import {
  priorHistoryLabel,
  priorUncounted,
  type PriorHistory,
  type PriorHistorySource,
  type PriorHistoryStatement,
} from "../../lib/prior-history";

const SUPER = new Set(["Admin", "Founder", "Overseer"]);

type TrainerLike = Pick<
  Trainer,
  "role" | "primaryHomeStudioId" | "accessibleStudioIds" | "activeGuestStudioIds" | "ownedStudioIds"
> &
  Partial<Pick<Trainer, "managedStudioIds">>;

type ClientStudioFields = { homeStudioId?: string | null; studioId?: string | null };

/**
 * The studio the clients/{id} update rule checks — `getStudioIdFromData`:
 * `homeStudioId`, else the older `studioId`. Firestore cannot store
 * `undefined`, so only an absent field falls through to `studioId`; an empty
 * or null home is what the rule sees, and it refuses the write.
 */
export function ruleStudioIdOf(client: ClientStudioFields | null | undefined): string | null {
  if (!client) return null;
  const raw = client.homeStudioId !== undefined ? client.homeStudioId : client.studioId;
  return typeof raw === "string" && raw ? raw : null;
}

/**
 * May this person change the client's prior history? The same answer
 * `match /clients/{clientId}`'s update rule gives, so the editor never offers
 * a Save the database will refuse: administrators, and anyone who works at or
 * leads the client's home studio (the grant and Demo Mode included).
 * `canRecordInBody` (features/inbody/access.ts) is the same mirror.
 */
export function canEditPriorHistory(
  t: TrainerLike | null | undefined,
  client: ClientStudioFields | null | undefined,
): boolean {
  if (!t) return false;
  if (SUPER.has(t.role)) return true;
  const studioId = ruleStudioIdOf(client);
  return worksAt(t, studioId) || leadsStudio(t, studioId) || hasRunOfDemo(t, studioId);
}

/**
 * What the door says, or null for no door.
 *
 * With a record it quotes it, so the tile says where its number splits.
 * Without one, only someone who can write it is offered the door: there is
 * nothing to read yet, and "Add" is a promise the rules would break for
 * anyone else.
 */
export function priorHistoryDoorText(
  prior: PriorHistory | null | undefined,
  canEdit: boolean,
): string | null {
  if (!prior) return canEdit ? "Add sessions before Journey" : null;
  const label = priorHistoryLabel(prior);
  if (label) return label;
  const stated = Math.max(0, Math.trunc(prior.sessions));
  // Nothing left that exists only as a number: either every prior session is
  // now a real row, or the record says there were none.
  return stated > 0 && priorUncounted(prior) === 0
    ? `${stated} before Journey · all imported`
    : "None before Journey";
}

/**
 * The door as a screen draws it: the words, whether it opens to edit or to
 * read, and what opens the editor. The profile works it out once and hands
 * the same object to both doors — the header's Completed sessions tile and
 * the client codex's Account page (landing, Sep 24 2026) — so the two can
 * never say different things or apply different rules. The editor itself
 * lives in ClientProfileView.
 */
export interface PriorHistoryDoorState {
  /** "412 before Journey · FileMaker", or "Add sessions before Journey". */
  text: string;
  /** False: the editor opens read-only, because the rules refuse this person's write. */
  canEdit: boolean;
  onOpen: () => void;
}

/** What the door says to a screen reader, on every door. */
export function priorHistoryDoorLabel(door: Pick<PriorHistoryDoorState, "text" | "canEdit">): string {
  return `Sessions before Journey: ${door.text}. ${door.canEdit ? "Open to edit." : "Open to read."}`;
}

/** The editor's fields, as typed. */
export interface PriorHistoryDraft {
  sessions: string;
  source: PriorHistorySource;
  through: string;
  note: string;
}

/**
 * Opening the editor seeds it from the record, so an edit is a correction
 * rather than a re-entry. A client with no record starts blank, counted up to
 * today.
 */
export function draftFromPrior(prior: PriorHistory | null | undefined, today: string): PriorHistoryDraft {
  return {
    sessions: prior ? String(prior.sessions) : "",
    source: prior?.source ?? "filemaker",
    through: prior?.through ?? today,
    note: prior?.note ?? "",
  };
}

export type PriorHistoryDraftReading =
  | { ok: true; statement: PriorHistoryStatement }
  | {
      ok: false;
      /** What to say under the box, or null when nothing has been typed yet. */
      problem: string | null;
    };

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The form, read as a statement — or why it is not one yet.
 *
 * Only a whole number of sessions is a statement. The old save quietly did
 * nothing on anything else, so a trainer who typed "4.5" pressed Save and
 * the dialog simply sat there.
 */
export function readPriorHistoryDraft(draft: PriorHistoryDraft, today: string): PriorHistoryDraftReading {
  const text = draft.sessions.trim();
  if (!text) return { ok: false, problem: null };
  if (!/^\d+$/.test(text)) return { ok: false, problem: "Enter a whole number of sessions." };
  return {
    ok: true,
    statement: {
      sessions: Number(text),
      through: DAY_KEY.test(draft.through) ? draft.through : today,
      source: draft.source,
      note: draft.note.trim() || null,
    },
  };
}

/**
 * Would saving change what the record says?
 *
 * A save stamps who said so and when. Pressing Save on an unchanged record
 * would move that stamp to someone who only opened it, so it is offered only
 * when something changed.
 */
export function statementChangesRecord(
  statement: PriorHistoryStatement,
  prior: PriorHistory | null | undefined,
): boolean {
  if (!prior) return true;
  return (
    statement.sessions !== prior.sessions ||
    statement.through !== prior.through ||
    statement.source !== prior.source ||
    (statement.note?.trim() || null) !== (prior.note?.trim() || null)
  );
}

/** "Recorded by Sam Lee · Sep 12, 2026" — who said so, the proof under the number. */
export function recordedByLine(prior: PriorHistory | null | undefined): string | null {
  const name = prior?.recordedByName?.trim();
  if (!name) return null;
  const when = toDate(prior?.recordedAt as DateLike);
  return when
    ? `Recorded by ${name} · ${formatStudioDate(when, { month: "short", day: "numeric", year: "numeric" })}`
    : `Recorded by ${name}`;
}
