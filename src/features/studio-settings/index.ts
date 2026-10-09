/**
 * features/studio-settings — every number a studio may set for itself, with a
 * company default head office sets in the app (AJ, Sep 28 2026: "let the
 * admins assign the default within the app"). See ./README.md.
 */
export {
  SETTINGS,
  SETTING_BY_KEY,
  GROUP_LABEL,
  GROUP_ORDER,
  NEW_CLIENTS_START,
  WEEKDAY_NAMES,
  type SettingChoice,
  type SettingDef,
  type SettingKey,
  type SettingGroup,
} from "./registry";
export {
  resolveAll,
  resolveSetting,
  formatSetting,
  inactiveProblem,
  parseSetting,
  usable,
  SOURCE_PHRASE,
  SOURCE_WORDS,
  type ResolvedSetting,
  type SettingLayers,
  type SettingSource,
  type SettingValue,
  type SettingValues,
} from "./resolve";
export { saveCompanyDefaults, saveStudioSettings, type SettingsPatch } from "./store";
export { useCompanyDefaults, useStudioOverrides, useStudioSettings, type StudioSettings } from "./useStudioSettings";
