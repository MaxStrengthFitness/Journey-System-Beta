# Rooms — the room bar and the room hues

*The rooms round, Oct 10 2026 — `docs/rounds/2026-10-10-rooms-calendar.md`. AJ's answer **1b** on the proposal page "Journey Rooms": name plates and a room hue.*

AJ: "each place should feel a bit different but the same so it feels like one app but i feel like im in the learning area or the active session area or the client area so i can instantly know what im looking at when i pull up the app".

Every room gets the SAME bar, in the same place, right under the navy frame. What differs is the room's name, its sections and one quiet hue.

## Files

| File | What it is |
| --- | --- |
| `RoomBar.tsx` | The bar: the room's **mark** (an icon tile in the room's hue) and **name** (Saira Condensed 22/800, upright) on the left, the room's ONE switch, the room's own tools on the right, and an optional second row inside the same shelf (`children`). A room says which room it is (`room`), never a colour |
| `RoomSwitch.tsx` | The one switch for a room's sections: a group of pressed buttons in a sunk well inside its 3:1 edge, the section you're on raised out of it in blue words (the Hub's command bar look, and Learning's). Every section is visible: a room never hides its top level in a dropdown |
| `rooms.css` | The bar, the switch and `.rm-tool` (a raised tool on the 3:1 edge), in the app's own tokens (`src/index.css`), so the bar is the same in every room whatever that room's palette. Prefix `rm-` |
| `rooms.ts` | The rooms (`ROOM_IDS`), their names, and the two whose hue is a colour that already has a job on purpose (`ROOMS_ON_A_JOB_COLOUR`). Pure |
| `room-hues.test.ts` | Measures every hue in both modes and holds the rule below |
| `RoomBar.render.test.tsx` | Mounts the bar and the switch |

## The room hue: a colour job of its own, WHERE YOU ARE

The Navy Frame gave each of the logo's colours one job: blue is yours and picked, orange is now and go, crimson is critical, plum is caution. The room hue is a new job, and it is held to these rules:

1. **It goes on two things only: the room's mark tile and the 3px line along the bottom of its bar.** Never a button, a chip, words, a data mark, a fill, an edge or a focus ring.
2. Its tokens are `--room-<id>` in `src/index.css`, `:root` and `.dark`, uppercase `#RRGGBB`, with the mark's icon ink `--room-mark-ink` (white in light, the frame's navy in dark) and the session's own `--room-session-ink` (navy: nothing puts white on an orange). They are **not** Tailwind utilities, so no `bg-room-*` class exists.
3. **Nothing outside `rooms.css` reads a `--room-` token**, and inside it only `.rm-mark` (its fill, and its icon in the mark ink) and `.rm-bar::after` (the line) read the hue. `rooms.css` maps each room to the bar's own `--rm-hue` on `.rm-bar[data-room="…"]`.
4. Each hue is measured in light and dark: the mark's icon on the hue at least 3:1, the line on the bar's surface (`--card`) at least 3:1.
5. It must not read as a colour that already has a job: every room's hue other than the Hub's (the logo blue: it's your day) and the session's (the orange of now) sits at least 30° of OKLCH hue from the blue, the orange, the crimson and the plum, or is a grey (chroma under 0.06).

| Room | Light | Dark |
| --- | --- | --- |
| Hub | `#1F5E9C` | `#65ABE9` |
| Session | `#D45A06` | `#F36D21` |
| Clients | `#0E7C7B` | `#4CC2BF` |
| Calendar | `#5048A6` | `#A79FF0` |
| Learning | `#2E7D4F` | `#6BC793` |
| My Studio | `#85690A` | `#DDB955` |
| Operations | `#4A5A6C` | `#A3B3C4` |
| Admins | `#5E5470` | `#B9AED2` |

The measurements are in the round document (§2.2).

## Using it

```tsx
<RoomBar
  room="calendar"
  name="Calendar"
  icon={CalendarDays}
  switcher={<RoomSwitch label="View" options={VIEWS} value={view} onChange={setView} />}
  tools={<TeamPicker … />}
>
  {/* a second row inside the same shelf: the date stepper, Refresh */}
</RoomBar>
```

- The bar is a **shelf** (`--shelf`, z 10): put it first in a flex column whose body scrolls under it, so it stays put. It is full-bleed: the room's own padding goes on the body below it, never round the bar.
- A tool on the bar is `.rm-tool` (raised on the `--input` 3:1 edge, 40px, 14/700, a press on `:active`), or the room's own control drawn the same way.
- On a phone (the bar's own container under 520px) the switch takes a line of its own, the width of the phone.

## Who has it

| Room | Since |
| --- | --- |
| Calendar | Oct 10 2026 (the rooms round) |

Learning, My Studio, Operations, Admins, the Hub, the client profile and the session take theirs in their own rounds. Their hues are measured and waiting.
