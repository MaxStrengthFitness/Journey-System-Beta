import {
  Firestore,
  getFirestore,
  Timestamp,
  FieldValue,
} from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { verifyMindbodySignature } from "./verifySignature";
import { recordHealthEvent } from "./healthState";
import { tryRecordEvent } from "./idempotency";
import {
  wallClockToInstant,
  isValidTimeZone,
  DEFAULT_TIME_ZONE,
  studioDayKeyOf,
} from "./time";
import {
  ensureCanonicalClient,
  recordLimboEvent,
  LIMBO_QUEUE,
  MindbodyClientProfile,
} from "./clientResolver";
import { recordAttemptFailure } from "./retryLedger";
import { extractBookingExtras } from "./passFields";
import { extractStaffId, mapStaffEventToPatch } from "./staffProfile";
import { resolveTrainerByStaffId } from "./staffResolver";

export type WebhookRequest = {
  rawBody: string;
  signatureHeader: string | undefined;
};

export type WebhookResponse = {
  statusCode: 200 | 400 | 401 | 500;
  body?: string;
};

export type WebhookDeps = {
  firestore: Firestore;
  webhookSecret: string;
};

type CachedStudio = {
  id: string;
  siteId: string;
  locationId?: string;
  /** IANA zone the studio's wall-clock times are expressed in. */
  timeZone?: string;
};

let studiosCache: CachedStudio[] | null = null;
let lastCacheUpdate = 0;

/** Clears the module-level studio cache. Exported for tests. */
export function resetStudioCache(): void {
  studiosCache = null;
  lastCacheUpdate = 0;
}

async function getStudios(firestore: Firestore): Promise<CachedStudio[]> {
  const now = Date.now();
  if (!studiosCache || now - lastCacheUpdate > 60000) {
    // Cache for 1 minute
    const next: CachedStudio[] = [];
    const snap = await firestore.collection("studios").get();
    snap.forEach((doc) => {
      const data = doc.data();
      if (data.mindbodySiteId) {
        next.push({
          id: doc.id,
          siteId: String(data.mindbodySiteId).trim(),
          locationId:
            data.mindbodyLocationId !== undefined &&
            data.mindbodyLocationId !== null
              ? String(data.mindbodyLocationId).trim()
              : undefined,
          timeZone: isValidTimeZone(data.timezone)
            ? String(data.timezone).trim()
            : undefined,
        });
      }
    });
    studiosCache = next;
    lastCacheUpdate = now;
  }
  return studiosCache;
}

export type StudioResolution = {
  studioId?: string;
  /** True when several studios share the site and the event names no location. */
  ambiguous: boolean;
  /** True when NO studio claims this Mindbody site at all. */
  unmapped: boolean;
  /** Timezone of the resolved studio, for reading MindBody's naive times. */
  timeZone?: string;
};

async function resolveStudio(
  firestore: Firestore,
  siteId: string | number,
  locationId?: string | number,
): Promise<StudioResolution> {
  const studios = await getStudios(firestore);
  const site = String(siteId).trim();
  const onSite = studios.filter((s) => s.siteId === site);

  if (onSite.length === 0) return { ambiguous: false, unmapped: true };
  if (locationId !== undefined && locationId !== null && locationId !== "") {
    const loc = String(locationId).trim();
    const match = onSite.find((s) => s.locationId === loc);
    if (match) {
      return {
        studioId: match.id,
        ambiguous: false,
        unmapped: false,
        timeZone: match.timeZone,
      };
    }
    // A location no studio claims, on a site only ONE studio has: that
    // studio's, exactly as the pull files it (lib/mindbody-api-sync.ts,
    // resolveStudioId). Parking it instead left the two paths disagreeing on
    // every booking at a single-studio site whose location was never entered.
    if (onSite.length !== 1) return { ambiguous: true, unmapped: false };
  }

  if (onSite.length === 1)
    return {
      studioId: onSite[0].id,
      ambiguous: false,
      unmapped: false,
      timeZone: onSite[0].timeZone,
    };
  return { ambiguous: true, unmapped: false };
}

/**
 * Parses a Mindbody UTC datetime string into a Timestamp.
 *
 * Unlike the booking events -- whose times are naive studio wall-clock strings
 * and go through `wallClockToInstant` -- membership and contract events send
 * true UTC (`2018-03-20T00:00:00Z`). A missing zone designator is treated as
 * UTC rather than as the container's clock, so behaviour never depends on where
 * the function happens to run.
 */
export function toUtcTimestamp(value: unknown): Timestamp | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return Timestamp.fromDate(parsed);
}

/** A Firestore Timestamp (or anything with toMillis / _seconds) as epoch ms, or null. */
function millisOf(value: unknown): number | null {
  if (!value) return null;
  const v = value as { toMillis?: () => number; _seconds?: number; seconds?: number };
  if (typeof v.toMillis === "function") {
    const ms = v.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  const secs = v._seconds ?? v.seconds;
  return typeof secs === "number" ? secs * 1000 : null;
}

/** Firestore map keys cannot contain path characters; Mindbody ids are numeric. */
function toMapKey(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const key = String(value).trim();
  if (!key || /[.~*/[\]]/.test(key)) return undefined;
  return key;
}

/**
 * The client document a Mindbody event belongs to. STRICT: always the canonical
 * path, never a document found by searching id fields.
 *
 * This used to fall back to a `mindbodyClientId`/`mindbodyId` field query so
 * commercial data would not land on an orphan record. That fallback is gone on
 * purpose: with one canonical location there is nothing to search for, and a
 * search could only ever return a stale document we have decided to ignore.
 */
function resolveClientRef(firestore: Firestore, clientId: string | number) {
  return firestore.collection("clients").doc(String(clientId).trim());
}

/**
 * WHICH JOURNEY RECORD IS MINDBODY CLIENT X ON SITE S?
 *
 * `clients/{mindbodyClientId}` carries no site, and Mindbody only promises an
 * id is unique within ONE site. MSF has two, and both numbered from
 * 100000001: on Sep 23 2026 the collision check found 43 ids naming a
 * DIFFERENT PERSON at each site. This webhook writes Mindbody-owned facts
 * that always overwrite, so an event from the other site filed by id alone
 * would move someone's home studio, and with it who may read their clinical
 * record.
 *
 * The client-identity round keeps every existing record where it is and gives
 * the SECOND person their own, `clients/{S}-{X}`. The rule is
 * src/lib/mindbody-site.ts (a separate package, so this is a copy — keep them
 * in step):
 *
 *   1. clients/S-X exists                       -> that is them
 *   2. clients/X is on site S, or unknown       -> that is them
 *   3. clients/X is on the OTHER site           -> S-X (made on first write)
 *   4. clients/X does not exist                 -> X, as always
 *
 * A record's site is its own `mindbodySiteId`, else its home studio's. With no
 * site on the event there is nothing to test, and X is used as before.
 */
export function siteQualifiedClientId(site: string | number, clientId: string | number): string {
  return `${String(site).trim()}-${String(clientId).trim()}`;
}

async function resolveClientDocId(
  firestore: Firestore,
  clientId: string | number,
  eventSiteId: string | number | undefined,
): Promise<{ docId: string; siteId?: string }> {
  const plainId = String(clientId).trim();
  const site = eventSiteId !== undefined ? String(eventSiteId).trim() : "";
  if (!site) return { docId: plainId };

  const qualifiedId = siteQualifiedClientId(site, plainId);
  if ((await resolveClientRef(firestore, qualifiedId).get()).exists) {
    return { docId: qualifiedId, siteId: site };
  }
  const plain = await resolveClientRef(firestore, plainId).get();
  if (!plain.exists) return { docId: plainId, siteId: site };
  const data = plain.data() || {};
  let theirSite =
    data.mindbodySiteId !== undefined && data.mindbodySiteId !== null
      ? String(data.mindbodySiteId).trim()
      : "";
  if (!theirSite && typeof data.homeStudioId === "string" && data.homeStudioId) {
    const studios = await getStudios(firestore);
    theirSite = studios.find((s) => s.id === data.homeStudioId)?.siteId ?? "";
  }
  // `siteId` is only handed on for a record about to be MADE: stamping it on
  // an existing record whose site was unknown would be a guess.
  return theirSite && theirSite !== site
    ? { docId: qualifiedId, siteId: site }
    : { docId: plainId };
}

/**
 * Handles incoming Mindbody webhooks.
 * Validates the signature, ensures uniqueness via idempotency checks,
 * and updates client records directly in Firestore.
 */
export async function handleMindbodyWebhook(
  deps: WebhookDeps,
  req: WebhookRequest,
): Promise<WebhookResponse> {
  // Health reporting requires a real, non-negative latency figure; this used to
  // be hardcoded to 0, which made the Integrations Hub health card meaningless.
  const processingStartedAt = Date.now();
  const signature = req.signatureHeader || "";

  // 1. Strict Verification Guard
  if (!verifyMindbodySignature(req.rawBody, signature, deps.webhookSecret)) {
    await recordHealthEvent(deps.firestore, { type: "signature_failure" });
    return { statusCode: 401 };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(req.rawBody);
  } catch (e) {
    return { statusCode: 400 };
  }

  // We use messageId or eventId as the tracking event ID.
  const eventId =
    typeof parsed.messageId === "string"
      ? parsed.messageId
      : typeof parsed.eventId === "string"
        ? parsed.eventId
        : undefined;
  const eventType =
    typeof parsed.eventId === "string"
      ? parsed.eventId
      : typeof parsed.eventName === "string"
        ? parsed.eventName
        : "unknown_event";

  if (typeof eventId !== "string" || !eventId.trim()) {
    return { statusCode: 400 };
  }

  // 2. Idempotency Check
  try {
    const { wasNew } = await tryRecordEvent(deps.firestore, eventId, eventType);
    if (!wasNew) {
      // Return 200 to satisfy Mindbody retry loop for duplicates
      return { statusCode: 200 };
    }
  } catch (e) {
    console.error("Idempotency check failed", e);
    return { statusCode: 500 };
  }

  // 3. Payload Mapping & Upsert
  try {
    // Navigate potentially nested payload structures
    const payloadData =
      (parsed.eventData as Record<string, unknown> | undefined) ||
      (parsed.eventInstance as Record<string, unknown> | undefined) ||
      parsed;

    // Safely extract required fields
    const clientId =
      typeof payloadData.clientId === "string" ||
      typeof payloadData.clientId === "number"
        ? payloadData.clientId
        : typeof parsed.clientId === "string" ||
            typeof parsed.clientId === "number"
          ? parsed.clientId
          : undefined;

    const siteId =
      typeof payloadData.siteId === "string" ||
      typeof payloadData.siteId === "number"
        ? payloadData.siteId
        : typeof parsed.siteId === "string" || typeof parsed.siteId === "number"
          ? parsed.siteId
          : undefined;

    // MindBody spells this differently across event types; any of them pins the
    // event to one physical studio.
    const rawLocationId =
      payloadData.locationId ??
      payloadData.LocationId ??
      (payloadData.location as Record<string, unknown> | undefined)?.id ??
      parsed.locationId;
    const locationId =
      typeof rawLocationId === "string" || typeof rawLocationId === "number"
        ? rawLocationId
        : undefined;

    const lowerType = eventType.toLowerCase();

    // Membership and contract events are checked first: they look like client
    // events, but their payloads carry none of the generic client fields and
    // must not fall through to the profile upsert.
    const isMembershipEvent = lowerType.includes("clientmembershipassignment");
    const isContractEvent = lowerType.includes("clientcontract");
    const isCommercialEvent = isMembershipEvent || isContractEvent;

    // Staff events are pulled out BEFORE the client test, and every branch
    // below is now a positive test rather than a leftover.
    //
    // `isClientEvent` used to be `!isBookingEvent && !isCommercialEvent` -- a
    // catch-all, not a test. A `staff.updated` event carries no clientId and
    // matches neither of the other two, so it fell into the CLIENT PROFILE
    // UPSERT: subscribing to staff events without this change would have
    // started writing staff records into the `clients` collection. Anything
    // matching no branch is now parked in limbo instead of guessed at, which
    // also covers every Mindbody event type nobody here has thought of yet.
    const isStaffEvent = lowerType.startsWith("staff.");

    const isBookingEvent =
      !isCommercialEvent &&
      !isStaffEvent &&
      (lowerType.includes("booking") || lowerType.includes("appointment"));
    //
    // Two ways to qualify, because neither alone is right:
    //
    //   the NAME contains "client" -- Mindbody sends "client.updated", and
    //     replayed or hand-built envelopes in this repo's tooling use names
    //     like "evt-client-updated"; and
    //   the payload NAMES a client -- so an unrecognised or future event that
    //     explicitly carries a clientId still reaches the person it is about,
    //     rather than becoming a limbo row nobody reads.
    //
    // The exclusions above are what carry the safety. Staff events never
    // carry a clientId and are excluded by name anyway, so neither door lets
    // one back into the client collection.
    const isClientEvent =
      !isCommercialEvent &&
      !isStaffEvent &&
      !isBookingEvent &&
      (lowerType.includes("client") || clientId !== undefined);

    // Which record this event is about — a read or two, and only for an event
    // that is about to touch a client. See resolveClientDocId.
    const target =
      clientId !== undefined &&
      clientId !== "" &&
      (isCommercialEvent || isClientEvent || isBookingEvent)
        ? await resolveClientDocId(deps.firestore, clientId, siteId)
        : null;

    if (isCommercialEvent && clientId && target) {
      const clientRef = resolveClientRef(deps.firestore, target.docId);
      const isCancelEvent =
        lowerType.includes("cancel") || lowerType.includes("delete");
      const now = FieldValue.serverTimestamp();
      const updates: Record<string, unknown> = {};

      if (isMembershipEvent) {
        // `clientMembershipAssignment.cancelled` carries only siteId, clientId
        // and membershipId, so the record is merged, never replaced -- the name
        // captured at assignment time survives the cancel.
        const key = toMapKey(payloadData.membershipId);
        if (key) {
          const record: Record<string, unknown> = {
            membershipId: payloadData.membershipId,
            status: isCancelEvent ? "Cancelled" : "Active",
            lastSyncAt: now,
          };
          if (siteId !== undefined) record.siteId = siteId;
          if (
            typeof payloadData.membershipName === "string" &&
            payloadData.membershipName.trim()
          ) {
            record.membershipName = payloadData.membershipName.trim();
          }
          if (isCancelEvent) {
            record.cancelledAt = now;
          } else {
            record.assignedAt = now;
            // A re-assigned membership must not keep looking cancelled.
            record.cancelledAt = null;
          }
          updates.mindbodyMemberships = { [key]: record };
        } else {
          console.warn(
            `Mindbody webhook: membership event ${eventId} for client ${clientId} had no usable membershipId; skipping.`,
          );
        }
      }

      if (isContractEvent) {
        // Keyed on clientContractId -- the unique client + contract pairing.
        // One client can hold two instances of the same contractId.
        const key = toMapKey(payloadData.clientContractId);
        if (key) {
          const record: Record<string, unknown> = {
            clientContractId: payloadData.clientContractId,
            lastSyncAt: now,
            updatedAt: now,
          };
          if (siteId !== undefined) record.siteId = siteId;

          if (isCancelEvent) {
            // Deleted in Mindbody. We keep the record and flip its status so
            // the studio can still see what the client used to hold.
            record.status = "Cancelled";
            record.cancelledAt = now;
          } else {
            record.status = "Active";
            record.cancelledAt = null;

            // `.updated` (suspensions, terminations, date changes) omits
            // contractId and contractName, so those keys are only written when
            // the event actually carries them.
            if (payloadData.contractId !== undefined) {
              record.contractId = payloadData.contractId;
            }
            if (
              typeof payloadData.contractName === "string" &&
              payloadData.contractName.trim()
            ) {
              record.contractName = payloadData.contractName.trim();
            }
            if (typeof payloadData.isAutoRenewing === "boolean") {
              record.isAutoRenewing = payloadData.isAutoRenewing;
            }
            if (payloadData.contractOriginationLocation !== undefined) {
              record.originationLocationId =
                payloadData.contractOriginationLocation;
            }

            const soldBy = `${
              typeof payloadData.contractSoldByStaffFirstName === "string"
                ? payloadData.contractSoldByStaffFirstName
                : ""
            } ${
              typeof payloadData.contractSoldByStaffLastName === "string"
                ? payloadData.contractSoldByStaffLastName
                : ""
            }`.trim();
            if (soldBy) record.soldByStaffName = soldBy;

            const startDate = toUtcTimestamp(payloadData.contractStartDateTime);
            if (startDate) record.startDate = startDate;
            const endDate = toUtcTimestamp(payloadData.contractEndDateTime);
            if (endDate) record.endDate = endDate;
            const agreementDate = toUtcTimestamp(payloadData.agreementDateTime);
            if (agreementDate) record.agreementDate = agreementDate;

            if (lowerType.includes("created")) record.createdAt = now;
          }

          updates.mindbodyContracts = { [key]: record };
        } else {
          console.warn(
            `Mindbody webhook: contract event ${eventId} for client ${clientId} had no usable clientContractId; skipping.`,
          );
        }
      }

      // A merge write on nested maps leaves every other membership, contract
      // and profile field on the document untouched.
      if (Object.keys(updates).length > 0) {
        await clientRef.set(updates, { merge: true });
      }
    } else if (isClientEvent && clientId) {
      // Mindbody-owned facts. These always overwrite: Mindbody is the source of
      // truth for commercial status, and nobody types these in the app.
      const enrichment: Record<string, unknown> = {};

      if (typeof payloadData.membershipStatus === "string")
        enrichment.membershipStatus = payloadData.membershipStatus;
      if (typeof payloadData.tierName === "string")
        enrichment.packageTier = payloadData.tierName;
      if (
        typeof payloadData.activeMembership === "boolean" ||
        typeof payloadData.activeMembership === "string"
      )
        enrichment.activeMembership = payloadData.activeMembership;
      if (typeof payloadData.lastVisited === "string")
        enrichment.lastSessionDate = payloadData.lastVisited;
      if (Array.isArray(payloadData.prebookedSchedules))
        enrichment.prebookedSchedules = payloadData.prebookedSchedules;
      if (Array.isArray(payloadData.upcomingBookings))
        enrichment.upcomingBookings = payloadData.upcomingBookings;

      // Mindbody's account notes go to their OWN field. `notes` on a client doc
      // is trainer-authored and must never be overwritten by a sync.
      if (typeof payloadData.notes === "string" && payloadData.notes.trim()) {
        enrichment.mindbodyNotes = payloadData.notes.slice(0, 1000);
      }

      // --- Mindbody-owned identity & compliance facts -------------------
      //
      // Same posture as the commercial fields above: these OVERWRITE, because
      // nobody types them in this app and Mindbody is the system of record.
      // Each is written only when the event actually carries it, so a partial
      // payload never blanks a field that a previous event filled.
      //
      // Deliberately NOT mapped: creditCardLastFour, creditCardExpDate,
      // directDebitLastFour. Mindbody sends them; nothing in a coaching app
      // needs them, and persisting them puts PCI-adjacent data in a document
      // every trainer at the studio can read.

      if (typeof payloadData.isLiabilityReleased === "boolean") {
        enrichment.isLiabilityReleased = payloadData.isLiabilityReleased;
      }
      const liabilityAt = toUtcTimestamp(payloadData.liabilityAgreementDateTime);
      if (liabilityAt) enrichment.liabilityAgreementDate = liabilityAt;

      // `status` is the membership status. Studios can define custom values on
      // top of Mindbody's standard set, so it is stored as the free string it
      // is rather than being narrowed to an enum that a studio could break.
      if (typeof payloadData.status === "string" && payloadData.status.trim()) {
        enrichment.mindbodyStatus = payloadData.status.trim();
      }

      // Client indexes arrive as [{indexName, indexValue}]. They are flattened
      // to a map and written WHOLE rather than merged, so an index the studio
      // removed in Mindbody disappears here too instead of lingering forever.
      if (Array.isArray(payloadData.indexes)) {
        const indexes: Record<string, string> = {};
        for (const raw of payloadData.indexes) {
          const name =
            raw && typeof raw.indexName === "string" ? raw.indexName.trim() : "";
          const value =
            raw && typeof raw.indexValue === "string" ? raw.indexValue.trim() : "";
          if (name && value) indexes[name] = value;
        }
        enrichment.mindbodyIndexes = indexes;
      }

      const mbCreatedAt = toUtcTimestamp(payloadData.creationDateTime);
      if (mbCreatedAt) enrichment.mindbodyCreatedAt = mbCreatedAt;

      const firstAppt = toUtcTimestamp(payloadData.firstAppointmentDateTime);
      if (firstAppt) enrichment.firstAppointmentDate = firstAppt;

      if (
        typeof payloadData.homeLocation === "number" ||
        typeof payloadData.homeLocation === "string"
      ) {
        enrichment.mindbodyHomeLocationId = payloadData.homeLocation;
      }

      if (typeof payloadData.isProspect === "boolean") {
        enrichment.isProspect = payloadData.isProspect;
      }

      // Mindbody's own visit count. Kept distinct from this app's sessionCount
      // — the two will not agree and neither is wrong.
      if (
        typeof payloadData.clientNumberOfVisitsAtSite === "number" &&
        Number.isFinite(payloadData.clientNumberOfVisitsAtSite)
      ) {
        enrichment.clientsNumberOfVisitsAtSite =
          payloadData.clientNumberOfVisitsAtSite;
      }

      // A real client event supersedes any stub a booking created earlier.
      enrichment.isMindbodyStub = false;

      // Person-facts. These only ever FILL BLANKS on an existing profile.
      const pickString = (...keys: string[]): string | undefined => {
        for (const key of keys) {
          const v = payloadData[key];
          if (typeof v === "string" && v.trim()) return v.trim();
        }
        return undefined;
      };

      const firstName = pickString("firstName", "FirstName", "clientFirstName");
      const lastName = pickString("lastName", "LastName", "clientLastName");

      const profile: MindbodyClientProfile = {
        firstName,
        lastName,
        email: pickString("email", "Email"),
        phone: pickString("mobilePhone", "homePhone", "workPhone", "phone"),
        dateOfBirth: pickString("birthDate", "birthDateTime", "dateOfBirth"),
        gender: pickString("gender"),
        address: pickString("addressLine1", "address"),
        emergencyContactName: pickString(
          "emergencyContactInfoName",
          "emergencyContactName",
        ),
        emergencyContactPhone: pickString(
          "emergencyContactInfoPhone",
          "emergencyContactPhone",
        ),
        city: pickString("city"),
        addressState: pickString("state"),
        postalCode: pickString("postalCode"),
        country: pickString("country"),
        referredBy: pickString("referredBy"),
      };

      if (firstName || lastName) {
        profile.mindbody_name = `${firstName || ""} ${lastName || ""}`.trim();
      }

      const rawPhoto = pickString("photoUrl");
      if (rawPhoto && /^https:\/\//i.test(rawPhoto)) {
        profile.photoUrl = rawPhoto;
      }

      let studioId: string | null = null;
      if (siteId) {
        const resolution = await resolveStudio(
          deps.firestore,
          siteId,
          locationId,
        );
        if (resolution.studioId) {
          studioId = resolution.studioId;
          // A client event is authoritative about which studio owns the person,
          // so it may reassign an existing homeStudioId (pre-existing behaviour).
          enrichment.homeStudioId = resolution.studioId;
        } else if (resolution.ambiguous) {
          // Reassigning a client's home studio decides who may view their
          // clinical record, so leave it alone rather than pick one.
          console.warn(
            `Mindbody webhook: site ${siteId} maps to multiple studios and the event named no resolvable location; leaving homeStudioId untouched for client ${clientId}.`,
          );
          await recordLimboEvent(deps.firestore, {
            eventId,
            eventType,
            kind: "client",
            siteId,
            locationId,
            clientId,
            reason:
              "Client profile saved, but its home studio is unset: the site is shared by several studios and the event named no resolvable location. Set mindbodyLocationId on each studio in Admin -> Studios.",
            payload: parsed,
          });
        } else if (resolution.unmapped) {
          // No studio claims this site. The client is still created so their
          // history starts accruing, but with homeStudioId null rather than a
          // guessed default — a mis-tenanted client shows on the wrong
          // location's schedule and is readable by the wrong trainers.
          console.warn(
            `Mindbody webhook: site ${siteId} maps to no studio; client ${clientId} created without a home studio.`,
          );
          await recordLimboEvent(deps.firestore, {
            eventId,
            eventType,
            kind: "client",
            siteId,
            locationId,
            clientId,
            reason:
              "Client profile saved, but its home studio is unset: no studio has this Mindbody site id. Set mindbodySiteId on the studio in Admin -> Studios, then re-run the pull-sync.",
            payload: parsed,
          });
        }
      }

      await ensureCanonicalClient(deps.firestore, {
        mindbodyClientId: clientId,
        docId: target?.docId,
        mindbodySiteId: target?.siteId,
        profile,
        enrichment,
        studioId,
        origin: "client-event",
      });

    } else if (isBookingEvent) {
      const bookingId =
        typeof payloadData.id === "string" || typeof payloadData.id === "number"
          ? String(payloadData.id)
          : typeof payloadData.appointmentId === "string" ||
              typeof payloadData.appointmentId === "number"
            ? String(payloadData.appointmentId)
            : typeof payloadData.bookingId === "string" ||
                typeof payloadData.bookingId === "number"
              ? String(payloadData.bookingId)
              : eventId;

      /*
       * THE THREE BOOKING EVENTS (Mindbody's Webhooks documentation, read
       * Sep 25 2026; the lean-sync round):
       *
       *   appointmentBooking.created / .updated — the whole appointment:
       *     locationId, clientId, clientFirstName/LastName, staffId,
       *     staffFirstName/LastName, startDateTime/endDateTime (UTC, with Z),
       *     status (Scheduled | Cancelled), appointmentName. `.updated` fires
       *     on a change to any of them: a new time, a new trainer.
       *   appointmentBooking.cancelled — siteId and appointmentId, NOTHING
       *     else. No location, so on a shared site it cannot name a studio;
       *     it can only name the booking Journey already holds.
       *
       * Events arrive in no guaranteed order and possibly more than once. The
       * guard below keeps the newest: a `created` retried fifteen minutes after
       * a cancellation must not put the cancelled session back on the Hub.
       */
      const isCancelEvent =
        lowerType.includes("cancel") || lowerType.includes("delete");
      const isCancelled =
        isCancelEvent ||
        (typeof payloadData.status === "string" &&
          payloadData.status.toLowerCase() === "cancelled");
      const eventAt = toUtcTimestamp(parsed.eventInstanceOriginationDateTime);

      const scheduleRef = deps.firestore.collection("schedules").doc(bookingId);
      const existingDoc = await scheduleRef.get();
      const existing: Record<string, unknown> | null = existingDoc.exists
        ? ((existingDoc.data() as Record<string, unknown> | undefined) ?? {})
        : null;

      bookingEvent: {
        const lastAppliedMs = millisOf(existing?.mindbodyEventAt);
        if (eventAt && lastAppliedMs !== null && eventAt.toMillis() < lastAppliedMs) {
          console.warn(
            `Mindbody webhook: ${eventType} for booking ${bookingId} happened before the last event applied to it; ignored.`,
          );
          break bookingEvent;
        }

        if (isCancelEvent) {
          // Only the booking Journey holds can be cancelled, and it keeps
          // everything it knew: the time, the client, the trainer.
          if (!existing) {
            console.log(
              `Mindbody webhook: cancellation for booking ${bookingId}, which Journey never held; nothing to cancel.`,
            );
            break bookingEvent;
          }
          // Appointment ids are unique per SITE: the row must be this site's.
          if (siteId !== undefined && typeof existing.studioId === "string") {
            const studios = await getStudios(deps.firestore);
            const owner = studios.find((s) => s.id === existing.studioId);
            if (owner && owner.siteId !== String(siteId).trim()) {
              console.warn(
                `Mindbody webhook: cancellation for booking ${bookingId} names site ${siteId}, but the booking belongs to ${existing.studioId} on site ${owner.siteId}; ignored.`,
              );
              break bookingEvent;
            }
          }
          const cancel: Record<string, unknown> = {
            status: "Cancelled",
            lastSyncAt: FieldValue.serverTimestamp(),
          };
          if (existing.status !== "Cancelled") {
            cancel.cancelledAt = FieldValue.serverTimestamp();
            cancel.cancelSource = "mindbody";
          }
          if (eventAt) cancel.mindbodyEventAt = eventAt;
          await scheduleRef.set(cancel, { merge: true });
          break bookingEvent;
        }

        // Pass / waitlist / visit-count data, when Mindbody sends any of it.
        // Strictly additive: absent fields write nothing.
        const bookingExtras = extractBookingExtras(payloadData);

        const rawStart =
          payloadData.startDateTime || payloadData.startTime || payloadData.start;
        const rawEnd =
          payloadData.endDateTime || payloadData.endTime || payloadData.end;

        // Read before the studio is resolved: a booking that ends up parked in
        // Limbo still has to tell an admin WHO is arriving.
        let clientName = "";
        if (typeof payloadData.clientName === "string") {
          clientName = payloadData.clientName;
        } else if (
          typeof payloadData.clientFirstName === "string" ||
          typeof payloadData.clientLastName === "string"
        ) {
          clientName =
            `${typeof payloadData.clientFirstName === "string" ? payloadData.clientFirstName : ""} ${typeof payloadData.clientLastName === "string" ? payloadData.clientLastName : ""}`.trim();
        } else if (
          typeof payloadData.firstName === "string" ||
          typeof payloadData.lastName === "string"
        ) {
          clientName =
            `${typeof payloadData.firstName === "string" ? payloadData.firstName : ""} ${typeof payloadData.lastName === "string" ? payloadData.lastName : ""}`.trim();
        }

        // Mindbody's documented staff fields first; the older guesses stay as
        // fallbacks for hand-built and replayed envelopes.
        const staffId =
          typeof payloadData.staffId === "string" || typeof payloadData.staffId === "number"
            ? String(payloadData.staffId).trim()
            : "";
        const staffFullName = `${typeof payloadData.staffFirstName === "string" ? payloadData.staffFirstName : ""} ${typeof payloadData.staffLastName === "string" ? payloadData.staffLastName : ""}`.trim();
        const staffName =
          staffFullName ||
          (typeof payloadData.staffName === "string"
            ? payloadData.staffName
            : typeof payloadData.instructorName === "string"
              ? payloadData.instructorName
              : typeof payloadData.teacherName === "string"
                ? payloadData.teacherName
                : typeof payloadData.trainerName === "string"
                  ? payloadData.trainerName
                  : "");

        const namedService =
          typeof payloadData.appointmentName === "string" && payloadData.appointmentName.trim()
            ? payloadData.appointmentName.trim()
            : typeof payloadData.serviceName === "string"
              ? payloadData.serviceName
              : typeof payloadData.sessionType === "string"
                ? payloadData.sessionType
                : typeof payloadData.className === "string"
                  ? payloadData.className
                  : "";

        // Resolved before the times are read: a naive wall-clock string is
        // meaningless without knowing which studio's clock it belongs to.
        let studioId: string | null = null;
        let studioTimeZone = DEFAULT_TIME_ZONE;
        if (siteId) {
          const resolution = await resolveStudio(
            deps.firestore,
            siteId,
            locationId,
          );
          if (resolution.studioId) {
            studioId = resolution.studioId;
            if (resolution.timeZone) studioTimeZone = resolution.timeZone;
          } else if (resolution.ambiguous || resolution.unmapped) {
            // The booking is PARKED, not dropped. It must not reach `schedules`:
            // a row with a null studioId is treated as "belongs to everyone" by
            // the hub's studio filter and would surface on every location's grid,
            // and a row filed under a guessed studio would show on the wrong
            // roster. Limbo keeps it visible to an admin without either failure.
            //
            // NOTE ON TIMES: without a studio there is no timezone to read a
            // naive string against, so the RAW strings are stored, unconverted.
            console.warn(
              `Mindbody webhook: parking booking ${bookingId} in ${LIMBO_QUEUE} — site ${siteId}${
                locationId !== undefined ? ` / location ${locationId}` : ""
              } ${resolution.unmapped ? "maps to no studio" : "does not resolve to a single studio"}.`,
            );
            await recordLimboEvent(deps.firestore, {
              eventId,
              eventType,
              kind: "booking",
              siteId,
              locationId,
              clientId,
              reason: resolution.unmapped
                ? "Booking parked: no studio has this Mindbody site id. Set mindbodySiteId in Admin -> Studios, then run Refresh Schedule to release it onto the roster."
                : "Booking parked: site is shared by several studios and the event named no resolvable location. Set mindbodyLocationId in Admin -> Studios, then run Refresh Schedule to release it onto the roster.",
              summary: {
                bookingId,
                clientName: clientName || "Unknown Client",
                // Raw, unconverted — see the note above.
                rawStartDateTime: typeof rawStart === "string" ? rawStart : null,
                rawEndDateTime: typeof rawEnd === "string" ? rawEnd : null,
                staffName: staffName || null,
                serviceName: namedService || null,
                status: isCancelled ? "Cancelled" : "Scheduled",
              },
              payload: parsed,
            });
            await recordHealthEvent(deps.firestore, {
              type: "webhook_success",
              hydrationLatencyMs: Math.max(0, Date.now() - processingStartedAt),
            });
            return { statusCode: 200 };
          }
        }

        // Now that the owning studio is known, read its wall clock. Mindbody's
        // documented times carry a Z, which wallClockToInstant takes as-is.
        const startDate = wallClockToInstant(rawStart, studioTimeZone);
        const endDate = wallClockToInstant(rawEnd, studioTimeZone);
        const startTime: Timestamp | null = startDate
          ? Timestamp.fromDate(startDate)
          : null;
        const endTime: Timestamp | null = endDate
          ? Timestamp.fromDate(endDate)
          : null;

        // Read from THIS person's record — never the other site's namesake.
        if (!clientName && clientId && target) {
          const clientSnap = await resolveClientRef(deps.firestore, target.docId).get();
          if (clientSnap.exists) {
            const cData = clientSnap.data();
            if (cData) {
              clientName =
                `${cData.firstName || ""} ${cData.lastName || ""}`.trim();
            }
          }
        }
        if (!clientName) {
          clientName =
            typeof existing?.clientName === "string" && existing.clientName
              ? existing.clientName
              : "Unknown Client";
        }

        /*
         * The trainer, by Mindbody staff id: at most two single-field queries
         * (staffResolver). This replaced reading EVERY trainer in the company on
         * every booking to compare names, which cost a read per trainer per
         * booking and could match the wrong person by name.
         *
         * A staff id no trainer carries writes no trainer, but it must not
         * erase one the pull found for the same staff member (the pull can
         * still match by name within the studio): if the staff name is the
         * one the row already shows, the row's trainer stays.
         */
        let trainerId: string | null = null;
        let trainerName = staffName;
        if (staffId) {
          const resolution = await resolveTrainerByStaffId(deps.firestore, staffId);
          if (resolution.kind === "matched") {
            trainerId = resolution.trainerId;
            const trainerSnap = await deps.firestore
              .collection("trainers")
              .doc(resolution.trainerId)
              .get();
            const fullName = trainerSnap.exists
              ? (trainerSnap.data() as Record<string, unknown> | undefined)?.fullName
              : undefined;
            if (typeof fullName === "string" && fullName.trim()) trainerName = fullName;
          }
        }
        const keepRowTrainer =
          trainerId === null &&
          existing !== null &&
          typeof existing.trainerName === "string" &&
          existing.trainerName.trim().toLowerCase() === staffName.trim().toLowerCase();

        const nextStatus = isCancelled ? "Cancelled" : "Scheduled";
        const scheduleData: Record<string, unknown> = {
          clientName,
          studioId,
          startTime,
          endTime,
          status: nextStatus,
          source: "MindBody",
          mindbodyAppointmentId: bookingId,
          lastSyncAt: FieldValue.serverTimestamp(),
        };
        if (!keepRowTrainer) {
          scheduleData.trainerId = trainerId;
          scheduleData.trainerName = trainerName;
        }
        // Never blank a service name a pull already wrote.
        if (namedService) scheduleData.serviceName = namedService;
        else if (!existing) scheduleData.serviceName = "Training Session";
        if (eventAt) scheduleData.mindbodyEventAt = eventAt;

        /*
         * The same change stamps the pull writes (lib/mindbody-api-sync.ts,
         * changeStamps), so Operations' week of changes reads a move or a
         * cancellation the webhook delivered exactly as one the pull found.
         */
        if (existing) {
          const prevStartMs = millisOf(existing.startTime);
          if (
            prevStartMs !== null &&
            startTime !== null &&
            prevStartMs !== startTime.toMillis() &&
            existing.status !== "Cancelled"
          ) {
            scheduleData.movedFromDay = studioDayKeyOf(prevStartMs, studioTimeZone);
            scheduleData.movedFromStart = existing.startTime;
            scheduleData.movedAt = FieldValue.serverTimestamp();
          }
          if (nextStatus === "Cancelled" && existing.status !== "Cancelled") {
            scheduleData.cancelledAt = FieldValue.serverTimestamp();
            scheduleData.cancelSource = "mindbody";
          } else if (nextStatus === "Scheduled" && existing.status === "Cancelled") {
            scheduleData.cancelledAt = null;
            scheduleData.cancelSource = null;
          }
        }

        // Trainers see pass state on the block; only written when reported, so a
        // payload without pass data never blanks out what a previous one set.
        if (bookingExtras.pass) scheduleData.mindbodyPass = bookingExtras.pass;
        if (bookingExtras.bookingOriginatedFromWaitlist !== undefined) {
          scheduleData.bookingOriginatedFromWaitlist =
            bookingExtras.bookingOriginatedFromWaitlist;
        }

        if (clientId) {
          // ORDERING HAZARD: a booking can arrive before the client.created event
          // for a brand-new client. Rather than write a clientId that points at
          // nothing (which the hub self-heals to null, producing an unlinked
          // block a trainer has to fix by hand), create a stub profile now. The
          // client event enriches it moments later and clears isMindbodyStub.
          //
          // The doc id this returns is used verbatim: if the client still lives
          // at a legacy doc id, the schedule must point THERE, not at a canonical
          // path that does not exist yet.
          const resolvedClient = await ensureCanonicalClient(deps.firestore, {
            mindbodyClientId: clientId,
            docId: target?.docId,
            mindbodySiteId: target?.siteId,
            profile: {
              mindbody_name: clientName !== "Unknown Client" ? clientName : undefined,
              firstName:
                clientName !== "Unknown Client"
                  ? clientName.split(" ")[0]
                  : undefined,
              lastName:
                clientName !== "Unknown Client"
                  ? clientName.split(" ").slice(1).join(" ") || undefined
                  : undefined,
            },
            studioId,
            origin: "booking-stub",
            // Mindbody's own lifetime visit count for this client at the site.
            enrichment:
              bookingExtras.clientsNumberOfVisitsAtSite !== undefined
                ? {
                    clientsNumberOfVisitsAtSite:
                      bookingExtras.clientsNumberOfVisitsAtSite,
                  }
                : undefined,
          });
          scheduleData.clientId = resolvedClient.clientDocId;
          scheduleData.mindbodyClientId = String(clientId);
        }

        if (!existing) {
          scheduleData.createdAt = FieldValue.serverTimestamp();
        }

        await scheduleRef.set(scheduleData, { merge: true });
      }
    } else if (isStaffEvent) {
      const staffId = extractStaffId(parsed);

      if (!staffId) {
        await recordLimboEvent(deps.firestore, {
          eventId,
          eventType,
          kind: "staff",
          siteId,
          locationId,
          reason:
            "Staff event carried no staff id, so there is nothing to match a trainer on.",
          payload: parsed,
        });
      } else {
        const resolution = await resolveTrainerByStaffId(deps.firestore, staffId);

        if (resolution.kind === "matched") {
          const { mindbody, deactivated } = mapStaffEventToPatch(parsed, eventType);

          // ONLY the `mindbody` map. Not role, not studio access,
          // not the Kaizen Roster. Mindbody owns the staff member's name,
          // work email and photo; the Journey System owns everything that
          // decides what they can do.
          //
          // Deactivation is reported, never enforced: `mindbody.isActive`
          // goes false and the profile says so loudly, but nobody's access is
          // revoked by a webhook. Removing a trainer's access is a decision a
          // human makes, and a mis-mapped staff id must not be able to lock
          // someone out mid-session.
          await deps.firestore
            .collection("trainers")
            .doc(resolution.trainerId)
            .set(
              { mindbody: { ...mindbody, lastSyncAt: FieldValue.serverTimestamp() } },
              { merge: true },
            );

          if (deactivated) {
            console.warn(
              `Mindbody webhook: staff ${staffId} was deactivated in Mindbody; trainer ${resolution.trainerId} flagged but access left unchanged.`,
            );
          }
        } else {
          await recordLimboEvent(deps.firestore, {
            eventId,
            eventType,
            kind: "staff",
            siteId,
            locationId,
            reason:
              resolution.kind === "ambiguous"
                ? `Mindbody staff id ${staffId} is claimed by more than one trainer (${resolution.trainerIds.join(", ")}). Fix the duplicate in Admin -> Trainers; nothing was written.`
                : `No trainer carries Mindbody staff id ${staffId}. Link them in Edit Trainer -> Mindbody Staff ID; a webhook never creates a trainer account.`,
            summary: { staffId },
            payload: parsed,
          });
        }
      }
    } else {
      // No branch claimed it. Park it rather than drop it.
      await recordLimboEvent(deps.firestore, {
        eventId,
        eventType,
        kind: isClientEvent || isCommercialEvent ? "client" : "unhandled",
        siteId,
        locationId,
        reason:
          isClientEvent || isCommercialEvent
            ? "Event carried no client id, so it could not be filed against a client."
            : `No handler for event type "${eventType}". Recorded so a new Mindbody event type surfaces instead of vanishing.`,
        payload: parsed,
      });
    }

    await recordHealthEvent(deps.firestore, {
      type: "webhook_success",
      hydrationLatencyMs: Math.max(0, Date.now() - processingStartedAt),
    });
    return { statusCode: 200 };

    // 4. Resiliency & Edge Errors
  } catch (error) {
    console.error("Webhook processing error:", { error: String(error) });

    await recordHealthEvent(deps.firestore, { type: "webhook_failure" });

    // The idempotency record was committed before this business logic ran, so
    // without a release the retry would be waved through as a duplicate and the
    // event lost. recordAttemptFailure either frees the gate for another
    // attempt or, once the budget is spent, dead-letters the event.
    try {
      const { willRetry, attempts } = await recordAttemptFailure(deps.firestore, {
        messageId: eventId,
        eventType,
        payload: parsed,
        error,
      });
      if (!willRetry) {
        console.error(
          `Mindbody webhook: event ${eventId} (${eventType}) dead-lettered after ${attempts} attempts.`,
        );
        // 200 stops the retry storm for an event we have given up on; it is
        // preserved in mindbodyDLQ for a human.
        return { statusCode: 200 };
      }
    } catch (ledgerError) {
      console.error(
        "Mindbody webhook: retry ledger failed; falling back to a plain 500.",
        ledgerError,
      );
    }

    // Catch errors without silently swallowing them
    return { statusCode: 500 };
  }
}

const mindbodyWebhookSecret = defineSecret("MINDBODY_WEBHOOK_SECRET");
let firestoreInstance: Firestore | null = null;

/**
 * The expected public entry point for Mindbody webhooks.
 * Wires the pure HTTP handler logic to Firebase, Pub/Sub, and secret parameters.
 * Lazy initialization is used for external clients.
 */
export const mindbodyWebhook = onRequest(
  {
    secrets: [mindbodyWebhookSecret],
    cors: false,
    region: "us-central1",
    maxInstances: 100,
    timeoutSeconds: 10,
  },
  async (req, res) => {
    if (req.method === "HEAD") {
      res.status(200).end();
      return;
    }

    if (!firestoreInstance) {
      firestoreInstance = getFirestore(
        "ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa",
      );
    }

    const payloadBuffer = req.rawBody; // req.rawBody is a Buffer natively in firebase-functions
    const rawBodyStr = payloadBuffer ? payloadBuffer.toString("utf8") : "";

    const deps: WebhookDeps = {
      firestore: firestoreInstance,
      webhookSecret: mindbodyWebhookSecret.value(),
    };

    const webhookReq: WebhookRequest = {
      rawBody: rawBodyStr,
      signatureHeader: req.header("x-mindbody-signature"),
    };

    const response = await handleMindbodyWebhook(deps, webhookReq);
    res.status(response.statusCode).send(response.body || "");
  },
);
