import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft, 
  Info, 
  LogOut, 
  User, 
  Mail, 
  Phone, 
  MessageSquare, 
  Users,
  MapPin
} from "lucide-react";
import { collection, addDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Studio, Trainer } from "../types";

interface AccessRequestViewProps {
  authenticatedUser?: any; // Google User if logged in
  studios?: Studio[];
  onTrainerCreated?: (t: Trainer) => void;
  onClose?: () => void;    // For unauthenticated guests returning to login
  onLogout?: () => void;   // Allow logged-in but unauthorized users to sign out
}

export default function AccessRequestView({
  authenticatedUser,
  studios = [],
  onTrainerCreated,
  onClose,
  onLogout,
}: AccessRequestViewProps) {
  const [fullName, setFullName] = useState(authenticatedUser?.displayName || "");
  const [email, setEmail] = useState(authenticatedUser?.email || "");
  const [phone, setPhone] = useState("");
  const [roleRequested, setRoleRequested] = useState("Trainer");
  const [reason, setReason] = useState("");
  const [selectedStudioId, setSelectedStudioId] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const isAutoAssigned = false; // Everyone must go through admin approval now

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      setSubmitError("Please fill out your name and email address.");
      return;
    }
    if (isAutoAssigned && !selectedStudioId) {
      setSubmitError("Please select your Home Studio to continue.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (isAutoAssigned) {
        // Auto-create trainer document
        const newTrainer: Trainer = {
          id: authenticatedUser.uid,
          fullName: fullName.trim(),
          initials: fullName
            .split(" ")
            .map((n) => n[0])
            .join("")
            .substring(0, 2)
            .toUpperCase(),
          role: "Trainer",
          pin: "",
          primaryHomeStudioId: selectedStudioId,
          accessibleStudioIds: [selectedStudioId],
          activeGuestStudioIds: [],
        };
        
        const trainerRef = doc(db, "trainers", authenticatedUser.uid);
        await setDoc(trainerRef, newTrainer);
        
        if (onTrainerCreated) {
          onTrainerCreated(newTrainer);
        }
        return; // Complete
      } else {
        await addDoc(collection(db, "access_requests"), {
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          roleRequested,
          reason: reason.trim(),
          status: "Pending",
          userId: authenticatedUser?.uid || null,
          createdAt: serverTimestamp(),
        });
        setSubmitSuccess(true);
      }
    } catch (err: any) {
      console.error("Error submitting access request:", err);
      setSubmitError(err.message || "Something went wrong while submitting your request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1c1d1f] flex flex-col items-center justify-center p-4 md:p-6 relative overflow-hidden text-white font-sans">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#3a352c] via-[#1c1d1f] to-[#121212] opacity-85"></div>
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/hexellence.png')] opacity-5 mix-blend-overlay"></div>
      <div className="absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.95)] pointer-events-none"></div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-lg bg-[#27282b]/90 border border-slate-800 rounded-[32px] p-6 md:p-8 z-10 shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl relative"
      >
        {/* Top Header Row */}
        <div className="flex justify-between items-center mb-6">
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-xs uppercase tracking-widest font-bold"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center gap-2 text-slate-400 hover:text-orange-400 transition-colors text-xs uppercase tracking-widest font-bold ml-auto"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          )}
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-2xl bg-[#ff9800]/10 border border-[#ff9800]/20 mb-4 text-[#ff9800]">
            <Info className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-widest mb-2 bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-300">
            {submitSuccess ? "Request Submitted" : "Access Request Hub"}
          </h2>
          <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
            {submitSuccess
              ? "Your request has been filed successfully. Administrator review is required to authenticate your account."
              : authenticatedUser
              ? `Your account (${authenticatedUser.email}) is authenticated, but is not registered as an authorized trainer inside the Max Strength Journey System.`
              : "Welcome to the Journey System. If you are a team member and do not have account credentials, you may request system access directly below."}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {!submitSuccess ? (
            <motion.form
              key="request-form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              {authenticatedUser && (
                <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 flex items-center gap-3">
                  <img
                    src={authenticatedUser.photoURL || ""}
                    referrerPolicy="no-referrer"
                    alt={fullName}
                    className="w-10 h-10 rounded-full border border-slate-700 bg-slate-800"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  <div>
                    <span className="text-xs uppercase tracking-wider text-[#ff9800] font-black block">
                      Account Signed In
                    </span>
                    <span className="text-sm font-bold text-slate-200 block truncate">
                      {authenticatedUser.displayName || authenticatedUser.email || "Unknown User"}
                    </span>
                  </div>
                </div>
              )}

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-slate-400 text-[11px] font-bold uppercase tracking-wider block">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full bg-[#1b1c1e] text-white pl-12 pr-4 py-3.5 rounded-xl border border-slate-800 focus:outline-none focus:border-[#ff9800] transition-colors text-sm"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-slate-400 text-[11px] font-bold uppercase tracking-wider block">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    disabled={!!authenticatedUser}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className="w-full bg-[#1b1c1e] text-white pl-12 pr-4 py-3.5 rounded-xl border border-slate-800 focus:outline-none focus:border-[#ff9800] transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-slate-400 text-[11px] font-bold uppercase tracking-wider block">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Enter phone number"
                    className="w-full bg-[#1b1c1e] text-white pl-12 pr-4 py-3.5 rounded-xl border border-slate-800 focus:outline-none focus:border-[#ff9800] transition-colors text-sm"
                  />
                </div>
              </div>

              {/* Role or Studio Selection */}
              {isAutoAssigned ? (
                <div className="space-y-1.5">
                  <label className="text-slate-400 text-[11px] font-bold uppercase tracking-wider block">
                    Select Your Home Studio
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                    <select
                      value={selectedStudioId}
                      onChange={(e) => setSelectedStudioId(e.target.value)}
                      required
                      className="w-full bg-[#1b1c1e] text-white pl-12 pr-4 py-3.5 rounded-xl border border-emerald-500/50 focus:outline-none focus:border-emerald-500 transition-colors text-sm appearance-none cursor-pointer"
                    >
                      <option value="" disabled>Select your primary location...</option>
                      {studios.map(studio => (
                        <option key={studio.id} value={studio.id}>{studio.name}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-emerald-400/80 text-[10px] mt-1 italic">
                    Your maxstrengthfitness.com email is recognized. Link your studio to enter immediately.
                  </p>
                </div>
              ) : (
                <>
                  {/* Role */}
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-[11px] font-bold uppercase tracking-wider block">
                      Requested Role
                    </label>
                    <div className="relative">
                      <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <select
                        value={roleRequested}
                        onChange={(e) => setRoleRequested(e.target.value)}
                        className="w-full bg-[#1b1c1e] text-white pl-12 pr-4 py-3.5 rounded-xl border border-slate-800 focus:outline-none focus:border-[#ff9800] transition-colors text-sm appearance-none cursor-pointer"
                      >
                        <option value="Trainer">Performance Trainer / LifeTransformer</option>
                        <option value="StudioOwner">Studio Owner / Franchise Member</option>
                        <option value="Administrative">Administrative Office Staff</option>
                        <option value="Client">Active Training Client</option>
                      </select>
                    </div>
                  </div>

                  {/* Reason */}
                  <div className="space-y-1.5">
                    <label className="text-slate-400 text-[11px] font-bold uppercase tracking-wider block">
                      Message / Details (Optional)
                    </label>
                    <div className="relative">
                      <MessageSquare className="absolute left-4 top-4 w-4 h-4 text-slate-500" />
                      <textarea
                        rows={3}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Provide details about your studio association or request."
                        className="w-full bg-[#1b1c1e] text-white pl-12 pr-4 py-3.5 rounded-xl border border-slate-800 focus:outline-none focus:border-[#ff9800] transition-colors text-sm resize-none"
                      />
                    </div>
                  </div>
                </>
              )}

              {submitError && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-3 p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-200 text-xs"
                >
                  <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500" />
                  <p className="flex-1 leading-relaxed">{submitError}</p>
                </motion.div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs uppercase tracking-widest transition-all mt-3 active:scale-[0.98] cursor-pointer shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Submitting...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Send className="w-4 h-4" />
                    {isAutoAssigned ? "Complete Account Setup" : "Submit Request"}
                  </span>
                )}
              </Button>
            </motion.form>
          ) : (
            <motion.div
              key="submit-success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-6 space-y-6"
            >
              <div className="flex justify-center">
                <div className="inline-flex p-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="w-12 h-12" />
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-emerald-400 font-black text-xs uppercase tracking-widest block">
                  Request Filed Successfully
                </span>
                <p className="text-slate-300 text-sm max-w-sm mx-auto leading-relaxed">
                  Excellent! Your access request for <strong>{fullName}</strong> has been saved. Administrative staff will evaluate this form and set up your system roster credentials shortly.
                </p>
                <p className="text-slate-500 text-xs mt-2 italic">
                  No other steps are required on your end. You may close this tab or sign out.
                </p>
              </div>

              <div className="pt-4 flex justify-center gap-4">
                {onClose && (
                  <Button
                    onClick={onClose}
                    variant="outline"
                    className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl px-5 h-11 uppercase text-[10px] tracking-widest font-black"
                  >
                    Back to Login
                  </Button>
                )}
                {onLogout && (
                  <Button
                    onClick={onLogout}
                    className="bg-[#1b1c1e] border border-slate-800 text-slate-300 hover:text-white rounded-xl px-5 h-11 uppercase text-[10px] tracking-widest font-black"
                  >
                    Logout Account
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
