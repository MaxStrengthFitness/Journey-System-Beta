/**
 * The report screen when there is no report to show: the client is still
 * loading, the report belongs to someone else, or it could not be read.
 *
 * One plain sentence and a way back. It never offers to start a report —
 * whatever went wrong, the trainer goes back to the record and chooses again
 * from there, where the name on the screen is the client they will get.
 *
 * Imported directly (not through the folder's index) because AppContent
 * shows it outside the lazily loaded editor, and the index would pull the
 * whole editor into the first download.
 */
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./progress-report.tokens.css";

export function ReportNotOpened({
  message,
  onBack,
}: {
  message: string;
  onBack: () => void;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center min-h-[60dvh] p-6 space-y-8 max-w-2xl mx-auto text-center bg-(--pr-navy) rounded-[60px] my-12 border border-(--pr-raise-border) shadow-2xl"
    >
      <p className="text-lg font-bold text-(--pr-on-navy) leading-relaxed">{message}</p>
      <Button
        variant="ghost"
        onClick={onBack}
        className="text-(--pr-on-navy-2) hover:text-(--pr-on-navy) hover:bg-(--pr-raise-2) font-bold uppercase tracking-[0.3em] text-[11px] h-12 px-8"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to the record
      </Button>
    </div>
  );
}
