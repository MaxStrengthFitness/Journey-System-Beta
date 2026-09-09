/**
 * The studio a trainer has pinned to enter automatically at login.
 *
 * Deliberately localStorage and not the trainer document: this is a
 * per-device convenience (the tablet bolted to the Westlake floor should open
 * Westlake), and the studio picker is a pre-studio screen where a write would
 * be the only write it makes. A trainer who works from two devices can pin a
 * different studio on each, which is the behaviour that was actually wanted.
 */
const KEY = "max_strength_default_studio_id";

export function getDefaultStudioId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    // Private mode / storage disabled — pinning is a convenience, never load-bearing.
    return null;
  }
}

export function setDefaultStudioId(studioId: string | null): void {
  try {
    if (studioId) localStorage.setItem(KEY, studioId);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
