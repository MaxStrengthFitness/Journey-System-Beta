import React, { useState, useEffect } from "react";
import {
  X,
  User,
  HeartPulse,
  Target,
  Briefcase,
  Calendar,
  Key,
  Shield,
  Image as ImageIcon,
} from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Client, ClientEvent, Trainer } from "../types";
import { useActiveStudio } from "../ActiveStudioContext";
import { useToast } from "../contexts/ToastContext";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OccupationSelect } from "./OccupationSelect";
import { CLINICAL_FLAGS_MATRIX } from "../data/clinical-matrix";

interface ClientInfoSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  authTrainer: Trainer | null;
  defaultTab?: string;
}

export const ClientInfoSheet: React.FC<ClientInfoSheetProps> = ({
  isOpen,
  onOpenChange,
  client,
  authTrainer,
  defaultTab,
}) => {
  const { success: toastSuccess, error: toastError } = useToast();
  const { availableStudios: studios } = useActiveStudio();
  const [formData, setFormData] = useState<Partial<Client>>({});
  const [dirtyFields, setDirtyFields] = useState<Set<keyof Client>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("identity");

  // Initialize form state
  useEffect(() => {
    if (isOpen && client) {
      setActiveTab(defaultTab || "identity");
      setFormData({
        firstName: client.firstName || "",
        lastName: client.lastName || "",
        dateOfBirth: client.dateOfBirth || "",
        gender: client.gender || "",
        phone: client.phone || "",
        email: client.email || "",
        address: client.address || "",
        emergencyContactName: client.emergencyContactName || "",
        emergencyContactPhone: client.emergencyContactPhone || "",
        occupation: client.occupation || "",
        isRetired: client.isRetired || false,
        activityLevel: client.activityLevel || "Sedentary",
        recoveryMetric: client.recoveryMetric || "Average",
        experienceLevel: client.experienceLevel || "Beginner",
        trainingPedigree: client.trainingPedigree || "Novice",
        leadSource: client.leadSource || "",
        referredBy: client.referredBy || "",
        clinicalFlags: client.clinicalFlags || [],
        medicalHistory: client.medicalHistory || "",
        clinicalNotes: client.clinicalNotes || "",
        height: client.height || "",
        weight: client.weight || "",
        discoveryNotes: client.discoveryNotes || "",
        globalNotes: client.globalNotes || "",
        smartGoal: (client as any).smartGoal || "",
        packageTier: client.packageTier || "None",
        approvedCrossTrainStudioIds: client.approvedCrossTrainStudioIds || [],
        events: client.events || [],
      });
      setDirtyFields(new Set());
    }
  }, [isOpen, client]);

  const updateField = (key: keyof Client, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    const initialVal = client[key];

    // Simple array equality check for flags/studios
    const isArrayEqual = (a: any[], b: any[]) => {
      if (a === b) return true;
      if (a == null || b == null) return false;
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; ++i) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    };

    setDirtyFields((prev) => {
      const next = new Set(prev);
      let isDifferent = false;

      if (Array.isArray(value) && Array.isArray(initialVal)) {
        isDifferent = !isArrayEqual(value, initialVal);
      } else {
        isDifferent = value !== initialVal;
      }

      // Handle undefined cases gracefully
      if (
        initialVal === undefined &&
        (value === "" ||
          value === false ||
          (Array.isArray(value) && value.length === 0))
      ) {
        isDifferent = false;
      }

      if (isDifferent) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (dirtyFields.size === 0 || !client.id) return;
    setIsSaving(true);
    try {
      const changes: Partial<Client> = {};
      dirtyFields.forEach((key) => {
        changes[key] = formData[key] as any;
      });
      if (authTrainer) (changes as any).lastUpdatedBy = authTrainer.id;

      await updateDoc(doc(db, "clients", client.id), changes);

      setDirtyFields(new Set());
      toastSuccess("Client profile info saved successfully.");
      // Close sheet after save? Let's leave it open so they see success.
    } catch (error) {
      console.error("Error saving client info:", error);
      toastError("Failed to save client info.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleFlag = (flagId: string) => {
    const current = formData.clinicalFlags || [];
    const updated = current.includes(flagId)
      ? current.filter((f) => f !== flagId)
      : [...current, flagId];
    updateField("clinicalFlags", updated);
  };

  const toggleCrossTrainStudio = (studioId: string) => {
    const current = formData.approvedCrossTrainStudioIds || [];
    const updated = current.includes(studioId)
      ? current.filter((id) => id !== studioId)
      : [...current, studioId];
    updateField("approvedCrossTrainStudioIds", updated);
  };

  const handleAddEvent = () => {
    const current = formData.events || [];
    const newEvent: ClientEvent = {
      id: Math.random().toString(36).substr(2, 9),
      title: "New Event",
      type: "Other",
      date: new Date().toISOString().split("T")[0],
      priority: "Medium",
    };
    updateField("events", [...current, newEvent]);
  };

  const updateEvent = (
    eventId: string,
    key: keyof ClientEvent,
    value: string,
  ) => {
    const current = formData.events || [];
    updateField(
      "events",
      current.map((e) => (e.id === eventId ? { ...e, [key]: value } : e)),
    );
  };

  const deleteEvent = (eventId: string) => {
    const current = formData.events || [];
    updateField(
      "events",
      current.filter((e) => e.id !== eventId),
    );
  };

  // Label UI convenience
  const FormLabel = ({ children }: { children: React.ReactNode }) => (
    <Label className="text-[11px] font-bold uppercase tracking-widest text-ink-d2 opacity-70 ml-1">
      {children}
    </Label>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex flex-col bg-bg-l border-none overflow-hidden m-0 animate-in fade-in zoom-in-[0.98] duration-200">
      <div className="p-6 md:px-10 md:py-8 border-b border-div-l flex flex-row items-start justify-between gap-2 shadow-sm bg-surface-1">
        <div>
          <h2 className="text-3xl font-black uppercase italic tracking-tighter text-ink-l1">
            Client Information
          </h2>
          <p className="text-sm font-bold uppercase tracking-widest text-cyan flex items-center gap-2 mt-1">
            {client.firstName} {client.lastName}
            {client.mindbodyId && (
              <>
                <span className="text-ink-l3 text-[10px]">•</span>
                <span className="text-ink-l3">MBO ID: {client.mindbodyId}</span>
              </>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onOpenChange(false)}
          className="rounded-xl w-12 h-12 text-ink-l3 hover:text-ink-l1 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-6 h-6" />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden flex max-w-7xl w-full mx-auto">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col md:flex-row overflow-hidden w-full m-0 p-0"
        >
          <div className="px-6 py-4 md:py-8 md:w-64 border-b md:border-b-0 md:border-r border-div-l bg-bg-l">
            <TabsList className="bg-transparent border-none p-0 flex md:flex-col overflow-x-auto no-scrollbar gap-2 md:gap-4 md:h-auto items-start justify-start w-full">
              <TabsTrigger
                value="identity"
                className="data-[state=active]:bg-cyan/10 data-[state=active]:text-cyan data-[state=active]:shadow-none rounded-xl text-ink-l3 text-[11px] font-bold uppercase tracking-widest h-10 px-4 transition-all border border-transparent data-[state=active]:border-cyan/20 shrink-0 w-full justify-start"
              >
                Identity
              </TabsTrigger>
              <TabsTrigger
                value="lifestyle"
                className="data-[state=active]:bg-cyan/10 data-[state=active]:text-cyan data-[state=active]:shadow-none rounded-xl text-ink-l3 text-[11px] font-bold uppercase tracking-widest h-10 px-4 transition-all border border-transparent data-[state=active]:border-cyan/20 shrink-0 w-full justify-start"
              >
                Lifestyle
              </TabsTrigger>
              <TabsTrigger
                value="medical"
                className="data-[state=active]:bg-cyan/10 data-[state=active]:text-cyan data-[state=active]:shadow-none rounded-xl text-ink-l3 text-[11px] font-bold uppercase tracking-widest h-10 px-4 transition-all border border-transparent data-[state=active]:border-cyan/20 shrink-0 w-full justify-start"
              >
                Medical
              </TabsTrigger>
              <TabsTrigger
                value="goals"
                className="data-[state=active]:bg-cyan/10 data-[state=active]:text-cyan data-[state=active]:shadow-none rounded-xl text-ink-l3 text-[11px] font-bold uppercase tracking-widest h-10 px-4 transition-all border border-transparent data-[state=active]:border-cyan/20 shrink-0 w-full justify-start"
              >
                Goals
              </TabsTrigger>
              <TabsTrigger
                value="admin"
                className="data-[state=active]:bg-cyan/10 data-[state=active]:text-cyan data-[state=active]:shadow-none rounded-xl text-ink-l3 text-[11px] font-bold uppercase tracking-widest h-10 px-4 transition-all border border-transparent data-[state=active]:border-cyan/20 shrink-0 w-full justify-start"
              >
                Admin
              </TabsTrigger>
              <TabsTrigger
                value="events"
                className="data-[state=active]:bg-cyan/10 data-[state=active]:text-cyan data-[state=active]:shadow-none rounded-xl text-ink-l3 text-[11px] font-bold uppercase tracking-widest h-10 px-4 transition-all border border-transparent data-[state=active]:border-cyan/20 shrink-0 w-full justify-start"
              >
                Events
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 p-6 md:p-10 bg-bg-l-card">
            <div className="max-w-3xl">
              {/* 1. Identity & Contact */}
              <TabsContent value="identity" className="m-0 space-y-8">
                <div className="flex flex-col gap-6">
                  <div className="flex items-center gap-4 p-6 border border-div-l rounded-3xl bg-surface-1 shadow-sm">
                    <div className="w-20 h-20 rounded-full bg-slate-200 dark:bg-slate-800 border-2 border-div-l flex items-center justify-center text-ink-l3 shrink-0">
                      <ImageIcon strokeWidth={1} size={36} />
                    </div>
                    <div className="flex-1">
                      <p className="text-[12px] font-black uppercase tracking-widest text-ink-l2">
                        Avatar Profile
                      </p>
                      <p className="text-xs text-ink-l3 opacity-70 mt-1">
                        Upload photo feature pending integration.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 flex flex-col">
                      <FormLabel>First Name</FormLabel>
                      <Input
                        className="h-12 border-div-l rounded-xl bg-surface-1 font-medium"
                        value={formData.firstName || ""}
                        onChange={(e) =>
                          updateField("firstName", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2 flex flex-col">
                      <FormLabel>Last Name</FormLabel>
                      <Input
                        className="h-12 border-div-l rounded-xl bg-surface-1 font-medium"
                        value={formData.lastName || ""}
                        onChange={(e) =>
                          updateField("lastName", e.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2 flex flex-col">
                      <FormLabel>Date of Birth</FormLabel>
                      <Input
                        type="date"
                        className="h-12 border-div-l rounded-xl bg-surface-1 font-medium"
                        value={formData.dateOfBirth || ""}
                        onChange={(e) =>
                          updateField("dateOfBirth", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2 flex flex-col">
                      <FormLabel>Gender</FormLabel>
                      <Select
                        value={formData.gender || ""}
                        onValueChange={(v) => updateField("gender", v)}
                      >
                        <SelectTrigger className="h-12 border-div-l rounded-xl bg-surface-1 font-medium">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Male">Male</SelectItem>
                          <SelectItem value="Female">Female</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 flex flex-col">
                      <FormLabel>MindBody ID</FormLabel>
                      <Input
                        className="h-12 border-div-l rounded-xl bg-surface-1 font-medium font-mono text-sm"
                        value={(formData as any).mindbodyId || ""}
                        onChange={(e) =>
                          updateField("mindbodyId" as any, e.target.value)
                        }
                        placeholder="e.g. 100005423"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 flex flex-col mt-4 pt-6 md:pt-8 border-t border-div-l">
                    <FormLabel>Phone</FormLabel>
                    <Input
                      className="h-12 border-div-l rounded-xl bg-surface-1 font-medium"
                      value={formData.phone || ""}
                      onChange={(e) => updateField("phone", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 flex flex-col">
                    <FormLabel>Email</FormLabel>
                    <Input
                      type="email"
                      className="h-12 border-div-l rounded-xl bg-surface-1 font-medium"
                      value={formData.email || ""}
                      onChange={(e) => updateField("email", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 flex flex-col">
                    <FormLabel>Address</FormLabel>
                    <Input
                      className="h-12 border-div-l rounded-xl bg-surface-1 font-medium"
                      value={formData.address || ""}
                      onChange={(e) => updateField("address", e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 pt-6 md:pt-8 border-t border-div-l">
                    <div className="space-y-2 flex flex-col">
                      <FormLabel>Emergency Contact</FormLabel>
                      <Input
                        className="h-12 border-div-l rounded-xl bg-surface-1 font-medium"
                        value={formData.emergencyContactName || ""}
                        onChange={(e) =>
                          updateField("emergencyContactName", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2 flex flex-col">
                      <FormLabel>Emergency Phone</FormLabel>
                      <Input
                        className="h-12 border-div-l rounded-xl bg-surface-1 font-medium"
                        value={formData.emergencyContactPhone || ""}
                        onChange={(e) =>
                          updateField("emergencyContactPhone", e.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* 2. Lifestyle */}
              <TabsContent value="lifestyle" className="m-0 space-y-8">
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-[1fr_auto] gap-6 items-end">
                    <div className="space-y-2 flex flex-col">
                      <FormLabel>Occupation</FormLabel>
                      <Input
                        className="h-12 border-div-l rounded-xl bg-surface-1 font-medium"
                        value={formData.occupation || ""}
                        onChange={(e) =>
                          updateField("occupation", e.target.value)
                        }
                      />
                    </div>
                    <div className="flex flex-col space-y-3 mb-2 px-4 items-center border border-div-l p-2 rounded-xl bg-surface-1">
                      <FormLabel>Retired</FormLabel>
                      <Switch
                        checked={formData.isRetired || false}
                        onCheckedChange={(v) => updateField("isRetired", v)}
                        className="data-[state=checked]:bg-cyan"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2 flex flex-col">
                      <FormLabel>Activity Level</FormLabel>
                      <Select
                        value={formData.activityLevel || ""}
                        onValueChange={(v) => updateField("activityLevel", v)}
                      >
                        <SelectTrigger className="h-12 border-div-l rounded-xl bg-surface-1 font-medium">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Sedentary">Sedentary</SelectItem>
                          <SelectItem value="Light">Light</SelectItem>
                          <SelectItem value="Moderate">Moderate</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                          <SelectItem value="Manual Labor">
                            Manual Labor
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 flex flex-col">
                      <FormLabel>Recovery Metric</FormLabel>
                      <Select
                        value={formData.recoveryMetric || ""}
                        onValueChange={(v) => updateField("recoveryMetric", v)}
                      >
                        <SelectTrigger className="h-12 border-div-l rounded-xl bg-surface-1 font-medium">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Poor">Poor</SelectItem>
                          <SelectItem value="Average">Average</SelectItem>
                          <SelectItem value="Optimal">Optimal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 border-t border-div-l pt-6 md:pt-8">
                    <div className="space-y-2 flex flex-col">
                      <FormLabel>Experience Level</FormLabel>
                      <Select
                        value={formData.experienceLevel || ""}
                        onValueChange={(v) => updateField("experienceLevel", v)}
                      >
                        <SelectTrigger className="h-12 border-div-l rounded-xl bg-surface-1 font-medium">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Beginner">Beginner</SelectItem>
                          <SelectItem value="Intermediate">
                            Intermediate
                          </SelectItem>
                          <SelectItem value="Advanced">Advanced</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 flex flex-col">
                      <FormLabel>Training Pedigree</FormLabel>
                      <Select
                        value={formData.trainingPedigree || ""}
                        onValueChange={(v) =>
                          updateField("trainingPedigree", v)
                        }
                      >
                        <SelectTrigger className="h-12 border-div-l rounded-xl bg-surface-1 font-medium">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Novice">Novice</SelectItem>
                          <SelectItem value="Intermediate">
                            Intermediate
                          </SelectItem>
                          <SelectItem value="Advanced">Advanced</SelectItem>
                          <SelectItem value="Protocol Veteran">
                            Protocol Veteran
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4 border-t border-div-l pt-6 md:pt-8">
                    <div className="space-y-2 flex flex-col">
                      <FormLabel>Lead Source</FormLabel>
                      <Input
                        className="h-12 border-div-l rounded-xl bg-surface-1 font-medium"
                        value={formData.leadSource || ""}
                        onChange={(e) =>
                          updateField("leadSource", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2 flex flex-col">
                      <FormLabel>Referred By</FormLabel>
                      <Input
                        className="h-12 border-div-l rounded-xl bg-surface-1 font-medium"
                        value={formData.referredBy || ""}
                        onChange={(e) =>
                          updateField("referredBy", e.target.value)
                        }
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* 3. Medical */}
              <TabsContent value="medical" className="m-0 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-div-l pb-8">
                  <div className="space-y-2 flex flex-col">
                    <FormLabel>Height</FormLabel>
                    <Input
                      className="h-12 border-div-l rounded-xl bg-surface-1 font-medium"
                      placeholder="e.g. 5'10&quot;"
                      value={formData.height || ""}
                      onChange={(e) => updateField("height", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2 flex flex-col">
                    <FormLabel>Weight</FormLabel>
                    <Input
                      className="h-12 border-div-l rounded-xl bg-surface-1 font-medium"
                      placeholder="lbs"
                      value={formData.weight || ""}
                      onChange={(e) => updateField("weight", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <FormLabel>Clinical Flags</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {CLINICAL_FLAGS_MATRIX.map((flag) => {
                      const isSelected = (
                        formData.clinicalFlags || []
                      ).includes(flag.id);
                      return (
                        <Badge
                          key={flag.id}
                          variant="outline"
                          className={`cursor-pointer px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border-2 transition-all ${
                            isSelected
                              ? "bg-red-500/10 text-red-500 border-red-500/30 shadow-sm"
                              : "bg-surface-1 text-ink-l3 border-div-l hover:border-ink-l3"
                          }`}
                          onClick={() => toggleFlag(flag.id)}
                        >
                          {flag.label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 flex flex-col pt-6 md:pt-8 border-t border-div-l">
                  <FormLabel>Medical History</FormLabel>
                  <Textarea
                    className="min-h-40 p-5 text-sm border-div-l rounded-2xl bg-surface-1 font-medium leading-relaxed"
                    value={formData.medicalHistory || ""}
                    onChange={(e) =>
                      updateField("medicalHistory", e.target.value)
                    }
                  />
                </div>

                <div className="space-y-2 flex flex-col border-t border-div-l pt-6 md:pt-8">
                  <FormLabel>Clinical Notes</FormLabel>
                  <Textarea
                    className="min-h-40 p-5 text-sm border-div-l rounded-2xl bg-surface-1 font-medium leading-relaxed focus:border-red-500/50 transition-colors"
                    placeholder="Trainer-specific contraindications or constraints"
                    value={formData.clinicalNotes || ""}
                    onChange={(e) =>
                      updateField("clinicalNotes", e.target.value)
                    }
                  />
                </div>
              </TabsContent>

              {/* 4. Goals */}
              <TabsContent value="goals" className="m-0 space-y-8">
                <div className="space-y-2 flex flex-col">
                  <FormLabel>Discovery / Primary "Why"</FormLabel>
                  <Textarea
                    className="min-h-50 p-5 text-[15px] border-div-l rounded-3xl bg-surface-1 leading-relaxed font-medium"
                    placeholder="Client intent and motivation for starting."
                    value={formData.globalNotes || ""}
                    onChange={(e) => updateField("globalNotes", e.target.value)}
                  />
                </div>
                <div className="space-y-2 flex flex-col mt-6 border-t border-div-l pt-8">
                  <FormLabel>Coach Strategy Notes</FormLabel>
                  <Textarea
                    className="min-h-40 p-5 text-sm border-div-l rounded-2xl bg-surface-1 leading-relaxed font-medium"
                    placeholder="How do you coach this client? What cues do they respond to?"
                    value={formData.discoveryNotes || ""}
                    onChange={(e) =>
                      updateField("discoveryNotes", e.target.value)
                    }
                  />
                </div>
                <div className="space-y-2 flex flex-col mt-6 border-t border-div-l pt-8">
                  <FormLabel>SMART Goal</FormLabel>
                  <Input
                    className="h-14 text-lg border-div-l rounded-2xl bg-surface-1 font-semibold"
                    placeholder="e.g. Skiing trip ready by Nov 15th"
                    value={(formData as any).smartGoal || ""}
                    onChange={(e) =>
                      updateField("smartGoal" as any, e.target.value)
                    }
                  />
                </div>
              </TabsContent>

              {/* 5. Admin */}
              <TabsContent value="admin" className="m-0 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 flex flex-col">
                    <FormLabel>Package Tier</FormLabel>
                    <Select
                      value={formData.packageTier || ""}
                      onValueChange={(v) => updateField("packageTier", v)}
                    >
                      <SelectTrigger className="h-12 border-div-l rounded-xl bg-surface-1 font-medium">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="None">None</SelectItem>
                        <SelectItem value="6-Month">6-Month</SelectItem>
                        <SelectItem value="12-Month">12-Month</SelectItem>
                        <SelectItem value="18-Month">18-Month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 flex flex-col">
                    <FormLabel>Home Studio</FormLabel>
                    <div className="h-12 border-div-l rounded-xl bg-slate-50 dark:bg-slate-900 border flex items-center px-4 opacity-70">
                      <span className="text-sm font-bold text-ink-l2">
                        {studios.find((s) => s.id === client.homeStudioId)
                          ?.name || client.homeStudioId}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6  mt-2 border-t border-div-l pt-8">
                  <div className="space-y-2 flex flex-col">
                    <FormLabel>Remaining Sessions</FormLabel>
                    <div className="h-12 border-div-l rounded-xl bg-slate-50 dark:bg-slate-900 border flex items-center px-4 opacity-70">
                      <span className="text-sm font-bold text-ink-l2">
                        {client.remainingSessions || 0}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2 flex flex-col">
                    <FormLabel>First Session</FormLabel>
                    <div className="h-12 border-div-l rounded-xl bg-slate-50 dark:bg-slate-900 border flex items-center px-4 opacity-70">
                      <span className="text-sm font-bold text-ink-l2">
                        Not extracted
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 mt-6 border-t border-div-l pt-8">
                  <FormLabel>Approved Cross-Train Studios</FormLabel>
                  <div className="flex flex-wrap gap-2">
                    {studios
                      .filter((s) => s.id !== client.homeStudioId)
                      .map((studio) => {
                        const isSelected = (
                          formData.approvedCrossTrainStudioIds || []
                        ).includes(studio.id!);
                        return (
                          <Badge
                            key={studio.id}
                            variant="outline"
                            className={`cursor-pointer px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border-2 transition-all ${
                              isSelected
                                ? "bg-cyan/10 text-cyan border-cyan/30 shadow-sm"
                                : "bg-surface-1 text-ink-l3 border-div-l hover:border-ink-l3"
                            }`}
                            onClick={() => toggleCrossTrainStudio(studio.id!)}
                          >
                            {studio.name}
                          </Badge>
                        );
                      })}
                    {studios.length <= 1 && (
                      <p className="text-xs text-ink-l3 font-medium">
                        No other studios available for cross-training.
                      </p>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* 6. Events */}
              <TabsContent value="events" className="m-0 space-y-8">
                <div className="space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b border-div-l">
                    <FormLabel>Client Event Horizon</FormLabel>
                    <Button
                      onClick={handleAddEvent}
                      size="sm"
                      className="h-10 px-6 rounded-xl bg-cyan hover:bg-cyan/90 text-white font-black uppercase tracking-widest text-[11px] shadow-sm"
                    >
                      + Add Event
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {!formData.events?.length && (
                      <div className="p-12 text-center border-2 border-dashed border-div-l rounded-3xl bg-surface-1/50">
                        <p className="text-sm text-ink-l3 font-medium">
                          No events scheduled. Track vacations, medical events,
                          and scans here.
                        </p>
                      </div>
                    )}
                    {(formData.events || []).map((event) => (
                      <div
                        key={event.id}
                        className="p-6 border border-div-l rounded-3xl bg-surface-1 shadow-sm space-y-4 relative overflow-hidden group"
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteEvent(event.id!)}
                          className="absolute top-2 right-2 h-10 w-10 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-5 h-5" />
                        </Button>
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_200px] gap-4 pr-10">
                          <Input
                            value={event.title}
                            onChange={(e) =>
                              updateEvent(event.id!, "title", e.target.value)
                            }
                            className="font-bold border-div-l h-12 text-lg bg-white dark:bg-slate-900"
                            placeholder="Event Title"
                          />
                          <div className="flex flex-col md:flex-row gap-2">
                            <Input
                              type="date"
                              value={event.date}
                              onChange={(e) =>
                                updateEvent(event.id!, "date", e.target.value)
                              }
                              className="border-div-l text-sm font-bold h-12 bg-white dark:bg-slate-900 w-full"
                            />
                            {(event.type === "Vacation" ||
                              event.type === "Medical" ||
                              event.type === "Snowbird" ||
                              event.type === "Alert" ||
                              event.endDate) && (
                              <Input
                                type="date"
                                value={event.endDate || ""}
                                onChange={(e) =>
                                  updateEvent(
                                    event.id!,
                                    "endDate",
                                    e.target.value,
                                  )
                                }
                                className="border-div-l text-sm font-bold h-12 bg-white dark:bg-slate-900 w-full"
                                placeholder="End Date"
                              />
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4">
                          <Select
                            value={event.type}
                            onValueChange={(v) =>
                              updateEvent(event.id!, "type", v)
                            }
                          >
                            <SelectTrigger className="h-12 text-sm border-div-l font-bold bg-white dark:bg-slate-900">
                              <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Other">Other</SelectItem>
                              <SelectItem value="Alert">Alert</SelectItem>
                              <SelectItem value="Surgery">Surgery</SelectItem>
                              <SelectItem value="Medical">Medical</SelectItem>
                              <SelectItem value="Vacation">Vacation</SelectItem>
                              <SelectItem value="Snowbird">Snowbird</SelectItem>
                              <SelectItem value="Pregnancy">
                                Pregnancy
                              </SelectItem>
                              <SelectItem value="Goal">Goal</SelectItem>
                              <SelectItem value="Progress Report">
                                Progress Report
                              </SelectItem>
                              <SelectItem value="InBody Scan">
                                InBody Scan
                              </SelectItem>
                              <SelectItem value="Routine Change">
                                Routine Change
                              </SelectItem>
                              <SelectItem value="Birthday/Anniversary">
                                Birthday/Anniversary
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            value={event.notes || ""}
                            onChange={(e) =>
                              updateEvent(event.id!, "notes", e.target.value)
                            }
                            className="border-div-l h-12 text-[15px] bg-white dark:bg-slate-900 font-medium"
                            placeholder="Optional notes... (e.g. Cleared for activity)"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </div>

      {/* Sticky Footer */}
      <div className="p-4 md:px-10 md:py-6 border-t border-div-l bg-surface-1 mt-auto flex-none flex justify-end shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <Button
            variant="outline"
            className="h-12 rounded-xl font-bold uppercase tracking-widest text-[11px] w-full md:w-32 border-div-l hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          <Button
            disabled={dirtyFields.size === 0 || isSaving}
            onClick={handleSave}
            className={`w-full md:w-auto h-12 md:px-10 rounded-xl font-black uppercase tracking-widest text-[11px] shadow-md transition-all ${
              dirtyFields.size > 0
                ? "bg-cyan hover:bg-[#00D9C1] text-[#050C16]"
                : "bg-ink-l2/5 text-ink-l3 border border-div-l backdrop-blur-md opacity-50"
            }`}
          >
            {isSaving
              ? "Saving..."
              : dirtyFields.size > 0
                ? `Save Profile Changes (${dirtyFields.size})`
                : "No Edits Made"}
          </Button>
        </div>
      </div>
    </div>
  );
};
