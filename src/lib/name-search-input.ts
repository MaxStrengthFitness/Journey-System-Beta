/**
 * SEARCHING FOR A PERSON BY NAME — with the keyboard's help switched off.
 *
 * Round: history editing + iPad fixes, Sep 17 2026.
 *
 * Trainers find clients by typing a name, and the iPad keyboard treats a name
 * as a misspelling. "Deitrich" becomes "Dietrich", "Nya" becomes "Nay",
 * "Rybak" becomes "Ryan" — and because the correction lands as the trainer
 * keeps typing, what they get is an empty result list for a client who is
 * standing in front of them. Autocapitalisation adds its own version of this
 * on a second word.
 *
 * Four attributes turn all of it off, and the only way they stay consistent
 * across the eight or nine places this app searches for a person is if they
 * are stated once:
 *
 *   autoCorrect     "off"    the replacement itself
 *   autoCapitalize  "none"   the shift key jumping back on
 *   autoComplete    "off"    Safari's own suggestion bar, which also carries
 *                            saved form values from other sites
 *   spellCheck      false    the red underline, and on some builds the
 *                            correction that rides along with it
 *
 * Spread it onto the input, never onto a field where a correction is WANTED —
 * a note, a session summary, anything written in sentences. This is for
 * fields whose whole content is a proper noun.
 *
 * (`autoCorrect` and `autoCapitalize` are not in the HTML standard; they are
 * Safari's, which is the browser this is for. React passes both through to
 * the DOM as-is.)
 */
export const NAME_SEARCH_PROPS = {
  autoCorrect: "off",
  autoCapitalize: "none",
  autoComplete: "off",
  spellCheck: false,
} as const;
