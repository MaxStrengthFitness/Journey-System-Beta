/**
 * MINDBODY CLIENT → DEMOGRAPHICS — the pure half of Master Sync's server side.
 *
 * Master Sync round (Sep 2026). Shared by server/mindbody-client.ts (which
 * makes the calls) and the browser (which types the route's answer). Nothing
 * here imports Firebase or touches the network, so it is tested in the normal
 * suite (vitest runs `src` only).
 *
 * Field names are the Public API v6 `Client` object (GET client/clients):
 * FirstName, LastName, Email, MobilePhone / HomePhone / WorkPhone, BirthDate,
 * Gender, AddressLine1 / AddressLine2, City, State, PostalCode, Country,
 * Status, Active, IsProspect, CreationDate, FirstAppointmentDate,
 * Liability { IsReleased, AgreementDate } (and the older top-level boolean
 * LiabilityRelease), EmergencyContactInfoName / Phone / Relationship,
 * PhotoUrl, Notes, HomeLocation { Id }. Mindbody's own docs are loose about
 * which fields may be null or missing, so every read here is defensive and an
 * empty value comes back as null — "Mindbody didn't say", never "blank it".
 *
 * Dates: Mindbody sends zoneless wall times. They are read as UTC
 * (parseMindbodyInstant), the same rule the webhook and the commercial sync
 * use, and returned as full ISO instants so nothing downstream re-guesses.
 */

import {
  parseMindbodyInstant,
  type ContractRow,
  type MembershipRow,
  type ServiceRow,
} from "./mindbody-commercial-map";

/** Everything Master Sync reads off a Mindbody client. null = Mindbody didn't say. */
export interface MindbodyDemographics {
  /** Mindbody's client id (`Id`) exactly as Mindbody returned it. */
  mindbodyClientId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  /** YYYY-MM-DD, a calendar day. */
  dateOfBirth: string | null;
  gender: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  /** Mindbody's membership status: Active, Non-Member, Expired, … or a studio's own value. */
  status: string | null;
  /** Mindbody's own active/inactive flag on the person. Not the app's `isActive`. */
  active: boolean | null;
  isProspect: boolean | null;
  /** ISO instant — when the client was added to the business. */
  createdAt: string | null;
  /** ISO instant — first visit to the site. */
  firstAppointmentDate: string | null;
  /**
   * The liability waiver. null when Mindbody sent nothing about it — unknown,
   * which must leave the stored answer alone.
   */
  liability: { isReleased: boolean; agreementDate: string | null } | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  /** https only. */
  photoUrl: string | null;
  /** Mindbody's account notes, first 1,000 characters. */
  notes: string | null;
  homeLocationId: number | string | null;
}

/** The commercial part, shaped like /api/mindbody/client-commercial's answer. */
export interface MasterSyncCommercial {
  /** null when that Mindbody call failed — unknown, never "none". */
  contracts: ContractRow[] | null;
  memberships: MembershipRow[] | null;
  services: ServiceRow[] | null;
  partial: boolean;
}

/** Which parts of a Master Sync could not be read. */
export type MasterSyncPart = "contracts" | "memberships" | "services" | "visits";

/** POST /api/mindbody/client-master-sync — the whole answer. */
export type MasterSyncResponse =
  | {
      found: false;
      mindbodyClientId: string;
      siteId: string;
      fetchedAt: string;
    }
  | {
      found: true;
      mindbodyClientId: string;
      siteId: string;
      demographics: MindbodyDemographics;
      commercial: MasterSyncCommercial;
      /**
       * Lifetime visits at the site (GET client/clientvisits, TotalResults).
       * Best-effort: null when that call failed or didn't say — unknown.
       */
      visits: number | null;
      /** True when contracts, memberships or pricing options couldn't be read. */
      partial: boolean;
      /** Every part that couldn't be read, visits included. */
      failed: MasterSyncPart[];
      fetchedAt: string;
    };

/** Limits that match firestore.rules and the app's own fields. */
export const MINDBODY_NOTES_MAX = 1000;
const NAME_MAX = 49; // isValidClient: size() < 50

/* ------------------------------------------------------------------ *
 * Small readers
 * ------------------------------------------------------------------ */

function text(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * A Mindbody date, or null. Mindbody fills unknown dates with its minimum
 * value ("0001-01-01T00:00:00") in places; anything before 1900 is treated
 * as "not given".
 */
function instant(value: unknown): string | null {
  const d = parseMindbodyInstant(value);
  if (!d || d.getUTCFullYear() < 1900) return null;
  return d.toISOString();
}

/** BirthDate "1970-05-12T00:00:00" → "1970-05-12". The day as written, no zone math. */
function calendarDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]);
  if (year < 1900) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Placeholders Mindbody may use for "not given". Never written over a real value. */
const EMPTY_GENDER = new Set(["none", "unknown", "unspecified", "not specified", "n/a"]);

/* ------------------------------------------------------------------ *
 * The mapper
 * ------------------------------------------------------------------ */

export function demographicsFromApi(c: any): MindbodyDemographics {
  const firstName = text(c?.FirstName);
  const lastName = text(c?.LastName);

  const gender = text(c?.Gender);

  const photo = text(c?.PhotoUrl);

  const notes = text(c?.Notes);

  let liability: MindbodyDemographics["liability"] = null;
  const liab = c?.Liability;
  if (liab && typeof liab === "object" && typeof liab.IsReleased === "boolean") {
    liability = {
      isReleased: liab.IsReleased,
      agreementDate: liab.IsReleased ? instant(liab.AgreementDate) : null,
    };
  } else if (typeof c?.LiabilityRelease === "boolean") {
    // Older shape: a bare boolean, no date.
    liability = { isReleased: c.LiabilityRelease, agreementDate: null };
  }

  const home = c?.HomeLocation;
  const homeId =
    home && typeof home === "object" && (typeof home.Id === "number" || typeof home.Id === "string")
      ? home.Id
      : typeof c?.HomeLocationId === "number" || typeof c?.HomeLocationId === "string"
        ? c.HomeLocationId
        : null;

  return {
    mindbodyClientId: text(c?.Id) ?? "",
    firstName: firstName && firstName.length <= NAME_MAX ? firstName : null,
    lastName: lastName && lastName.length <= NAME_MAX ? lastName : null,
    email: text(c?.Email),
    phone: text(c?.MobilePhone) ?? text(c?.HomePhone) ?? text(c?.WorkPhone),
    dateOfBirth: calendarDay(c?.BirthDate),
    gender: gender && !EMPTY_GENDER.has(gender.toLowerCase()) ? gender : null,
    addressLine1: text(c?.AddressLine1),
    addressLine2: text(c?.AddressLine2),
    city: text(c?.City),
    state: text(c?.State),
    postalCode: text(c?.PostalCode),
    country: text(c?.Country),
    status: text(c?.Status),
    active: bool(c?.Active),
    isProspect: bool(c?.IsProspect),
    createdAt: instant(c?.CreationDate),
    firstAppointmentDate: instant(c?.FirstAppointmentDate),
    liability,
    emergencyContactName: text(c?.EmergencyContactInfoName),
    emergencyContactPhone: text(c?.EmergencyContactInfoPhone),
    emergencyContactRelationship: text(c?.EmergencyContactInfoRelationship),
    photoUrl: photo && /^https:\/\//i.test(photo) ? photo : null,
    notes: notes ? notes.slice(0, MINDBODY_NOTES_MAX) : null,
    homeLocationId: typeof homeId === "string" ? text(homeId) : homeId,
  };
}

/** The one-line address: line 1, then line 2 when it adds something. */
export function joinAddress(line1: string | null, line2: string | null): string | null {
  const a = (line1 || "").trim();
  const b = (line2 || "").trim();
  if (a && b && !a.toLowerCase().includes(b.toLowerCase())) return `${a}, ${b}`;
  return a || b || null;
}

/**
 * The client Mindbody returned for exactly this id, or null.
 *
 * GET client/clients?ClientIds= should only return that client, but the
 * answer is checked anyway: a record is never taken on anything but its id —
 * no name matching, no "first result".
 */
export function pickRequestedClient(clients: unknown, mindbodyClientId: string): any | null {
  if (!Array.isArray(clients)) return null;
  const wanted = String(mindbodyClientId).trim().toLowerCase();
  if (!wanted) return null;
  return (
    clients.find(
      (c: any) =>
        (typeof c?.Id === "string" || typeof c?.Id === "number") &&
        String(c.Id).trim().toLowerCase() === wanted,
    ) ?? null
  );
}

/**
 * Lifetime visit count from a GET client/clientvisits page, or null.
 * Asked for with Limit=1: only the pagination total is read.
 */
export function visitsTotalFrom(data: any): number | null {
  const total = data?.PaginationResponse?.TotalResults;
  return typeof total === "number" && Number.isInteger(total) && total >= 0 ? total : null;
}

/**
 * The start of the visit count. Mindbody defaults StartDate to today, so a
 * lifetime count needs a date before any MSF studio opened.
 */
export const VISITS_START_DATE = "2000-01-01";
