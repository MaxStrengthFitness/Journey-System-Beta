/**
 * The physical locations behind a Mindbody Site ID.
 *
 * Lifted out of AdminStudioManager, which had two near-identical copies of
 * this — one for the create form, one for the edit form — each with its own
 * debounce, its own sequence ref and its own status string. They had already
 * drifted: only one of them handled a transport failure.
 */

import { useEffect, useRef, useState } from "react";
import { authedFetch } from "../../../lib/authed-fetch";

export type MindbodyLocation = { id: string; name: string };

/** Pause after typing before the lookup fires. */
const DEBOUNCE_MS = 600;
/** Below this length a site id is still being typed and not worth a round trip. */
const MIN_SITE_ID_LENGTH = 3;

export interface MindbodyLocationsState {
  locations: MindbodyLocation[];
  loading: boolean;
  /** Plain-English status for the field's hint line. Empty when idle. */
  status: string;
  /**
   * What the last lookup came back with (My Studio round, Sep 2026): a site
   * id is only saved once Mindbody has answered for it, because a wrong id
   * parks every booking in Limbo and makes the studio's trainers blind.
   * "idle" below the minimum length, "ok" when Mindbody answered (even with
   * no locations), "error" when it refused or could not be reached.
   */
  outcome: "idle" | "loading" | "ok" | "error";
}

function friendlyError(status: number | null, message?: string, code?: string): string {
  if (status === 401 || status === 403 || code === "unauthorised") {
    return "Mindbody refused the request — check the API key for this site.";
  }
  if (status === 404) return "No Mindbody site with that ID.";
  if (status === 429) return "Mindbody is rate-limiting us. Try again shortly.";
  if (status && status >= 500) return "Mindbody is not responding right now.";
  if (!status) return "Could not reach Mindbody. Check the connection.";
  return message || "Could not load locations for this site.";
}

export function useMindbodyLocations(siteId: string): MindbodyLocationsState {
  const [state, setState] = useState<MindbodyLocationsState>({
    locations: [],
    loading: false,
    status: "",
    outcome: "idle",
  });

  // Responses can land out of order once someone edits a site id quickly, so
  // a reply is only accepted while it is still the newest request.
  const seq = useRef(0);

  useEffect(() => {
    const trimmed = siteId.trim();
    const reqId = ++seq.current;

    if (trimmed.length < MIN_SITE_ID_LENGTH) {
      setState({ locations: [], loading: false, status: "", outcome: "idle" });
      return;
    }

    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true, status: "Looking up locations…", outcome: "loading" }));
      try {
        const res = await authedFetch("/api/mindbody/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId: trimmed }),
        });
        if (reqId !== seq.current) return;

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setState({
            locations: [],
            loading: false,
            status: friendlyError(res.status, err?.error, err?.code),
            outcome: "error",
          });
          return;
        }

        const data = await res.json();
        const locations: MindbodyLocation[] = data.locations || [];
        setState({
          locations,
          loading: false,
          status:
            locations.length === 0
              ? "No locations on this site yet."
              : `${locations.length} location${locations.length === 1 ? "" : "s"} found.`,
          outcome: "ok",
        });
      } catch (e: any) {
        if (reqId !== seq.current) return;
        setState({
          locations: [],
          loading: false,
          status: friendlyError(null, e?.message),
          outcome: "error",
        });
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [siteId]);

  return state;
}
