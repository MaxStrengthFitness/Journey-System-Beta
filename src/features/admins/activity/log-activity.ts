/**
 * logActivity — the one writer of the Activity record (activity.ts says what
 * an entry is). Any admin action may call it after its own write has landed:
 *
 *   void logActivity({
 *     kind: "publish",
 *     what: "Published Hip Thrust (Nautilus) from Solon's offer.",
 *     studioId: "solon",
 *     byName: authTrainer.fullName,
 *   });
 *
 * It signs the entry with the Auth uid (the rules pin it) and the server's
 * time, and it NEVER throws: the change a person made is what matters, and a
 * record that couldn't be written must not undo it or block the screen. It
 * resolves true when the entry was written, false when it wasn't (no one
 * signed in, or the write refused), and says why in the console.
 *
 * Offline, Firestore queues the entry with the change and sends both when
 * the iPad is back, so callers don't await it on the way to the next screen.
 * Administrators only: the rules refuse anyone else.
 */
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { activityPayload, type ActivityInput } from "./activity";

export async function logActivity(input: ActivityInput): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    console.warn("The Activity record wasn't written: nobody is signed in.");
    return false;
  }
  try {
    const payload = activityPayload(input, uid);
    await addDoc(collection(db, "activity"), { ...payload, at: serverTimestamp() });
    return true;
  } catch (err) {
    console.warn("Couldn't write to the Activity record", err);
    return false;
  }
}
