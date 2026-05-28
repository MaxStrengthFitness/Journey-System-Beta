import React, { useState, useEffect } from "react";
import { 
  X, User, HeartPulse, Target, Briefcase, Calendar, Key, Shield, Image as ImageIcon 
} from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Client, ClientEvent, Trainer } from "../types";
import { useActiveStudio } from "../ActiveStudioContext";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    setFormData(prev => ({ ...prev, [key]: value }));
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

    setDirtyFields(prev => {
      const next = new Set(prev);
      let isDifferent = false;

      if (Array.isArray(value) && Array.isArray(initialVal)) {
        isDifferent = !isArrayEqual(value, initialVal);
      } else {
        isDifferent = value !== initialVal;
      }

      // Handle undefined cases gracefully
      if (initialVal === undefined && (value === "" || value === false || (Array.isArray(value) && value.length === 0))) {
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
      dirtyFields.forEach(key => {
        changes[key] = formData[key] as any;
      });
      if (authTrainer) (changes as any).lastUpdatedBy = authTrainer.id;

      await updateDoc(doc(db, "clients", client.id), changes);
      
      setDirtyFields(new Set());
      // Close sheet after save? Let's leave it open so they see success.
    } catch (error) {
      console.error("Error saving client info:", error);
      alert("Failed to save client info.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleFlag = (flagId: string) => {
    const current = formData.clinicalFlags || [];
    const updated = current.includes(flagId) 
      ? current.filter(f => f !== flagId) 
      : [...current, flagId];
    updateField('clinicalFlags', updated);
  };

  const toggleCrossTrainStudio = (studioId: string) => {
    const current = formData.approvedCrossTrainStudioIds || [];
    const updated = current.includes(studioId) 
      ? current.filter(id => id !== studioId) 
      : [...current, studioId];
    updateField('approvedCrossTrainStudioIds', updated);
  };

  const handleAddEvent = () => {
    const current = formData.events || [];
        const newEvent: ClientEvent = {
        id: Math.random().toString(36).substr(2, 9),
        title: "New Event",
        type: "Other",
        date: new Date().toISOString().split("T")[0],
        priority: "Medium"
    };
    updateField("events", [...current, newEvent]);
  };

  const updateEvent = (eventId: string, key: keyof ClientEvent, value: string) => {
    const current = formData.events || [];
    updateField("events", current.map(e => e.id === eventId ? { ...e, [key]: value } : e));
  };

  const deleteEvent = (eventId: string) => {
    const current = formData.events || [];
    updateField("events", current.filter(e => e.id !== eventId));
  };

  // Label UI convenience
  const FormLabel = ({ children }: { children: React.ReactNode }) => (
    <Label className="text-[11px] font-bold uppercase tracking-widest text-ink-d2 opacity-70 ml-1">{children}</Label>
  );

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col bg-bg-l border-l border-div-l">
        <SheetHeader className="p-6 border-b border-div-l flex flex-col gap-2">
           <div>
             <SheetTitle className="text-2xl font-bold uppercase italic tracking-tighter text-ink-l1">Client Info</SheetTitle>
             <p className="text-[11px] font-bold uppercase tracking-widest text-cyan">
               {client.firstName} {client.lastName}
             </p>
           </div>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-4 border-b border-div-l">
            <TabsList className="bg-transparent border-none p-0 flex flex-nowrap overflow-x-auto no-scrollbar gap-4 h-10 w-full justify-start">
              <TabsTrigger value="identity" className="data-[state=active]:bg-cyan/10 data-[state=active]:text-cyan data-[state=active]:shadow-none rounded-xl text-ink-l3 text-[11px] font-bold uppercase tracking-widest h-8 px-4 transition-all border border-transparent data-[state=active]:border-cyan/20 shrink-0">Identity</TabsTrigger>
              <TabsTrigger value="lifestyle" className="data-[state=active]:bg-cyan/10 data-[state=active]:text-cyan data-[state=active]:shadow-none rounded-xl text-ink-l3 text-[11px] font-bold uppercase tracking-widest h-8 px-4 transition-all border border-transparent data-[state=active]:border-cyan/20 shrink-0">Lifestyle</TabsTrigger>
              <TabsTrigger value="medical" className="data-[state=active]:bg-cyan/10 data-[state=active]:text-cyan data-[state=active]:shadow-none rounded-xl text-ink-l3 text-[11px] font-bold uppercase tracking-widest h-8 px-4 transition-all border border-transparent data-[state=active]:border-cyan/20 shrink-0">Medical</TabsTrigger>
              <TabsTrigger value="goals" className="data-[state=active]:bg-cyan/10 data-[state=active]:text-cyan data-[state=active]:shadow-none rounded-xl text-ink-l3 text-[11px] font-bold uppercase tracking-widest h-8 px-4 transition-all border border-transparent data-[state=active]:border-cyan/20 shrink-0">Goals</TabsTrigger>
              <TabsTrigger value="admin" className="data-[state=active]:bg-cyan/10 data-[state=active]:text-cyan data-[state=active]:shadow-none rounded-xl text-ink-l3 text-[11px] font-bold uppercase tracking-widest h-8 px-4 transition-all border border-transparent data-[state=active]:border-cyan/20 shrink-0">Admin</TabsTrigger>
              <TabsTrigger value="events" className="data-[state=active]:bg-cyan/10 data-[state=active]:text-cyan data-[state=active]:shadow-none rounded-xl text-ink-l3 text-[11px] font-bold uppercase tracking-widest h-8 px-4 transition-all border border-transparent data-[state=active]:border-cyan/20 shrink-0">Events</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 p-6">
            
            {/* 1. Identity & Contact */}
            <TabsContent value="identity" className="m-0 space-y-6">
               <div className="flex flex-col gap-6">
                 <div className="flex items-center gap-4 p-4 border border-div-l rounded-2xl bg-surface-1">
                   <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-800 border-2 border-div-l flex items-center justify-center text-ink-l3 shrink-0">
                     <ImageIcon strokeWidth={1} size={32} />
                   </div>
                   <div className="flex-1">
                     <p className="text-[11px] font-bold uppercase tracking-widest text-ink-l2">Avatar</p>
                     <p className="text-xs text-ink-l3">Upload photo feature pending.</p>
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5 flex flex-col">
                     <FormLabel>First Name</FormLabel>
                     <Input className="h-12 border-div-l rounded-xl bg-surface-1" value={formData.firstName || ""} onChange={e => updateField('firstName', e.target.value)} />
                   </div>
                   <div className="space-y-1.5 flex flex-col">
                     <FormLabel>Last Name</FormLabel>
                     <Input className="h-12 border-div-l rounded-xl bg-surface-1" value={formData.lastName || ""} onChange={e => updateField('lastName', e.target.value)} />
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5 flex flex-col">
                     <FormLabel>Date of Birth</FormLabel>
                     <Input type="date" className="h-12 border-div-l rounded-xl bg-surface-1" value={formData.dateOfBirth || ""} onChange={e => updateField('dateOfBirth', e.target.value)} />
                   </div>
                   <div className="space-y-1.5 flex flex-col">
                     <FormLabel>Gender</FormLabel>
                     <Select value={formData.gender || ""} onValueChange={v => updateField('gender', v)}>
                       <SelectTrigger className="h-12 border-div-l rounded-xl bg-surface-1">
                         <SelectValue placeholder="Select..." />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Male">Male</SelectItem>
                         <SelectItem value="Female">Female</SelectItem>
                         <SelectItem value="Other">Other</SelectItem>
                       </SelectContent>
                     </Select>
                   </div>
                 </div>

                 <div className="space-y-1.5 flex flex-col mt-4 border-t border-div-l pt-6">
                    <FormLabel>Phone</FormLabel>
                    <Input className="h-12 border-div-l rounded-xl bg-surface-1" value={formData.phone || ""} onChange={e => updateField('phone', e.target.value)} />
                 </div>
                 <div className="space-y-1.5 flex flex-col">
                    <FormLabel>Email</FormLabel>
                    <Input type="email" className="h-12 border-div-l rounded-xl bg-surface-1" value={formData.email || ""} onChange={e => updateField('email', e.target.value)} />
                 </div>
                 <div className="space-y-1.5 flex flex-col">
                    <FormLabel>Address</FormLabel>
                    <Input className="h-12 border-div-l rounded-xl bg-surface-1" value={formData.address || ""} onChange={e => updateField('address', e.target.value)} />
                 </div>

                 <div className="grid grid-cols-2 gap-4 mt-4 border-t border-div-l pt-6">
                    <div className="space-y-1.5 flex flex-col">
                       <FormLabel>Emergency Contact</FormLabel>
                       <Input className="h-12 border-div-l rounded-xl bg-surface-1" value={formData.emergencyContactName || ""} onChange={e => updateField('emergencyContactName', e.target.value)} />
                    </div>
                    <div className="space-y-1.5 flex flex-col">
                       <FormLabel>Emergency Phone</FormLabel>
                       <Input className="h-12 border-div-l rounded-xl bg-surface-1" value={formData.emergencyContactPhone || ""} onChange={e => updateField('emergencyContactPhone', e.target.value)} />
                    </div>
                 </div>
               </div>
            </TabsContent>

            {/* 2. Lifestyle */}
            <TabsContent value="lifestyle" className="m-0 space-y-6">
              <div className="flex flex-col gap-6">
                 <div className="grid grid-cols-[1fr_auto] gap-4 items-end">
                    <div className="space-y-1.5 flex flex-col">
                      <FormLabel>Occupation</FormLabel>
                      {/* OccupationSelect expects a setter for the full state usually, but let's wire it carefully. Assuming it expects { value, onChange } or similar. We can just use an Input if complex, but let's replicate ClientInfoTab's usage. Actually ClientInfoTab had its own wiring. We'll use Input for now to avoid prop mismatches, or implement a basic text input. */}
                      <Input className="h-12 border-div-l rounded-xl bg-surface-1" value={formData.occupation || ""} onChange={e => updateField('occupation', e.target.value)} />
                    </div>
                    <div className="flex flex-col space-y-1.5 mb-2 px-2 items-center">
                      <FormLabel>Retired</FormLabel>
                      <Switch checked={formData.isRetired || false} onCheckedChange={v => updateField('isRetired', v)} className="data-[state=checked]:bg-cyan" />
                    </div>
                 </div>

                 <div className="space-y-1.5 flex flex-col">
                    <FormLabel>Activity Level</FormLabel>
                     <Select value={formData.activityLevel || ""} onValueChange={v => updateField('activityLevel', v)}>
                       <SelectTrigger className="h-12 border-div-l rounded-xl bg-surface-1">
                         <SelectValue placeholder="Select..." />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Sedentary">Sedentary</SelectItem>
                         <SelectItem value="Light">Light</SelectItem>
                         <SelectItem value="Moderate">Moderate</SelectItem>
                         <SelectItem value="High">High</SelectItem>
                         <SelectItem value="Manual Labor">Manual Labor</SelectItem>
                       </SelectContent>
                     </Select>
                 </div>

                 <div className="space-y-1.5 flex flex-col">
                    <FormLabel>Recovery Metric</FormLabel>
                     <Select value={formData.recoveryMetric || ""} onValueChange={v => updateField('recoveryMetric', v)}>
                       <SelectTrigger className="h-12 border-div-l rounded-xl bg-surface-1">
                         <SelectValue placeholder="Select..." />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Poor">Poor</SelectItem>
                         <SelectItem value="Average">Average</SelectItem>
                         <SelectItem value="Optimal">Optimal</SelectItem>
                       </SelectContent>
                     </Select>
                 </div>

                 <div className="space-y-1.5 flex flex-col mt-4 border-t border-div-l pt-6">
                    <FormLabel>Experience Level</FormLabel>
                     <Select value={formData.experienceLevel || ""} onValueChange={v => updateField('experienceLevel', v)}>
                       <SelectTrigger className="h-12 border-div-l rounded-xl bg-surface-1">
                         <SelectValue placeholder="Select..." />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Beginner">Beginner</SelectItem>
                         <SelectItem value="Intermediate">Intermediate</SelectItem>
                         <SelectItem value="Advanced">Advanced</SelectItem>
                       </SelectContent>
                     </Select>
                 </div>

                 <div className="space-y-1.5 flex flex-col">
                    <FormLabel>Training Pedigree</FormLabel>
                     <Select value={formData.trainingPedigree || ""} onValueChange={v => updateField('trainingPedigree', v)}>
                       <SelectTrigger className="h-12 border-div-l rounded-xl bg-surface-1">
                         <SelectValue placeholder="Select..." />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Novice">Novice</SelectItem>
                         <SelectItem value="Intermediate">Intermediate</SelectItem>
                         <SelectItem value="Advanced">Advanced</SelectItem>
                         <SelectItem value="Protocol Veteran">Protocol Veteran</SelectItem>
                       </SelectContent>
                     </Select>
                 </div>

                 <div className="grid grid-cols-2 gap-4 mt-4 border-t border-div-l pt-6">
                    <div className="space-y-1.5 flex flex-col">
                       <FormLabel>Lead Source</FormLabel>
                       <Input className="h-12 border-div-l rounded-xl bg-surface-1" value={formData.leadSource || ""} onChange={e => updateField('leadSource', e.target.value)} />
                    </div>
                    <div className="space-y-1.5 flex flex-col">
                       <FormLabel>Referred By</FormLabel>
                       <Input className="h-12 border-div-l rounded-xl bg-surface-1" value={formData.referredBy || ""} onChange={e => updateField('referredBy', e.target.value)} />
                    </div>
                 </div>
              </div>
            </TabsContent>

            {/* 3. Medical */}
            <TabsContent value="medical" className="m-0 space-y-6">
              <div className="grid grid-cols-2 gap-4 border-b border-div-l pb-6">
                 <div className="space-y-1.5 flex flex-col">
                    <FormLabel>Height</FormLabel>
                    <Input className="h-12 border-div-l rounded-xl bg-surface-1" placeholder="e.g. 5'10&quot;" value={formData.height || ""} onChange={e => updateField('height', e.target.value)} />
                 </div>
                 <div className="space-y-1.5 flex flex-col">
                    <FormLabel>Weight</FormLabel>
                    <Input className="h-12 border-div-l rounded-xl bg-surface-1" placeholder="lbs" value={formData.weight || ""} onChange={e => updateField('weight', e.target.value)} />
                 </div>
              </div>

              <div className="space-y-3">
                 <FormLabel>Clinical Flags</FormLabel>
                 <div className="flex flex-wrap gap-2">
                   {CLINICAL_FLAGS_MATRIX.map((flag) => {
                     const isSelected = (formData.clinicalFlags || []).includes(flag.id);
                     return (
                       <Badge
                         key={flag.id}
                         variant="outline"
                         className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest border transition-all ${
                           isSelected
                             ? "bg-red-500/10 text-red-500 border-red-500/20"
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

              <div className="space-y-1.5 flex flex-col pt-4">
                 <FormLabel>Medical History</FormLabel>
                 <Textarea className="min-h-[120px] p-4 text-sm border-div-l rounded-2xl bg-surface-1" value={formData.medicalHistory || ""} onChange={e => updateField('medicalHistory', e.target.value)} />
              </div>

              <div className="space-y-1.5 flex flex-col">
                 <FormLabel>Clinical Notes</FormLabel>
                 <Textarea className="min-h-[120px] p-4 text-sm border-div-l rounded-2xl bg-surface-1" placeholder="Trainer-specific contraindications or constraints" value={formData.clinicalNotes || ""} onChange={e => updateField('clinicalNotes', e.target.value)} />
              </div>
            </TabsContent>

            {/* 4. Goals */}
            <TabsContent value="goals" className="m-0 space-y-6">
              <div className="space-y-1.5 flex flex-col">
                 <FormLabel>Discovery / Primary "Why"</FormLabel>
                 <Textarea className="min-h-[140px] p-4 text-sm border-div-l rounded-2xl bg-surface-1 leading-relaxed" placeholder="Client intent and motivation for starting." value={formData.globalNotes || ""} onChange={e => updateField('globalNotes', e.target.value)} />
              </div>
              <div className="space-y-1.5 flex flex-col mt-6">
                 <FormLabel>Coach Strategy Notes</FormLabel>
                 <Textarea className="min-h-[120px] p-4 text-sm border-div-l rounded-2xl bg-surface-1 leading-relaxed" placeholder="How do you coach this client? What cues do they respond to?" value={formData.discoveryNotes || ""} onChange={e => updateField('discoveryNotes', e.target.value)} />
              </div>
              <div className="space-y-1.5 flex flex-col mt-6">
                 <FormLabel>SMART Goal</FormLabel>
                 <Input className="h-12 border-div-l rounded-xl bg-surface-1" placeholder="e.g. Skiing trip ready by Nov 15th" value={(formData as any).smartGoal || ""} onChange={e => updateField('smartGoal' as any, e.target.value)} />
              </div>
            </TabsContent>

            {/* 5. Admin */}
            <TabsContent value="admin" className="m-0 space-y-6">
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1.5 flex flex-col">
                    <FormLabel>Package Tier</FormLabel>
                     <Select value={formData.packageTier || ""} onValueChange={v => updateField('packageTier', v)}>
                       <SelectTrigger className="h-12 border-div-l rounded-xl bg-surface-1">
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
                 <div className="space-y-1.5 flex flex-col">
                    <FormLabel>Home Studio</FormLabel>
                    <div className="h-12 border-div-l rounded-xl bg-slate-50 dark:bg-slate-900 border flex items-center px-3 opacity-60">
                      <span className="text-sm font-bold text-ink-l2">{studios.find(s => s.id === client.homeStudioId)?.name || client.homeStudioId}</span>
                    </div>
                 </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1.5 flex flex-col">
                    <FormLabel>Remaining Sessions</FormLabel>
                    <div className="h-12 border-div-l rounded-xl bg-slate-50 dark:bg-slate-900 border flex items-center px-3 opacity-60">
                      <span className="text-sm font-bold text-ink-l2">{client.remainingSessions || 0}</span>
                    </div>
                 </div>
                 <div className="space-y-1.5 flex flex-col">
                    <FormLabel>First Session</FormLabel>
                    <div className="h-12 border-div-l rounded-xl bg-slate-50 dark:bg-slate-900 border flex items-center px-3 opacity-60">
                      <span className="text-sm font-bold text-ink-l2">Not extracted</span>
                    </div>
                 </div>
               </div>

               <div className="space-y-3 mt-4 border-t border-div-l pt-6">
                 <FormLabel>Approved Cross-Train Studios</FormLabel>
                 <div className="flex flex-wrap gap-2">
                   {studios.filter(s => s.id !== client.homeStudioId).map((studio) => {
                     const isSelected = (formData.approvedCrossTrainStudioIds || []).includes(studio.id!);
                     return (
                       <Badge
                         key={studio.id}
                         variant="outline"
                         className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest border transition-all ${
                           isSelected
                             ? "bg-cyan/10 text-cyan border-cyan/20"
                             : "bg-surface-1 text-ink-l3 border-div-l hover:border-ink-l3"
                         }`}
                         onClick={() => toggleCrossTrainStudio(studio.id!)}
                       >
                         {studio.name}
                       </Badge>
                     );
                   })}
                   {studios.length <= 1 && <p className="text-xs text-ink-l3">No other studios available.</p>}
                 </div>
               </div>
            </TabsContent>

            {/* 6. Events */}
            <TabsContent value="events" className="m-0 space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <FormLabel>Client Event Horizon</FormLabel>
                  <Button onClick={handleAddEvent} size="sm" className="h-8 rounded-lg bg-cyan hover:bg-cyan/80 text-white font-bold uppercase tracking-widest text-[11px]">
                    + Add Event
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {!(formData.events?.length) && <p className="text-sm text-ink-l3 italic">No events scheduled.</p>}
                  {(formData.events || []).map((event) => (
                    <div key={event.id} className="p-4 border border-div-l rounded-2xl bg-surface-1 space-y-3 relative overflow-hidden group">
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => deleteEvent(event.id!)}
                        className="absolute top-2 right-2 h-8 w-8 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                      <div className="grid grid-cols-[1fr_120px] gap-3 pr-8">
                        <Input 
                          value={event.title} 
                          onChange={e => updateEvent(event.id!, "title", e.target.value)} 
                          className="font-bold border-div-l h-10" placeholder="Event Title"
                        />
                        <div className="flex flex-col gap-1">
                          <Input 
                            type="date" 
                            value={event.date} 
                            onChange={e => updateEvent(event.id!, "date", e.target.value)} 
                            className="border-div-l text-xs font-bold h-10" 
                          />
                          {(event.type === 'Vacation' || event.type === 'Medical' || event.type === 'Snowbird' || event.type === 'Alert' || event.endDate) && (
                            <Input 
                              type="date" 
                              value={event.endDate || ''} 
                              onChange={e => updateEvent(event.id!, "endDate", e.target.value)} 
                              className="border-div-l text-xs font-bold h-10" 
                              placeholder="End Date"
                            />
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-[120px_1fr] gap-3">
                        <Select value={event.type} onValueChange={v => updateEvent(event.id!, "type", v)}>
                          <SelectTrigger className="h-10 text-xs border-div-l font-bold">
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Other">Other</SelectItem>
                            <SelectItem value="Alert">Alert</SelectItem>
                            <SelectItem value="Surgery">Surgery</SelectItem>
                            <SelectItem value="Medical">Medical</SelectItem>
                            <SelectItem value="Vacation">Vacation</SelectItem>
                            <SelectItem value="Snowbird">Snowbird</SelectItem>
                            <SelectItem value="Pregnancy">Pregnancy</SelectItem>
                            <SelectItem value="Goal">Goal</SelectItem>
                            <SelectItem value="Progress Report">Progress Report</SelectItem>
                            <SelectItem value="InBody Scan">InBody Scan</SelectItem>
                            <SelectItem value="Routine Change">Routine Change</SelectItem>
                            <SelectItem value="Birthday/Anniversary">Birthday/Anniversary</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input 
                          value={event.notes || ""} 
                          onChange={e => updateEvent(event.id!, "notes", e.target.value)} 
                          className="border-div-l h-10 text-sm" placeholder="Optional notes..." 
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

          </ScrollArea>
          
          {/* Sticky Footer */}
          <div className="p-6 border-t border-div-l bg-bg-l-card mt-auto flex-none">
             <Button 
               disabled={dirtyFields.size === 0 || isSaving}
               onClick={handleSave}
               className={`w-full h-12 rounded-xl font-bold uppercase tracking-widest text-[11px] shadow-sm transition-all ${
                 dirtyFields.size > 0 ? "bg-cyan hover:bg-cyan/90 text-white" : "bg-ink-l2/5 text-ink-l3 border border-div-l backdrop-blur-md"
               }`}
             >
               {isSaving ? "Saving..." : dirtyFields.size > 0 ? `Save Changes (${dirtyFields.size})` : "No Changes"}
             </Button>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};
