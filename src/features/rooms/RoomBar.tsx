/**
 * THE ROOM BAR (the rooms round, Oct 10 2026; AJ's answer 1b).
 *
 * The same bar in every room, right under the navy frame: the room's MARK (an
 * icon tile in the room's hue) and its NAME on the left, ONE visible switch
 * for the room's sections, and the room's own tools on the right. A second
 * row, inside the same shelf, holds what the room needs beside its switch
 * (the Calendar's date stepper and Refresh). It is a shelf: it casts over
 * the room as the room scrolls under it.
 *
 * The room's hue is painted by rooms.css from `data-room`, on the mark and
 * the 3px line along the bar's foot, and on nothing else. A room never
 * passes a colour in: it says which room it is.
 */
import type { ComponentType, ReactNode } from "react";
import type { RoomId } from "./rooms";
import "./rooms.css";

export interface RoomBarProps {
  room: RoomId;
  /** The room's name, whole: the page says where you are. */
  name: string;
  /** The room's mark, a lucide icon (drawn in the mark ink on the hue). */
  icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean | "true" }>;
  /** The ONE switch for the room's sections (RoomSwitch). */
  switcher?: ReactNode;
  /** The room's own tools, on the right of the first row. */
  tools?: ReactNode;
  /** A second row under the first, inside the same shelf. */
  children?: ReactNode;
}

export function RoomBar({ room, name, icon: Icon, switcher, tools, children }: RoomBarProps) {
  return (
    <header className="rm-bar" data-room={room}>
      <div className="rm-bar__row">
        <div className="rm-bar__id">
          <span className="rm-mark" aria-hidden="true">
            <Icon size={22} strokeWidth={2.2} aria-hidden />
          </span>
          <h1 className="rm-name">{name}</h1>
        </div>
        {switcher ? <div className="rm-bar__switch">{switcher}</div> : null}
        {tools ? <div className="rm-bar__tools">{tools}</div> : null}
      </div>
      {children ? <div className="rm-bar__row rm-bar__row--more">{children}</div> : null}
    </header>
  );
}

export default RoomBar;
