/**
 * WAS SOMEONE SIGNED IN ON THIS DEVICE? (the speed round, Oct 5 2026, R14)
 *
 * Firebase Auth's `getAuth()` installs the popup sign-in helper, and on
 * Safari, iOS and every mobile browser the SDK then loads that helper's
 * hidden iframe (apis.google.com, then the auth domain's iframe.js, about
 * 95 KB, then a ping that may wait 5 s) BEFORE it says who is signed in.
 * Every cold open of Journey on an iPad paid for it, signed in or not,
 * although only the sign-in screen ever uses it.
 *
 * So src/firebase.ts chooses at load, from this one flag:
 *
 *  - signed in here last time: start Auth without the helper. The person is
 *    reported at once; the iframe never loads.
 *  - not: start it with the helper, exactly as getAuth() did, so the sign-in
 *    screen appears with the popup ready (Safari blocks a popup that isn't
 *    opened straight from the tap, so it must be ready BEFORE the tap).
 *
 * And if a device that booted signed in reaches the sign-in screen (a
 * sign-out, an expired account), the screen warms the helper itself
 * (`prepareSignIn`) and its buttons wait for it (`useSignInReady`).
 *
 * The flag is set whenever Auth reports someone signed in and removed when
 * it reports nobody; a sign-out's clearing of local storage removes it too
 * (features/sign-out). index.html reads the same key to decide whether to
 * warm the connections the sign-in helper needs.
 */
export const SIGNED_IN_HERE_KEY = "journey_signed_in_here";

type FlagStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The device's local storage, or null where it is blocked (a private window). */
export function deviceStorage(): FlagStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function wasSignedInHere(storage: FlagStorage | null): boolean {
  try {
    return storage?.getItem(SIGNED_IN_HERE_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberSignedInHere(storage: FlagStorage | null, signedIn: boolean): void {
  try {
    if (signedIn) storage?.setItem(SIGNED_IN_HERE_KEY, "1");
    else storage?.removeItem(SIGNED_IN_HERE_KEY);
  } catch {
    /* Storage blocked: the next open simply starts Auth the old way. */
  }
}
