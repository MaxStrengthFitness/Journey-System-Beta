import React from "react";
import { motion } from "motion/react";
import { 
  X, Trash2, Maximize, Database
} from "lucide-react";
import { Timestamp } from "firebase/firestore";
import { Client, Trainer } from "../types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OccupationSelect } from "./OccupationSelect";
import { getErgonomicRisk } from "../data/occupational-matrix";
import { CLINICAL_FLAGS_MATRIX } from "../data/clinical-matrix";
import { generateMockClientWithHistory } from "../lib/mockDataGenerator";
import { isOwner as checkIsOwner } from "../lib/permissions";

interface ClientInfoSheetProps {
  client: Client;
  infoForm: any;
  setInfoForm: React.Dispatch<React.SetStateAction<any>>;
  isSavingInfo: boolean;
  handleSaveInfo: () => Promise<void>;
  authTrainer: Trainer | null;
  setIsDeleting: (v: boolean) => void;
  setView: (view: any, params?: any) => void;
}

export const ClientInfoTab: React.FC<ClientInfoSheetProps> = ({
  client,
  infoForm,
  setInfoForm,
  isSavingInfo,
  handleSaveInfo,
  authTrainer,
  setIsDeleting,
  setView,
}) => {
  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col font-sans">
      <div className="flex-1 space-y-6 bg-transparent pb-32">
        <div className="grid gap-6">
            
          {/* 1. The "Why" (Goals & Motivation) */}
            <Card className="rounded-2xl shadow-xl bg-bg-l-card border-div-l">
              <CardHeader className="p-6 border-b border-div-l">
                <CardTitle className="text-xl font-bold uppercase italic tracking-tighter text-ink-l1">
                  The 'Why' (Goals & Motivation)
                </CardTitle>
                <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-[#38BDF8]">
                  Discovery & Intent Path
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                  <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-l1 ml-1">
                    Primary Focus / Medical Profile notes
                  </Label>
                  <Textarea
                    value={infoForm.discoveryNotes || ""}
                    onChange={(e) =>
                      setInfoForm((f: any) => ({ ...f, discoveryNotes: e.target.value }))
                    }
                    placeholder="Why is this client here? What is their background, goals, motivation?"
                    className="min-h-[125px] rounded-2xl bg-slate-50 dark:bg-slate-950 font-bold border-div-l focus-visible:ring-cta text-sm text-ink-l1"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-l1 ml-1">
                    Coach-Facing Strategy & Narrative Tracker
                  </Label>
                  <Textarea
                    value={infoForm.globalNotes || ""}
                    onChange={(e) =>
                      setInfoForm((f: any) => ({ ...f, globalNotes: e.target.value }))
                    }
                    placeholder="How do you coach this client? What cues do they respond to?"
                    className="min-h-[125px] rounded-2xl bg-slate-50 dark:bg-slate-950 font-bold border-div-l focus-visible:ring-cta text-sm text-ink-l1"
                  />
                </div>
              </CardContent>
            </Card>

            {/* 2. Demographics & Context */}
            <Card className="rounded-2xl shadow-xl bg-bg-l-card border-div-l">
              <CardHeader className="p-6 border-b border-div-l">
                <CardTitle className="text-xl font-bold uppercase italic tracking-tighter text-ink-l1">
                  Demographics & Context
                </CardTitle>
                <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-[#38BDF8]">
                  Life, Labor & Recovery Balance
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-center mb-1">
                    <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-l1 ml-1">
                      Occupation
                    </Label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-l1">Retired</span>
                      <Switch
                        checked={infoForm.isRetired || false}
                        onCheckedChange={(val) =>
                          setInfoForm((f: any) => ({
                            ...f,
                            isRetired: val,
                            ...(val ? { occupation: "Retired" } : {}),
                          }))
                        }
                      />
                    </div>
                  </div>
                  <OccupationSelect
                    value={infoForm.occupation || ""}
                    onChange={(val) => setInfoForm((f: any) => ({ ...f, occupation: val }))}
                    disabled={infoForm.isRetired}
                  />
                  {infoForm.occupation && (
                    <div className="p-4 bg-slate-100 dark:bg-slate-950 rounded-2xl flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wide text-ink-l1">Ergonomic Profile Assessment:</span>
                      <Badge className="bg-[#38BDF8] text-slate-950 font-bold text-xs border-none shadow-sm">
                        {getErgonomicRisk(infoForm.occupation)}
                      </Badge>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-l1 ml-1">
                    Activity Level
                  </Label>
                  <Select
                    value={infoForm.activityLevel || "Moderate"}
                    onValueChange={(val) => setInfoForm((f: any) => ({ ...f, activityLevel: val }))}
                  >
                    <SelectTrigger className="h-12 rounded-2xl font-bold bg-slate-50 dark:bg-slate-950 border-div-l text-ink-l1">
                      <SelectValue placeholder="Select Activity level" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border-div-l font-bold p-2 text-ink-l1">
                      <SelectItem value="Sedentary">Sedentary</SelectItem>
                      <SelectItem value="Light">Light</SelectItem>
                      <SelectItem value="Moderate">Moderate</SelectItem>
                      <SelectItem value="Very Active">Very Active</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-l1 ml-1">
                    Recovery Metric
                  </Label>
                  <Select
                    value={infoForm.recoveryMetric || "Average"}
                    onValueChange={(val) => setInfoForm((f: any) => ({ ...f, recoveryMetric: val }))}
                  >
                    <SelectTrigger className="h-12 rounded-2xl font-bold bg-slate-50 dark:bg-slate-950 border-div-l text-ink-l1">
                      <SelectValue placeholder="Select Recovery level" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border-div-l font-bold p-2 text-ink-l1">
                      <SelectItem value="Excellent">Excellent</SelectItem>
                      <SelectItem value="Above Average">Above Average</SelectItem>
                      <SelectItem value="Average">Average</SelectItem>
                      <SelectItem value="Poor">Poor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-l1 ml-1">
                    Training Pedigree
                  </Label>
                  <Select
                    value={infoForm.trainingPedigree || "Novice"}
                    onValueChange={(val) => setInfoForm((f: any) => ({ ...f, trainingPedigree: val }))}
                  >
                    <SelectTrigger className="h-12 rounded-2xl font-bold bg-slate-50 dark:bg-slate-950 border-div-l text-ink-l1">
                      <SelectValue placeholder="Select Pedigree" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border-div-l font-bold p-2 text-ink-l1">
                      <SelectItem value="Novice">Novice</SelectItem>
                      <SelectItem value="Intermediate">Intermediate</SelectItem>
                      <SelectItem value="Advanced">Advanced (Aptitude Built)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* 3. Medical Status */}
            <Card className="rounded-2xl shadow-xl bg-bg-l-card border-div-l">
              <CardHeader className="p-6 border-b border-div-l">
                <CardTitle className="text-xl font-bold uppercase italic tracking-tighter text-ink-l1">
                  Orthopedic & Clinical Safety
                </CardTitle>
                <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-red-500">
                  Precautionary Boundaries (Contraindicated Elements)
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-4">
                  <Label className="text-[11px] font-bold uppercase tracking-widest text-red-500">
                    Active Clinical Safety Flags
                  </Label>
                  {infoForm.clinicalFlags && infoForm.clinicalFlags.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-4 bg-red-500/5 border border-red-500/10 rounded-2xl">
                      {infoForm.clinicalFlags.map((flagId: string) => {
                        const f = CLINICAL_FLAGS_MATRIX.find(x => x.id === flagId);
                        return f ? (
                          <Badge key={flagId} className="bg-red-500 text-white font-bold text-xs py-1.5 px-3 rounded-full hover:bg-red-600 transition-colors border-none shadow-sm">
                            {f.conditionName}
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="cl-flags-select" className="border-b-0">
                      <AccordionTrigger className="text-xs font-bold uppercase tracking-widest text-[#38BDF8] py-2 hover:no-underline">
                        Manage Active Safety Flags
                      </AccordionTrigger>
                      <AccordionContent className="pt-2">
                        <div className="grid grid-cols-1 gap-2 max-h-[250px] overflow-y-auto custom-scrollbar p-2 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-div-l shadow-inner">
                          {CLINICAL_FLAGS_MATRIX.map((flag) => {
                            const isChecked = infoForm.clinicalFlags?.includes(flag.id) || false;
                            return (
                              <label key={flag.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-white dark:hover:bg-slate-900 transition-colors cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    const current = infoForm.clinicalFlags || [];
                                    if (isChecked) {
                                      setInfoForm((f: any) => ({ ...f, clinicalFlags: current.filter((a: any) => a !== flag.id) }));
                                    } else {
                                      setInfoForm((f: any) => ({ ...f, clinicalFlags: [...current, flag.id] }));
                                    }
                                  }}
                                  className="mt-1 accent-red-600"
                                />
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-tight text-slate-900 dark:text-slate-100">{flag.conditionName}</p>
                                  <p className="text-[10px] text-slate-500 font-medium leading-normal mt-0.5">{flag.severity}</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-ink-l1 ml-1">
                    Medical Narrative & Precaution Summary
                  </Label>
                  <Textarea
                    value={infoForm.clinicalNotes || ""}
                    onChange={(e) =>
                      setInfoForm((f: any) => ({
                        ...f,
                        clinicalNotes: e.target.value,
                      }))
                    }
                    placeholder="Detail any orthopedic history or clinical considerations..."
                    className="min-h-[125px] rounded-2xl bg-slate-50 dark:bg-slate-950 font-bold border-div-l focus-visible:ring-cta text-sm text-ink-l1"
                  />
                </div>
              </CardContent>
            </Card>

            {/* 4. Contact & Billing */}
            <Card className="rounded-2xl shadow-xl bg-bg-l-card border-div-l flex flex-col h-full">
              <CardHeader className="p-6 border-b border-div-l flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold uppercase italic tracking-tighter text-ink-l1">
                    Contact & Administrative
                  </CardTitle>
                  <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 mt-1 text-[#64748B]">
                    Trainer Assignment & Contact Details
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-6 flex-1">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-[#64748B] dark:text-slate-400">
                      First Name
                    </Label>
                    <Input
                      value={infoForm.firstName || ""}
                      onChange={(e) => setInfoForm((f: any) => ({ ...f, firstName: e.target.value }))}
                      className="h-12 text-sm rounded-2xl font-bold px-4 bg-slate-50 dark:bg-slate-950 border-div-l focus-visible:ring-cta text-ink-l1"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-[11px] font-bold uppercase tracking-widest text-[#64748B] dark:text-slate-400">
                      Last Name
                    </Label>
                    <Input
                      value={infoForm.lastName || ""}
                      onChange={(e) => setInfoForm((f: any) => ({ ...f, lastName: e.target.value }))}
                      className="h-12 text-sm rounded-2xl font-bold px-4 bg-slate-50 dark:bg-slate-950 border-div-l focus-visible:ring-cta text-ink-l1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-widest text-[#64748B] dark:text-slate-400">
                    Email
                  </Label>
                  <Input
                    value={infoForm.email || ""}
                    onChange={(e) => setInfoForm((f: any) => ({ ...f, email: e.target.value }))}
                    className="h-12 text-sm rounded-2xl font-bold px-4 bg-slate-50 dark:bg-slate-950 border-div-l focus-visible:ring-cta text-ink-l1"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-widest text-[#64748B] dark:text-slate-400">
                    Age
                  </Label>
                  <Input
                    type="number"
                    value={infoForm.age ?? ""}
                    onChange={(e) =>
                      setInfoForm((f: any) => ({
                        ...f,
                        age: e.target.value ? parseInt(e.target.value) : null,
                      }))
                    }
                    className="h-12 text-sm rounded-2xl font-bold px-4 bg-slate-50 dark:bg-slate-950 border-div-l focus-visible:ring-cta text-ink-l1"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-widest text-[#64748B] dark:text-slate-400">Package Tier</Label>
                  <Select
                    value={infoForm.packageTier || "None"}
                    onValueChange={(v: any) => setInfoForm((f: any) => ({ ...f, packageTier: v }))}
                  >
                    <SelectTrigger className="h-12 text-sm rounded-2xl font-bold px-4 bg-slate-50 dark:bg-slate-950 border-div-l text-ink-l1">
                      <SelectValue placeholder="Select Tier" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-900 border-div-l font-bold p-2 text-ink-l1">
                      <SelectItem value="None">None / Trial</SelectItem>
                      <SelectItem value="6-Month">6-Month</SelectItem>
                      <SelectItem value="12-Month">12-Month</SelectItem>
                      <SelectItem value="18-Month">18-Month VIP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label className="text-[11px] font-bold uppercase tracking-widest text-[#64748B] dark:text-slate-400">
                    Start Date
                  </Label>
                  <Input
                    type="text"
                    placeholder="MM/DD/YYYY"
                    value={infoForm.firstSessionDateRaw || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      const numbersOnly = val.replace(/\D/g, "");
                      let formatted = numbersOnly;
                      if (numbersOnly.length > 2 && numbersOnly.length <= 4) {
                        formatted = `${numbersOnly.slice(0, 2)}/${numbersOnly.slice(2)}`;
                      } else if (numbersOnly.length > 4) {
                        formatted = `${numbersOnly.slice(0, 2)}/${numbersOnly.slice(2, 4)}/${numbersOnly.slice(4, 8)}`;
                      }
                      
                      setInfoForm((f: any) => ({
                        ...f,
                        firstSessionDateRaw: formatted,
                      }));

                      if (numbersOnly.length === 8) {
                        const m = parseInt(numbersOnly.slice(0, 2), 10);
                        const d_val = parseInt(numbersOnly.slice(2, 4), 10);
                        const y = parseInt(numbersOnly.slice(4, 8), 10);
                        if (m >= 1 && m <= 12 && d_val >= 1 && d_val <= 31 && y >= 1900) {
                          const selectedDate = new Date(y, m - 1, d_val);
                          const timestamp = Timestamp.fromDate(selectedDate);
                          setInfoForm((f: any) => ({
                            ...f,
                            firstSessionDate: timestamp,
                            firstSessionDateRaw: formatted,
                          }));
                        }
                      } else if (numbersOnly.length === 0) {
                        setInfoForm((f: any) => ({
                          ...f,
                          firstSessionDate: null,
                          firstSessionDateRaw: "",
                        }));
                      }
                    }}
                    className="h-12 text-sm rounded-2xl font-bold px-4 bg-slate-50 dark:bg-slate-950 border-div-l text-ink-l1"
                  />
                </div>
              </CardContent>
            </Card>

            {/* 5. Account Lifecycle controls */}
            <Card className="rounded-2xl shadow-xl bg-bg-l-card border-div-l overflow-hidden">
              <CardHeader className="p-6 border-b border-div-l flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-bold uppercase italic tracking-tighter text-ink-l1">
                    Account Lifecycle Control
                  </CardTitle>
                  <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-amber-500">
                    Active State, Retention Rules & Exclusions
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-950 border border-div-l rounded-2xl">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-tight text-slate-900 dark:text-slate-100">Membership Active State</p>
                    <p className="text-[10px] text-slate-500 font-medium leading-normal">Inactive status locks workouts but keeps historic records safe.</p>
                  </div>
                  <Switch
                    checked={infoForm.isActive || false}
                    onCheckedChange={(v) =>
                      setInfoForm((f: any) => ({ ...f, isActive: v }))
                    }
                    className="data-[state=checked]:bg-emerald-500"
                  />
                </div>

                <div className="flex flex-col p-4 bg-slate-50 dark:bg-slate-950 border border-div-l rounded-2xl gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-tight text-slate-900 dark:text-slate-100">Exclude from Retention</p>
                      <p className="text-[10px] text-slate-500 font-medium leading-normal">Hide this client from MIA/retention lists (e.g. long-term holds).</p>
                    </div>
                    <Switch
                      checked={infoForm.retentionMeta?.excludedFromMIA || false}
                      onCheckedChange={(v) =>
                        setInfoForm((f: any) => ({ 
                          ...f, 
                          retentionMeta: { ...(f.retentionMeta || {}), excludedFromMIA: v }
                        }))
                      }
                      className="data-[state=checked]:bg-emerald-500"
                    />
                  </div>

                  {infoForm.retentionMeta?.excludedFromMIA && (
                    <div className="flex flex-col gap-3 pt-3 border-t border-div-l">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-[11px] font-black uppercase text-ink-l3">Reason for Exclusion</Label>
                        <Select
                          value={infoForm.retentionMeta?.excludedReason || ""}
                          onValueChange={(val) =>
                            setInfoForm((f: any) => ({
                              ...f,
                              retentionMeta: { ...(f.retentionMeta || {}), excludedReason: val }
                            }))
                          }
                        >
                          <SelectTrigger className="w-full bg-white dark:bg-slate-900 border-div-l h-10">
                            <SelectValue placeholder="Select a reason..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Vacation">Vacation</SelectItem>
                            <SelectItem value="Snowbird">Snowbird</SelectItem>
                            <SelectItem value="Medical">Medical</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label className="text-[11px] font-black uppercase text-ink-l3">Auto-Resume On (Optional)</Label>
                        <Input
                          type="date"
                          value={infoForm.retentionMeta?.autoIncludeAfter || ""}
                          onChange={(e) =>
                            setInfoForm((f: any) => ({
                              ...f,
                              retentionMeta: { ...(f.retentionMeta || {}), autoIncludeAfter: e.target.value }
                            }))
                          }
                          className="w-full bg-white dark:bg-slate-900 border-div-l h-10"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <Button
                    onClick={() => setView("chart-importer")}
                    className="w-full bg-[#0ea5e9]/10 hover:bg-[#0ea5e9]/20 text-[#38BDF8] border border-[#38BDF8]/30 rounded-2xl font-bold uppercase italic tracking-widest h-12 shadow-sm transition-all"
                  >
                    <Maximize className="w-4 h-4 mr-2" />
                    Open Migration Hub
                  </Button>
                  
                  <Button
                    onClick={() => setView("workouts", { isIntroSession: true })}
                    className="w-full bg-[#115E8D] hover:bg-[#115E8D]/90 rounded-2xl font-bold uppercase italic tracking-widest h-12 shadow-md shadow-[#115E8D]/20 border-none text-white font-display"
                  >
                    Start Introductory Session
                  </Button>
                  
                  <Button
                    disabled={isSavingInfo}
                    onClick={handleSaveInfo}
                    className="w-full h-12 rounded-full bg-cta hover:bg-cta-strong font-bold uppercase italic text-xs tracking-widest text-white transition-all shadow-md font-display"
                  >
                    {isSavingInfo ? "Processing..." : "Save All Changes"}
                  </Button>

                  <div className="pt-4 mt-2 border-t border-div-l">
                    <Button
                      variant="outline"
                      className="w-full h-10 rounded-full border-red-500/20 text-red-500 hover:bg-red-500/10 hover:text-red-400 font-bold uppercase tracking-widest text-[11px] transition-all bg-transparent shadow-none font-display"
                      onClick={() => setIsDeleting(true)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-2" />
                      Delete Profile
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {checkIsOwner(authTrainer) && (
              <Card className="rounded-2xl shadow-sm bg-amber-500/5 border border-amber-500/10">
                <CardHeader className="p-6 border-b border-amber-500/10 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-bold uppercase italic tracking-tighter text-ink-l1">
                      Debug Tools
                    </CardTitle>
                    <CardDescription className="text-[11px] font-medium uppercase tracking-wide opacity-70 text-amber-500/80">
                      Administrative Utilities
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <Button
                    onClick={async () => {
                      if (!authTrainer) return;
                      if (confirm("Generate a new mock client with 60 days of history?")) {
                        try {
                          const { clientName } = await generateMockClientWithHistory(authTrainer.id!, authTrainer.initials);
                          alert(`Success: Created ${clientName}`);
                          window.location.reload(); 
                        } catch (err: any) {
                          alert(err.message);
                        }
                      }
                    }}
                    className="w-full bg-amber-500 hover:bg-amber-600 text-black rounded-2xl font-bold uppercase italic tracking-widest h-12 shadow-sm transition-all border-none font-display"
                  >
                    <Database className="w-4 h-4 mr-2" />
                    Provision Mock Client Data
                  </Button>
                  <p className="text-[11px] text-center text-amber-500/40 font-bold uppercase tracking-widest">
                    Creates a new test entity with full history
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
  );
};
