import { useEffect, useState } from "react";

/**
 * The time, once a minute: what a page that says "today" and "in at 9:00"
 * needs, without a clock that runs every second. The interval stops when the
 * page unmounts.
 */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
