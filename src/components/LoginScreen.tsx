/**
 * The sign-in screen: the logo, the two provider buttons, the error line.
 *
 * Moved out of AppContent.tsx in the beta-prep trim (Sep 17 2026). The markup
 * is unchanged; AppContent still owns the sign-in itself (handleLogin, the
 * error, the in-flight flag) and hands them in.
 *
 * Two things to fix in the polish step, left as found here:
 *  - the button labels and the footer are `text-slate-900 dark:text-white/..`
 *    on a surface that is dark in BOTH themes, so in light mode they are
 *    near-black on near-black;
 *  - the root is `min-h-screen overflow-hidden` with no scroller, the last of
 *    the pre-shell "scroll trap" screens (ROADMAP, Sep 5).
 */
import { motion } from "motion/react";
import { MaxStrengthLogo } from "./MaxStrengthLogo";
import { cn } from "../lib/utils";

export interface LoginScreenProps {
  isLoggingIn: boolean;
  loginError: string | null;
  onLogin: (provider: "google" | "microsoft") => void;
}

export function LoginScreen({ isLoggingIn, loginError, onLogin }: LoginScreenProps) {
  return (
    <div className="min-h-screen bg-[#1c1d1f] flex flex-col items-center justify-center p-6 focus:outline-none relative overflow-hidden">
      {/* Background Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-[#005187]/20 via-[#1c1d1f] to-[#121212] opacity-80"></div>
      {/* Pattern Overlay */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/hexellence.png')] opacity-10 mix-blend-overlay"></div>
      {/* Edge Shadow */}
      <div className="absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.8)] pointer-events-none"></div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-lg z-10 flex flex-col items-center justify-center min-h-[60dvh] mt-[-5dvh]"
      >
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <MaxStrengthLogo
              size="2xl"
              theme="dark"
              showSlogan={true}
              className="drop-shadow-[0_15px_35px_rgba(0,0,0,0.6)] mb-8"
            />
          </motion.div>

          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-transparent bg-clip-text bg-linear-to-r from-slate-200 via-white to-slate-400 font-extrabold tracking-[0.3em] text-2xl md:text-3xl uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]"
          >
            Journey System
          </motion.h1>
        </div>

        {loginError && (
          <div className="mt-8 bg-red-500/10 border border-red-500/50 p-4 rounded-xl text-red-100 text-sm max-w-sm text-center font-medium shadow-[0_0_15px_rgba(220,38,38,0.3)] w-full">
            {loginError}
          </div>
        )}

        <div className="mt-8 w-full flex flex-col items-center justify-center gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onLogin("google")}
            disabled={isLoggingIn}
            className={cn(
              "relative overflow-hidden group w-full max-w-[320px] rounded-[40px] p-0.5 shadow-[0_15px_30px_rgba(0,0,0,0.5)] transition-opacity",
              isLoggingIn ? "opacity-50 cursor-not-allowed" : "opacity-100",
            )}
          >
            {/* Outer Metallic Ring */}
            <div className="absolute inset-0 bg-linear-to-b from-[#8b9bb4] via-[#33465e] to-[#1a2b41] rounded-[40px]"></div>
            {/* Inner highlight */}
            <div className="absolute inset-px bg-linear-to-b from-white/30 to-transparent rounded-[39px]"></div>

            <div className="relative bg-[#1d2736]/90 px-8 py-4 rounded-[38px] flex flex-row items-center justify-center gap-4 w-full h-full shadow-[inset_0_2px_15px_rgba(0,0,0,0.8)] backdrop-blur-md">
              <svg
                className="w-6 h-6 text-slate-900 dark:text-white/90"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span className="font-bold text-slate-900 dark:text-white/90 text-sm tracking-wide">
                Continue with Google
              </span>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onLogin("microsoft")}
            disabled={isLoggingIn}
            className={cn(
              "relative overflow-hidden group w-full max-w-[320px] rounded-[40px] p-0.5 shadow-[0_15px_30px_rgba(0,0,0,0.5)] transition-opacity",
              isLoggingIn ? "opacity-50 cursor-not-allowed" : "opacity-100",
            )}
          >
            {/* Outer Metallic Ring */}
            <div className="absolute inset-0 bg-linear-to-b from-[#8b9bb4] via-[#33465e] to-[#1a2b41] rounded-[40px]"></div>
            {/* Inner highlight */}
            <div className="absolute inset-px bg-linear-to-b from-white/30 to-transparent rounded-[39px]"></div>

            <div className="relative bg-[#1d2736]/90 px-8 py-4 rounded-[38px] flex flex-row items-center justify-center gap-4 w-full h-full shadow-[inset_0_2px_15px_rgba(0,0,0,0.8)] backdrop-blur-md">
              <svg
                className="w-6 h-6 text-slate-900 dark:text-white/90"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
              </svg>
              <span className="font-bold text-slate-900 dark:text-white/90 text-sm tracking-wide">
                Continue with Microsoft
              </span>
            </div>
          </motion.button>
        </div>
      </motion.div>

      <div className="absolute bottom-6 w-full text-center z-10 px-6 flex flex-col items-center gap-3">
        <p className="text-slate-900 dark:text-white/30 text-[10px] sm:text-xs tracking-wider uppercase font-medium">
          Master/Admin Credentials Required for Administrative Portal Access
        </p>
        <div className="text-[#ff9800] font-black text-xs uppercase tracking-widest transition-colors mb-4 md:mb-0">
          No Account? Sign in to Request Access.
        </div>
      </div>
    </div>
  );
}
