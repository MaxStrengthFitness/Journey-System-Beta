/**
 * What the sign-in screen says when a sign-in doesn't finish (the front door,
 * Oct 3 2026).
 *
 * Each sentence says what happened, that it usually isn't the person's fault,
 * and the one thing to do next. The old messages were written for whoever was
 * setting up Azure ("Set VITE_MICROSOFT_TENANT_ID=organizations in .env");
 * the technical detail is kept, after the plain sentence, for the day someone
 * has to pass it on to head office.
 */

export const MICROSOFT_DOMAIN = "maxstrengthfitness.com";

/** null means say nothing: the person closed the sign-in window themselves. */
export function signInErrorSentence(err: { code?: string; message?: string } | null | undefined): string | null {
  const code = err?.code ?? "";
  const message = (err?.message ?? "").trim();
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return null;
  if (code === "auth/popup-blocked")
    return "The sign-in window was blocked. Allow pop-ups for Journey in the browser's settings, then try again.";
  if (code === "auth/network-request-failed")
    return "This device couldn't reach Google or Microsoft. Check the Wi-Fi, then try again.";
  if (code === "auth/too-many-requests") return "Too many tries in a row. Wait a minute, then try again.";
  if (code === "auth/user-disabled")
    return "This account has been switched off. If that's a mistake, talk to your studio leader.";
  if (code === "auth/unauthorized-domain")
    return "Sign-in isn't set up for this web address. Open Journey from its usual address, or tell head office which one you used.";
  if (/unauthorized_client|not enabled for consumers|AADSTS\d+/i.test(message))
    return `Microsoft sign-in isn't set up correctly right now. Use Google for now, and tell head office what it said: ${message}`;
  return message
    ? `Sign-in didn't finish. Try again; if it keeps happening, tell head office what it said: ${message}`
    : "Sign-in didn't finish. Try again.";
}

/** A Microsoft account from outside the company, turned away at the door. */
export function wrongMicrosoftAccountSentence(email: string | null | undefined): string {
  const who = (email ?? "").trim();
  return who
    ? `${who} isn't a Max Strength account. Microsoft sign-in is only for @${MICROSOFT_DOMAIN} addresses: use Google instead, or sign in to Microsoft with your work account.`
    : `That Microsoft account has no email address Journey can use. Microsoft sign-in is only for @${MICROSOFT_DOMAIN} addresses: use Google instead.`;
}

export function isCompanyMicrosoftEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase().endsWith(`@${MICROSOFT_DOMAIN}`);
}
