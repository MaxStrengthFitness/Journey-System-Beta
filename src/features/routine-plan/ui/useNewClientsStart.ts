/**
 * HOW A STUDIO STARTS A NEW CLIENT, as Programming and the briefing read it
 * (the studio setting `newClientsStart`, the first-session round, item 8;
 * AJ, Oct 7 2026: "Some studios may start building an A and B routine
 * immediately for a client. So we need to be able to have that
 * customization").
 *
 * `useStudioSettings` answers with the app's default while it reads, and
 * with the next layer down when a read failed. That is right for a number a
 * screen only shows, and wrong here: at a studio that starts on A and B
 * together, a Keep or a Start pressed before the settings answered would
 * quietly keep no B (the review of item 8: a failed read is unknown, never
 * "A alone"). So the answer is true or false only when the value is the
 * studio's own, or both layers have answered; else "loading" or "failed".
 */
import { NEW_CLIENTS_START, type StudioSettings } from "../../studio-settings";
import { useStudioSettings } from "../../studio-settings/useStudioSettings";
import type { NewClientsStartRead } from "./host";

/** The setting as a screen may act on it: answered, still reading, or not read. */
export function newClientsStartOf(settings: Pick<StudioSettings, "value" | "source" | "loading" | "failed">): NewClientsStartRead {
  // The studio's own value is the answer whatever head office's read did;
  // anything else is the answer only once both layers have answered.
  const answered = settings.source("newClientsStart") === "studio" || (!settings.loading && !settings.failed);
  if (!answered) return settings.loading ? "loading" : "failed";
  return settings.value("newClientsStart") === NEW_CLIENTS_START.aAndB;
}

/**
 * The studio's `newClientsStart` for `studioId` (null reads nothing of the
 * studio's own: head office's default, or the app's). Two small listeners,
 * shared with every screen reading a studio setting.
 */
export function useNewClientsStart(studioId: string | null | undefined): NewClientsStartRead {
  return newClientsStartOf(useStudioSettings(studioId ?? null));
}
