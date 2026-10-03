/**
 * A new person's own access request, remembered (the front door, Oct 3 2026).
 *
 * The request used to be added under a random id, so the person who sent it
 * could never find it again: every sign-in showed them the empty form. It is
 * now written at `access_requests/{their uid}` and read back by that id, one
 * document and no index (Firestore here builds none by itself). The leaders'
 * side is unchanged: My Studio → Team lists every Pending request by its
 * status, and approving one writes trainers/{userId} and marks it Approved.
 *
 * A request sent before this change sits under a random id and isn't found
 * here; that person sees the form once more, and the leaders may see two.
 */
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { toDate } from "../../lib/studio-time";

/** The roles a new person may ask for. Clients don't use Journey (AJ, Oct 3 2026). */
export const REQUEST_ROLES = [
  { value: "Trainer", label: "Trainer", detail: "Life Transformer" },
  { value: "StudioLeader", label: "Head trainer or leader", detail: "Runs the floor or the studio" },
  { value: "Administrative", label: "Front desk or office", detail: "Bookings and admin" },
  { value: "StudioOwner", label: "Owner", detail: "Owns one or more studios" },
] as const;

export type RequestRole = (typeof REQUEST_ROLES)[number]["value"];

export function roleLabel(value: string | null | undefined): string {
  return REQUEST_ROLES.find((r) => r.value === value)?.label.toLowerCase() ?? "a member of the team";
}

export type MyRequest =
  | { kind: "none" }
  | { kind: "pending"; studioId: string; role: string; sentAt: Date | null }
  | { kind: "approved" }
  | { kind: "closed" };

/** What a stored request says about where this person stands. */
export function requestStanding(data: Record<string, unknown> | null | undefined): MyRequest {
  if (!data) return { kind: "none" };
  const status = String(data.status ?? "");
  if (status === "Pending")
    return {
      kind: "pending",
      studioId: String(data.requestedStudioId ?? ""),
      role: String(data.roleRequested ?? ""),
      sentAt: toDate(data.createdAt as never),
    };
  if (status === "Approved") return { kind: "approved" };
  return { kind: "closed" };
}

/** This person's request, or null when it couldn't be read (unknown, never "none"). */
export async function readMyRequest(uid: string): Promise<MyRequest | null> {
  try {
    const snap = await getDoc(doc(db, "access_requests", uid));
    return requestStanding(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
  } catch (err) {
    console.warn("Could not read your access request.", err);
    return null;
  }
}

export interface RequestDraft {
  fullName: string;
  email: string;
  phone: string;
  roleRequested: string;
  requestedStudioId: string;
  reason: string;
}

/** Sends it, at the person's own uid. Throws when the write is refused. */
export async function sendMyRequest(uid: string, draft: RequestDraft): Promise<void> {
  await setDoc(doc(db, "access_requests", uid), {
    fullName: draft.fullName.trim(),
    email: draft.email.trim().toLowerCase(),
    phone: draft.phone.trim(),
    roleRequested: draft.roleRequested,
    requestedStudioId: draft.requestedStudioId,
    reason: draft.reason.trim(),
    status: "Pending",
    userId: uid,
    createdAt: serverTimestamp(),
  });
}
