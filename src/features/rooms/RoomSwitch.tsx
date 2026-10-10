/**
 * A ROOM'S ONE SWITCH (the rooms round, Oct 10 2026).
 *
 * The sections of a room, all visible: the Hub's command bar look (a well
 * sunk inside its 3:1 edge, the section you're on raised out of it in blue
 * words) and Learning's switch, now one control every room's bar uses. It
 * is a group of pressed buttons, as the Hub's layer switch is, so a screen
 * reader says which one is on.
 */
import type { ComponentType } from "react";
import "./rooms.css";

export interface RoomSwitchOption<T extends string> {
  id: T;
  label: string;
  icon?: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean | "true" }>;
}

export interface RoomSwitchProps<T extends string> {
  /** What the switch chooses, for a screen reader ("View"). */
  label: string;
  options: ReadonlyArray<RoomSwitchOption<T>>;
  value: T;
  onChange: (next: T) => void;
}

export function RoomSwitch<T extends string>({ label, options, value, onChange }: RoomSwitchProps<T>) {
  return (
    <div className="rm-switch" role="group" aria-label={label}>
      {options.map(({ id, label: words, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className="rm-switch__btn"
          aria-pressed={id === value}
          onClick={() => {
            if (id !== value) onChange(id);
          }}
        >
          {Icon ? <Icon size={16} strokeWidth={2.4} aria-hidden /> : null}
          {words}
        </button>
      ))}
    </div>
  );
}

export default RoomSwitch;
