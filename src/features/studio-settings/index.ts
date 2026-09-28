/**
 * features/studio-settings — every number a studio may set for itself, with a
 * company default head office sets in the app (AJ, Sep 28 2026: "let the
 * admins assign the default within the app"). See ./README.md.
 */
export { SETTINGS, SETTING_BY_KEY, GROUP_LABEL, WEEKDAY_NAMES, type SettingDef, type SettingKey, type SettingGroup } from "./registry";
export {
  resolveAll,
  resolveSetting,
  formatSetting,
  parseSetting,
  usable,
  SOURCE_WORDS,
  type ResolvedSetting,
  type SettingLayers,
  type SettingSource,
  type SettingValue,
  type SettingValues,
} from "./resolve";
export { saveCompanyDefaults, saveStudioSettings, type SettingsPatch } from "./store";
export { useCompanyDefaults, useStudioOverrides, useStudioSettings, type StudioSettings } from "./useStudioSettings";
