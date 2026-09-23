/**
 * "Is this client document the person this Mindbody record is about?"
 *
 * `clients/{mindbodyClientId}` carries no site, and Mindbody only promises a
 * client id is unique within ONE site. MSF has two, and both numbered from
 * 100000001: on Sep 23 2026 the collision check found 43 ids naming a
 * DIFFERENT PERSON at each site. So a document found by id alone is only this
 * person when its home studio is on the same site.
 *
 * The rule every writer follows — the schedule sync (mindbody-api-sync.ts),
 * the webhook (functions/src/mindbody/index.ts, which cannot import this: a
 * separate package) and the Limbo release (mindbody-limbo.ts):
 *
 *   home studio on ANOTHER site   a different person — never written to
 *   home studio on the SAME site  this person (a sibling studio is a visitor)
 *   anything unknown              unknown is not wrong — carry on as before
 */

type StudioSite = { id?: string; mindbodySiteId?: string | number | null };

/**
 * The site a client's home studio sits on, when that is a POSITIVE mismatch
 * with `site`; null when it matches or either side is unknown.
 */
export function otherSiteOf(
  homeStudioId: unknown,
  site: string | number | null | undefined,
  studios: readonly StudioSite[],
): string | null {
  if (typeof homeStudioId !== "string" || !homeStudioId) return null;
  const theirs = studios.find((s) => s.id === homeStudioId)?.mindbodySiteId;
  const theirSite = theirs != null ? String(theirs).trim() : "";
  const thisSite = site != null ? String(site).trim() : "";
  return theirSite && thisSite && theirSite !== thisSite ? theirSite : null;
}
