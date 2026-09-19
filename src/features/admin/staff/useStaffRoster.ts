/**
 * THE STAFF ROSTER, LIVE — one hook for both doors.
 *
 * My Studio round, Sep 2026. Staff & Roles (Operations) and My Studio → Team
 * both need the same three sources merged the same way: the trainer
 * documents the app already streams, the pending access requests (a live
 * listener — never a Force Refresh button), and the staff list Mindbody
 * holds for the studio's site. buildStaffRoster (roster.ts) does the merge;
 * this is the plumbing around it, lifted out of AdminStaffTab so the Team
 * section could not drift into a second copy.
 */

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../../firebase";
import { authedFetch } from "../../../lib/authed-fetch";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import type { Studio, Trainer } from "../../../types";
import { buildStaffRoster, summariseRoster, type AccessRequest, type MindbodyStaff, type StaffRow } from "./roster";

export interface StaffRosterState {
  rows: StaffRow[];
  summary: ReturnType<typeof summariseRoster>;
  requests: AccessRequest[];
  mindbodyStaff: MindbodyStaff[];
  /** Plain English about the Mindbody side: loading, offline, no site id, an error. Empty when fine. */
  staffStatus: string;
}

export function useStaffRoster({
  trainers,
  studio,
  studioId,
}: {
  trainers: Trainer[];
  /** The studio whose Mindbody site the staff list comes from. */
  studio: Studio | null;
  /** Restricts the rows to one studio when set; null lists everyone. */
  studioId: string | null;
}): StaffRosterState {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [mindbodyStaff, setMindbodyStaff] = useState<MindbodyStaff[]>([]);
  const [staffStatus, setStaffStatus] = useState("");

  /* ---- access requests: a live stream ------------------------------ */
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "access_requests"), where("status", "==", "Pending")),
      (snap) => setRequests(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AccessRequest, "id">) }))),
      (err) => handleFirestoreError(err, OperationType.GET, "access_requests"),
    );
    return () => unsub();
  }, []);

  /* ---- Mindbody staff for this studio's site ------------------------ */
  const siteId = studio?.mindbodySiteId;
  const mode = studio?.mindbodyMode;
  useEffect(() => {
    if (!siteId) {
      setMindbodyStaff([]);
      setStaffStatus(
        mode === "offline"
          ? "This studio runs offline — nobody arrives from Mindbody."
          : "No Mindbody Site ID on this studio yet.",
      );
      return;
    }
    let cancelled = false;
    setStaffStatus("Loading staff from Mindbody…");
    void (async () => {
      try {
        const res = await authedFetch("/api/mindbody/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId: String(siteId) }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setMindbodyStaff([]);
          setStaffStatus(err?.error || "Mindbody did not return a staff list.");
          return;
        }
        const data = await res.json();
        setMindbodyStaff(data.staff || []);
        setStaffStatus("");
      } catch {
        if (!cancelled) {
          setMindbodyStaff([]);
          setStaffStatus("Could not reach Mindbody.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId, mode]);

  const rows = useMemo(
    () => buildStaffRoster({ trainers, mindbodyStaff, requests, studioId }),
    [trainers, mindbodyStaff, requests, studioId],
  );
  const summary = useMemo(() => summariseRoster(rows), [rows]);

  return { rows, summary, requests, mindbodyStaff, staffStatus };
}
