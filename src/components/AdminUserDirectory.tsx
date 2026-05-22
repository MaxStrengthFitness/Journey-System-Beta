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
} from "lucide-react";
import { OperationType, handleFirestoreError, DocumentIdMissingError } from "../lib/firestore-errors";
import { useDebounce } from "../hooks/useDebounce";
import { cn, getRoleColor, getRoleDisplayName } from "@/lib/utils";
import { CreateTrainerModal } from "./CreateTrainerModal";

interface Props {
  studios: Studio[];
  onRefresh?: (collectionName: "trainers") => Promise<void>;
}

export function AdminUserDirectory({ studios, onRefresh }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400); // Wait 400ms after last keystroke

  const [users, setUsers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Fetch logic
  const fetchUsers = async (viewAll: boolean = false) => {
    setLoading(true);
    try {
      let q;
      if (viewAll) {
        q = query(collection(db, "trainers"), limit(50));
      } else if (debouncedSearch.trim() !== "") {
        const term = debouncedSearch.toLowerCase().trim();
        q = query(
          collection(db, "trainers"),
          where("searchTokens", "array-contains", term),
          limit(50),
        );
      } else {
        setUsers([]);
        setLoading(false);
        return;
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

  useEffect(() => {
    if (debouncedSearch.length >= 2) {
      fetchUsers(false);
    } else if (debouncedSearch.length === 0 && users.length > 0) {
      setUsers([]); // Clear when search goes empty
    }
  }, [debouncedSearch]);

  const handleUpdateRole = async (userId: string | undefined | null, newRole: string) => {
    try {
      if (!userId) {
        throw new DocumentIdMissingError("trainers", OperationType.UPDATE);
      }
      await updateDoc(doc(db, "trainers", userId), { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole as UserRole } : u)),
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

  return (
    <div className="space-y-6">
      <Card className="rounded-[32px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-6 overflow-visible">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 rounded-xl flex flex-col items-center justify-center">
              <UserCog className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase italic tracking-tight text-slate-900 dark:text-white leading-none">
                User Directory
              </h2>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                Manage Roles & System Access
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="text-[10px] font-black uppercase tracking-widest h-10 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              New User
            </Button>
            <Button
              onClick={() => fetchUsers(true)}
              variant="outline"
              className="text-[10px] font-black uppercase tracking-widest h-10 rounded-xl border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
            >
              View All Staff (Max 50)
            </Button>
          </div>
        </div>

        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-12 h-14 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-2xl font-bold font-sans text-sm outline-none focus:border-indigo-500/50"
          />
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-8 text-indigo-500">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="py-8 text-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl">
              <User className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                No users found. Try searching or View All.
              </p>
            </div>
          ) : (
            users.map((user) => (
              <div
                key={user.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-950 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400">
                    {user.initials ||
                      user.fullName.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">
                      {user.fullName}
                    </h3>
                    <p
                      className={cn(
                        "text-[10px] uppercase font-bold tracking-widest",
                        getRoleColor(user.role).split(" ")[0],
                      )}
                    >
                      {getRoleDisplayName(user.role)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      "px-2 py-1 text-[9px] uppercase font-black",
                      getRoleColor(user.role),
                    )}
                  >
                    {getRoleDisplayName(user.role)}
                  </Badge>

                  {editingUserId === user.id ? (
                    <div className="flex items-center gap-2">
                      <Select
                        value={user.role || "LifeTransformer"}
                        onValueChange={(val) => {
                          if (!user.id) return;
                          handleUpdateRole(user.id, val);
                          setEditingUserId(null);
                        }}
                      >
                        <SelectTrigger className="w-36 h-9 text-[10px] font-bold uppercase rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LifeTransformer">
                            Life Transformer
                          </SelectItem>
                          <SelectItem value="StudioLeader">
                            Studio Leader
                          </SelectItem>
                          <SelectItem value="Owner">Owner</SelectItem>
                          <SelectItem value="Founder">Founder</SelectItem>
                          <SelectItem value="Admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        className="h-9 text-[10px]"
                        onClick={() => setEditingUserId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-lg"
                        onClick={() => {
                          if (!user.id) return;
                          setEditingUserId(user.id);
                        }}
                      >
                        <Edit className="w-4 h-4 text-slate-500" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-lg hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                        onClick={() => {
                          if (!user.id) return;
                          handleDeleteUser(user.id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-slate-400" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <CreateTrainerModal
        isOpen={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onSubmit={handleCreateUser}
      />
    </div>
  );
}
