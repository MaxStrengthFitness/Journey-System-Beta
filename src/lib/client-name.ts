/**
 * CLIENT NAMES — one place that decides what to call a client.
 *
 * The client-profile audit (Sep 2026): legal names and dates of birth stay on
 * the record for administration, but a coach-entered NICKNAME ("Judy" for
 * Judith, "Doc", "Bud") replaces the legal first name across the primary
 * headers — the profile, the pre-session briefing, the Active Session and the
 * post-session screen — because that is what the client is called on the
 * floor. The legal name is never overwritten: Mindbody owns it, and the
 * Master Sync keeps it current.
 *
 * `nickname` is a coach field; nothing from Mindbody writes it.
 */

type NameLike = {
  firstName?: string | null;
  lastName?: string | null;
  nickname?: string | null;
} | null | undefined;

const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** The nickname when there is one, else the legal first name. */
export function clientFirstName(client: NameLike, fallback = ""): string {
  return clean(client?.nickname) || clean(client?.firstName) || fallback;
}

/** "Judy Daus" — what a header says. */
export function clientDisplayName(client: NameLike, fallback = "Client"): string {
  const name = [clientFirstName(client), clean(client?.lastName)].filter(Boolean).join(" ");
  return name || fallback;
}

/** "Judith Daus" — the name on the record. */
export function clientLegalName(client: NameLike): string {
  return [clean(client?.firstName), clean(client?.lastName)].filter(Boolean).join(" ");
}

/** True when a nickname is in use and differs from the legal first name. */
export function goesByNickname(client: NameLike): boolean {
  const nick = clean(client?.nickname);
  return !!nick && nick.toLowerCase() !== clean(client?.firstName).toLowerCase();
}

/** "JD" — from the name the client goes by. */
export function clientInitials(client: NameLike): string {
  return `${clientFirstName(client).charAt(0)}${clean(client?.lastName).charAt(0)}`.toUpperCase();
}
