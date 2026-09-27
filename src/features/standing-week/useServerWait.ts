import { useEffect, useState } from "react";
import { SERVER_WAIT_MS } from "./server-read";

/**
 * The two things `serverRead` needs from the browser (voice review follow-up,
 * Sep 27 2026): whether it says it is online (its `online` / `offline`
 * events, as session-record/useSendState reads them), and whether a read
 * that is `waiting` for the server has waited SERVER_WAIT_MS. The clock runs
 * only while something waits, and starts again from nothing each time it
 * does. Reads nothing and writes nothing.
 */
const browserOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

export function useServerWait(waiting: boolean): { online: boolean; waitedOut: boolean } {
  const [online, setOnline] = useState(browserOnline);
  const [waitedOut, setWaitedOut] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setOnline(browserOnline());
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    setWaitedOut(false);
    if (!waiting) return;
    const t = setTimeout(() => setWaitedOut(true), SERVER_WAIT_MS);
    return () => clearTimeout(t);
  }, [waiting]);

  return { online, waitedOut: waiting && waitedOut };
}
