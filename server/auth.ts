/**
 * Sign-in check for the web service's Mindbody routes.
 *
 * Round: Renewals, Phase 0 (Sep 2026). Until now /api/mindbody/* answered
 * anyone who could reach the server. Every call must now carry the caller's
 * Firebase sign-in token (src/lib/authed-fetch.ts adds it), and the caller
 * must be staff at a studio on the Mindbody site they ask about. The decision
 * itself is src/lib/staff-access.ts, which mirrors firestore.rules.
 *
 * NO DATABASE KEY ON THE WEB SERVICE. render.yaml keeps the Firestore
 * service-account key off this public-facing service on purpose, and this
 * file keeps it that way:
 *   - the sign-in token is verified with Google's public keys, which needs
 *     only the project id;
 *   - the caller's own trainer document, and each studio it names, are read
 *     through the Firestore REST API USING THE CALLER'S OWN TOKEN, so those
 *     reads are subject to the same security rules as the app. Only single
 *     documents are read, never a whole collection: a list is refused when
 *     any one document in it is off-limits (that took the schedule sync down
 *     on Sep 13 2026), a get is judged on its own.
 *
 * Reads are cached: a caller's profile for 5 minutes, a studio's site for
 * 10, so a busy iPad costs a handful of reads an hour, not one per call.
 */

import type { NextFunction, Request, Response } from "express";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import path from "path";
import {
  decideMindbodyAccess,
  decodeRestFields,
  resolveStaffAccess,
  restDocId,
  type StaffAccess,
  type TrainerAccessFields,
} from "../src/lib/staff-access.ts";

const PROFILE_TTL_MS = 5 * 60 * 1000;
const NO_PROFILE_TTL_MS = 60 * 1000;
const STUDIOS_TTL_MS = 10 * 60 * 1000;
const AUTH_APP_NAME = "journey-route-auth";

interface FirebaseTarget {
  projectId: string;
  databaseId: string;
}

let target: FirebaseTarget | null = null;

function firebaseTarget(): FirebaseTarget {
  if (target) return target;
  let config: { projectId?: string; firestoreDatabaseId?: string } = {};
  try {
    config = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8"),
    );
  } catch {
    // Generated at build time; the env vars are enough without it.
  }
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || config.projectId || "";
  const databaseId =
    process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || config.firestoreDatabaseId || "(default)";
  if (!projectId) {
    throw new Error(
      "VITE_FIREBASE_PROJECT_ID is not set, so sign-in tokens can't be checked.",
    );
  }
  target = { projectId, databaseId };
  return target;
}

/**
 * A Firebase Admin app used ONLY to verify sign-in tokens. It is given a
 * project id and no credential: verifying a token needs Google's public keys,
 * not a service account.
 */
function tokenVerifier() {
  const existing = getApps().find((a) => a.name === AUTH_APP_NAME);
  const app =
    existing ?? initializeApp({ projectId: firebaseTarget().projectId }, AUTH_APP_NAME);
  return getAuth(app);
}

async function restGet(url: string, idToken: string): Promise<{ status: number; body: any }> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

/**
 * "HTTP 403: Missing or insufficient permissions." — the status plus
 * Firestore's own one-line reason when it gives one. It goes into the
 * error the caller sees, because "try again in a minute" on its own sent
 * AJ to the logs to learn which of two reads had failed and why (Sep 13
 * 2026). Never includes the document, only the status and the message.
 */
function describeRestFailure(status: number, body: any): string {
  const msg = typeof body?.error?.message === "string" ? body.error.message.trim() : "";
  return msg ? `HTTP ${status}: ${msg}` : `HTTP ${status}`;
}

function documentsBase(): string {
  const { projectId, databaseId } = firebaseTarget();
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
}

/* ------------------------------------------------------------------ *
 * Studio → Mindbody site, one studio at a time
 * ------------------------------------------------------------------ */

/**
 * Studio id → Mindbody site id (null when the studio has none), cached.
 *
 * Sep 13 2026: this used to LIST the whole studios collection in one
 * request. The live rules refused that list (HTTP 403) while the same
 * token could GET the caller's own studios, and every schedule sync died
 * with "could not read the studio list". A list is refused if ANY
 * document it would return is off-limits, so it can never be the way a
 * public-facing server learns about the two or three studios a trainer
 * works at. Now each studio named on the caller's trainer document is
 * fetched on its own, and roles that reach every site read nothing.
 */
const studioSiteCache = new Map<string, { site: string | null; expiresAt: number }>();

async function studioSiteOf(studioId: string, idToken: string): Promise<string | null> {
  const cached = studioSiteCache.get(studioId);
  if (cached && cached.expiresAt > Date.now()) return cached.site;
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(studioId)) return null;

  const { status, body } = await restGet(
    `${documentsBase()}/studios/${encodeURIComponent(studioId)}?mask.fieldPaths=mindbodySiteId`,
    idToken,
  );
  let site: string | null = null;
  if (status === 200) {
    const raw = decodeRestFields(body?.fields).mindbodySiteId;
    site =
      typeof raw === "string" || typeof raw === "number" ? String(raw).trim() || null : null;
  } else if (status !== 404) {
    // Unknown, never "no site": ride on the last good answer if there is
    // one, else say which read failed and why.
    if (cached) return cached.site;
    throw new Error(`could not read one of your studios (${describeRestFailure(status, body)})`);
  }
  studioSiteCache.set(studioId, { site, expiresAt: Date.now() + STUDIOS_TTL_MS });
  return site;
}

/** The site map for exactly the studios the caller's profile names. */
async function loadCallerStudioSites(
  studioIds: string[],
  idToken: string,
): Promise<Record<string, string | null>> {
  const map: Record<string, string | null> = {};
  for (const id of studioIds) map[id] = await studioSiteOf(id, idToken);
  return map;
}

/* ------------------------------------------------------------------ *
 * The caller's profile
 * ------------------------------------------------------------------ */

/** The caller's trainer document, cached. The role is resolved per request, so a sign-in claim is never cached under someone else's answer. */
const profiles = new Map<string, { trainer: TrainerAccessFields | null; expiresAt: number }>();

async function loadTrainer(uid: string, idToken: string): Promise<TrainerAccessFields | null> {
  const cached = profiles.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.trainer;

  const { status, body } = await restGet(
    `${documentsBase()}/trainers/${encodeURIComponent(uid)}`,
    idToken,
  );
  let trainer: TrainerAccessFields | null = null;
  if (status === 200) {
    trainer = decodeRestFields(body?.fields) as TrainerAccessFields;
  } else if (status !== 404) {
    // Unknown, not "no profile": ride on the last good answer if we have one.
    if (cached) return cached.trainer;
    throw new Error(`could not read your staff profile (${describeRestFailure(status, body)})`);
  }
  profiles.set(uid, {
    trainer,
    expiresAt: Date.now() + (trainer ? PROFILE_TTL_MS : NO_PROFILE_TTL_MS),
  });
  return trainer;
}

async function loadAccess(uid: string, claimRole: unknown, idToken: string): Promise<StaffAccess | null> {
  const trainer = await loadTrainer(uid, idToken);
  if (!trainer) return null;
  // First pass with no site map: it settles the role and the studio list.
  // A role that reaches every site never needs a studio read at all.
  const shape = resolveStaffAccess({ uid, claimRole, trainer, siteIdByStudio: {} });
  if (!shape || shape.allSites) return shape;
  const siteIdByStudio = await loadCallerStudioSites(shape.studioIds, idToken);
  return resolveStaffAccess({ uid, claimRole, trainer, siteIdByStudio });
}

/**
 * The Mindbody site of a client this caller may open, or null. Used when a
 * trainer asks about a client whose home studio is on another site (an
 * approved cross-train client). The read is made with the caller's own token,
 * so the security rules decide whether they may open the client at all; the
 * answer is the site of THAT client's home studio, which the request must
 * name — so the check can't be pointed at one client to pull another.
 *
 * Which record that is follows src/lib/mindbody-site.ts: both MSF sites
 * number clients from 100000001, so the second person on a shared number
 * lives at `clients/{site}-{id}`, and that record is asked about first. The
 * plain record answers for the other site's person, whose home site will not
 * match the request's, so falling back to it can refuse but never wrongly
 * allow.
 */
async function readableClientSite(
  mindbodyClientId: string,
  idToken: string,
  requestSiteId?: string,
): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(mindbodyClientId)) return null;
  const candidates =
    requestSiteId && /^[0-9]{1,20}$/.test(requestSiteId)
      ? [`${requestSiteId}-${mindbodyClientId}`, mindbodyClientId]
      : [mindbodyClientId];
  for (const docId of candidates) {
    const { status, body } = await restGet(
      `${documentsBase()}/clients/${encodeURIComponent(docId)}?mask.fieldPaths=homeStudioId`,
      idToken,
    );
    if (status !== 200) continue;
    const home = decodeRestFields(body?.fields).homeStudioId;
    if (typeof home !== "string" || !home) continue;
    return studioSiteOf(home, idToken);
  }
  return null;
}

/** A plain id — a string or a number — or absent. Anything else is refused. */
function plainIdOrAbsent(v: unknown): boolean {
  return v === undefined || v === null || v === "" || typeof v === "string" || typeof v === "number";
}

/* ------------------------------------------------------------------ *
 * The middleware
 * ------------------------------------------------------------------ */

export interface RequireStaffOptions {
  /** Only Admin / Founder / Overseer. */
  requireSuper?: boolean;
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function requireStaff(options: RequireStaffOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const idToken = bearerToken(req);
    if (!idToken) {
      return res
        .status(401)
        .json({ error: "Please sign in again — this request carried no sign-in." });
    }

    let decoded: { uid: string; role?: unknown };
    try {
      decoded = (await tokenVerifier().verifyIdToken(idToken)) as any;
    } catch {
      return res
        .status(401)
        .json({ error: "Your sign-in has expired. Refresh the page and try again." });
    }

    let access: StaffAccess | null;
    try {
      access = await loadAccess(decoded.uid, decoded.role, idToken);
    } catch (err: any) {
      const why = String(err?.message || err || "unknown error");
      console.error("[auth] could not resolve caller:", why);
      // The reason rides in the sentence the app shows. It names a read and
      // a status, never a document or a token, and it is the difference
      // between a fixable report and "it says try again".
      return res
        .status(503)
        .json({ error: `Couldn't confirm your account just now (${why}). Try again in a minute.` });
    }

    // The routes turn these into strings; only plain ids may reach them.
    const body = req.body && typeof req.body === "object" ? req.body : null;
    if (body && (!plainIdOrAbsent(body.siteId) || !plainIdOrAbsent(body.mindbodyClientId))) {
      return res.status(400).json({ error: "That request names an invalid Mindbody site or client." });
    }
    if (body && (typeof body.siteId === "string" || typeof body.siteId === "number")) {
      body.siteId = String(body.siteId).trim();
    }
    const siteId = body?.siteId;
    let decision = decideMindbodyAccess(access, {
      siteId,
      requireSuper: options.requireSuper,
    });

    // A cross-train client lives on another site: allowed when the caller may
    // open that exact client AND the request names that client's own site.
    // Only a lookup by id: the name search is dropped on this path, so it
    // can't be used to find someone else on the other site.
    const mbClient = body?.mindbodyClientId;
    if (
      !decision.ok &&
      access &&
      !options.requireSuper &&
      typeof siteId === "string" &&
      siteId !== "" &&
      (typeof mbClient === "string" || typeof mbClient === "number") &&
      String(mbClient).trim() !== ""
    ) {
      try {
        const clientSite = await readableClientSite(String(mbClient).trim(), idToken, siteId);
        if (clientSite && clientSite === siteId) {
          decision = { ok: true, status: 200, error: "" };
          delete body.clientName;
        }
      } catch {
        // Leave the refusal standing.
      }
    }

    if (!decision.ok) {
      return res.status(decision.status).json({ error: decision.error });
    }
    res.locals.caller = access;
    return next();
  };
}
