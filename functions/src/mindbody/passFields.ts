/**
 * Extracts client-pass, waitlist and visit-count data from a Mindbody booking
 * payload.
 *
 * IMPORTANT CONTEXT (Aug 30, 2026): Mindbody's published
 * `appointmentBooking.created` schema does NOT list any of these fields — they
 * appear on CLASS booking events. Max Strength books 1:1 appointments, so these
 * may never arrive. Everything here is therefore strictly additive: a field is
 * written only when the payload actually carries it, so an absent field leaves
 * no empty keys behind and costs nothing.
 *
 * Key casing is read tolerantly (camelCase, PascalCase, snake_case) because the
 * webhook and the REST proxy spell things differently.
 */

export type MindbodyPass = {
  passId?: string;
  sessionsTotal?: number;
  sessionsDeducted?: number;
  sessionsRemaining?: number;
  activationDateTime?: string;
  expirationDateTime?: string;
};

export type MindbodyBookingExtras = {
  /** Only present when the payload carried at least one pass field. */
  pass?: MindbodyPass;
  bookingOriginatedFromWaitlist?: boolean;
  clientsNumberOfVisitsAtSite?: number;
};

const variants = (name: string): string[] => {
  const pascal = name.charAt(0).toUpperCase() + name.slice(1);
  const snake = name.replace(/([A-Z])/g, "_$1").toLowerCase();
  return [name, pascal, snake];
};

const pick = (
  source: Record<string, unknown>,
  name: string,
): unknown => {
  for (const key of variants(name)) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
};

const asString = (v: unknown): string | undefined => {
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
};

const asNumber = (v: unknown): number | undefined => {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

const asBoolean = (v: unknown): boolean | undefined => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "true") return true;
    if (t === "false") return false;
  }
  return undefined;
};

export function extractBookingExtras(
  payload: Record<string, unknown>,
): MindbodyBookingExtras {
  const out: MindbodyBookingExtras = {};

  const pass: MindbodyPass = {};
  const passId = asString(pick(payload, "clientPassId"));
  if (passId !== undefined) pass.passId = passId;

  const total = asNumber(pick(payload, "clientPassSessionsTotal"));
  if (total !== undefined) pass.sessionsTotal = total;

  const deducted = asNumber(pick(payload, "clientPassSessionsDeducted"));
  if (deducted !== undefined) pass.sessionsDeducted = deducted;

  const remaining = asNumber(pick(payload, "clientPassSessionsRemaining"));
  if (remaining !== undefined) pass.sessionsRemaining = remaining;

  const activation = asString(pick(payload, "clientPassActivationDateTime"));
  if (activation !== undefined) pass.activationDateTime = activation;

  const expiration = asString(pick(payload, "clientPassExpirationDateTime"));
  if (expiration !== undefined) pass.expirationDateTime = expiration;

  // Only attach the object if Mindbody actually said something about a pass.
  if (Object.keys(pass).length > 0) out.pass = pass;

  const waitlist = asBoolean(pick(payload, "bookingOriginatedFromWaitlist"));
  if (waitlist !== undefined) out.bookingOriginatedFromWaitlist = waitlist;

  const visits = asNumber(pick(payload, "clientsNumberOfVisitsAtSite"));
  if (visits !== undefined) out.clientsNumberOfVisitsAtSite = visits;

  return out;
}
