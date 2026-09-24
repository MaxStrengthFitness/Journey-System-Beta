import type { Client } from "../../types";

/**
 * The client record's form as it opens: what ClientInfoSheet puts in
 * `formData` from the saved client, and again whenever it re-syncs from a
 * snapshot with no unsaved edits.
 *
 * Every field the dossier reads through its `val()` helper MUST be seeded
 * here. `val()` reads the form and nothing else — there is no fall back to
 * the record, unlike the Life, Goals and Contract panels — so a field left
 * out shows an empty box however much is stored. Wingspan was missed for
 * exactly that reason (Sep 2026): a stored `clients/{id}.wingspan` always
 * showed blank, while machine fit's Setup screen was sending trainers to
 * that box to add it. `info-form.test.ts` reads the dossier's source and
 * holds every `val()` field to this list.
 *
 * Seeding never writes anything: the Save bar writes only the fields a
 * trainer touched (`dirtyFields`), so an untouched field stays as it is.
 */
export function clientFormSeed(client: Client): Partial<Client> {
  return {
    firstName: client.firstName || "",
    lastName: client.lastName || "",
    nickname: client.nickname || "",
    mindbodyId: client.mindbodyId || "",
    mindbodyClientId: client.mindbodyClientId || client.mindbodyId || "",
    mindbody_name: client.mindbody_name || "",
    mindbodyNotes: client.mindbodyNotes || "",
    photoUrl: client.photoUrl || "",
    dateOfBirth: client.dateOfBirth || "",
    gender: client.gender || "",
    phone: client.phone || "",
    email: client.email || "",
    address: client.address || "",
    emergencyContactName: client.emergencyContactName || "",
    emergencyContactPhone: client.emergencyContactPhone || "",
    occupation: client.occupation || "",
    isRetired: client.isRetired || false,
    workProfile: client.workProfile ?? null,
    recreationActivities: client.recreationActivities || [],
    fitnessBackground: client.fitnessBackground || [],
    needsUnteaching: client.needsUnteaching || false,
    pedigreeHistory: client.pedigreeHistory || [],
    // Dropdowns start EMPTY. Pre-filling "Sedentary"/"Novice" here made an
    // unset field look assessed, and the first save wrote it to Firestore.
    // Nothing is stored until a trainer explicitly picks an option.
    activityLevel: client.activityLevel || "",
    recoveryMetric: client.recoveryMetric || "",
    experienceLevel: client.experienceLevel || "",
    trainingPedigree: client.trainingPedigree || "",
    leadSource: client.leadSource || "",
    referredBy: client.referredBy || "",
    clinicalFlags: client.clinicalFlags || [],
    medicalHistory: client.medicalHistory || "",
    clinicalNotes: client.clinicalNotes || "",
    height: client.height || "",
    wingspan: client.wingspan || "",
    weight: client.weight || "",
    discoveryNotes: client.discoveryNotes || "",
    globalNotes: client.globalNotes || "",
    smartGoal: client.smartGoal || "",
    packageTier: client.packageTier || "",
    approvedCrossTrainStudioIds: client.approvedCrossTrainStudioIds || [],
    events: client.events || [],
  };
}
