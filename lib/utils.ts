import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getAnnouncementStyle = (type: string | undefined, priority: string | undefined): string => {
  if (priority === 'high') {
     return 'bg-rose-50 border-rose-500/50 text-rose-900 dark:bg-rose-950/30 dark:border-rose-500/50 dark:text-rose-100 ring-1 ring-rose-500/20';
  }
  
  switch(type) {
    case 'shout-out': return 'bg-emerald-50 border-emerald-500/50 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-500/50 dark:text-emerald-100';
    case 'event': return 'bg-amber-50 border-amber-500/50 text-amber-900 dark:bg-amber-950/30 dark:border-amber-500/50 dark:text-amber-100';
    case 'tip': return 'bg-sky-50 border-sky-500/50 text-sky-900 dark:bg-sky-950/30 dark:border-sky-500/50 dark:text-sky-100';
    case 'news': 
    default: return 'bg-indigo-50 border-indigo-500/50 text-indigo-900 dark:bg-indigo-950/30 dark:border-indigo-500/50 dark:text-indigo-100';
  }
};

export const getRoleColor = (role: string | undefined): string => {
  switch (role) {
    case 'Founder': return 'text-amber-500 border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10';
    case 'Admin': return 'text-indigo-500 border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10';
    case 'Overseer': return 'text-teal-500 border-teal-200 dark:border-teal-500/30 bg-teal-50 dark:bg-teal-500/10';
    case 'Owner':
    case 'FranchiseOwner':
    case 'StudioOwner': return 'text-orange-500 border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/10';
    case 'StudioLeader':
    case 'HeadTrainer': return 'text-sky-500 border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10';
    case 'Trainer':
    case 'LifeTransformer':
    default: return 'text-emerald-500 border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10';
  }
};

export const getRoleDisplayName = (role: string | undefined): string => {
  switch (role) {
    case 'Founder': return 'Founder';
    case 'Admin': return 'Admin';
    case 'Overseer': return 'Overseer';
    case 'Owner':
    case 'FranchiseOwner':
    case 'StudioOwner': return 'Owner';
    case 'StudioLeader':
    case 'HeadTrainer': return 'Studio Leader';
    case 'Trainer':
    case 'LifeTransformer':
    default: return 'Life Transformer';
  }
};
