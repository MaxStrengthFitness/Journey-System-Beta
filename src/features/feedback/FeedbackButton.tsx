/**
 * The always-there way in.
 *
 * Round: Settings tiers & Task Board, Sep 2026.
 *
 * Lives in the global header next to the announcements bell, so the report is
 * one tap from wherever the problem is. That matters more than it sounds: a
 * trainer who hits a bug mid-session will not navigate to a settings screen
 * afterwards and reconstruct it from memory, and a report written an hour
 * later is missing the only details that would have made it reproducible.
 */

import { Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "./FeedbackProvider";

export function FeedbackButton({ className }: { className?: string }) {
  const { open } = useFeedback();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => open("bug")}
      title="Report a bug or share feedback"
      aria-label="Report a bug or share feedback"
      className={
        className ??
        "h-10 w-10 rounded-full transition-colors hover:bg-transparent shrink-0 text-muted-foreground hover:text-foreground"
      }
    >
      <Bug className="w-5 h-5 sm:w-6 sm:h-6" />
    </Button>
  );
}
