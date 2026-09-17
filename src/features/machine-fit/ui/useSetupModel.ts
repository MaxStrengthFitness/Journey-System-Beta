/**
 * MACHINE FIT — everything the Setup screen shows, derived in one place.
 *
 * Inputs the profile already holds (the machines, this client's saved
 * settings, the studio's client roster) plus the two fit tiers, which are
 * read only once the Setup segment has actually been opened (`enabled`).
 *
 * Per machine it works out three things, all from the same cohort rules:
 *   · what the fields SHOW — the draft over what is saved;
 *   · what to SUGGEST for the fields that show nothing, conditioned on the
 *     ones that show something (so it re-suggests as the trainer types);
 *   · what the CHECK says about what is SAVED — never about a draft, because
 *     a half-typed row is not a set-up anyone chose yet.
 *
 * Thirty machines × a few hundred rows is microseconds of work, so all of it
 * is plain `useMemo`; nothing is cached by hand.
 */

import { useMemo } from "react";
import type { Client, ClientMachineSetting, Machine, Routine } from "../../../types";
import type { MachineCatalogEntry } from "../../../types/machines";
import { toEquipmentMachines } from "../../equipment/adapters";
import type { EquipmentMachine } from "../../equipment/types";
import { countToReview } from "../audit";
import { auditForMachine, suggestForMachine } from "../engine";
import { factorsOf } from "../factors";
import { useFitData, type FitData } from "../fit-store";
import type { FitFactors, MachineAudit, MatchSpec, SuggestionResult } from "../types";
import { normalizedValues, shownValue, stepsByNk, toFitFields, type FitField } from "./field-values";
import { shownOf, type SetupDraftState } from "./setup-draft";

export type RowFilter = "all" | "routine" | "empty";

/** One offered value, in the field's own spelling. */
export interface Offer {
  value: string;
  strong: boolean;
  universal: boolean;
  support: number;
  outOf: number;
}

export interface SetupRowModel {
  machine: EquipmentMachine;
  fields: FitField[];
  /** What each field shows right now (storage key → value). */
  shown: Record<string, string>;
  /** Fields whose on-screen value differs from what is saved. */
  dirty: Set<string>;
  /** On which of her routines this machine is prescribed. */
  routines: string[];
  isSetUp: boolean;
  suggestion: SuggestionResult | null;
  /** The picks for fields that currently show nothing, by storage key. */
  offer: Record<string, Offer>;
  audit: MachineAudit | null;
}

export interface SetupModel {
  rows: SetupRowModel[];
  allRows: SetupRowModel[];
  target: FitFactors;
  fit: FitData;
  setUpCount: number;
  toReview: number;
  /** Prescribed machines with no settings at all — the thing worth a dot before a first session. */
  prescribedNotSetUp: number;
  /** Rows a bulk accept would fill: a strong suggestion with at least one empty field. */
  strongRows: SetupRowModel[];
}

export interface UseSetupModelArgs {
  client: Client | null | undefined;
  clientId: string;
  machines: Machine[];
  clientSettings: Record<string, ClientMachineSetting>;
  routines: Routine[];
  isBActive: boolean;
  catalog: MachineCatalogEntry[];
  studioMachineSettings?: Record<string, Record<string, string>>;
  studioClients: readonly Client[];
  activeStudioId: string | null | undefined;
  spec: MatchSpec;
  drafts: SetupDraftState;
  filter: RowFilter;
  enabled: boolean;
}

export function useSetupModel({
  client,
  clientId,
  machines,
  clientSettings,
  routines,
  isBActive,
  catalog,
  studioMachineSettings,
  studioClients,
  activeStudioId,
  spec,
  drafts,
  filter,
  enabled,
}: UseSetupModelArgs): SetupModel {
  const equipment = useMemo(() => {
    const catalogById: Record<string, MachineCatalogEntry> = {};
    for (const c of catalog) catalogById[c.id] = c;
    return (
      toEquipmentMachines({
        machines,
        clientSettings,
        allLogs: [],
        catalogById,
        studioMachineSettings,
        machineStats: client?.machineStats ?? null,
      })
        // The floor's own order, not "in use first": this list mirrors the
        // FileMaker grid a trainer is copying from, top to bottom.
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    );
  }, [machines, clientSettings, catalog, studioMachineSettings, client?.machineStats]);

  const prescribed = useMemo(() => {
    const byMachine = new Map<string, string[]>();
    for (const r of routines) {
      const name = r.name === "Routine B" ? "B" : r.name === "Routine A" ? "A" : null;
      if (!name || (name === "B" && !isBActive)) continue;
      for (const id of r.machineIds ?? []) byMachine.set(id, [...(byMachine.get(id) ?? []), name]);
    }
    return byMachine;
  }, [routines, isBActive]);

  const machineIds = useMemo(() => equipment.map((m) => m.id), [equipment]);
  const fit = useFitData(activeStudioId, machineIds, studioClients, enabled);
  const target = useMemo(() => factorsOf(client ?? null), [client]);

  const allRows = useMemo<SetupRowModel[]>(() => {
    return equipment.map((machine) => {
      const fields = toFitFields(machine.fields);
      const draft = drafts.drafts[machine.id];
      const shown: Record<string, string> = {};
      const dirty = new Set<string>();
      for (const f of fields) {
        shown[f.key] = shownOf(draft, machine.settings, f.key);
        if (draft && f.key in draft.values) dirty.add(f.key);
      }

      const sources = fit.sources[machine.id];
      const fieldKeys = fields.map((f) => f.nk);
      let suggestion: SuggestionResult | null = null;
      const offer: Record<string, Offer> = {};
      const hasEmpty = fields.some((f) => shown[f.key].trim() === "");
      if (enabled && sources && fields.length > 0 && hasEmpty) {
        suggestion = suggestForMachine({
          fieldKeys,
          target,
          targetClientId: clientId,
          sources,
          spec,
          pinned: normalizedValues(fields, shown),
        });
        if (suggestion.ok === true) {
          const byNk = new Map(fields.map((f) => [f.nk, f]));
          for (const pick of suggestion.picks) {
            const f = byNk.get(pick.key);
            if (f && shown[f.key].trim() === "") {
              offer[f.key] = {
                value: shownValue(f, pick.value),
                strong: pick.strength === "strong",
                universal: !!pick.universal,
                support: pick.support,
                outOf: pick.outOf,
              };
            }
          }
        }
      }

      const savedNorm = normalizedValues(fields, machine.settings);
      const audit =
        enabled && sources && Object.keys(savedNorm).length > 0
          ? auditForMachine({
              fieldKeys,
              settings: savedNorm,
              target,
              targetClientId: clientId,
              sources,
              spec,
              acks: machine.fitAcks ?? null,
              fieldSteps: stepsByNk(fields),
            })
          : null;

      return {
        machine,
        fields,
        shown,
        dirty,
        routines: prescribed.get(machine.id) ?? [],
        isSetUp: Object.keys(savedNorm).length > 0,
        suggestion,
        offer,
        audit,
      };
    });
  }, [equipment, drafts, fit.sources, enabled, target, clientId, spec, prescribed]);

  return useMemo<SetupModel>(() => {
    const rows = allRows.filter((r) =>
      filter === "routine" ? r.routines.length > 0 : filter === "empty" ? !r.isSetUp : true,
    );
    const audits = allRows.map((r) => r.audit).filter((a): a is MachineAudit => a !== null);
    return {
      rows,
      allRows,
      target,
      fit,
      setUpCount: allRows.filter((r) => r.isSetUp).length,
      toReview: countToReview(audits),
      prescribedNotSetUp: allRows.filter((r) => r.routines.length > 0 && !r.isSetUp && r.fields.length > 0).length,
      strongRows: rows.filter(
        (r) =>
          r.suggestion?.ok === true &&
          r.suggestion.strength === "strong" &&
          Object.values(r.offer).some((o) => o.strong),
      ),
    };
  }, [allRows, filter, target, fit]);
}
