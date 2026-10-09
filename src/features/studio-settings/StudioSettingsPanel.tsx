import { useMemo } from "react";
import { deleteField, doc, updateDoc } from "firebase/firestore";
import { SlidersHorizontal } from "lucide-react";
import { db } from "../../firebase";
import { useToast } from "../../contexts/ToastContext";
import type { Studio } from "../../types";
import { AdminField, AdminGrid, AdminInput, AdminNotice, AdminPanel, AdminSelect, SaveBar } from "../admin/primitives";
import { useDirtyForm } from "../admin/useDirtyForm";
import { GROUP_LABEL, GROUP_ORDER, SETTINGS, WEEKDAY_NAMES, type SettingDef, type SettingKey } from "./registry";
import { SOURCE_PHRASE, formatSetting, inactiveProblem, parseSetting, resolveAll, resolveSetting, usable, type SettingValue } from "./resolve";
import { ChoiceSegments } from "./ChoiceSegments";
import { saveStudioSettings, type SettingsPatch } from "./store";
import { useStudioSettings } from "./useStudioSettings";
import "../admin/admin.css";

/**
 * MY STUDIO → STUDIO → THIS STUDIO'S SETTINGS — a studio's own numbers.
 *
 * AJ, Sep 28 2026: "let the admins assign the default within the app". Head
 * office sets Max Strength's default for each (Admins → Standard → Studio
 * defaults); here a studio's leaders set their own, or clear it to follow
 * the default again. Everyone else who works at the studio reads them, with
 * where each came from. One editor for a studio's own values: Operations
 * shows them and points here (Setup → Rules), and nothing else writes them.
 *
 * The form holds text per setting ("" = follow the default). A save sends
 * only what changed (`useDirtyForm`), each value checked by the registry
 * first; a studio whose settings couldn't be read gets no save bar, because
 * the form could be missing what it would overwrite.
 *
 * `deepCleanDays` lived on the studio's own document (`deepCleanIntervalDays`,
 * edited on The studio's day until tonight): it shows here as the studio's
 * own, and clearing it clears both, so the studio really follows the default.
 */

type SettingsForm = Record<SettingKey, string>;

function textOf(def: SettingDef, raw: unknown): string {
  const v = usable(def, raw);
  if (v === undefined) return "";
  if (def.kind === "weekday") return v === null ? "none" : String(v);
  return String(v);
}

export interface StudioSettingsPanelProps {
  studioId: string;
  studio: Pick<Studio, "id" | "name"> & { deepCleanIntervalDays?: unknown };
  /** The studio's leaders (leadsHere); everyone else reads. */
  canEdit: boolean;
}

export function StudioSettingsPanel({ studioId, studio, canEdit }: StudioSettingsPanelProps) {
  const { success: toastSuccess } = useToast();
  const settings = useStudioSettings(studioId, studio);
  const legacyDeep = studio.deepCleanIntervalDays;

  const external = useMemo<SettingsForm>(() => {
    const values = settings.studioValues ?? {};
    return Object.fromEntries(
      SETTINGS.map((def) => {
        const own = def.key in values ? values[def.key] : def.legacyStudioField ? legacyDeep : undefined;
        return [def.key, textOf(def, own)];
      }),
    ) as SettingsForm;
  }, [settings.studioValues, legacyDeep]);

  const form = useDirtyForm<SettingsForm>(
    external,
    async (patch) => {
      const out: SettingsPatch = {};
      for (const [key, text] of Object.entries(patch) as [SettingKey, string][]) {
        const parsed = parseSetting(key, text);
        if ("error" in parsed) throw new Error(`${labelOf(key)}: ${parsed.error}`);
        out[key] = "clear" in parsed ? "clear" : parsed.value;
      }
      // Settling in must still end after New once the change lands.
      // Asked of each setting alone: resolveAll would quietly fall back to a
      // pair that works, and the leader would never hear theirs didn't.
      if ("newMax" in out || "settlingMax" in out) {
        const layers = { studio: applyPatch(settings.studioValues, out), company: settings.companyValues };
        const newMax = resolveSetting("newMax", layers).value ?? 0;
        const settlingMax = resolveSetting("settlingMax", layers).value ?? 0;
        if (settlingMax <= newMax) throw new Error("Settling in has to end after New.");
      }
      // Inactive must still come after Lapsed (the inactive round, Oct 1 2026), asked the same way.
      if ("lapsedDays" in out || "inactiveDays" in out) {
        const layers = { studio: applyPatch(settings.studioValues, out), company: settings.companyValues };
        const problem = inactiveProblem(resolveSetting("lapsedDays", layers).value, resolveSetting("inactiveDays", layers).value);
        if (problem) throw new Error(problem);
      }
      await saveStudioSettings(studioId, out);
      if (out.deepCleanDays === "clear" && legacyDeep !== undefined) {
        await updateDoc(doc(db, "studios", studioId), { deepCleanIntervalDays: deleteField() });
      }
      toastSuccess(`Saved. ${studio.name}'s screens follow the new numbers.`);
    },
    { label: `${studio.name}'s settings` },
  );

  const groups = GROUP_ORDER.map((g) => ({ g, defs: SETTINGS.filter((d) => d.group === g) }));
  const saveDisabled = settings.failed;

  return (
    <AdminPanel
      title="This studio's settings"
      icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
      subtitle={
        canEdit
          ? "Max Strength sets a default for each of these; set your own here, or clear a box to follow the default again."
          : "The numbers these screens use at this studio, and where each came from. Only this studio's leaders change them."
      }
      footer={
        canEdit && !saveDisabled ? (
          <SaveBar status={form.status} error={form.error} onSave={() => void form.save()} onDiscard={form.discard} />
        ) : !canEdit ? (
          <div className="px-4 py-3 text-sm" style={{ color: "var(--adm-ink-muted)" }}>
            Only this studio's leaders can change these settings.
          </div>
        ) : undefined
      }
    >
      {settings.failed && (
        <AdminNotice tone="warn">
          Couldn't read every layer of these settings just now, so the numbers below may not be the studio's. Nothing can be
          saved until they can be read.
        </AdminNotice>
      )}
      {groups.map(({ g, defs }) => (
        <section key={g} className="mb-4 last:mb-0">
          <h4 className="mb-2 text-[14px] font-bold" style={{ color: "var(--adm-ink-muted)" }}>
            {GROUP_LABEL[g]}
          </h4>
          <fieldset disabled={!canEdit || saveDisabled} className="contents">
            <AdminGrid>
              {defs.map((def) => {
                const now = settings.all[def.key];
                const fallback = fallbackFor(def.key, settings.companyValues);
                // "Now 3 sessions …: Max Strength's default.", "Now A alone: the app's default."
                const hint = `${def.help} Now ${formatSetting(def.key, now.value)}${def.unit ? ` ${def.unit}` : ""}: ${SOURCE_PHRASE[now.source]}.`;
                const id = `ms-setting-${def.key}`;
                return (
                  <AdminField key={def.key} label={def.label} hint={hint} htmlFor={def.kind === "choice" ? undefined : id}>
                    {def.kind === "choice" ? (
                      // A choice of a few, side by side (newClientsStart): blue when picked, inside the
                      // form, so a pick is dirty-tracked and saved with the rest.
                      <ChoiceSegments
                        id={id}
                        label={def.label}
                        value={form.value[def.key]}
                        disabled={!canEdit || saveDisabled}
                        options={[
                          { value: "", label: `Follow the default (${formatSetting(def.key, fallback)})` },
                          ...(def.choices ?? []).map((c) => ({ value: String(c.value), label: c.label, sub: c.sub })),
                        ]}
                        onChange={(v) => form.setField(def.key, v)}
                      />
                    ) : def.kind === "weekday" ? (
                      <AdminSelect id={id} value={form.value[def.key]} onChange={(e) => form.setField(def.key, e.target.value)}>
                        <option value="">Follow the default ({formatSetting(def.key, fallback)})</option>
                        <option value="none">None</option>
                        {WEEKDAY_NAMES.map((name, i) => (
                          <option key={name} value={String(i)}>
                            {name}
                          </option>
                        ))}
                      </AdminSelect>
                    ) : (
                      <AdminInput
                        id={id}
                        inputMode={def.kind === "multiple" ? "decimal" : "numeric"}
                        value={form.value[def.key]}
                        placeholder={`${formatSetting(def.key, fallback)} (the default)`}
                        onChange={(e) => form.setField(def.key, e.target.value)}
                      />
                    )}
                  </AdminField>
                );
              })}
            </AdminGrid>
          </fieldset>
        </section>
      ))}
    </AdminPanel>
  );
}

function labelOf(key: SettingKey): string {
  return SETTINGS.find((d) => d.key === key)?.label ?? key;
}

/** What a cleared box follows: head office's default, or the app's. */
function fallbackFor(key: SettingKey, company: Parameters<typeof resolveAll>[0]["company"]): SettingValue {
  return resolveAll({ studio: null, company })[key].value;
}

/** The studio's values as they will be once the patch lands (a cleared key gone). */
function applyPatch(values: Record<string, unknown> | null, patch: SettingsPatch): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(values ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === "clear") delete out[k];
    else if (v !== undefined) out[k] = v;
  }
  return out;
}
