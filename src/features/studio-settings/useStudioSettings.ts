/**
 * THE STUDIO SETTINGS ON A SCREEN — a studio's values, resolved.
 *
 *   const settings = useStudioSettings(studioId, studioDoc);
 *   settings.value("quietFloorSessions")   // 2, or the studio's, or head office's
 *   settings.source("lapsedDays")          // "studio" | "company" | "app"
 *
 * Two small listeners: Max Strength's defaults (one document for the whole
 * company, shared by every screen that asks, so it is read once however many
 * mount) and the studio's own. Until they answer, every value is the app's
 * default, so a screen never waits on its settings to draw; a failed read
 * keeps the next layer's answer and says so in `failed`.
 */
import { useEffect, useMemo, useState } from "react";
import { forgetOnSignOut } from "../sign-out/memory";
import type { SettingKey } from "./registry";
import { resolveAll, type ResolvedSetting, type SettingSource, type SettingValue, type SettingValues } from "./resolve";
import { companyDefaultsRef, listenLayer, studioSettingsRef, type LayerRead } from "./store";

/* ---- Max Strength's defaults: one listener, shared ------------------------------ */

let companyRead: LayerRead = { status: "loading" };
const companyListeners = new Set<(r: LayerRead) => void>();
let stopCompany: (() => void) | null = null;

function subscribeCompany(fn: (r: LayerRead) => void): () => void {
  companyListeners.add(fn);
  fn(companyRead);
  if (!stopCompany) {
    stopCompany = listenLayer(companyDefaultsRef(), (r) => {
      companyRead = r;
      companyListeners.forEach((l) => l(r));
    });
  }
  return () => {
    companyListeners.delete(fn);
    if (companyListeners.size === 0 && stopCompany) {
      stopCompany();
      stopCompany = null;
      companyRead = { status: "loading" };
    }
  };
}

// The next person on a shared iPad reads the defaults afresh.
forgetOnSignOut(() => {
  stopCompany?.();
  stopCompany = null;
  companyRead = { status: "loading" };
});

export function useCompanyDefaults(): LayerRead {
  const [read, setRead] = useState<LayerRead>(companyRead);
  useEffect(() => subscribeCompany(setRead), []);
  return read;
}

/* ---- one studio's own ---------------------------------------------------------- */

export function useStudioOverrides(studioId: string | null | undefined): LayerRead {
  const [read, setRead] = useState<LayerRead>({ status: "loading" });
  useEffect(() => {
    if (!studioId) {
      setRead({ status: "ready", values: null });
      return;
    }
    setRead({ status: "loading" });
    return listenLayer(studioSettingsRef(studioId), setRead);
  }, [studioId]);
  return read;
}

/* ---- resolved -------------------------------------------------------------------- */

export interface StudioSettings {
  value(key: SettingKey): SettingValue;
  source(key: SettingKey): SettingSource;
  all: Record<SettingKey, ResolvedSetting>;
  /** Either layer still loading: values are the best answer so far. */
  loading: boolean;
  /** Either layer could not be read: values fell through to what could be. */
  failed: boolean;
  /** The raw layers, for the editors. */
  studioValues: SettingValues | null;
  companyValues: SettingValues | null;
}

const valuesOf = (r: LayerRead): SettingValues | null => (r.status === "ready" ? r.values : null);

export function useStudioSettings(
  studioId: string | null | undefined,
  studioDoc?: { deepCleanIntervalDays?: unknown } | null,
): StudioSettings {
  const company = useCompanyDefaults();
  const studio = useStudioOverrides(studioId);
  const legacy = studioDoc?.deepCleanIntervalDays;
  return useMemo(() => {
    const studioValues = valuesOf(studio);
    const companyValues = valuesOf(company);
    const all = resolveAll({ studio: studioValues, company: companyValues, studioDoc: { deepCleanIntervalDays: legacy } });
    return {
      value: (key) => all[key].value,
      source: (key) => all[key].source,
      all,
      loading: company.status === "loading" || studio.status === "loading",
      failed: company.status === "failed" || studio.status === "failed",
      studioValues,
      companyValues,
    };
  }, [company, studio, legacy]);
}
