/**
 * THE ROOMS (the rooms round, Oct 10 2026; AJ's answer 1b on "Journey
 * Rooms"). Pure: the list of rooms and what each one is called.
 *
 * AJ: "each place should feel a bit different but the same so it feels like
 * one app but i feel like im in the learning area or the active session area
 * or the client area so i can instantly know what im looking at when i pull
 * up the app".
 *
 * Every room has the same bar (RoomBar) and a hue of its own, its token
 * in src/index.css, painted on its mark tile and on the 3px line under its
 * bar and nowhere else (rooms.css; room-hues.test.ts). The Calendar is the
 * first room built (Oct 10 2026); the others take their bar in their own
 * rounds, and their hues are measured and waiting.
 */

export const ROOM_IDS = ["hub", "session", "clients", "calendar", "learning", "studio", "operations", "admins"] as const;

export type RoomId = (typeof ROOM_IDS)[number];

/** The room's name, as its bar says it. */
export const ROOM_NAMES: Record<RoomId, string> = {
  hub: "Hub",
  session: "Session",
  clients: "Clients",
  calendar: "Calendar",
  learning: "Learning",
  studio: "My Studio",
  operations: "Operations",
  admins: "Admins",
};

/**
 * The two rooms whose hue is a colour that already has a job, on purpose:
 * the Hub keeps the logo blue (it is your day) and the session keeps the
 * orange (it is now). Every other room's hue keeps its distance from the
 * blue, the orange, the crimson and the plum (room-hues.test.ts).
 */
export const ROOMS_ON_A_JOB_COLOUR: ReadonlySet<RoomId> = new Set<RoomId>(["hub", "session"]);
