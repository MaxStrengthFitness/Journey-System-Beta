import React, { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query } from "firebase/firestore";
import { db } from "../firebase";
import { Studio, Trainer, HubAnnouncement, FranchiseNetwork } from "../types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Network,
  Building2,
  Users,
  Megaphone,
  Loader2,
  Plus,
  ArrowRight,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";
import { useToast } from "../contexts/ToastContext";
import { AnnouncementComposer } from "../features/admin/announcements/AnnouncementComposer";
import {
  millis,
  type AnnouncementScope,
  type NetworkOption,
} from "../features/admin/announcements/audience";
import "../features/admin/admin.css";

interface FranchiseDashboardViewProps {
  authTrainer: Trainer;
  allStudios: Studio[];
  allTrainers: Trainer[];
  networks: FranchiseNetwork[];
}

import { FranchiseTeamManagement } from "./FranchiseTeamManagement";

export function FranchiseDashboardView({
  authTrainer,
  allStudios,
  allTrainers,
  networks,
}: FranchiseDashboardViewProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const isSuperAdmin =
    authTrainer.role === "Founder" ||
    authTrainer.role === "Admin" ||
    authTrainer.role === "Overseer";
  const displayNetworks = isSuperAdmin
    ? networks
    : networks.filter(
        (n) =>
          (n.ownerIds || []).includes(authTrainer.id!) ||
          n.ownerId === authTrainer.id,
      );

  const [selectedNetworkId, setSelectedNetworkId] = useState<string | null>(
    displayNetworks[0]?.id || null,
  );

  // Determine owned studios based on whether they are super-admin looking at a specific network
  // or an owner looking at their own stuff.
  const activeNetwork = displayNetworks.find((n) => n.id === selectedNetworkId);
  const networkStudioIds = activeNetwork ? activeNetwork.studioIds || [] : [];

  const ownedStudios =
    isSuperAdmin && activeNetwork
      ? allStudios.filter((s) => networkStudioIds.includes(s.id!))
      : allStudios.filter(
          (s) =>
            s.ownerId === authTrainer.id ||
            authTrainer.ownedStudioIds?.includes(s.id!) ||
            networkStudioIds.includes(s.id!),
        );

  const ownedStudioIds = ownedStudios.map((s) => s.id!);

  const staff = allTrainers.filter(
    (t) =>
      (t.primaryHomeStudioId &&
        ownedStudioIds.includes(t.primaryHomeStudioId)) ||
      t.accessibleStudioIds?.some((id) => ownedStudioIds.includes(id)) ||
      t.activeGuestStudioIds?.some((id) => ownedStudioIds.includes(id)),
  );

  /**
   * Live notices this owner posted. Streamed rather than fetched once, so
   * taking one down on another device does not leave a phantom row here;
   * filtered to this author because an owner has no business taking down
   * head office's announcement from their own dashboard.
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
      (err) =>
        handleFirestoreError(err, OperationType.GET, "hub_announcements"),
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

  /**
   * Only the networks this person actually holds, expanded to their studios
   * so the composer can resolve an audience without loading anything.
   */
  const composerNetworks: NetworkOption[] = useMemo(
    () =>
      displayNetworks.map((n) => ({
        id: n.id,
        name: n.name,
        studioIds: n.studioIds ?? [],
      })),
    [displayNetworks],
  );

  /**
   * "Everyone" is not on this menu. A franchise owner addressing the whole
   * platform is exactly the bug this round closed, and leaving the option
   * present-but-discouraged would reopen it on the first busy morning.
   */
  const composerScopes: AnnouncementScope[] = useMemo(
    () =>
      composerNetworks.length > 0 ? ["network", "studio"] : ["studio"],
    [composerNetworks],
  );

  return (
    <div className="space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 flex flex-col items-center justify-center border border-amber-500/20">
            <Network className="w-7 h-7 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-3xl md:text-5xl font-black italic tracking-tighter uppercase text-slate-900 dark:text-white leading-none">
              Franchise Management
            </h1>
            <p className="text-xs md:text-sm font-bold uppercase tracking-widest text-slate-500 mt-1">
              Oversee your network of locations & Life Transformers
            </p>
          </div>
        </div>

        {isSuperAdmin && (
          <div className="flex items-center gap-2">
            <Label className="text-[11px] font-bold uppercase tracking-widest text-slate-500">
              View Network:
            </Label>
            <Select
              value={selectedNetworkId || ""}
              onValueChange={setSelectedNetworkId}
            >
              <SelectTrigger className="w-50 h-10 font-bold uppercase text-[11px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl">
                <SelectValue placeholder="Select Network" />
              </SelectTrigger>
              <SelectContent>
                {displayNetworks.map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="rounded-[32px] border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
          <CardHeader className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-sky-500" />
              <CardTitle className="text-xl font-black uppercase italic tracking-tight">
                Your Locations
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {ownedStudios.length === 0 ? (
                <div className="text-xs text-slate-500 font-medium">
                  No locations registered to your account yet.
                </div>
              ) : (
                ownedStudios.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                  >
                    <span className="font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                      {s.name}
                    </span>
                    <Badge variant="outline">
                      {
                        staff.filter(
                          (t) =>
                            t.primaryHomeStudioId === s.id ||
                            t.accessibleStudioIds?.includes(s.id!) ||
                            t.activeGuestStudioIds?.includes(s.id!),
                        ).length
                      }{" "}
                      Transformers
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[32px] border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
          <CardHeader className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-amber-500" />
              <CardTitle className="text-xl font-black uppercase italic tracking-tight">
                Life Transformers
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <FranchiseTeamManagement
              trainers={allTrainers}
              studios={ownedStudios}
              authTrainer={authTrainer}
              isAdmin={isSuperAdmin}
              activeStudioId={null}
            />
          </CardContent>
        </Card>
      </div>

      {/*
        ANNOUNCEMENTS. The form that used to be inlined here is gone.

        It was a second implementation of the admin composer with its own
        field conventions, and the conventions did not match: it wrote
        targetScope "network" alongside studioId "all", and the reader treats
        studioId "all" as everybody. So an owner posting to their network
        published to every trainer on the platform, and the card labelled it
        "To: All Studios" - accurately, as it turned out, just not the studios
        anyone meant. See features/admin/announcements/audience.ts.

        The scope list below is the enforcement: an owner is offered their own
        networks and the studios inside them, and nothing else exists to pick.
      */}
      <AnnouncementComposer
        author={{ id: authTrainer.id, fullName: authTrainer.fullName }}
        studios={ownedStudios.map((s) => ({ id: s.id, name: s.name }))}
        networks={composerNetworks}
        scopes={composerScopes}
        published={myAnnouncements}
        title="Message your network"
        subtitle="Lands in the alerts bell for everyone at the studios you pick."
      />
    </div>
  );
}
