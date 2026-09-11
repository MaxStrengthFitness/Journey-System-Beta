/**
 * fetch(), plus the signed-in user's Firebase token.
 *
 * Round: Renewals, Phase 0 (Sep 2026). The web service's Mindbody routes now
 * refuse any call without a sign-in (server/auth.ts), so every browser call to
 * /api/mindbody/* goes through here instead of bare fetch().
 *
 * Where the token comes from is registered by src/firebase.ts rather than
 * imported here. That keeps this file free of Firebase, so modules that use it
 * stay testable with a mocked firebase module, and a missing sign-in simply
 * sends no token (the server then answers 401 with a sentence to show).
 */

type TokenSource = () => Promise<string | null>;

let tokenSource: TokenSource | null = null;

/** Called once by src/firebase.ts. */
export function setIdTokenSource(source: TokenSource): void {
  tokenSource = source;
}

async function currentIdToken(): Promise<string | null> {
  if (!tokenSource) return null;
  try {
    return await tokenSource();
  } catch {
    return null;
  }
}

export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await currentIdToken();
  const headers: Record<string, string> = {};
  const given = init.headers;
  if (typeof Headers !== "undefined" && given instanceof Headers) {
    given.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (given && typeof given === "object" && !Array.isArray(given)) {
    Object.assign(headers, given as Record<string, string>);
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(input, { ...init, headers });
}
