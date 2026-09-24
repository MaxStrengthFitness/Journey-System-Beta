/**
 * A piece of state whose every CHANGE asks first.
 *
 * AppContent has no router: the screen is `currentView`, the client is
 * `selectedClientId`, and dozens of buttons across the app set them, most of
 * them through props handed down several levels. Guarding the setter itself
 * is what reaches every one of those buttons at once, including the ones
 * added next month.
 *
 * Setting the value it already has is not a navigation and never asks.
 */
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { useLeaveGuard } from "./UnsavedChanges";

export function useGuardedState<T>(
  initial: T | (() => T),
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  });
  const guard = useLeaveGuard();

  const set = useCallback(
    (next: T) => {
      if (Object.is(next, latest.current)) return;
      guard(() => {
        latest.current = next;
        setValue(next);
      });
    },
    [guard],
  );

  return [value, set];
}
