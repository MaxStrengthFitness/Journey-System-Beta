/**
 * The tracker's "who are we training?" picker, shown when the Active Session
 * tab is opened with no client selected.
 *
 * Moved out of components/WorkoutTrackerView.tsx, unchanged, in the beta-prep
 * trim (Sep 17 2026). See PerformanceEntryDialog.tsx for why.
 */
import { useState } from "react";
import { Search, Users, ChevronRight } from "lucide-react";
import { Client } from "../../types";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function ClientSelectionDialog({
  clients,
  onSelect,
  onClose,
  open = true,
  title = "Select Client",
  description = "Choose a client to start their current training session.",
}: {
  clients: Client[];
  onSelect: (id: string) => void;
  onClose: () => void;
  open?: boolean;
  title?: string;
  description?: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = clients.filter((c) =>
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-112.5 rounded-3xl p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-2xl font-black uppercase italic tracking-tight">
            {title}
          </DialogTitle>
          <DialogDescription className="font-bold text-xs">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Find client..."
              className="pl-10 h-11 rounded-xl bg-white dark:bg-bg-dark border-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[60dvh] overflow-y-auto px-6 pb-6 pt-2 space-y-2">
          {filtered.length > 0 ? (
            filtered.map((client) => (
              <button
                key={client.id}
                onClick={() => onSelect(client.id!)}
                className="w-full text-left p-4 rounded-2xl border-2 border-transparent hover:border-primary/20 hover:bg-primary/5 transition-all flex items-center justify-between group"
              >
                <div>
                  <p className="font-black text-lg leading-tight uppercase">
                    {client.firstName} {client.lastName}
                  </p>
                  <p className="text-[11px] font-bold text-muted-foreground uppercase opacity-60">
                    {client.height} • {client.weight || "--"} lbs
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))
          ) : (
            <div className="py-12 text-center opacity-40">
              <Users className="w-12 h-12 mx-auto mb-2" />
              <p className="text-xs font-black uppercase">No clients found</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
