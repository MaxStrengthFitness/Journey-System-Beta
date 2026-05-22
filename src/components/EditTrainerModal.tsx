import React, { useState, useEffect } from "react";
import { hashPin } from "../lib/auth-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Network } from "lucide-react";
import { Trainer, Studio } from "../types";
import { arrayUnion, arrayRemove, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { Switch } from "@/components/ui/switch";
import { generateSearchTokens } from "@/lib/utils";

interface EditTrainerModalProps {
  trainer: Trainer;
  authTrainer?: Trainer | null;
  studios?: Studio[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updates: Partial<Trainer>) => void;
}

export function EditTrainerModal({
  trainer,
  authTrainer,
  studios = [],
  isOpen,
  onOpenChange,
  onSave,
}: EditTrainerModalProps) {
  const [fullName, setFullName] = useState(trainer.fullName);
  const [initials, setInitials] = useState(trainer.initials);
  const [pin, setPin] = useState(trainer.pin || "");
  const [enablePin, setEnablePin] = useState(
    !!trainer.pin || !!trainer.pinHash,
  );
  const [bio, setBio] = useState(trainer.bio || "");
  const [certifications, setCertifications] = useState<string[]>(
    trainer.certifications || [],
  );
  const [newCert, setNewCert] = useState("");

  // Update state when trainer changes
  useEffect(() => {
    if (isOpen) {
      setFullName(trainer.fullName);
      setInitials(trainer.initials);
      setPin(trainer.pin || "");
      setEnablePin(!!trainer.pin || !!trainer.pinHash);
      setBio(trainer.bio || "");
      setCertifications(trainer.certifications || []);
      setNewCert("");
    }
  }, [trainer, isOpen]);

  const handleAddCert = () => {
    if (newCert.trim() && !certifications.includes(newCert.trim())) {
      setCertifications([...certifications, newCert.trim()]);
      setNewCert("");
    }
  };

  const handleRemoveCert = (cert: string) => {
    setCertifications(certifications.filter((c) => c !== cert));
  };

  const handleSubmit = async () => {
    if (!fullName || !initials) return;
    if (enablePin && pin.length !== 4) return;

    let finalPin = "";
    let finalPinHash = "";

    if (enablePin) {
      if (pin && pin !== trainer.pin) {
        finalPinHash = await hashPin(pin);
        finalPin = ""; // Keep plaintext empty for security if hashed
      } else {
        finalPin = trainer.pin || "";
        finalPinHash = trainer.pinHash || "";
      }
    }

    const searchTokens = generateSearchTokens(fullName);

    onSave({
      fullName,
      initials,
      pin: finalPin,
      pinHash: finalPinHash,
      bio,
      certifications,
      searchTokens,
    });

    onOpenChange(false);
  };

  const toggleStudioAccess = async (
    studioId: string,
    isGrantingAccess: boolean,
  ) => {
    if (!trainer.id) return;
    try {
      const ref = doc(db, "trainers", trainer.id);
      await updateDoc(ref, {
        accessibleStudioIds: isGrantingAccess
          ? arrayUnion(studioId)
          : arrayRemove(studioId),
      });
      // the snapshot listener in App.tsx will automatically update
    } catch (err) {
      console.error("Failed to toggle studio access", err);
    }
  };

  const isSuperAdmin = authTrainer?.role === "Admin" || authTrainer?.role === "Founder" || authTrainer?.role === "Overseer";
  const role = authTrainer?.role;
  const isSystemAdmin = role === "Admin" || isSuperAdmin;
  const isOverseer = role === "Overseer";
  const isStudioOwner = role === "StudioOwner";
  const isHeadTrainer = role === "HeadTrainer";

  const assignableStudios = studios.filter((s) => {
    if (isSystemAdmin || isOverseer) return true;
    if (isStudioOwner) {
      return (
        authTrainer?.primaryHomeStudioId === s.id ||
        authTrainer?.ownedStudioIds?.includes(s.id!)
      );
    }
    if (isHeadTrainer) {
      return authTrainer?.primaryHomeStudioId === s.id;
    }
    return false;
  });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white">
            Edit Profile
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-widest">
              Full Name
            </Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl h-12 font-medium"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-widest">
                Initials
              </Label>
              <Input
                value={initials}
                onChange={(e) => setInitials(e.target.value.toUpperCase())}
                className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl h-12 uppercase font-medium"
                maxLength={3}
              />
            </div>
            <div className="space-y-4 border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-widest">
                    PIN Lock Security
                  </Label>
                  <p className="text-[9px] text-slate-400 dark:text-slate-500 font-medium">
                    Require a 4-digit PIN to login
                  </p>
                </div>
                <Switch
                  checked={enablePin}
                  onCheckedChange={(checked) => {
                    setEnablePin(checked);
                    if (!checked) setPin("");
                  }}
                />
              </div>
              {enablePin && (
                <div className="space-y-2">
                  <Label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-widest">
                    4-Digit PIN Code
                  </Label>
                  <Input
                    value={pin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, "");
                      if (val.length <= 4) setPin(val);
                    }}
                    className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl h-10 font-mono"
                    maxLength={4}
                    placeholder="Enter 4 digits"
                    type="password"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-widest">
              Intelligence Summary (Bio)
            </Label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl min-h-[100px] resize-none font-medium"
              placeholder="Field experience and specialized training..."
            />
          </div>

          <div className="space-y-3">
            <Label className="text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 tracking-widest">
              Certifications
            </Label>
            <div className="flex flex-wrap gap-2">
              {certifications.map((cert) => (
                <Badge
                  key={cert}
                  variant="outline"
                  className="rounded-xl border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold px-3 py-1.5 flex items-center gap-1"
                >
                  {cert}
                  <button
                    onClick={() => handleRemoveCert(cert)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={newCert}
                onChange={(e) => setNewCert(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCert();
                  }
                }}
                className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl h-10 flex-1 font-medium"
                placeholder="e.g. CPT, NSCA"
              />
              <Button
                type="button"
                onClick={handleAddCert}
                variant="outline"
                className="rounded-xl h-10 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm shrink-0 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white"
              >
                <Plus className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </Button>
            </div>
          </div>

          {/* Cross-Training & Studio Access */}
          {assignableStudios.length > 0 && (
            <div className="space-y-3 pt-6 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 mb-4">
                <Network className="w-5 h-5 text-indigo-500" />
                <Label className="text-[12px] font-black uppercase text-slate-900 dark:text-white tracking-widest">
                  Cross-Training & Studio Access
                </Label>
              </div>

              <div className="grid gap-3">
                {assignableStudios.map((studio) => {
                  const hasAccess =
                    trainer.accessibleStudioIds?.includes(studio.id!) ||
                    trainer.primaryHomeStudioId === studio.id;
                  const isHomeStudio =
                    trainer.primaryHomeStudioId === studio.id;

                  return (
                    <div
                      key={studio.id}
                      className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl"
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 dark:text-white text-sm">
                          {studio.name}
                        </span>
                        {isHomeStudio && (
                          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mt-0.5">
                            Primary Home Base
                          </span>
                        )}
                      </div>
                      <Switch
                        checked={hasAccess}
                        disabled={isHomeStudio}
                        onCheckedChange={(checked) =>
                          toggleStudioAccess(studio.id!, checked)
                        }
                        className={hasAccess ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700"}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="pt-4 border-t border-slate-200 dark:border-slate-800">
          <Button
            onClick={handleSubmit}
            disabled={!fullName || !initials || (enablePin && pin.length !== 4)}
            className="w-full bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 font-black uppercase tracking-widest text-xs h-12 rounded-xl transition-all shadow-md"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
