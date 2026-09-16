import React, { useState, useEffect, useMemo } from "react";
import { X, Maximize } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";

import { auth, db } from "../firebase";
import { Client, Machine, ProgressReport, Trainer } from "../types";
import type { DossierSection } from "../types/journal";
import { useActiveStudio } from "../ActiveStudioContext";
import { useToast } from "../contexts/ToastContext";
import { useScrollerPad } from "../features/client-profile/use-scroller-pad";
import { clientDisplayName } from "../lib/client-name";
import { mindbodyIdOf } from "../lib/mindbody-id";
import { Button } from "@/components/ui/button";
import { ClientDossier } from "./client-dossier/ClientDossier";

/**
 * The old sidebar used "identity" for what is now the General section.
 * Callers still pass tab values, so they are translated here rather than
 * chased down and changed.
 */
/**
 * Deep links and old callers still speak the tab names the modal had in 2025.
 * `lifestyle` and `events` no longer exist as sections — both of their subjects
 * now live under Life (see DOSSIER_SECTIONS in types/journal.ts) — so they are
 * translated rather than dropped, and an old link still lands somewhere sane.
 */
const LEGACY_TAB_TO_SECTION: Record<string, DossierSection> = {
  identity: "general",
  general: "general",
  lifestyle: "life",
  life: "life",
  medical: "medical",
  goals: "goals",
  focus: "focus",
  notes: "notes",
  reports: "reports",
  journal: "notes",
  admin: "admin",
  events: "life",
};

interface ClientInfoSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * "overlay" (default) is the original full-screen sheet. "inline" renders
   * the same dossier + save bar as ordinary tab content — the profile's
   * Details tab (Sep 2026). In inline mode `isOpen` is ignored and
   * `onOpenChange` is only called by the Migration Hub shortcut.
   */
  variant?: "overlay" | "inline";
  /** Inline only: classes for the bounded container (its height comes from here). */
  className?: string;
  client: Client;
  authTrainer: Trainer | null;
  /** Legacy tab id; translated to a dossier section. */
  defaultTab?: string;
  /** Reference data for the journal areas and rails. */
  machines?: Machine[];
  trainers?: Trainer[];
  /** Jump the user to the Journal tab behind this modal. */
  onOpenJournal?: () => void;
  /** Jump the user to the progress-report archive. */
  onOpenReports?: () => void;
  /** Switch to the Planner (Goals → Plans from the team → Write a plan). */
  onOpenPlanner?: () => void;
  /**
   * The Reports section's shelf. Passed through since the profile merge —
   * the reports live inside this spine now, not in a separate tab.
   */
  progressReports?: ProgressReport[];
  onSelectReport?: (id: string) => void;
  onDeleteReport?: (report: ProgressReport) => void;
  onNewReport?: () => void;
}

export const ClientInfoSheet: React.FC<ClientInfoSheetProps> = ({
  isOpen,
  onOpenChange,
  variant = "overlay",
  className,
  client,
  authTrainer,
  defaultTab,
  machines = [],
  trainers = [],
  onOpenJournal,
  onOpenReports,
  onOpenPlanner,
  progressReports = [],
  onSelectReport,
  onDeleteReport,
  onNewReport,
}) => {
  const inline = variant === "inline";
  const saveBarRef = React.useRef<HTMLDivElement | null>(null);
  useScrollerPad(saveBarRef, inline);
  const { success: toastSuccess, error: toastError } = useToast();
  const { availableStudios: studios } = useActiveStudio();
  const [formData, setFormData] = useState<Partial<Client>>({});
  const [dirtyFields, setDirtyFields] = useState<Set<keyof Client>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // The Auth uid, not authTrainer.id: the FORD rules pin authorId to it, the
  // same way the journalEntries rule does, and the two differ on older
  // accounts.
  const fordAuthor = useMemo(
    () => ({
      id: auth.currentUser?.uid || authTrainer?.id || "",
      initials: (authTrainer?.initials || "TR").toUpperCase(),
      fullName: authTrainer?.fullName || "Coach",
    }),
    [authTrainer],
  );
  const [activeTab, setActiveTab] = useState("identity");

  // Initialize form state. Inline, the sheet stays mounted for as long as the
  // Details tab is open, and the `client` object is rebuilt on every
  // Firestore snapshot — so a re-init on every client change would wipe a
  // half-typed edit whenever anything about the client saved elsewhere. The
  // form re-syncs from the document only while it has NO unsaved edits.
  const dirtyRef = React.useRef(dirtyFields);
  dirtyRef.current = dirtyFields;
  useEffect(() => {
    if ((isOpen || inline) && client) {
      if (inline && dirtyRef.current.size > 0) return;
      setActiveTab(defaultTab || "identity");
      setFormData({
        firstName: client.firstName || "",
        lastName: client.lastName || "",
        nickname: client.nickname || "",
        mindbodyId: client.mindbodyId || "",
        mindbodyClientId: client.mindbodyClientId || client.mindbodyId || "",
        mindbody_name: client.mindbody_name || "",
        mindbodyNotes: client.mindbodyNotes || "",
        photoUrl: client.photoUrl || "",
        dateOfBirth: client.dateOfBirth || "",
        gender: client.gender || "",
        phone: client.phone || "",
        email: client.email || "",
        address: client.address || "",
        emergencyContactName: client.emergencyContactName || "",
        emergencyContactPhone: client.emergencyContactPhone || "",
        occupation: client.occupation || "",
        isRetired: client.isRetired || false,
        workProfile: client.workProfile ?? null,
        recreationActivities: client.recreationActivities || [],
        fitnessBackground: client.fitnessBackground || [],
        needsUnteaching: client.needsUnteaching || false,
        pedigreeHistory: client.pedigreeHistory || [],
        // Dropdowns start EMPTY. Pre-filling "Sedentary"/"Novice" here made an
        // unset field look assessed, and the first save wrote it to Firestore.
        // Nothing is stored until a trainer explicitly picks an option.
        activityLevel: client.activityLevel || "",
        recoveryMetric: client.recoveryMetric || "",
        experienceLevel: client.experienceLevel || "",
        trainingPedigree: client.trainingPedigree || "",
        leadSource: client.leadSource || "",
        referredBy: client.referredBy || "",
        clinicalFlags: client.clinicalFlags || [],
        medicalHistory: client.medicalHistory || "",
        clinicalNotes: client.clinicalNotes || "",
        height: client.height || "",
        weight: client.weight || "",
        discoveryNotes: client.discoveryNotes || "",
        globalNotes: client.globalNotes || "",
        smartGoal: client.smartGoal || "",
        packageTier: client.packageTier || "",
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

      // null and undefined are the same "nothing" (a cleared lock, say).
      if (initialVal == null && value == null) isDifferent = false;

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

  if (!inline && !isOpen) return null;

  return (
    <div
      className={
        inline
          // No `overflow-hidden` in the inline variant: it would cut the
          // sticky jump rail and the sticky save bar out of the page scroll.
          ? `flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white ${className || ""}`
          : "fixed inset-0 z-100 flex flex-col bg-card text-foreground border-none overflow-hidden m-0 animate-in fade-in zoom-in-[0.98] duration-200"
      }
    >
      {inline ? (
        /* Slim inline bar: the tab already says "Details", so no title here. */
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/60">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 min-w-0">
            <span className="text-[#0a548b] dark:text-[#8cc4f2] truncate">
              {clientDisplayName(client)}
            </span>
            {mindbodyIdOf(client) && (
              <>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="truncate">MBO ID {mindbodyIdOf(client)}</span>
              </>
            )}
          </p>
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false);
              window.dispatchEvent(new CustomEvent("open-bulk-import"));
            }}
            variant="outline"
            className="h-9 rounded-xl border-border text-[10px] font-bold uppercase tracking-widest px-3 flex items-center gap-2 shrink-0"
          >
            <Maximize className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Migration Hub (OCR)</span>
          </Button>
        </div>
      ) : (
      <div className="p-6 md:px-10 md:py-8 border-b border-slate-200 dark:border-slate-800 flex flex-row items-start justify-between gap-2 shadow-sm bg-slate-50 dark:bg-slate-900">
        <div>
          <h2 className="text-3xl font-black uppercase italic tracking-tighter text-foreground">
            Client Information
          </h2>
          <p className="text-sm font-bold uppercase tracking-widest text-[#38BDF8] flex items-center gap-2 mt-1">
            {client.firstName} {client.lastName}
            {client.mindbodyId && (
              <>
                <span className="text-muted-foreground text-[10px]">•</span>
                <span className="text-muted-foreground">
                  MBO ID: {client.mindbodyId}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={() => {
              onOpenChange(false);
              window.dispatchEvent(new CustomEvent("open-bulk-import"));
            }}
            className="h-12 bg-[#0ea5e9]/10 hover:bg-[#0ea5e9]/20 text-[#38BDF8] border border-[#38BDF8]/30 rounded-xl font-bold uppercase italic tracking-widest px-4 shadow-sm transition-all flex items-center gap-2"
          >
            <Maximize className="w-4 h-4" />
            <span>Open Migration Hub (OCR)</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="rounded-xl w-12 h-12 text-muted-foreground hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-6 h-6" />
          </Button>
        </div>
      </div>
      )}

      <ClientDossier
        client={client}
        formData={formData}
        updateField={updateField}
        studios={studios}
        machines={machines}
        trainers={trainers}
        defaultSection={LEGACY_TAB_TO_SECTION[defaultTab || ""] || "general"}
        onOpenJournal={onOpenJournal}
        onOpenReports={onOpenReports}
        onOpenPlanner={onOpenPlanner}
        fordAuthor={fordAuthor}
        progressReports={progressReports}
        onSelectReport={onSelectReport}
        onDeleteReport={onDeleteReport}
        onNewReport={onNewReport}
        scroll={inline ? "page" : "inner"}
        authTrainer={authTrainer}
      />

      {/* Sticky Footer */}
      <div
        ref={saveBarRef}
        style={inline ? { bottom: "var(--scroll-pad-bottom, 0px)" } : undefined}
        className={
          inline
            // Sticky to the viewport bottom: the form is now as long as the
            // page, and Save must never be a scroll away.
            // Opaque, and pinned to the scroller's true bottom edge
            // (use-scroller-pad.ts), or fields show through and below it.
            ? "sticky z-20 rounded-b-2xl px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 mt-auto flex-none flex justify-end"
            : "p-4 md:px-10 md:py-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 mt-auto flex-none flex justify-end shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]"
        }
      >
        <div className="flex items-center gap-4 w-full md:w-auto">
          {inline ? (
            dirtyFields.size > 0 && (
              <Button
                variant="ghost"
                className="h-12 rounded-xl font-bold uppercase tracking-widest text-[11px] text-slate-500 hover:text-slate-900 dark:hover:text-white"
                onClick={() => {
                  setDirtyFields(new Set());
                  setFormData((prev) => {
                    const reset: Partial<Client> = { ...prev };
                    dirtyFields.forEach((k) => {
                      (reset as Record<string, unknown>)[k as string] = (client as Record<string, unknown>)[k as string] ?? "";
                    });
                    return reset;
                  });
                }}
              >
                Discard edits
              </Button>
            )
          ) : (
          <Button
            variant="outline"
            className="h-12 rounded-xl font-bold uppercase tracking-widest text-[11px] w-full md:w-32 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
          )}
          <Button
            disabled={dirtyFields.size === 0 || isSaving}
            onClick={handleSave}
            className={`w-full md:w-auto h-12 md:px-10 rounded-xl font-black uppercase tracking-widest text-[11px] shadow-md transition-all ${
              dirtyFields.size > 0
                ? "bg-[#38BDF8] hover:bg-[#0284c7] text-slate-950 font-bold"
                : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 opacity-70"
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
