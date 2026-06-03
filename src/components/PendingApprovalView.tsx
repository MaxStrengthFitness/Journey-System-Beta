import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Clock, LogOut, Zap } from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { Trainer } from '../types';

export function PendingApprovalView({ user, onLogout }: { user: FirebaseUser, onLogout: () => void }) {
  const [isInitializing, setIsInitializing] = useState(false);

  const handleInitializeFounder = async () => {
    try {
      setIsInitializing(true);
      
      const email = user.email || '';
      const parts = email.split('@')[0].split(/[._-]/);
      let initials = 'F';
      if (parts.length >= 2) {
          initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      } else if (parts[0] && parts[0].length >= 2) {
          initials = parts[0].substring(0, 2).toUpperCase();
      } else if (parts[0] && parts[0].length === 1) {
          initials = parts[0].toUpperCase();
      }

      // 1. Write Trainer Document directly to Firestore
      const trainerData: Partial<Trainer> = {
        fullName: email.split('@')[0],
        initials,
        email,
        role: 'Founder',
        systemStatus: 'active',
        requiresPinReset: true,
        isVisibleOnCalendar: true,
        primaryHomeStudioId: 'HQ',
        accessibleStudioIds: [],
        activeGuestStudioIds: [],
        ownedStudioIds: [],
        searchTokens: email.split('@')[0].toLowerCase().split(/[._-]/),
      };

      await setDoc(doc(db, 'trainers', user.uid), trainerData, { merge: true });

      // 2. Call Cloud Function to apply JWT Claim
      const setCustomUserClaims = httpsCallable(functions, "setCustomUserClaims");
      await setCustomUserClaims({ targetUid: user.uid, role: 'Founder' });
      
      // 3. Force Token Refresh
      await user.getIdToken(true);
      
      // Reload the page to catch new token and trainer profile
      window.location.reload();
      
    } catch (e) {
      console.error("Failed to initialize founder:", e);
      alert("Failed to initialize system. Check console.");
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-background to-background opacity-80"></div>
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-lg z-10 flex flex-col items-center justify-center min-h-[60vh] mt-[-5vh]"
      >
        <div className="bg-slate-900 border border-slate-800/80 rounded-[40px] p-10 md:p-14 shadow-2xl flex flex-col items-center text-center relative overflow-hidden backdrop-blur-md w-full">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500/40 via-sky-400 to-blue-500/40" />
          
          <div className="w-20 h-20 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-8 relative">
             <div className="absolute inset-0 rounded-full border border-blue-500/30 animate-[ping_3s_ease-in-out_infinite]"></div>
             <Clock className="w-10 h-10 text-blue-400" />
          </div>

          <h1 className="text-3xl font-black italic uppercase text-white tracking-widest mb-4">
            Pending Approval
          </h1>
          
          <p className="text-zinc-400 mb-8 max-w-sm mx-auto leading-relaxed">
            Your login was successful, but your account (<span className="text-white font-medium">{user.email}</span>) does not have an active trainer profile assigned yet. 
          </p>

          <div className="flex items-center gap-3 bg-blue-950/30 border border-blue-900/50 rounded-2xl p-4 mb-10 w-full text-left">
            <ShieldAlert className="w-5 h-5 text-blue-400 shrink-0" />
            <p className="text-xs text-blue-300">
              Please contact an Administrator to configure your role and studio access.
            </p>
          </div>
          
          <div className="flex flex-col gap-3 w-full max-w-[240px]">
            {user.email === 'jeff@maxstrengthfitness.com' && (
              <Button 
                onClick={handleInitializeFounder}
                disabled={isInitializing}
                className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white w-full font-bold uppercase tracking-widest text-xs h-12 shadow-[0_0_20px_rgba(234,88,12,0.3)]"
              >
                <Zap className="w-4 h-4 mr-2" />
                {isInitializing ? "Initializing..." : "Initialize Founder"}
              </Button>
            )}

            <Button 
              onClick={onLogout}
              variant="outline"
              className="rounded-xl border-slate-700 hover:bg-slate-800 text-white w-full font-bold uppercase tracking-widest text-xs h-12"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
