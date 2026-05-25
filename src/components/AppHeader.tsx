import React from "react";
import { Moon, Bell, Settings } from "lucide-react";
import { MaxStrengthLogo } from "./MaxStrengthLogo";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  variant: "light" | "dark";
  trainerInitials?: string;
  studioName?: string;
  onStudioClick?: () => void;
  onSettingsClick?: () => void;
  rightControls?: React.ReactNode;
  trainerDropdown?: React.ReactNode;
}

export function AppHeader({ 
  variant, 
  trainerInitials, 
  studioName = "SOLON", 
  onStudioClick,
  onSettingsClick,
  rightControls,
  trainerDropdown 
}: AppHeaderProps) {
  const isLight = variant === "light";
  
  return (
    <header className={cn(
      "h-[56px] shrink-0 border-b flex items-center justify-between px-4 z-20",
      isLight ? "bg-white border-div-l" : "bg-bg-dark-2 border-div-d"
    )}>
      <div className="flex items-center gap-3">
        <MaxStrengthLogo size="md" showText={false} className={isLight ? "text-ink-l1" : "text-white"} />
        <button 
          onClick={onStudioClick}
          className={cn(
            "font-display italic text-xl leading-none mt-1 uppercase justify-center transition-opacity",
            isLight ? "text-ink-l3" : "text-white",
            onStudioClick ? "hover:opacity-75 cursor-pointer" : "cursor-default"
          )}
        >
          STRENGTH FITNESS / {studioName}
        </button>
      </div>
      <div className="flex items-center gap-4">
        {rightControls || (
          <>
            {!isLight && (
              <button className="text-ink-d2 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-dark">
                <Moon className="w-5 h-5 fill-current" />
              </button>
            )}
            <button 
              onClick={onSettingsClick}
              className={cn(
                "transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center",
                isLight ? "text-ink-l3 hover:text-ink-l1" : "text-ink-d2 hover:text-white"
              )}
            >
              <Settings className="w-5 h-5" />
            </button>
            <button className={cn(
              "transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center",
              isLight ? "text-cyan hover:text-cyan/80" : "text-ink-d2 hover:text-white"
            )}>
              <Bell className="w-5 h-5" />
            </button>
          </>
        )}
        
        <div className={cn("w-px h-6 mx-1", isLight ? "bg-div-l" : "bg-div-d")} />
        
        {trainerDropdown || (
          <button className={cn(
            "w-11 h-11 rounded-full font-display italic text-sm flex items-center justify-center cursor-pointer shadow-sm mx-auto",
            isLight ? "bg-bg-dark text-white" : "bg-bg-dark-3 text-white border border-div-d"
          )}>
            {trainerInitials}
          </button>
        )}
      </div>
    </header>
  );
}
