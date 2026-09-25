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

/**
 * The guarded setter on its own, for state somebody else owns. AppContent's
 * screen lives in `useGuardedPlace` (features/admin), which also holds it to
 * who may open Operations and writes its own refusals with the RAW setter;
 * every button gets this one, which asks first.
 *
 * `value` is what the screen is showing now; setting it again never asks.
 */
export function useGuardedSetter<T>(
  value: T,
  setValue: (next: T) => void,
): (next: T) => void {
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  });
  const guard = useLeaveGuard();

  return useCallback(
    (next: T) => {
      if (Object.is(next, latest.current)) return;
      guard(() => {
        latest.current = next;
        setValue(next);
      });
    },
    [guard, setValue],
  );
}

export function useGuardedState<T>(
  initial: T | (() => T),
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(initial);
  const set = useGuardedSetter(value, setValue as (next: T) => void);
  return [value, set];
}
