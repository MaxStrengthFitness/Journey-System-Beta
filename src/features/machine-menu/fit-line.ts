/**
 * THE MACHINE MENU — machine fit's "worth a look" line, and when it shows.
 *
 * Rarely seen, and the same in both doors (machine menu design §C, "Machine
 * fit"; AJ, Oct 4 2026, "ill take all your recommended"): one plum line under
 * the settings when machine fit's check of what is SAVED finds a RARE value
 * among this STUDIO's similar clients — nobody of a similar build here sits
 * there. Machine fit's own engine and words, nothing new:
 *
 *   useFitData (the host's one read, the studio roster passed in)
 *     → auditForMachine (the Setup screen's Check, on the saved values)
 *     → flagSentence, word for word
 *     → "Right for this client" writes acknowledgeFlag.
 *
 * NOTHING shows when the client has no height on file, when too few similar
 * clients are set up, when the answer is unknown (neither tier read), when
 * only the company tier could answer, or for an "uncommon" flag (a faint dot
 * on Setup, never counted, never drawn here). A combination flag is always
 * uncommon, so it never shows either.
 *
 * The check reads what is SAVED, never the draft: a half-changed tile is not
 * a set-up anyone chose yet (useSetupModel's rule).
 *
 * PURE — no React, no Firestore.
 */
import { auditForMachine } from "../machine-fit/engine";
import type { FitData } from "../machine-fit/fit-store";
import type { FieldFlag, FitAck, FitFactors, MachineAudit, MatchSpec } from "../machine-fit/types";
import { normalizedValues, shownValue, stepsByNk, toFitFields, type FitField } from "../machine-fit/ui/field-values";
import { flagSentence } from "../machine-fit/ui/sentences";
import type { SettingFieldSpec } from "../equipment/types";

export interface MenuAuditInput {
  machineId: string;
  clientId: string;
  fields: readonly SettingFieldSpec[];
  /** The values SAVED on the machine for this client (storage keys). */
  saved: Readonly<Record<string, string | undefined>>;
  /** The host's `useFitData` answer; null or not ready, and nothing is checked. */
  fit: FitData | null | undefined;
  /** `factorsOf(client)`: the client's height, gender and the rest. */
  target: FitFactors | null | undefined;
  spec: MatchSpec;
  /** The "right for this client" reviews already on the settings document. */
  acks?: Readonly<Record<string, FitAck | undefined>> | null;
}

/**
 * Machine fit's check of the saved set-up, or null while the read is out,
 * with nothing saved, or with no fields. The same call the Setup screen's
 * Check makes (useSetupModel), for one machine.
 */
export function menuAudit(input: MenuAuditInput): MachineAudit | null {
  const { fit, target } = input;
  if (!fit || fit.status !== "ready" || !target) return null;
  const sources = fit.sources[input.machineId];
  if (!sources) return null;
  const fields = toFitFields(input.fields);
  if (fields.length === 0) return null;
  const settings = normalizedValues(fields, input.saved as Record<string, string | undefined>);
  if (Object.keys(settings).length === 0) return null;
  const acks: Record<string, FitAck> = {};
  for (const [k, v] of Object.entries(input.acks ?? {})) if (v) acks[k] = v;
  return auditForMachine({
    fieldKeys: fields.map((f) => f.nk),
    settings,
    target,
    targetClientId: input.clientId,
    sources,
    spec: input.spec,
    acks,
    fieldSteps: stepsByNk(fields),
  });
}

/**
 * The flags the card draws: a RARE value at the STUDIO tier, from a check
 * that ran. Everything else — no height, too few, unknown, the company tier,
 * uncommon, a combination — is nothing at all.
 */
export function rareStudioFlags(audit: MachineAudit | null | undefined): FieldFlag[] {
  if (!audit || audit.state !== "checked" || audit.tier !== "studio") return [];
  return audit.flags.filter((f): f is FieldFlag => f.kind === "value" && f.level === "rare");
}

/** How machine fit's words name a field and a value: in the machine's own spelling. */
function showFor(fields: readonly FitField[]) {
  return {
    label: (nk: string) => fields.find((f) => f.nk === nk)?.label ?? nk,
    value: (nk: string, v: string) => {
      const f = fields.find((x) => x.nk === nk);
      return f ? shownValue(f, v) : v;
    },
  };
}

/** The line's words: machine fit's `flagSentence`, word for word. */
export function fitLineSentence(flag: FieldFlag, fields: readonly SettingFieldSpec[], audit: MachineAudit): string {
  return flagSentence(flag, showFor(toFitFields(fields)), audit.cohort, audit.tier);
}

/** The storage key of the dial a flag is about, so the line can name its tile. */
export function flagFieldKey(flag: FieldFlag, fields: readonly SettingFieldSpec[]): string | null {
  return toFitFields(fields).find((f) => f.nk === flag.key)?.key ?? null;
}

/** What "Right for this client" writes: the field's key and the value it is right at. */
export function fitAckOf(flag: FieldFlag): { ackKey: string; value: string } {
  return { ackKey: flag.key, value: flag.value };
}

/** After the tap, until machine fit's check catches up. */
export function fitAckedWords(clientFirstName: string): string {
  const who = (clientFirstName ?? "").trim();
  return who ? `Marked right for ${who}.` : "Marked right for this client.";
}

export const FIT_ACK_BUTTON = "Right for this client";
export const FIT_ACK_FAILED = "Couldn't save the review";
