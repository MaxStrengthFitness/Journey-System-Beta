/**
 * WHO MAY DO WHAT ON THE CODEX — one answer for every page.
 *
 * Client codex, Sep 2026. Three specs each wrote their own "may she edit
 * this record": the shell's, a Goals/Account one and Body calling the InBody
 * check itself. They would have drifted, and a page offering an editor the
 * database refuses is how a trainer loses a paragraph of typing. So there is
 * ONE: `codexAccess`, worked out once by the shell and handed to every page
 * as props (`canEdit`, `fordReadable`, `fordWritable`).
 *
 *   canEdit       The clients/{id} update rule: an administrator, or anyone
 *                 who trains at or leads the client's HOME studio (the grant
 *                 and Demo Mode included). That is exactly what
 *                 `canRecordInBody` already mirrors (inbody/access.ts), with
 *                 the home read EXACTLY as `getStudioIdFromData` reads it
 *                 (`ruleStudioIdOf`, client-profile/prior-history-door.ts):
 *                 the older `studioId` only when `homeStudioId` is ABSENT. A
 *                 null or empty home is what the rule sees, and it refuses
 *                 the write, so nobody but an administrator is offered Edit
 *                 there — the same answer the prior-history door on the
 *                 Account page gives. A cross-train studio and a franchise
 *                 owner who does not work there READ the record and are
 *                 offered no editor.
 *   fordReadable  The FORD read rule: the same people, plus franchise owners.
 *                 That rule reads the DETAIL's stamped studio, not the
 *                 client document, so this uses `homeStudioId` below (the
 *                 lenient home a detail is stamped with), not the update
 *                 rule's reading.
 *                 A cross-train visitor is refused FORD by the database, so
 *                 the tab never opens a FORD listener for them (it would only
 *                 fail) and says whose record it is instead.
 *   fordWritable  The FORD CREATE rule (`isTrainerOfStudio(studioId)`, the
 *                 detail stamped with her home studio): anyone who trains at
 *                 or leads that studio, the grant and Demo Mode included.
 *                 NOT an administrator or franchise owner who works
 *                 elsewhere — the create rule has no such clause, so they
 *                 read FORD and edit the record but are refused a new
 *                 detail (client codex, phase 17: the intake card offers
 *                 its FORD tap only on this).
 *
 * Pure: no React, no Firestore. access.test.ts holds it to the rules.
 */
import type { Studio, Trainer } from "../../types";
import { canRecordInBody } from "../inbody/access";
import { leadsStudio, worksAt } from "../renewals/permissions";
import { hasRunOfDemo } from "../demo-mode/access";
import { FRANCHISE_ROLES } from "../../lib/staff-access";
import { ruleStudioIdOf } from "../client-profile/prior-history-door";

export interface CodexAccess {
  /** May change the client document (the one Save bar), and so see its editors. */
  canEdit: boolean;
  /** May read the client's FORD (clients/{id}/ford). */
  fordReadable: boolean;
  /** May add a FORD detail for her (the create rule: trains at or leads her home studio). */
  fordWritable: boolean;
  /**
   * The studio the record belongs to: `homeStudioId`, else the older
   * `studioId` (`recordStudioIdOf`). For the name, the coverage cutover and
   * the studio a FORD detail is stamped with — NOT the update rule's
   * reading, which is `ruleStudioIdOf`.
   */
  homeStudioId: string | null;
  /** That studio's name, or null while the studios are not loaded (never a guess). */
  homeStudioName: string | null;
}

/** Only the fields the home studio is read from. `studioId` is the older field. */
export interface RecordStudioFields {
  homeStudioId?: string | null;
  studioId?: string | null;
}

/**
 * The client's own studio, read leniently: `homeStudioId`, else the older
 * `studioId` — also when the home is null or empty. Right for naming the
 * studio and for its cutover. NOT the clients/{id} update rule's reading:
 * `getStudioIdFromData` falls back to `studioId` only when `homeStudioId` is
 * absent, so a permission uses `ruleStudioIdOf` instead.
 */
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
  // The update rule's own reading of the home (absent-only fallback).
  const canEdit = canRecordInBody(trainer ?? null, ruleStudioIdOf(client));
  const role = typeof trainer?.role === "string" ? trainer.role : "";
  const fordReadable =
    canRecordInBody(trainer ?? null, homeStudioId) || (Boolean(trainer) && FRANCHISE_ROLES.has(role));
  // The FORD create rule has no administrator or franchise clause: only the
  // studio's own people (isTrainerOfStudio), mirrored here.
  const fordWritable =
    worksAt(trainer, homeStudioId) || leadsStudio(trainer, homeStudioId) || hasRunOfDemo(trainer, homeStudioId);
  const name = homeStudioId ? (studios ?? []).find((s) => s.id === homeStudioId)?.name?.trim() : "";
  return {
    canEdit,
    fordReadable,
    fordWritable,
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
