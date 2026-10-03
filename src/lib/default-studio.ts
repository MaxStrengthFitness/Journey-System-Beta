/**
 * The studio a trainer has pinned to enter automatically at login.
 *
 * Deliberately localStorage and not the trainer document: this is a
 * per-device convenience (the tablet bolted to the Westlake floor should open
 * Westlake), and the studio picker is a pre-studio screen where a write would
 * be the only write it makes. A trainer who works from two devices can pin a
 * different studio on each, which is the behaviour that was actually wanted.
 */
/** Exported for sign-out, which keeps this key and clears the rest (features/sign-out). */
export const DEFAULT_STUDIO_KEY = "max_strength_default_studio_id";
const KEY = DEFAULT_STUDIO_KEY;

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

/**
 * The studio this iPad last opened, by id AND name (the front door, Oct 3
 * 2026). The sign-in screen says "This iPad opens Strongsville" before anyone
 * is signed in, when the studios can't be read yet, so it keeps the name it
 * was given. It belongs to the iPad, so sign-out keeps it (DEVICE_KEYS).
 */
export const DEVICE_STUDIO_KEY = "journey_device_studio";

export interface DeviceStudio {
  id: string;
  name: string;
}

export function getDeviceStudio(): DeviceStudio | null {
  try {
    const raw = localStorage.getItem(DEVICE_STUDIO_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<DeviceStudio>;
    return typeof v.id === "string" && typeof v.name === "string" && v.id && v.name.trim()
      ? { id: v.id, name: v.name.trim() }
      : null;
  } catch {
    return null;
  }
}

export function rememberDeviceStudio(studio: DeviceStudio): void {
  try {
    localStorage.setItem(DEVICE_STUDIO_KEY, JSON.stringify({ id: studio.id, name: studio.name }));
  } catch {
    /* ignore */
  }
}

/** The sign-in screen's sentence about this iPad, or null when it knows nothing. */
export function deviceStudioLine(device: DeviceStudio | null, pinnedId: string | null): string | null {
  if (!device) return null;
  return pinnedId === device.id ? `This iPad opens ${device.name}` : `Last used at ${device.name}`;
}
