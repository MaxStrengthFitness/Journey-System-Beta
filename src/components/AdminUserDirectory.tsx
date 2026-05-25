import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  limit,
  where,
  addDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { Trainer, Studio, CreateTrainerPayload, UserRole } from "../types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Edit,
  Trash2,
  UserCog,
  User,
  ShieldCheck,
  Loader2,
  Plus,
  Home,
  Key,
  Sparkles,
  Lock,
  Mail,
  Filter,
  Building2,
  CalendarDays,
  Activity,
} from "lucide-react";
import { OperationType, handleFirestoreError, DocumentIdMissingError } from "../lib/firestore-errors";
import { useDebounce } from "../hooks/useDebounce";
import { cn, getRoleColor, getRoleDisplayName } from "@/lib/utils";
import { CreateTrainerModal } from "./CreateTrainerModal";
import { EditTrainerModal } from "./EditTrainerModal";

interface Props {
  studios: Studio[];
  onRefresh?: (collectionName: "trainers") => Promise<void>;
}

export function AdminUserDirectory({ studios, onRefresh }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400); // Wait 400ms after last keystroke

  const [users, setUsers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<Trainer | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Filters state
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [studioFilter, setStudioFilter] = useState<string>("all");

  // Fetch logic
  const fetchUsers = async (viewAll: boolean = false) => {
    setLoading(true);
    try {
      let q;
      if (viewAll || debouncedSearch.trim() === "") {
        q = query(collection(db, "trainers"), limit(100));
      } else {
        const term = debouncedSearch.toLowerCase().trim();
        q = query(
          collection(db, "trainers"),
          where("searchTokens", "array-contains", term),
          limit(100),
        );
      }

      const snap = await getDocs(q);
      const data = snap.docs.map(
        (doc) => ({ id: doc.id, ...(doc.data() as Omit<Trainer, "id">) }) as Trainer,
      );

      setUsers(data);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, "trainers");
    } finally {
      setLoading(false);
    }
  };

  // Initial load on mount and when search term updates
  useEffect(() => {
    if (debouncedSearch.length >= 2) {
      fetchUsers(false);
    } else if (debouncedSearch.length === 0) {
      fetchUsers(true); // Load all by default if search is cleared
    }
  }, [debouncedSearch]);

  const handleUpdateTrainerFields = async (updatedFields: Partial<Trainer>) => {
    if (!editingTrainer || !editingTrainer.id) return;
    try {
      await updateDoc(doc(db, "trainers", editingTrainer.id), updatedFields);
      setUsers((prev) =>
        prev.map((u) => (u.id === editingTrainer.id ? { ...u, ...updatedFields } : u)),
      );
      await onRefresh?.("trainers");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "trainers");
    }
  };

  const handleDeleteUser = async (userId: string | undefined | null) => {
    try {
      if (!userId) {
        throw new DocumentIdMissingError("trainers", OperationType.DELETE);
      }
      if (
        !window.confirm(
          "Are you sure you want to permanently delete this user? This action cannot be reversed.",
        )
      )
        return;
      await deleteDoc(doc(db, "trainers", userId));
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      await onRefresh?.("trainers");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, "trainers");
    }
  };

  const handleCreateUser = async (trainerData: CreateTrainerPayload) => {
    try {
      const role: UserRole = trainerData.isOwner ? "Owner" : "LifeTransformer";
      const ref = await addDoc(collection(db, "trainers"), {
        ...trainerData,
        role: role,
        systemStatus: "active",
        createdAt: new Date().toISOString(),
      });
      // Add the newly created user to the state
      const newUser: Trainer = {
        id: ref.id,
        fullName: trainerData.fullName,
        initials: trainerData.initials,
        pin: trainerData.pin,
        pinHash: trainerData.pinHash,
        primaryHomeStudioId: trainerData.primaryHomeStudioId,
        accessibleStudioIds: trainerData.accessibleStudioIds,
        activeGuestStudioIds: trainerData.activeGuestStudioIds || [],
        role: role,
        isVisibleOnCalendar: trainerData.isVisibleOnCalendar,
        searchTokens: trainerData.searchTokens,
        email: trainerData.email,
        createdAt: new Date().toISOString(),
      };
      setUsers((prev) => [newUser, ...prev]);
      await onRefresh?.("trainers");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "trainers");
    }
  };

  const getStudioName = (studioId: string) => {
    const studio = studios.find((s) => s.id === studioId);
    return studio ? studio.name : "Unknown Studio";
  };

  // Perform multi-axis filtration
  const filteredUsers = users.filter((user) => {
    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const matchesStudio =
      studioFilter === "all" ||
      user.primaryHomeStudioId === studioFilter ||
      user.accessibleStudioIds?.includes(studioFilter) ||
      user.activeGuestStudioIds?.includes(studioFilter);
    return matchesRole && matchesStudio;
  });

  return (
    <div className="space-y-6">
      <Card className="rounded-[32px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-6 overflow-visible">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 rounded-xl flex flex-col items-center justify-center">
              <UserCog className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase italic tracking-tight text-slate-900 dark:text-white leading-none">
                Staff & User Directory
              </h2>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                Manage Roles, Studio Involvements & Credentials
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="text-[11px] font-black uppercase tracking-widest h-10 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              New User
            </Button>
            <Button
              onClick={() => fetchUsers(true)}
              variant="outline"
              className="text-[11px] font-black uppercase tracking-widest h-10 rounded-xl border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
            >
              Force Directory Refresh
            </Button>
          </div>
        </div>

        {/* Dual Axis Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-8">
          {/* Main search bar */}
          <div className="relative md:col-span-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl font-bold font-sans text-sm focus:border-indigo-500"
            />
          </div>

          {/* Role Filter */}
          <div className="md:col-span-3">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-black uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate">Role: {roleFilter === "all" ? "All Roles" : getRoleDisplayName(roleFilter as UserRole)}</span>
                </div>
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200 dark:border-slate-800">
                <SelectItem value="all" className="font-bold uppercase text-[11px]">All Roles</SelectItem>
                <SelectItem value="LifeTransformer" className="font-bold uppercase text-[11px]">Life Transformer</SelectItem>
                <SelectItem value="StudioLeader" className="font-bold uppercase text-[11px]">Studio Leader</SelectItem>
                <SelectItem value="Owner" className="font-bold uppercase text-[11px]">Owner</SelectItem>
                <SelectItem value="Founder" className="font-bold uppercase text-[11px]">Founder</SelectItem>
                <SelectItem value="Admin" className="font-bold uppercase text-[11px]">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Studio Filter */}
          <div className="md:col-span-3">
            <Select value={studioFilter} onValueChange={setStudioFilter}>
              <SelectTrigger className="h-12 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-black uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate">Studio: {studioFilter === "all" ? "All Locations" : getStudioName(studioFilter)}</span>
                </div>
              </SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200 dark:border-slate-800">
                <SelectItem value="all" className="font-bold uppercase text-[11px]">All Locations</SelectItem>
                {studios.map((s) => (
                  <SelectItem key={s.id} value={s.id || ""} className="font-bold uppercase text-[11px]">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-12 text-indigo-500">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl">
              <User className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-sm font-black uppercase tracking-widest text-slate-400">
                No users match the search filters.
              </p>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-bold">
                Try adjustment of your search term or selection controls.
              </p>
            </div>
          ) : (
            filteredUsers.map((user) => {
              const hasPinSet = !!(user.pin || user.pinHash);
              const otherAccess = (user.accessibleStudioIds || []).filter(
                (id) => id !== user.primaryHomeStudioId,
              );
              const guestAccess = user.activeGuestStudioIds || [];

              return (
                <div
                  key={user.id}
                  className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 rounded-3xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/30 hover:bg-white dark:hover:bg-slate-950 transition-all shadow-sm"
                >
                  {/* Basic Profile Description */}
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-sm shadow-sm shrink-0">
                      {user.initials || user.fullName.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-black text-slate-900 dark:text-white tracking-tight truncate text-base leading-none">
                          {user.fullName}
                        </h3>
                        <Badge
                          variant="outline"
                          className={cn(
                            "px-2.5 py-0.5 text-[10px] uppercase font-black tracking-widest rounded-md",
                            getRoleColor(user.role),
                          )}
                        >
                          {getRoleDisplayName(user.role)}
                        </Badge>
                        {hasPinSet && (
                          <Badge
                            variant="secondary"
                            className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border border-emerald-100/50 dark:border-emerald-900/40 px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-md flex items-center gap-1"
                          >
                            <Lock className="w-2.5 h-2.5" /> PIN Locked
                          </Badge>
                        )}
                        {user.isVisibleOnCalendar === false && (
                          <Badge
                            variant="outline"
                            className="bg-yellow-50 dark:bg-yellow-950/20 text-yellow-600 border-yellow-200/50 px-2 py-0.5 text-[9px] font-extrabold uppercase rounded-md"
                          >
                            Hidden on Calendar
                          </Badge>
                        )}
                      </div>

                      {/* Details row */}
                      <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs font-bold text-slate-500 dark:text-slate-400">
                        {user.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            {user.email}
                          </span>
                        )}
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                          Initials: {user.initials}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Studio Involvements Dashboard Display */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-white dark:bg-slate-900/20 border border-slate-100 dark:border-slate-800/60 p-3 rounded-2xl lg:min-w-[340px] max-w-full">
                    {/* Primary Studio */}
                    <div className="space-y-1">
                      <span className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 flex items-center gap-1">
                        <Home className="w-3 h-3 text-[#F06C22]" /> Primary Facility
                      </span>
                      <span className="block text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                        {getStudioName(user.primaryHomeStudioId)}
                      </span>
                    </div>

                    {/* Shared/Guest Staffing columns */}
                    {(otherAccess.length > 0 || guestAccess.length > 0) && (
                      <div className="h-px sm:h-8 w-full sm:w-px bg-slate-100 dark:bg-slate-800 shrink-0" />
                    )}

                    <div className="space-y-1 min-w-0">
                      {otherAccess.length > 0 && (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#F06C22] shrink-0 flex items-center gap-0.5">
                            <Key className="w-2.5 h-2.5" /> Staff:
                          </span>
                          <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 truncate max-w-[200px]">
                            {otherAccess.map((id) => getStudioName(id)).join(", ")}
                          </span>
                        </div>
                      )}
                      
                      {guestAccess.length > 0 && (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-indigo-500 shrink-0 flex items-center gap-0.5">
                            <Sparkles className="w-2.5 h-2.5" /> Guest:
                          </span>
                          <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 truncate max-w-[200px]">
                            {guestAccess.map((id) => getStudioName(id)).join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="flex items-center justify-end gap-2.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 rounded-xl px-4 text-xs font-black uppercase tracking-wider flex items-center gap-1 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                      onClick={() => {
                        setEditingTrainer(user);
                        setIsEditModalOpen(true);
                      }}
                    >
                      <Edit className="w-3.5 h-3.5 text-slate-500" />
                      Configure
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-xl border-slate-200 dark:border-slate-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                      onClick={() => handleDeleteUser(user.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-slate-400" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <CreateTrainerModal
        isOpen={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSubmit={handleCreateUser}
      />

      <EditTrainerModal
        trainer={editingTrainer}
        studios={studios}
        isOpen={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        onSave={handleUpdateTrainerFields}
      />
    </div>
  );
}
