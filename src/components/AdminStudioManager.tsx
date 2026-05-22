import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  addDoc,
  deleteDoc,
  getDocs,
  updateDoc,
  doc,
  orderBy,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "../firebase";
import { Studio, Trainer, FranchiseNetwork } from "../types";
import {
  Building2,
  Users,
  ChevronRight,
  MapPin,
  Mail,
  Phone,
  Clock,
  Save,
  ArrowLeft,
  Plus,
  Trash2,
  Star,
  UserCircle,
  BadgeInfo,
  ShieldCheck,
  Network,
  Link2,
  Unlink2,
  Crown,
  Key,
  Flame,
  Layers,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion, AnimatePresence } from "motion/react";
import { cn, getRoleColor, getRoleDisplayName } from "@/lib/utils";
import { OperationType, handleFirestoreError } from "../lib/firestore-errors";

interface Props {
  authTrainer: Trainer;
  studios: Studio[];
  networks: FranchiseNetwork[];
  trainers: Trainer[];
  isAdmin?: boolean;
  onBack?: () => void;
  onRefresh?: (
    collectionName: "studios" | "networks" | "trainers",
  ) => Promise<void>;
}

export function AdminStudioManager({
  authTrainer,
  studios: allStudios,
  networks,
  trainers,
  isAdmin = false,
  onBack,
  onRefresh,
}: Props) {
  // Tabs
  const [activeTab, setActiveTab] = useState<"networks" | "studios">(
    "networks",
  );

  // Selection state
  const [selectedNetworkId, setSelectedNetworkId] = useState<string | null>(
    null,
  );
  const [selectedStudioId, setSelectedStudioId] = useState<string | null>(null);

  // Creation / modification states
  const [newNetworkName, setNewNetworkName] = useState("");
  const [newNetworkOwnerIds, setNewNetworkOwnerIds] = useState<string[]>([]);
  const [newNetworkState, setNewNetworkState] = useState("");
  const [isCreatingNetwork, setIsCreatingNetwork] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [staffLoading, setStaffLoading] = useState(false);

  // Filter studios based on access permissions
  // Super Admin / Franchise Owners see all; local managers see their matched territories
  const manageableStudios = React.useMemo(() => {
    if (
      isAdmin ||
      authTrainer.role === "Admin" ||
      authTrainer.role === "FranchiseOwner" ||
      authTrainer.role === "Overseer"
    ) {
      return allStudios;
    }
    // Filter to studios where the authTrainer is the designated owner or listed in ownedStudioIds
    return allStudios.filter(
      (s) =>
        s.ownerId === authTrainer.id ||
        authTrainer.ownedStudioIds?.includes(s.id!),
    );
  }, [allStudios, authTrainer, isAdmin]);

  // Selected entities helper
  const selectedStudio = allStudios.find((s) => s.id === selectedStudioId);
  const selectedNetwork = networks.find((n) => n.id === selectedNetworkId);

  // Filter independent studios (not linked to any network)
  const independentStudios = React.useMemo(() => {
    return allStudios.filter((s) => {
      const isLinkedToAny = networks.some((n) => n.studioIds?.includes(s.id!));
      return !isLinkedToAny && !s.networkId;
    });
  }, [allStudios, networks]);

  // Find staff for a selected studio
  const getStaffForStudio = (studioId: string) => {
    return trainers.filter(
      (t) =>
        t.primaryHomeStudioId === studioId ||
        t.accessibleStudioIds?.includes(studioId) ||
        t.activeGuestStudioIds?.includes(studioId) ||
        t.id === selectedStudio?.ownerId ||
        t.id === selectedStudio?.headTrainerId,
    );
  };

  // 1. CREATE FRANCHISE NETWORK
  const handleCreateNetwork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNetworkName.trim() || newNetworkOwnerIds.length === 0) {
      alert(
        "Please provide a network name and assign at least one franchise owner.",
      );
      return;
    }

    setIsSaving(true);
    try {
      await addDoc(collection(db, "networks"), {
        name: newNetworkName,
        ownerId: newNetworkOwnerIds[0], // Keep for backward compatibility
        ownerIds: newNetworkOwnerIds,
        state: newNetworkState,
        studioIds: [],
        createdAt: new Date(),
      });
      setNewNetworkName("");
      setNewNetworkOwnerIds([]);
      setNewNetworkState("");
      setIsCreatingNetwork(false);
      await onRefresh?.("networks");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "networks");
    } finally {
      setIsSaving(false);
    }
  };

  // 2. CREATE STUDIO
  const [newStudioName, setNewStudioName] = useState("");
  const handleCreateStudio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudioName.trim()) {
      alert("Please provide a new location name.");
      return;
    }

    setIsSaving(true);
    try {
      await addDoc(collection(db, "studios"), {
        name: newStudioName,
        timezone: "UTC", // Default wait for update
        createdAt: new Date(),
        ownerId: authTrainer.id,
      });
      setNewStudioName("");
      await onRefresh?.("studios");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "studios");
    } finally {
      setIsSaving(false);
    }
  };

  // 3. DELETE FRANCHISE NETWORK
  const handleDeleteNetwork = async (networkId: string) => {
    const net = networks.find((n) => n.id === networkId);
    if (!net) return;
    if (net.studioIds && net.studioIds.length > 0) {
      alert(
        "Please unlink all associated studios from this regional network before removing it.",
      );
      return;
    }
    if (
      !confirm(
        `Are you absolutely sure you want to disband the regional command for "${net.name}"?`,
      )
    ) {
      return;
    }

    try {
      await deleteDoc(doc(db, "networks", networkId));
      if (selectedNetworkId === networkId) {
        setSelectedNetworkId(null);
      }
      await onRefresh?.("networks");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `networks/${networkId}`);
    }
  };

  // 3. LINK STUDIO TO NETWORK
  const handleLinkStudio = async (networkId: string, studioId: string) => {
    try {
      const net = networks.find((n) => n.id === networkId);
      if (!net) return;

      const alreadyLinked = net.studioIds?.includes(studioId);
      if (alreadyLinked) return;

      const updatedStudioIds = [...(net.studioIds || []), studioId];
      // Update Network doc
      await updateDoc(doc(db, "networks", networkId), {
        studioIds: updatedStudioIds,
      });
      // Update Studio doc
      await updateDoc(doc(db, "studios", studioId), {
        networkId: networkId,
      });
      await onRefresh?.("networks");
      await onRefresh?.("studios");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `networks/${networkId}`);
    }
  };

  // 4. UNLINK STUDIO FROM NETWORK
  const handleUnlinkStudio = async (networkId: string, studioId: string) => {
    try {
      const net = networks.find((n) => n.id === networkId);
      if (!net) return;

      const updatedStudioIds = (net.studioIds || []).filter(
        (id) => id !== studioId,
      );
      // Update Network doc
      await updateDoc(doc(db, "networks", networkId), {
        studioIds: updatedStudioIds,
      });
      // Update Studio doc
      await updateDoc(doc(db, "studios", studioId), {
        networkId: null,
      });
      await onRefresh?.("networks");
      await onRefresh?.("studios");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `networks/${networkId}`);
    }
  };

  // 5. UPDATE STUDIO METADATA (INCLUDING REASSIGNING ROLES)
  const handleUpdateStudioMetadata = async (
    e: React.FormEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();
    if (!selectedStudio?.id) return;

    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const ownerIdVal = formData.get("ownerId") as string;
    const headTrainerIdVal = formData.get("headTrainerId") as string;

    const updates: Partial<Studio> = {
      name: formData.get("name") as string,
      contactEmail: formData.get("contactEmail") as string,
      phone: formData.get("phone") as string,
      address: formData.get("address") as string,
      timezone: formData.get("timezone") as string,
      mindbodySiteId: formData.get("mindbodySiteId") as string,
      ownerId: ownerIdVal === "none" ? null : ownerIdVal,
      headTrainerId: headTrainerIdVal === "none" ? null : headTrainerIdVal,
    };

    try {
      await updateDoc(doc(db, "studios", selectedStudio.id), updates);

      // Auto-update Trainer roles if we assigned them
      if (ownerIdVal && ownerIdVal !== "none") {
        await updateDoc(doc(db, "trainers", ownerIdVal), {
          role: "StudioOwner",
          ownedStudioIds: arrayUnion(selectedStudio.id),
        });
      }
      if (headTrainerIdVal && headTrainerIdVal !== "none") {
        await updateDoc(doc(db, "trainers", headTrainerIdVal), {
          role: "HeadTrainer",
          accessibleStudioIds: arrayUnion(selectedStudio.id),
        });
      }

      alert("Clinical Studio profile synchronization complete!");
      await onRefresh?.("studios");
      await onRefresh?.("trainers");
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.UPDATE,
        `studios/${selectedStudio.id}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  // 6. ROSTER: ADD TRAINER
  const handleAddTrainerToStudio = async (trainerId: string) => {
    if (!selectedStudioId) return;
    try {
      await updateDoc(doc(db, "trainers", trainerId), {
        accessibleStudioIds: arrayUnion(selectedStudioId),
      });
      setIsAddingStaff(false);
      await onRefresh?.("trainers");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `trainers/${trainerId}`);
    }
  };

  // 7. ROSTER: REMOVE TRAINER
  const handleRemoveTrainerFromStudio = async (trainerId: string) => {
    if (!selectedStudioId) return;
    if (
      trainerId === selectedStudio?.ownerId ||
      trainerId === selectedStudio?.headTrainerId
    ) {
      alert(
        "You cannot remove an active designated Business Owner or Head Trainer from the location roster. Re-assign their roles first in the card above.",
      );
      return;
    }

    try {
      await updateDoc(doc(db, "trainers", trainerId), {
        accessibleStudioIds: arrayRemove(selectedStudioId),
        activeGuestStudioIds: arrayRemove(selectedStudioId),
      });
      await onRefresh?.("trainers");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `trainers/${trainerId}`);
    }
  };

  // RENDER SUITE / TABS Layout
  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-12 font-sans selection:bg-[#F06C22]/35 selection:text-white pb-32">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Main Header Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-900 pb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-[#F06C22] to-amber-600 flex items-center justify-center text-white shadow-2xl shadow-[#F06C22]/20">
              <Network className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter text-white">
                  Franchise Command
                </h1>
                <Badge className="bg-[#F06C22]/15 text-[#F06C22] border border-[#F06C22]/20 text-[9px] font-black uppercase tracking-widest px-2 py-0.5">
                  Enterprise
                </Badge>
              </div>
              <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.25em] text-zinc-500 mt-1">
                Cross-Studio Infrastructure & Role Mapping Matrix
              </p>
            </div>
          </div>
          {onBack && (
            <Button
              variant="outline"
              onClick={onBack}
              className="border-slate-850 hover:bg-slate-900 text-zinc-300 hover:text-white font-black uppercase tracking-widest text-[10px] h-12 rounded-2xl px-6 bg-slate-950 transition-all shadow-xl"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Overview
            </Button>
          )}
        </div>

        {/* Selected Studio Subview (Configure Staff / Metadata) */}
        {selectedStudioId ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            {/* Context breadcrumb back */}
            <button
              onClick={() => setSelectedStudioId(null)}
              className="flex items-center gap-2 text-[#F06C22] hover:text-[#F06C22]/80 transition-colors uppercase font-black text-[10px] tracking-widest"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Executive Registries
            </button>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-900">
              <div>
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-[#F06C22]">
                    <Building2 className="w-5 h-5" />
                  </span>
                  <div>
                    <h2 className="text-3xl font-black uppercase italic tracking-tight text-white leading-none mb-1">
                      {selectedStudio.name}
                    </h2>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                      Station Security ID: {selectedStudio.id}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-widest text-[9px] font-black py-1 px-3 rounded-full">
                  Territory Active
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              {/* Studio Config and Role Assignment (Super / Franchise Owner Level) */}
              <div className="lg:col-span-2 space-y-8">
                <Card className="rounded-[32px] bg-slate-900/60 border border-slate-800/80 shadow-2xl relative overflow-hidden backdrop-blur-md">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#F06C22]/5 filter blur-3xl rounded-full" />
                  <CardHeader className="p-8 border-b border-slate-800/60 flex flex-row items-center gap-4">
                    <span className="w-10 h-10 bg-[#F06C22]/15 border border-[#F06C22]/20 rounded-xl flex items-center justify-center text-[#F06C22]">
                      <BadgeInfo className="w-5 h-5" />
                    </span>
                    <div>
                      <CardTitle className="text-lg font-black uppercase tracking-wider text-white">
                        Studio Infrastructure Setup
                      </CardTitle>
                      <CardDescription className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest mt-0.5">
                        Parameters synchronizing physical location and systems
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8">
                    <form
                      onSubmit={handleUpdateStudioMetadata}
                      className="grid grid-cols-1 md:grid-cols-2 gap-6"
                    >
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-[#F06C22] ml-1">
                          Site Display Name
                        </Label>
                        <Input
                          name="name"
                          defaultValue={selectedStudio.name}
                          className="bg-slate-950 border-slate-800 text-white rounded-2xl h-12 focus:border-[#F06C22] focus:ring-0 font-bold"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">
                          Business Email
                        </Label>
                        <Input
                          name="contactEmail"
                          defaultValue={selectedStudio.contactEmail}
                          className="bg-slate-950 border-slate-800 text-zinc-300 rounded-2xl h-12 font-bold focus:border-[#F06C22]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">
                          Phone Number
                        </Label>
                        <Input
                          name="phone"
                          defaultValue={selectedStudio.phone}
                          className="bg-slate-950 border-slate-800 text-zinc-300 rounded-2xl h-12 font-bold focus:border-[#F06C22]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">
                          Operating Timezone
                        </Label>
                        <Input
                          name="timezone"
                          defaultValue={selectedStudio.timezone}
                          className="bg-slate-950 border-slate-800 text-zinc-300 rounded-2xl h-12 font-bold focus:border-[#F06C22]"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">
                          Physical Address
                        </Label>
                        <Input
                          name="address"
                          defaultValue={selectedStudio.address}
                          className="bg-slate-950 border-slate-800 text-zinc-300 rounded-2xl h-12 font-bold focus:border-[#F06C22]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">
                          MindBody Site ID
                        </Label>
                        <Input
                          name="mindbodySiteId"
                          defaultValue={selectedStudio.mindbodySiteId}
                          className="bg-slate-950 border-slate-800 text-zinc-300 rounded-2xl h-12 font-bold focus:border-[#F06C22]"
                        />
                      </div>

                      {/* Explicit Role Mapping directly from HQ Command Center */}
                      <div className="md:col-span-2 pt-6 border-t border-slate-800/60 mt-4 space-y-6">
                        <h3 className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                          <Crown className="w-4 h-4 text-[#F06C22]" />
                          Role & Permission Mapping
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">
                              Assigned Business Owner
                            </Label>
                            <Select
                              name="ownerId"
                              defaultValue={selectedStudio.ownerId || "none"}
                            >
                              <SelectTrigger className="bg-slate-950 border-slate-800 text-white h-12 rounded-2xl font-bold">
                                <SelectValue placeholder="No Owner Assigned" />
                              </SelectTrigger>
                              <SelectContent className="bg-slate-900 border-slate-800 text-white">
                                <SelectItem value="none">
                                  No Owner Assigned
                                </SelectItem>
                                {trainers.map((t) => (
                                  <SelectItem key={t.id} value={t.id!}>
                                    {t.fullName} ({t.role})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-1">
                              Designated Head Trainer
                            </Label>
                            <Select
                              name="headTrainerId"
                              defaultValue={
                                selectedStudio.headTrainerId || "none"
                              }
                            >
                              <SelectTrigger className="bg-slate-950 border-slate-800 text-white h-12 rounded-2xl font-bold">
                                <SelectValue placeholder="No Head Trainer Assigned" />
                              </SelectTrigger>
                              <SelectContent className="bg-slate-900 border-slate-800 text-white">
                                <SelectItem value="none">
                                  No Head Trainer Assigned
                                </SelectItem>
                                {trainers.map((t) => (
                                  <SelectItem key={t.id} value={t.id!}>
                                    {t.fullName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-2 pt-6 border-t border-slate-800/60 flex justify-end">
                        <Button
                          type="submit"
                          disabled={isSaving}
                          className="bg-[#F06C22] hover:bg-[#D95B16] text-white font-black uppercase tracking-widest text-xs h-12 px-8 rounded-2xl shadow-xl shadow-[#F06C22]/10"
                        >
                          {isSaving ? (
                            "Saving Configurations..."
                          ) : (
                            <div className="flex items-center gap-2">
                              <Save className="w-4 h-4" />
                              Synchronize Systems
                            </div>
                          )}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>

                {/* Staff Roster Management */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black uppercase tracking-wider flex items-center gap-3 text-white">
                      <span className="w-10 h-10 bg-[#F06C22]/15 border border-[#F06C22]/20 rounded-xl flex items-center justify-center text-[#F06C22]">
                        <Users className="w-5 h-5" />
                      </span>
                      Linked Professional Staff
                    </h3>
                    <Button
                      onClick={() => setIsAddingStaff(true)}
                      className="bg-slate-900 hover:bg-slate-850 hover:text-white border border-slate-800 hover:border-[#F06C22]/30 text-[#F06C22] font-black uppercase tracking-widest text-[10px] h-10 px-4 rounded-xl shadow-xl transition-all"
                    >
                      <Plus className="w-4 h-4 mr-1.5" />
                      Authorize Trainer
                    </Button>
                  </div>

                  <AnimatePresence>
                    {isAddingStaff && (
                      <motion.div
                        initial={{ opacity: 0, y: -15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        className="p-6 bg-slate-900/40 border border-dashed border-slate-800 rounded-[28px]"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-xs font-black uppercase tracking-widest text-[#F06C22]">
                            Search Organization for Trainer
                          </h4>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsAddingStaff(false)}
                            className="text-[10px] font-black text-zinc-550 uppercase"
                          >
                            Cancel
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="md:col-span-2">
                            <Select onValueChange={handleAddTrainerToStudio}>
                              <SelectTrigger className="bg-slate-950 border-slate-800 text-white h-12 rounded-xl font-bold">
                                <SelectValue placeholder="Select trainer profile to link..." />
                              </SelectTrigger>
                              <SelectContent className="bg-slate-900 border-slate-800 text-white">
                                {trainers
                                  .filter(
                                    (t) =>
                                      !getStaffForStudio(
                                        selectedStudio.id!,
                                      ).some((current) => current.id === t.id),
                                  )
                                  .map((t) => (
                                    <SelectItem key={t.id} value={t.id!}>
                                      {t.fullName} ({t.initials})
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {getStaffForStudio(selectedStudio.id!).map((trainer) => {
                      const isOwner = trainer.id === selectedStudio.ownerId;
                      const isHead =
                        trainer.id === selectedStudio.headTrainerId;

                      return (
                        <Card
                          key={trainer.id}
                          className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex items-stretch group hover:border-[#F06C22]/30 transition-colors"
                        >
                          <div
                            className={cn(
                              "w-1.5 transition-all",
                              isOwner
                                ? "bg-amber-500"
                                : isHead
                                  ? "bg-indigo-500"
                                  : "bg-[#F06C22] group-hover:w-3",
                            )}
                          />
                          <CardContent className="p-4 flex items-center gap-4 w-full">
                            <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center font-black text-white shadow-inner">
                              {trainer.initials}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-extrabold text-sm uppercase tracking-wider text-white truncate">
                                {trainer.fullName}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                <Badge
                                  className={cn(
                                    "border text-[8px] font-black uppercase tracking-widest px-1.5 h-4",
                                    getRoleColor(trainer.role),
                                  )}
                                >
                                  {getRoleDisplayName(trainer.role)}
                                </Badge>
                                {isOwner && (
                                  <Badge className="bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[8px] font-black uppercase px-1.5 h-4">
                                    Franchise Principal
                                  </Badge>
                                )}
                                {isHead && (
                                  <Badge className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[8px] font-black uppercase px-1.5 h-4">
                                    Studio Leader
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  handleRemoveTrainerFromStudio(trainer.id!)
                                }
                                className="w-8 h-8 rounded-lg text-zinc-600 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Sidebar Stats and Control Metrics */}
              <div className="space-y-6">
                <Card className="rounded-[28px] bg-slate-900 border border-slate-800 p-6 space-y-6">
                  <div className="flex items-center gap-2 text-[#F06C22] border-b border-slate-850 pb-4">
                    <ShieldCheck className="w-5 h-5" />
                    <span className="text-xs font-black uppercase tracking-widest">
                      Studio Permissions Check
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#F06C22]">
                        Home Base Staff
                      </p>
                      <p className="text-2xl font-black text-white tracking-widest mt-0.5">
                        {
                          trainers.filter(
                            (t) => t.primaryHomeStudioId === selectedStudio.id,
                          ).length
                        }
                      </p>
                      <p className="text-[9px] font-medium text-zinc-500 leading-normal uppercase mt-1">
                        Trainers designated natively to this specific home
                        location.
                      </p>
                    </div>

                    <div className="pt-4 border-t border-slate-850">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                        Cross-Training Access
                      </p>
                      <p className="text-2xl font-black text-rose-400 tracking-widest mt-0.5">
                        {
                          trainers.filter(
                            (t) =>
                              t.accessibleStudioIds?.includes(
                                selectedStudio.id,
                              ) && t.primaryHomeStudioId !== selectedStudio.id,
                          ).length
                        }
                      </p>
                      <p className="text-[9px] font-medium text-zinc-500 leading-normal uppercase mt-1">
                        Affiliated trainers with authorized cross-studio client
                        permissions.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-8">
            {/* Tab Swappers */}
            <div className="flex bg-slate-900 p-1.5 rounded-[22px] max-w-md border border-slate-850/80">
              <button
                onClick={() => setActiveTab("networks")}
                className={cn(
                  "flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all",
                  activeTab === "networks"
                    ? "bg-slate-950 text-white shadow-xl border border-slate-850"
                    : "text-zinc-500 hover:text-white",
                )}
              >
                Franchise Networks
              </button>
              <button
                onClick={() => setActiveTab("studios")}
                className={cn(
                  "flex-1 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all",
                  activeTab === "studios"
                    ? "bg-slate-950 text-white shadow-xl border border-slate-850"
                    : "text-zinc-500 hover:text-white",
                )}
              >
                Location Registry
              </button>
            </div>

            {/* TAB 1: FRANCHISE NETWORKS */}
            {activeTab === "networks" && (
              <div className="space-y-12">
                {/* Network Builder (Super Admin or Franchise Owner) */}
                {(isAdmin ||
                  authTrainer.role === "FranchiseOwner" ||
                  authTrainer.role === "Admin") && (
                  <Card className="rounded-[32px] bg-slate-900 border border-slate-800 p-8 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-[#F06C22]" />
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-[#F06C22]/10 border border-[#F06C22]/20 flex items-center justify-center text-[#F06C22]">
                        <Flame className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase italic tracking-tight text-white leading-none">
                          Regional Franchise Builder
                        </h3>
                        <p className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest mt-1">
                          Bootstrap new regional networks and link territories
                          under single ownership
                        </p>
                      </div>
                    </div>

                    <form
                      onSubmit={handleCreateNetwork}
                      className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end"
                    >
                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-[#F06C22]">
                          Franchise Name
                        </Label>
                        <Input
                          placeholder="e.g. Max Strength Northeast Ohio"
                          value={newNetworkName}
                          onChange={(e) => setNewNetworkName(e.target.value)}
                          className="bg-slate-950 border-slate-800 text-white rounded-xl h-12 focus:border-[#F06C22] font-semibold"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-[#F06C22]">
                          State
                        </Label>
                        <Input
                          placeholder="e.g. Ohio"
                          value={newNetworkState}
                          onChange={(e) => setNewNetworkState(e.target.value)}
                          className="bg-slate-950 border-slate-800 text-white rounded-xl h-12 focus:border-[#F06C22] font-semibold"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-[#F06C22]">
                          Franchise Principals (Owners)
                        </Label>
                        <Select
                          value={""}
                          onValueChange={(id) => {
                            if (!newNetworkOwnerIds.includes(id)) {
                              setNewNetworkOwnerIds([
                                ...newNetworkOwnerIds,
                                id,
                              ]);
                            }
                          }}
                        >
                          <SelectTrigger className="bg-slate-950 border-slate-800 text-white h-12 rounded-xl font-bold">
                            <SelectValue
                              placeholder={
                                newNetworkOwnerIds.length > 0
                                  ? `${newNetworkOwnerIds.length} Owner(s) Selected`
                                  : "Select Owners"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-800 text-white max-h-60 overflow-y-auto">
                            {trainers
                              .filter(
                                (t) =>
                                  t.role === "FranchiseOwner" ||
                                  t.role === "Owner" ||
                                  t.role === "StudioOwner" ||
                                  t.role === "Admin",
                              )
                              .map((t) => (
                                <SelectItem key={t.id} value={t.id!}>
                                  {t.fullName} ({t.role})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        {/* Display selected owners as chips */}
                        {newNetworkOwnerIds.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {newNetworkOwnerIds.map((id) => {
                              const t = trainers.find((tr) => tr.id === id);
                              return (
                                <Badge
                                  key={id}
                                  onClick={() =>
                                    setNewNetworkOwnerIds(
                                      newNetworkOwnerIds.filter(
                                        (oid) => oid !== id,
                                      ),
                                    )
                                  }
                                  className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-xs"
                                >
                                  {t?.fullName || id} &times;
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <Button
                        type="submit"
                        disabled={isSaving}
                        className="bg-[#F06C22] hover:bg-[#D95B16] text-white font-black uppercase tracking-widest text-xs h-12 rounded-xl shadow-xl shadow-[#F06C22]/10 flex items-center justify-center gap-2"
                      >
                        <Sparkles className="w-4 h-4" />
                        Incorporate Network
                      </Button>
                    </form>
                  </Card>
                )}

                {/* Networks grid list */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-900">
                    <h3 className="text-sm font-black uppercase tracking-widest text-zinc-500 italic">
                      Active Incorporated Networks ({networks.length})
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {[...networks]
                      .sort((a, b) =>
                        (a.state || "").localeCompare(b.state || ""),
                      )
                      .map((network) => {
                        const regionalOwners = network.ownerIds
                          ? trainers.filter((t) =>
                              network.ownerIds!.includes(t.id!),
                            )
                          : network.ownerId
                            ? [
                                trainers.find(
                                  (t) =>
                                    t.id === network.ownerId ||
                                    t.fullName === network.ownerId,
                                ),
                              ].filter(Boolean)
                            : [];
                        const assignedStudios = allStudios.filter(
                          (s) =>
                            network.studioIds?.includes(s.id!) ||
                            s.networkId === network.id,
                        );

                        return (
                          <Card
                            key={network.id}
                            className="bg-slate-900 border border-slate-800 rounded-[28px] overflow-hidden flex flex-col justify-between p-6 relative"
                          >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#F06C22]/60 to-transparent" />

                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="text-xl font-extrabold uppercase italic tracking-tight text-white">
                                    {network.name}
                                  </h4>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                                      REGIONAL FRANCHISE NETWORK
                                    </p>
                                    {network.state && (
                                      <Badge
                                        variant="outline"
                                        className="text-[8px] tracking-widest border-slate-700 text-zinc-400"
                                      >
                                        {network.state}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    handleDeleteNetwork(network.id)
                                  }
                                  className="w-8 h-8 rounded-lg text-zinc-600 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>

                              <div className="flex items-center gap-2 bg-slate-950 p-3 rounded-xl border border-slate-850">
                                <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                                <div className="text-left w-full">
                                  <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest leading-none mb-1">
                                    Franchise Principals
                                  </p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {regionalOwners.length > 0 ? (
                                      regionalOwners.map((ro) => (
                                        <Badge
                                          key={ro?.id}
                                          variant="secondary"
                                          className="bg-slate-900 border border-slate-800 text-white hover:bg-slate-800 text-[10px]"
                                        >
                                          {ro?.fullName || "Unknown"}
                                        </Badge>
                                      ))
                                    ) : (
                                      <p className="text-xs font-black text-white uppercase leading-none">
                                        Jeff (HQ)
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Linked Studios */}
                              <div className="space-y-2 pt-2">
                                <p className="text-[9px] font-bold text-[#F06C22] uppercase tracking-widest">
                                  Incorporated Studios ({assignedStudios.length}
                                  )
                                </p>
                                <div className="space-y-1.5">
                                  {assignedStudios.map((studio) => (
                                    <div
                                      key={studio.id}
                                      className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-xl border border-slate-850"
                                    >
                                      <span className="text-xs font-bold uppercase text-zinc-300 flex items-center gap-1.5">
                                        <Building2 className="w-3.5 h-3.5 text-zinc-550" />
                                        {studio.name}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        onClick={() =>
                                          handleUnlinkStudio(
                                            network.id,
                                            studio.id!,
                                          )
                                        }
                                        className="text-[#F06C22] hover:text-[#F06C22]/80 font-black uppercase text-[8px] tracking-widest px-2.5 py-1 rounded h-auto flex items-center gap-1 hover:bg-[#F06C22]/10"
                                      >
                                        <Unlink2 className="w-3 h-3" />
                                        Unlink
                                      </Button>
                                    </div>
                                  ))}

                                  {assignedStudios.length === 0 && (
                                    <p className="text-[10px] text-zinc-650 font-bold uppercase tracking-widest py-1 italic">
                                      No physical locations linked.
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Link studio selection to this network */}
                            {independentStudios.length > 0 && (
                              <div className="pt-4 mt-6 border-t border-slate-850">
                                <p className="text-[8px] font-black uppercase tracking-widest text-[#F06C22] mb-2 leading-none">
                                  Link Independent Location:
                                </p>
                                <Select
                                  onValueChange={(studioId: string) =>
                                    handleLinkStudio(
                                      network.id as string,
                                      studioId,
                                    )
                                  }
                                >
                                  <SelectTrigger className="bg-slate-950 border-slate-800 text-zinc-300 h-10 rounded-xl text-[10px] font-black uppercase tracking-wider">
                                    <SelectValue placeholder="Add Independent Location" />
                                  </SelectTrigger>
                                  <SelectContent className="bg-slate-900 border-slate-800 text-white">
                                    {independentStudios.map((s) => (
                                      <SelectItem key={s.id} value={s.id!}>
                                        {s.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                          </Card>
                        );
                      })}

                    {networks.length === 0 && (
                      <div className="col-span-full py-20 text-center bg-slate-900/40 rounded-[40px] border border-dashed border-slate-850/80">
                        <Network className="w-12 h-12 text-slate-850 mx-auto mb-4" />
                        <p className="text-sm font-black uppercase tracking-widest text-zinc-500">
                          No active regional network commands incorporated
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: STUDIO LOCATION REGISTRY */}
            {activeTab === "studios" && (
              <div className="space-y-6">
                {(isAdmin ||
                  authTrainer.role === "Founder" ||
                  authTrainer.role === "Admin") && (
                  <Card className="rounded-[32px] bg-slate-900 border border-slate-800 p-8 relative overflow-hidden mb-8">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-[#F06C22]" />
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-[#F06C22]/10 border border-[#F06C22]/20 flex items-center justify-center text-[#F06C22]">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black uppercase italic tracking-tight text-white leading-none">
                          Studio Location Registry
                        </h3>
                        <p className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest mt-1">
                          Register new physical clinic locations into the
                          platform
                        </p>
                      </div>
                    </div>

                    <form
                      onSubmit={handleCreateStudio}
                      className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end"
                    >
                      <div className="space-y-2 relative">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-[#F06C22]">
                          Physical Location Name
                        </Label>
                        <Input
                          placeholder="e.g. Max Strength Chardon"
                          value={newStudioName}
                          onChange={(e) => setNewStudioName(e.target.value)}
                          className="bg-slate-950 border-slate-800 text-white rounded-xl h-12 focus:border-[#F06C22] font-semibold"
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={isSaving}
                        className="bg-[#F06C22] hover:bg-[#D95B16] text-white font-black uppercase tracking-widest text-xs h-12 rounded-xl shadow-xl shadow-[#F06C22]/10 flex items-center justify-center gap-2"
                      >
                        <Building2 className="w-4 h-4" />
                        Incorporate Location
                      </Button>
                    </form>
                  </Card>
                )}

                <h3 className="text-sm font-black uppercase tracking-widest text-zinc-500 italic pb-2 border-b border-slate-900">
                  Location Registry ({manageableStudios.length} Physical
                  Locations)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {manageableStudios.map((studio) => {
                    const parentNetwork = networks.find(
                      (n) =>
                        n.studioIds?.includes(studio.id!) ||
                        studio.networkId === n.id,
                    );
                    const staffRoster = getStaffForStudio(studio.id!);

                    return (
                      <div
                        key={studio.id}
                        onClick={() => setSelectedStudioId(studio.id!)}
                        className="bg-slate-900 border border-slate-800/80 rounded-[28px] p-6 shadow-xl flex flex-col justify-between min-h-[240px] relative overflow-hidden cursor-pointer hover:border-[#F06C22]/50 transition-all group"
                      >
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-slate-850 to-transparent group-hover:via-[#F06C22] transition-colors" />
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <span className="w-8 h-8 rounded-lg bg-slate-950 flex items-center justify-center border border-slate-800 text-[#F06C22] group-hover:bg-[#F06C22] group-hover:text-white transition-colors">
                              <Building2 className="w-4 h-4" />
                            </span>
                            {parentNetwork ? (
                              <span className="text-[8px] font-black uppercase bg-[#F06C22]/15 text-[#F06C22] px-2 py-0.5 rounded-full border border-[#F06C22]/20">
                                {parentNetwork.name}
                              </span>
                            ) : (
                              <span className="text-[8px] font-black uppercase bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full border border-zinc-700/30">
                                Independent Clinic
                              </span>
                            )}
                          </div>

                          <h4 className="font-extrabold uppercase italic tracking-tight text-lg text-white mb-1 leading-none group-hover:text-[#F06C22] transition-colors">
                            {studio.name}
                          </h4>
                          <div className="flex items-center gap-1 text-zinc-500 mb-6 mt-1.5">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="text-[9px] font-bold uppercase tracking-wider truncate">
                              {studio.address || "Address Not Configured"}
                            </span>
                          </div>
                        </div>

                        {/* Staff count footer */}
                        <div className="border-t border-slate-850/80 pt-4 flex items-center justify-between">
                          <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                            AUTHORIZED STAFF:
                          </span>
                          <span className="text-sm font-black text-white">
                            {staffRoster.length}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {manageableStudios.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-slate-900/40 rounded-[40px] border border-dashed border-slate-850/80">
                      <Building2 className="w-12 h-12 text-slate-850 mx-auto mb-4" />
                      <p className="text-sm font-black uppercase tracking-widest text-zinc-400">
                        No manageable studio locations found under your
                        authorization
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
