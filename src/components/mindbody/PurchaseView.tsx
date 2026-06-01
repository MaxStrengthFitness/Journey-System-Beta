import React from "react";
import { CreditCard } from "lucide-react";

export function PurchaseView() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden text-center p-8 mt-6">
      <div className="w-20 h-20 bg-brand/10 rounded-full flex items-center justify-center mb-6">
        <CreditCard className="w-10 h-10 text-brand" />
      </div>
      <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-4 text-slate-900 dark:text-white">
        Mindbody Purchase Flow
      </h2>
      <p className="text-slate-500 max-w-md mx-auto leading-relaxed">
        New e-commerce integration for Mindbody. Connect your Mindbody account 
        to enable direct point-of-sale functionality for memberships, drop-ins, 
        and merchandise directly from within the Max Strength App.
      </p>
    </div>
  );
}
