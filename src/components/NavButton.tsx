/**
 * One button of the app's bottom navigation bar.
 *
 * Moved out of AppContent.tsx, unchanged, in the beta-prep trim (Sep 17 2026).
 */
import React from "react";
import { motion } from "motion/react";

export function NavButton({
  active,
  onClick,
  icon,
  label,
  activeColor = "text-[#115E8D]",
  activeBg = "bg-sky-500 dark:bg-sky-600/10",
  activeIndicator = "bg-sky-500 dark:bg-sky-600",
  attention = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeColor?: string;
  activeBg?: string;
  activeIndicator?: string;
  /** A live session is running and this tab is the way back to it:
      the tab stays orange even when not active, with a pulsing dot. */
  attention?: boolean;
}) {
  const tone = active
    ? `${activeColor} scale-105`
    : attention
      ? "text-orange-500 dark:text-orange-400"
      : "text-[#68717A] hover:text-[#115E8D]";
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 min-w-0 flex-col items-center gap-0.5 transition-all duration-300 relative ${tone}`}
    >
      <div
        className={`relative p-1 sm:p-1.5 rounded-lg transition-colors ${active ? activeBg : attention ? "bg-orange-500/10 dark:bg-orange-600/10" : "bg-transparent"}`}
      >
        {icon}
        {attention && !active && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-orange-500 dark:bg-orange-400 ring-2 ring-white dark:ring-slate-950 animate-pulse"
          />
        )}
      </div>
      <span className="w-full text-center truncate text-[9px] sm:text-[11px] font-black uppercase tracking-tighter">
        {label}
      </span>
      {active && (
        <motion.div
          layoutId="nav-indicator"
          className={`absolute -bottom-1 left-0 right-0 h-0.5 rounded-full ${activeIndicator}`}
        />
      )}
    </button>
  );
}
