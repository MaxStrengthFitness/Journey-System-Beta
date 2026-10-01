/**
 * ADMINS → STANDARD → STUDIO DEFAULTS — Max Strength's default for every
 * number a studio may set for itself.
 *
 * AJ, Sep 28 2026: "let the admins assign the default within the app". Each
 * row: the setting and its unit, the app's own default, Max Strength's
 * default (a box; empty goes back to the app's), one sentence of what it
 * changes, and — read only, quietly — which studios set their own. One save
 * bar for the page, dirty-tracked, writing only the boxes that changed
 * (useDirtyForm, saveCompanyDefaults); a half-typed page joins the leave
 * question. After a save lands, one line goes into the Activity record.
 *
 * A read that failed says it can't check and draws no boxes: an empty box
 * would read as "not set" when nobody knows.
 *
 * The reads: Max Strength's defaults (the one shared listener every screen
 * uses, useCompanyDefaults) and, on this page only, one read of each real
 * studio's own settings (studios/{s}/config/settings), to count them.
 */
import { useEffect, useMemo, useState } from "react";
import { getDoc } from "firebase/firestore";
import { SlidersHorizontal } from "lucide-react";
import type { Studio, Trainer } from "../../../types";
import { AdminHeader, AdminInput, AdminNotice, AdminPanel, AdminScreen, AdminSelect, SaveBar } from "../../admin/primitives";
import { useDirtyForm } from "../../admin/useDirtyForm";
import { isDemoStudio } from "../../demo-mode/is-demo";
import {
  GROUP_LABEL,
  GROUP_ORDER,
  SETTINGS,
  WEEKDAY_NAMES,
  formatSetting,
  saveCompanyDefaults,
  useCompanyDefaults,
  type SettingDef,
  type SettingValues,
} from "../../studio-settings";
import { studioSettingsRef } from "../../studio-settings/store";
import { logActivity } from "../activity/log-activity";
import {
  defaultsRecord,
  fieldProblem,
  formOf,
  formProblem,
  ownLine,
  patchOf,
  unusableStored,
  whoSetsTheirOwn,
  type DefaultsForm,
  type OwnRead,
} from "./setting-defaults";
import "../admins.css";

/** One read of each studio's own settings, when this page opens. */
function useStudiosOwnSettings(studioIds: readonly string[]): Record<string, OwnRead> {
  const [reads, setReads] = useState<Record<string, OwnRead>>({});
  const key = [...studioIds].sort().join(",");
  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(",") : [];
    setReads(Object.fromEntries(ids.map((id) => [id, { state: "loading" } as OwnRead])));
    Promise.all(
      ids.map((id) =>
        getDoc(studioSettingsRef(id))
          .then((snap): [string, OwnRead] => {
            const data = snap.exists() ? (snap.data() as { values?: unknown }) : null;
            const values = data && data.values && typeof data.values === "object" ? (data.values as SettingValues) : null;
            return [id, { state: "ok", values }];
          })
          .catch((): [string, OwnRead] => [id, { state: "failed" }]),
      ),
    ).then((pairs) => {
      if (!cancelled) setReads(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return reads;
}


export function SettingDefaultsPage({ studios, authTrainer }: { studios: Studio[]; authTrainer: Trainer }) {
  const company = useCompanyDefaults();
  const values = company.status === "ready" ? company.values : null;
  const external = useMemo(() => formOf(values), [values]);

  const form = useDirtyForm<DefaultsForm>(
    external,
    async (changed) => {
      const problem = formProblem({ ...external, ...changed } as DefaultsForm);
      if (problem) throw new Error(problem);
      const patch = patchOf(changed);
      await saveCompanyDefaults(patch);
      const record = defaultsRecord(patch, values);
      if (record) void logActivity({ kind: "setting-default", studioId: null, ...record, byName: authTrainer.fullName });
    },
    { label: "Max Strength's studio defaults" },
  );

  const real = useMemo(() => studios.filter((s) => s.id && !isDemoStudio(s)), [studios]);
  const reads = useStudiosOwnSettings(useMemo(() => real.map((s) => s.id!), [real]));
  const own = useMemo(() => whoSetsTheirOwn(real, reads), [real, reads]);
  const stored = useMemo(() => unusableStored(values), [values]);
  const problem = formProblem(form.value);

  const header = (
    <AdminHeader
      icon={<SlidersHorizontal className="w-5 h-5" />}
      title="Studio defaults"
      subtitle="Max Strength's default for every number a studio may set for itself. A studio that sets its own keeps it; every other studio follows what is set here. Empty a box to go back to the app's own value. Studios' own values are theirs, on My Studio → Studio."
    />
  );

  if (company.status === "loading") {
    return (
      <AdminScreen>
        {header}
        <p className="hq-standing" role="status">
          Reading Max Strength&apos;s defaults…
        </p>
      </AdminScreen>
    );
  }

  if (company.status === "failed") {
    return (
      <AdminScreen>
        {header}
        <AdminNotice tone="warn">
          Couldn&apos;t read Max Strength&apos;s defaults just now, so this page can&apos;t say what they are or change them. Every
          studio keeps using what it had. Try again in a moment.
        </AdminNotice>
      </AdminScreen>
    );
  }

  const row = (def: SettingDef) => {
    const text = form.value[def.key];
    const err = fieldProblem(def.key, text);
    const id = `hq-default-${def.key}`;
    const app = formatSetting(def.key, def.appDefault);
    const shown = err ? null : text === "" ? null : text === "none" ? "None" : def.kind === "weekday" ? formatSetting(def.key, Number(text)) : text;
    const who = ownLine(own.byKey[def.key]);
    return (
      <div key={def.key} className="hq-setting">
        <div className="hq-setting__head">
          <label className="hq-setting__label" htmlFor={id}>
            {def.label}
          </label>
          <div className="hq-setting__control">
            {def.kind === "weekday" ? (
              <AdminSelect id={id} value={text} onChange={(e) => form.setField(def.key, e.target.value)}>
                <option value="">Not set</option>
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
                className="hq-setting__input"
                inputMode={def.kind === "multiple" ? "decimal" : "numeric"}
                value={text}
                placeholder="Not set"
                invalid={Boolean(err)}
                onChange={(e) => form.setField(def.key, e.target.value)}
              />
            )}
            {def.unit ? <span className="hq-setting__unit">{def.unit}</span> : null}
          </div>
        </div>
        <p className="hq-setting__now">
          {shown === null
            ? `The app's default is ${app}. With this box empty, studios use it.`
            : `The app's default is ${app}. Studios use ${shown} unless they set their own.`}
        </p>
        <p className="hq-setting__help">{def.help}</p>
        {err ? <p className="adm-hint adm-hint--error">{err}</p> : null}
        {stored[def.key] !== undefined ? (
          <p className="hq-setting__warn">
            What is stored ({stored[def.key]}) isn&apos;t a usable value, so studios use the app&apos;s {app}. Enter one, or save it empty.
          </p>
        ) : null}
        {who ? <p className="hq-setting__own">{who}</p> : null}
      </div>
    );
  };

  return (
    <AdminScreen>
      {header}
      <AdminPanel
        title="Max Strength's defaults"
        icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
        footer={
          <SaveBar
            status={problem && form.dirty ? "error" : form.status}
            error={problem ?? form.error}
            onSave={() => {
              if (problem) return;
              void form.save();
            }}
            onDiscard={form.discard}
          />
        }
      >
        <div className="hq-settings">
          {GROUP_ORDER.map((g) => {
            const defs = SETTINGS.filter((d) => d.group === g);
            if (defs.length === 0) return null;
            return (
              <section key={g} className="hq-settings__group" aria-label={GROUP_LABEL[g]}>
                <h3 className="hq-settings__title">{GROUP_LABEL[g]}</h3>
                {defs.map(row)}
              </section>
            );
          })}
        </div>
      </AdminPanel>
      {own.failed.length > 0 ? (
        <p className="hq-standing">
          {`Couldn't read ${own.failed.join(", ")}'s own settings just now, so ${own.failed.length === 1 ? "it isn't" : "they aren't"} counted above.`}
        </p>
      ) : null}
    </AdminScreen>
  );
}
