import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "../../../lib/utils";

/**
 * SWIPE ROW — swipe right for the main thing, left for "not me".
 *
 * Round: Relay, Sep 2026. A card on a held iPad has two gestures that need
 * no aim: a thumb dragged right, a thumb dragged left. Right is DONE (or
 * whatever the card's main act is), left is NOT ME — which snoozes the card
 * to the next shift phase and deletes nothing. Long-press opens the quick
 * menu. Buttons inside the card still work as buttons; the gesture only
 * fires past a clear threshold, so a scroll never turns into a swipe.
 *
 * Pointer events, not touch events, so it also works with a trackpad on the
 * desk PC. Vertical movement beyond a few pixels cancels the swipe: that
 * was a scroll.
 */
const THRESHOLD_PX = 72;
const CANCEL_Y_PX = 18;
const LONG_PRESS_MS = 550;

export function SwipeRow({
  children,
  onSwipeRight,
  onSwipeLeft,
  onLongPress,
  rightLabel = "Done",
  leftLabel = "Not me",
  className,
  disabled,
}: {
  children: ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  onLongPress?: () => void;
  rightLabel?: string;
  leftLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const cancelled = useRef(false);
  const pressTimer = useRef<number | null>(null);

  const clearPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const reset = () => {
    start.current = null;
    cancelled.current = false;
    setDx(0);
    setDragging(false);
    clearPress();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    // A tap on a button inside the card is the button's.
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select")) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    cancelled.current = false;
    if (onLongPress) {
      pressTimer.current = window.setTimeout(() => {
        if (start.current && !cancelled.current && Math.abs(dx) < 6) {
          onLongPress();
          reset();
        }
      }, LONG_PRESS_MS);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || cancelled.current || e.pointerId !== s.id) return;
    const ddx = e.clientX - s.x;
    const ddy = e.clientY - s.y;
    if (Math.abs(ddy) > CANCEL_Y_PX && Math.abs(ddy) > Math.abs(ddx)) {
      cancelled.current = true;
      clearPress();
      setDx(0);
      setDragging(false);
      return;
    }
    if (Math.abs(ddx) > 6) {
      clearPress();
      if (!dragging) {
        setDragging(true);
        try {
          e.currentTarget.setPointerCapture(s.id);
        } catch {
          /* jsdom and some browsers: capture is a nicety */
        }
      }
    }
    const allowed = (ddx > 0 && onSwipeRight) || (ddx < 0 && onSwipeLeft) ? ddx : ddx / 4;
    setDx(Math.max(-140, Math.min(140, allowed)));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s || e.pointerId !== s.id) return;
    const ddx = dx;
    reset();
    if (cancelled.current) return;
    if (ddx >= THRESHOLD_PX && onSwipeRight) onSwipeRight();
    else if (ddx <= -THRESHOLD_PX && onSwipeLeft) onSwipeLeft();
  };

  const style: CSSProperties = {
    transform: dx ? `translateX(${dx}px)` : undefined,
    transition: dragging ? "none" : "transform 160ms ease-out",
  };
  const armed = dx >= THRESHOLD_PX ? "right" : dx <= -THRESHOLD_PX ? "left" : null;

  return (
    <div className={cn("sw", className, armed && `sw--${armed}`)} data-dragging={dragging || undefined}>
      {onSwipeRight && (
        <span className="sw__under sw__under--right" aria-hidden style={{ opacity: Math.min(1, Math.max(0, dx) / THRESHOLD_PX) }}>
          {rightLabel}
        </span>
      )}
      {onSwipeLeft && (
        <span className="sw__under sw__under--left" aria-hidden style={{ opacity: Math.min(1, Math.max(0, -dx) / THRESHOLD_PX) }}>
          {leftLabel}
        </span>
      )}
      <div
        className="sw__card"
        style={style}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={reset}
        onPointerLeave={(e) => {
          if (!dragging) return;
          onPointerUp(e);
        }}
        onContextMenu={(e) => {
          if (onLongPress) e.preventDefault();
        }}
      >
        {children}
      </div>
    </div>
  );
}
