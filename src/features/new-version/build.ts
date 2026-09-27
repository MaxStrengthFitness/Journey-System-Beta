/**
 * WHICH VERSION OF JOURNEY IS THIS, AND WHICH ONE IS LIVE (new-version round,
 * Sep 26 2026).
 *
 * Every push to master puts a new Journey on Render. Each screen is a file
 * whose name is unique to its deploy, so a deploy deletes the files an open
 * app has not fetched yet. An app that does not notice keeps running the old
 * version until someone reloads it, and a Home Screen app has no reload
 * button.
 *
 * vite.config.ts names each build and writes that name twice: into the app
 * (`__APP_BUILD__`) and beside it (`/version.json`, which `serveBuiltApp` in
 * server/served-files.ts sends uncached). Comparing the two is how an open app learns a deploy happened.
 * Nothing else is compared: a DIFFERENT name is a new version, whether it is
 * newer or a rollback, because either way the old files are gone.
 *
 * PURE apart from `fetchLiveBuild`, which is handed its fetch.
 */

declare const __APP_BUILD__: string | undefined;

/** The name outside a production build: the dev server and the tests. */
export const DEV_BUILD = "dev";

/** This app's own build. */
export const APP_BUILD: string =
  typeof __APP_BUILD__ === "string" && __APP_BUILD__.trim() !== "" ? __APP_BUILD__ : DEV_BUILD;

export const VERSION_URL = "/version.json";

/** Long enough for studio Wi-Fi; short enough that nobody waits on it. */
export const VERSION_CHECK_TIMEOUT_MS = 5_000;

/** The name inside a `version.json` body, or null when there is none. */
export function parseVersionFile(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const build = (body as { build?: unknown }).build;
  return typeof build === "string" && build.trim() !== "" ? build.trim() : null;
}

/**
 * The build the server has live, or null when that cannot be told: no answer,
 * a slow answer, an error, or a body with no name in it (the dev server
 * answers every path with the app's own page). Null means UNKNOWN, never
 * "the same": it is the one answer that must never lead to a reload, because
 * a Home Screen app reloaded with no connection opens to a blank screen.
 */
export async function fetchLiveBuild(
  fetchFn: typeof fetch = fetch,
  timeoutMs: number = VERSION_CHECK_TIMEOUT_MS,
  now: () => number = Date.now,
): Promise<string | null> {
  const abort = typeof AbortController === "function" ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      abort?.abort();
      resolve(null);
    }, timeoutMs);
  });
  const asked = (async () => {
    try {
      // `no-store` keeps the iPad's own cache out of it, and the query keeps
      // out anything between the iPad and Render that ignores that.
      const res = await fetchFn(`${VERSION_URL}?t=${now()}`, {
        cache: "no-store",
        signal: abort?.signal,
      });
      if (!res.ok) return null;
      return parseVersionFile(await res.json());
    } catch {
      return null;
    }
  })();
  try {
    return await Promise.race([asked, late]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** True when the server has a build live other than this one. */
export function isNewBuild(running: string, live: string | null): boolean {
  if (running === DEV_BUILD || live === null) return false;
  return live !== running;
}
