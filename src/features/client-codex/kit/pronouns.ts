/**
 * HOW THE CODEX REFERS TO A CLIENT — "How to coach her", "His why".
 *
 * Client codex, Sep 2026. The approved mockup writes she and her throughout,
 * and clients are not all women. The header prints the client's name once and
 * owns it (commit 1642a75), so the pages' own copy uses a pronoun instead of
 * repeating the name.
 *
 * The pronoun comes from the gender Mindbody holds for the client (Mindbody
 * owns people): Female is she and her, Male is he and his, and anything else —
 * no gender on file, "Other", Mindbody's "None" — is they and their. "They" is
 * the fallback for an unknown, not a claim, which is what `known` is for.
 * Overnight default for AJ's open question (Sep 24 2026); reversible here in
 * one place.
 *
 * The gender is read by machine fit's `parseGender`, so "F", "female " and
 * "Woman" mean the same thing on the codex as they do in the set-up cohorts.
 *
 * Grammar: "they" takes the plural verb ("they are", "they say"), so pass both
 * forms to `agree` rather than adding an "s": `agree(p, "says", "say")`.
 */
import { parseGender } from "../../machine-fit/factors";
import type { Client } from "../../../types";

export interface Pronouns {
  /** she · he · they */
  subject: "she" | "he" | "they";
  /** her · him · them */
  object: "her" | "him" | "them";
  /** Before a noun: her · his · their ("her why"). */
  possessive: "her" | "his" | "their";
  /** On its own: hers · his · theirs ("the choice is hers"). */
  possessiveAlone: "hers" | "his" | "theirs";
  /** herself · himself · themselves */
  reflexive: "herself" | "himself" | "themselves";
  /** True for "they": the verb that follows is the plural form. */
  plural: boolean;
  /** False when Mindbody holds no usable gender, so "they" is a fallback. */
  known: boolean;
}

const SHE: Pronouns = {
  subject: "she",
  object: "her",
  possessive: "her",
  possessiveAlone: "hers",
  reflexive: "herself",
  plural: false,
  known: true,
};

const HE: Pronouns = {
  subject: "he",
  object: "him",
  possessive: "his",
  possessiveAlone: "his",
  reflexive: "himself",
  plural: false,
  known: true,
};

const THEY: Pronouns = {
  subject: "they",
  object: "them",
  possessive: "their",
  possessiveAlone: "theirs",
  reflexive: "themselves",
  plural: true,
  known: false,
};

/** The pronouns for a client, from the gender Mindbody holds. */
export function pronounsOf(client: Pick<Client, "gender"> | null | undefined): Pronouns {
  const g = parseGender(typeof client?.gender === "string" ? client.gender : null);
  if (g === "f") return SHE;
  if (g === "m") return HE;
  return THEY;
}

/** The verb form that agrees with the pronoun: `agree(p, "is", "are")`. */
export function agree(p: Pronouns, singular: string, pluralForm: string): string {
  return p.plural ? pluralForm : singular;
}
