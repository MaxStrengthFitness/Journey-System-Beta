/**
 * Pulse's panel, as a file fetched on first use. It is its own module so the
 * Active Session (which opens it) and AppContent (which fetches it early, once
 * the app is quiet: features/new-version/warm-up.ts) share ONE loader, and
 * AppContent does not have to import the Active Session to reach it.
 */
export const loadClientCheckInPanel = () =>
  import("./ClientCheckInPanel").then((m) => ({ default: m.ClientCheckInPanel }));
