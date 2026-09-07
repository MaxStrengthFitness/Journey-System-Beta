/**
 * Franchise Management.
 *
 * Round: Admin Overhaul, Round 2 Phase 4 (Section 15).
 *
 * This file is now the wiring: Firestore in, FranchiseHub out. The scoping
 * that used to be computed inline lives in features/admin/franchise/scope.ts
 * (with the seeded-network bug it was carrying), the layout is in
 * FranchiseHub.tsx, and the announcement composer is the shared one from
 * Phase 1. What is left here is the three streams and the props.
 */

import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../firebase";
import type {
  Client,
  FranchiseNetwork,
  HubAnnouncement,
  Studio,
  Trainer,
} from "../types";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { FranchiseHub } from "../features/admin/franchise/FranchiseHub";
import { AnnouncementComposer } from "../features/admin/announcements/AnnouncementComposer";
import {
  millis,
  type AnnouncementScope,
  type NetworkOption,
} from "../features/admin/announcements/audience";
import { FranchiseTeamManagement } from "./FranchiseTeamManagement";
import "../features/admin/admin.css";

interface FranchiseDashboardViewProps {
  authTrainer: Trainer;
  allStudios: Studio[];
  allTrainers: Trainer[];
  networks: FranchiseNetwork[];
  clients?: Client[];
}

export function FranchiseDashboardView({
  authTrainer,
  allStudios,
  allTrainers,
  networks,
}: FranchiseDashboardViewProps) {
  /**
   * Live notices this owner posted. Streamed rather than fetched once, so
   * taking one down on another device does not leave a phantom row here;
   * filtered to this author because an owner has no business retiring head
   * office's announcement from their own dashboard.
   */
  const [allAnnouncements, setAllAnnouncements] = useState<HubAnnouncement[]>(
    [],
  );

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "hub_announcements")),
      (snap) => {
        setAllAnnouncements(
          snap.docs.map((d) => ({ ...(d.data() as HubAnnouncement), id: d.id })),
        );
      },
      (err) => handleFirestoreError(err, OperationType.GET, "hub_announcements"),
    );
    return () => unsub();
  }, []);

  const myAnnouncements = useMemo(() => {
    const now = Date.now();
    return allAnnouncements
      .filter((a) => a.authorId === authTrainer.id)
      .filter((a) => a.isActive !== false)
      .filter((a) => {
        const expires = millis(a.expiresAt);
        return expires === 0 || expires >= now;
      })
      .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  }, [allAnnouncements, authTrainer.id]);

  return (
    <FranchiseHub
      viewer={authTrainer}
      studios={allStudios}
      trainers={allTrainers}
      networks={networks}
      published={myAnnouncements}
      team={({ studios, isSuperAdmin }) => (
        <FranchiseTeamManagement
          trainers={allTrainers}
          studios={studios}
          authTrainer={authTrainer}
          isAdmin={isSuperAdmin}
          activeStudioId={null}
        />
      )}
      announcements={({ studios, networks: scopedNetworks, published }) => {
        /*
          ANNOUNCEMENTS. The form that used to be inlined here is gone.

          It was a second implementation of the admin composer with its own
          field conventions, and the conventions did not match: it wrote
          targetScope "network" alongside studioId "all", and the reader treats
          studioId "all" as everybody. So an owner posting to their network
          published to every trainer on the platform, and the card labelled it
          "To: All Studios" - accurately, as it turned out, just not the
          studios anyone meant. See features/admin/announcements/audience.ts.

          The scope list below is the enforcement: "Everyone" is not offered,
          because a franchise owner addressing the whole platform is exactly
          the bug this round closed and a discouraged-but-present option would
          reopen it on the first busy morning.
        */
        const composerNetworks: NetworkOption[] = scopedNetworks.map((n) => ({
          id: n.id,
          name: n.name,
          studioIds: n.studioIds ?? [],
        }));
        const scopes: AnnouncementScope[] =
          composerNetworks.length > 0 ? ["network", "studio"] : ["studio"];
        return (
          <AnnouncementComposer
            author={{ id: authTrainer.id, fullName: authTrainer.fullName }}
            studios={studios.map((s) => ({ id: s.id, name: s.name }))}
            networks={composerNetworks}
            scopes={scopes}
            published={published}
            title="Message your network"
            subtitle="Lands in the alerts bell for everyone at the studios you pick."
          />
        );
      }}
    />
  );
}
