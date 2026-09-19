/**
 * THE MSF STANDARD SET, AND PUBLISHING A STUDIO'S MACHINE — the pure half.
 *
 * Round: Operations (Round B), Sep 2026. AJ, Sep 18: "the owner of Max
 * Strength may adjust the standard template as they wish"; "within the
 * Operations dashboard we need to be able to, from the catalog, create a
 * standard set of machines that new studios can adopt"; a studio's custom
 * machine can be offered to corporate, "the new published variant will be
 * adopted at the creating studio so that it is similar across the board".
 *
 * THE STANDARD SET IS TWO FIELDS ON THE CATALOG DOCUMENT: `inStandardSet`
 * (membership — isStandardSetMachine reads it, with a missing flag counting
 * as in) and `defaultOrder` (the order a new floor starts in, and the order
 * "New in the MSF standard" lists). Nothing here pushes anything to a floor:
 * a floor adopts (features/my-studio/floor.ts). Changing the set changes what
 * a new floor starts with and what an existing floor is offered.
 *
 * PUBLISHING is two steps and only the first is a tap: the catalog document
 * is created from the submission's definition (publishPlan), and the
 * studio's own id is migrated onto the catalog id by
 * scripts/migrate-machine-id.ts from the PC (migrationCommand) — every set
 * ever logged references the id, and the script is the thing that walks
 * every document. AJ chose the script over a Cloud Function (Sep 18).
 */
import type { MachineCatalogEntry, MachineDefinition } from "../../../types/machines";
import { isStandardSetMachine } from "../studios/registry";
import type { CatalogSubmissionDoc } from "../../my-studio/floor";

export const ORDER_STEP = 10;

const byOrder = (a: MachineCatalogEntry, b: MachineCatalogEntry) =>
  (a.defaultOrder ?? 999) - (b.defaultOrder ?? 999) || a.name.localeCompare(b.name);

/** The standard set, in the order a new floor starts in. */
export function standardSet(catalog: MachineCatalogEntry[]): MachineCatalogEntry[] {
  return catalog.filter((m) => isStandardSetMachine(m)).sort(byOrder);
}

/** Active catalog machines a studio would have to adopt one by one. */
export function outsideStandard(catalog: MachineCatalogEntry[]): MachineCatalogEntry[] {
  return catalog.filter((m) => m.status === "active" && !isStandardSetMachine(m)).sort(byOrder);
}

export interface OrderWrite {
  id: string;
  defaultOrder: number;
}

/**
 * Move one machine of the set to a new position and renumber the set in
 * tens. Only the documents whose order changes are returned — the write
 * stays small, and a machine outside the set keeps its number.
 */
export function reorderPlan(set: MachineCatalogEntry[], fromIndex: number, toIndex: number): OrderWrite[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= set.length || toIndex >= set.length) return [];
  const next = [...set];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  const writes: OrderWrite[] = [];
  next.forEach((m, i) => {
    const order = (i + 1) * ORDER_STEP;
    if (m.defaultOrder !== order) writes.push({ id: m.id, defaultOrder: order });
  });
  return writes;
}

/** 'Hip Adduction' → 'm-hip-adduction', made unique against the catalog. */
export function catalogIdFor(name: string, existingIds: Iterable<string>): string {
  const taken = new Set(existingIds);
  const base = "m-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  const stem = base === "m-" ? "m-machine" : base;
  if (!taken.has(stem)) return stem;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${stem}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${stem}-${Date.now()}`;
}

export const CATALOG_ID_RE = /^m-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface PublishPlan {
  id: string;
  /** The catalog document, minus timestamps (the caller stamps them). */
  doc: Omit<MachineCatalogEntry, "createdAt" | "createdBy" | "updatedAt" | "updatedBy">;
}

/**
 * The catalog document a submission becomes. Not in the standard set —
 * corporate adds it there on purpose, if at all — and last in the order.
 */
export function publishPlan(
  submission: Pick<CatalogSubmissionDoc, "definition" | "studioName">,
  catalog: MachineCatalogEntry[],
  id: string,
): { ok: true; plan: PublishPlan } | { ok: false; reason: string } {
  if (!CATALOG_ID_RE.test(id)) return { ok: false, reason: "A catalog id is m- followed by lowercase letters, numbers and dashes (m-hip-adduction)." };
  if (catalog.some((m) => m.id === id)) return { ok: false, reason: `${id} is already in the catalog.` };
  const name = (submission.definition?.name ?? "").trim();
  if (!name) return { ok: false, reason: "The submission has no machine name." };
  const maxOrder = catalog.reduce((max, m) => Math.max(max, m.defaultOrder ?? 0), 0);
  const definition: MachineDefinition = { ...submission.definition, name };
  return {
    ok: true,
    plan: {
      id,
      doc: {
        ...definition,
        id,
        status: "active",
        defaultOrder: maxOrder + ORDER_STEP,
        inStandardSet: false,
        schemaVersion: 1,
      },
    },
  };
}

/**
 * The PowerShell line that moves the studio's id onto the catalog id —
 * every set, setting and roster entry — run from the project folder on the
 * PC. Dry run first; the script writes nothing without --commit.
 */
export function migrationCommand(submission: Pick<CatalogSubmissionDoc, "machineId">, publishedAs: string, commit = false): string {
  return (
    `npx tsx scripts/migrate-machine-id.ts --from ${submission.machineId} --to ${publishedAs}${commit ? " --commit" : ""} ` +
    "--project gen-lang-client-0731527386 --database ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa"
  );
}
