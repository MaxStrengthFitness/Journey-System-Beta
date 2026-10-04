/**
 * HOW THE CODEX REFERS TO A CLIENT — "How to coach them", "Their why".
 *
 * Client codex, Sep 2026. The approved mockup writes she and her throughout,
 * and clients are not all women. The header prints the client's name once and
 * owns it (commit 1642a75), so the pages' own copy uses a pronoun instead of
 * repeating the name.
 *
 * The pronoun is they, for every client. On-screen text never guesses a
 * client's gender (AJ, Oct 3 2026, on a man's row: "it says her when its a
 * man"), and the gender Mindbody holds is not a client's pronouns, so it is not
 * read here. Until Sep 24 2026 Female was she and Male was he; Oct 3 2026 that
 * guess went. Where a sentence reads as well without a pronoun, write it
 * without one.
 *
 * Grammar: "they" takes the plural verb ("they are", "they say"), so pass both
 * forms to `agree` rather than adding an "s": `agree(p, "says", "say")`.
 */

export interface Pronouns {
  /** she · he · they */
  subject: "she" | "he" | "they";
  /** her · him · them */
  object: "her" | "him" | "them";
  /** Before a noun: her · his · their ("their why"). */
  possessive: "her" | "his" | "their";
  /** On its own: hers · his · theirs ("the choice is theirs"). */
  possessiveAlone: "hers" | "his" | "theirs";
  /** herself · himself · themselves */
  reflexive: "herself" | "himself" | "themselves";
  /** True for "they": the verb that follows is the plural form. */
  plural: boolean;
}

/** The pronouns every screen uses for a client: they, them, their. */
export const CLIENT_PRONOUNS: Pronouns = {
  subject: "they",
  object: "them",
  possessive: "their",
  possessiveAlone: "theirs",
  reflexive: "themselves",
  plural: true,
};

/** The verb form that agrees with the pronoun: `agree(p, "is", "are")`. */
export function agree(p: Pronouns, singular: string, pluralForm: string): string {
  return p.plural ? pluralForm : singular;
}
