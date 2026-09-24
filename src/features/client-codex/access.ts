/**
 * WHO MAY DO WHAT ON THE CODEX — one answer for every page.
 *
 * Client codex, Sep 2026. Three specs each wrote their own "may she edit
 * this record": the shell's, a Goals/Account one and Body calling the InBody
 * check itself. They would have drifted, and a page offering an editor the
 * database refuses is how a trainer loses a paragraph of typing. So there is
 * ONE: `codexAccess`, worked out once by the shell and handed to every page
 * as props (`canEdit`, `fordReadable`).
 *
 *   canEdit       The clients/{id} update rule: an administrator, or anyone
 *                 who trains at or leads the client's HOME studio (the grant
 *                 and Demo Mode included). That is exactly what
 *                 `canRecordInBody` already mirrors (inbody/access.ts), and
 *                 the rule reads the home the same way `getStudioIdFromData`
 *                 does: `homeStudioId`, else the older `studioId`. A
 *                 cross-train studio and a franchise owner who does not work
 *                 there READ the record and are offered no editor.
 *   fordReadable  The FORD read rule: the same people, plus franchise owners.
 *                 A cross-train visitor is refused FORD by the database, so
 *                 the tab never opens a FORD listener for them (it would only
 *                 fail) and says whose record it is instead.
 *
 * Pure: no React, no Firestore. access.test.ts holds it to the rules.
 */
import type { Studio, Trainer } from "../../types";
import { canRecordInBody } from "../inbody/access";
import { FRANCHISE_ROLES } from "../../lib/staff-access";

export interface CodexAccess {
  /** May change the client document (the one Save bar), and so see its editors. */
  canEdit: boolean;
  /** May read the client's FORD (clients/{id}/ford). */
  fordReadable: boolean;
  /** The studio the record belongs to: `homeStudioId`, else the older `studioId`. */
  homeStudioId: string | null;
  /** That studio's name, or null while the studios are not loaded (never a guess). */
  homeStudioName: string | null;
}

/** Only the fields the home studio is read from. `studioId` is the older field. */
export interface RecordStudioFields {
  homeStudioId?: string | null;
  studioId?: string | null;
}

/** The studio the rules treat as the client's own (firestore.rules getStudioIdFromData). */
export function recordStudioIdOf(client: RecordStudioFields | null | undefined): string | null {
  const id = client?.homeStudioId || client?.studioId || "";
  return id ? id : null;
}

type TrainerLike = Parameters<typeof canRecordInBody>[0] & Partial<Pick<Trainer, "managedStudioIds">>;

export function codexAccess(
  trainer: TrainerLike | null | undefined,
  client: RecordStudioFields | null | undefined,
  studios: readonly Pick<Studio, "id" | "name">[] | null | undefined,
): CodexAccess {
  const homeStudioId = recordStudioIdOf(client);
  const canEdit = canRecordInBody(trainer ?? null, homeStudioId);
  const role = typeof trainer?.role === "string" ? trainer.role : "";
  const fordReadable = canEdit || (Boolean(trainer) && FRANCHISE_ROLES.has(role));
  const name = homeStudioId ? (studios ?? []).find((s) => s.id === homeStudioId)?.name?.trim() : "";
  return {
    canEdit,
    fordReadable,
    homeStudioId,
    homeStudioName: name ? name : null,
  };
}

/**
 * The sub-toggle's context line for a reader who may not edit: whose record
 * this is, and that their own notes still save (notes are not the client
 * document). Null for a reader who may edit — they need no line.
 */
export function readOnlyLine(access: Pick<CodexAccess, "canEdit" | "homeStudioName">): string | null {
  if (access.canEdit) return null;
  const home = access.homeStudioName ?? "The home studio";
  return `Read only here · ${home} keeps this record. Notes you write still save.`;
}
