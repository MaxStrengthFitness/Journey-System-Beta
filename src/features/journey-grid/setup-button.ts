/**
 * THE NOW BAR'S SETTINGS BUTTON — what it says (the open session round, Oct
 * 9 2026; AJ's "2a").
 *
 * AJ: "with the new routine is a client has no settings so you need to be
 * able to adjust the settings quickly while running the routine, currently
 * you just click on the machine and then fill it in and save". The Now Bar's
 * read-only setting tiles became ONE 40px raised button that opens the
 * machine card straight on the first empty dial:
 *
 *   - a first time on the machine (nothing saved for this client, by a read
 *     that has answered): "Set up · 2 not set";
 *   - once set, the settings themselves, "Gap 1 · Seat 12 · Back pad 3",
 *     wrapping and never cut, and "· 1 not set" after them while a dial is
 *     still empty;
 *   - settings not read yet: what the rail already shows (the machine's
 *     standard gap) or "Settings", never a count off a read that hasn't
 *     answered;
 *   - a machine with no dials and nothing on file: no button.
 *
 * PURE — no React.
 */
import type { JourneyMachine } from "./types";

export type SetupButton =
  | {
      kind: "setup";
      /** Dials still empty. */
      notSet: number;
      /** "Set up · 2 not set". */
      words: string;
      /** What a screen reader hears. */
      aria: string;
    }
  | {
      kind: "settings";
      /** [full name, value], in the rail's order ("Gap", "1"). */
      pairs: [string, string][];
      /** Dials still empty, known only once the settings are read (0 otherwise). */
      notSet: number;
      /** "Gap 1 · Seat 12 · Back pad 3", "Settings" when there are none to say. */
      words: string;
      aria: string;
    };

/** "2 not set". */
export const notSetWords = (n: number): string => `${n} not set`;

/**
 * The button for one machine on the Now Bar (and the phone's card), or null
 * when there is nothing to set up or show.
 */
export function setupButtonOf(
  machine: Pick<JourneyMachine, "name" | "settings" | "settingLabels" | "dialsNotSet" | "firstSetup">,
): SetupButton | null {
  const notSet = Math.max(0, machine.dialsNotSet ?? 0);
  const pairs: [string, string][] = Object.entries(machine.settings ?? {})
    .filter(([, v]) => String(v ?? "").trim() !== "")
    .map(([k, v]) => [machine.settingLabels?.[k] ?? k, String(v).trim()]);
  const name = machine.name;

  if (machine.firstSetup === true && notSet > 0) {
    const words = `Set up · ${notSetWords(notSet)}`;
    return { kind: "setup", notSet, words, aria: `Set up ${name}: ${notSetWords(notSet)}. Opens the machine card on the first one.` };
  }

  // The empty dials are said only once the settings are known (firstSetup false).
  const stillEmpty = machine.firstSetup === false ? notSet : 0;
  if (pairs.length === 0) {
    // No dials to fill (or none worked out) and nothing to show: no button.
    if (notSet === 0) return null;
    const words = stillEmpty > 0 ? `Settings · ${notSetWords(stillEmpty)}` : "Settings";
    return { kind: "settings", pairs, notSet: stillEmpty, words, aria: `${name} settings. Opens the machine card.` };
  }
  const said = pairs.map(([k, v]) => `${k} ${v}`);
  const words = [...said, ...(stillEmpty > 0 ? [notSetWords(stillEmpty)] : [])].join(" · ");
  return {
    kind: "settings",
    pairs,
    notSet: stillEmpty,
    words,
    aria: `${name} settings: ${words}. Opens the machine card to change them.`,
  };
}
