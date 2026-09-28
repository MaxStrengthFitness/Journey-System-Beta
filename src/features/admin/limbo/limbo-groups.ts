/**
 * LIMBO, SORTED BY WHERE THE EVENTS CAME FROM. PURE: no React, no Firestore.
 *
 * Round: the Admins room (Sep 28 2026). An event lands in Limbo when no
 * studio claimed its Mindbody site and location at the time, usually because
 * a studio was missing its Site ID or location id. Once that is fixed the
 * registry can say where the event belongs: this groups the waiting events
 * by site and location and names the studio that claims that pair NOW, so
 * the person releasing them starts from the registry's answer rather than a
 * blank picker. Releasing is still one deliberate tap per event.
 *
 * The rule for a suggestion mirrors how the pull files a booking: an exact
 * site-and-location match; or, on a site only one studio has, that studio
 * when it claims no location of its own; or, for an event with no location,
 * the site's only studio. Offline studios and the practice studio never
 * take a booking.
 */
import type { LimboEntry, Studio } from "../../../types";
import { isDemoStudio } from "../../demo-mode/is-demo";

export interface LimboGroup {
  key: string;
  siteId: string | null;
  locationId: string | null;
  entries: LimboEntry[];
  /** The studio the registry says this site and location are, if any. */
  suggestion: Studio | null;
  heading: string;
  note: string;
}

const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v).trim());

/** Which studio the registry says an event's site and location belong to, or null. */
export function suggestedStudio(entry: Pick<LimboEntry, "siteId" | "locationId">, studios: readonly Studio[]): Studio | null {
  const site = str(entry.siteId);
  if (!site) return null;
  const location = str(entry.locationId);
  const onSite = studios.filter((s) => s.id && str(s.mindbodySiteId) === site && s.mindbodyMode !== "offline" && !isDemoStudio(s));
  if (location) {
    const exact = onSite.find((s) => str(s.mindbodyLocationId) === location);
    if (exact) return exact;
    if (onSite.length === 1 && !str(onSite[0].mindbodyLocationId)) return onSite[0];
    return null;
  }
  return onSite.length === 1 ? onSite[0] : null;
}

function countWords(entries: readonly LimboEntry[]): string {
  const bookings = entries.filter((e) => e.kind === "booking").length;
  const clients = entries.filter((e) => e.kind === "client").length;
  const other = entries.length - bookings - clients;
  const parts: string[] = [];
  if (bookings) parts.push(`${bookings} ${bookings === 1 ? "booking" : "bookings"}`);
  if (clients) parts.push(`${clients} client ${clients === 1 ? "record" : "records"}`);
  if (other) parts.push(`${other} other ${other === 1 ? "record" : "records"}`);
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The waiting events, grouped by site and location, the biggest group first. */
export function limboGroups(entries: readonly LimboEntry[], studios: readonly Studio[]): LimboGroup[] {
  const byKey = new Map<string, LimboEntry[]>();
  for (const e of entries) {
    const key = `${str(e.siteId)}|${str(e.locationId)}`;
    const list = byKey.get(key) ?? [];
    list.push(e);
    byKey.set(key, list);
  }
  const groups: LimboGroup[] = [];
  for (const [key, list] of byKey) {
    const siteId = str(list[0].siteId) || null;
    const locationId = str(list[0].locationId) || null;
    const suggestion = suggestedStudio({ siteId, locationId }, studios);
    const heading = siteId
      ? locationId
        ? `Site ${siteId} · location ${locationId}`
        : `Site ${siteId} · no location given`
      : "No Mindbody site on the event";
    const note = `${countWords(list)}. ${
      suggestion
        ? `The registry says this is ${suggestion.name}.`
        : siteId
          ? "No studio claims it yet: add the Site ID and location on the studio's page, or choose a studio for each."
          : "Choose a studio for each."
    }`;
    groups.push({ key, siteId, locationId, entries: list, suggestion, heading, note });
  }
  // The biggest first; an event with no site at all last among its size.
  return groups.sort(
    (a, b) => b.entries.length - a.entries.length || Number(!a.siteId) - Number(!b.siteId) || a.key.localeCompare(b.key),
  );
}
