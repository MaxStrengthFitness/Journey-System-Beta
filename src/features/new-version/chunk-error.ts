/**
 * "THIS SCREEN'S FILE COULD NOT BE LOADED" (new-version round, Sep 26 2026).
 *
 * Journey fetches each screen the first time it is opened (React.lazy). After a
 * deploy the old screen files are gone, the server answers 404 for them
 * (`serveBuiltApp` in server/served-files.ts), and the browser refuses the
 * import. React remembers that refusal for as long as the page lives, so only
 * a reload brings the screen back. Two ways to know an error is one of these:
 *
 *   - Vite says so. Its preload helper dispatches `vite:preloadError` on window
 *     with the error as `payload` before the error reaches React. main.tsx
 *     hands that error to `noteChunkLoadError`, and React later throws the SAME
 *     object, so the boundary can recognise it exactly.
 *   - The browser's own words, for an import Vite did not wrap. Safari says
 *     "Importing a module script failed.", Chrome and Edge "Failed to fetch
 *     dynamically imported module", Firefox "error loading dynamically imported
 *     module".
 *
 * PURE apart from the module-level WeakSet, which holds nothing about a person.
 */

const noted = new WeakSet<object>();

export function noteChunkLoadError(err: unknown): void {
  if (err && typeof err === "object") noted.add(err);
}

const BROWSER_WORDS: readonly RegExp[] = [
  /Importing a module script failed/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Unable to preload CSS/i,
];

export function isChunkLoadError(err: unknown): boolean {
  if (err && typeof err === "object" && noted.has(err)) return true;
  const message =
    err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string"
      ? (err as { message: string }).message
      : typeof err === "string"
        ? err
        : "";
  return BROWSER_WORDS.some((words) => words.test(message));
}
