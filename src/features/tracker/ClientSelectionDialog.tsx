/**
 * WHO'S THIS? The tracker's client picker: who an open session is for.
 *
 * Moved out of components/WorkoutTrackerView.tsx in the beta-prep trim (Sep
 * 17 2026). Since the open session round (Oct 9 2026; finding 3 of
 * docs/rounds/2026-10-09-open-session.md) it is opened from the session bar's
 * Who's this? at any time, and still from Finish:
 *
 * - It finds a person the way the Client Directory does: the one name matcher
 *   (features/client-directory/search.ts), so "judy" finds Judith, "obrien"
 *   finds O'Brien, and a typo finds the close matches, said as such. It was a
 *   plain substring of "first last".
 * - A row is the name alone, wrapped and never cut short. It showed each
 *   client's height and body weight, which nobody needs to tell two people
 *   apart and nobody should read off a screen on the floor.
 * - **New client** adds the person and gives them this session
 *   (`onCreateNew`); it used to leave the session behind.
 */
import { useMemo, useState } from "react";
import { Search, Users, ChevronRight, UserPlus } from "lucide-react";
import { Client } from "../../types";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { buildNameIndex, compareTier, searchNames } from "../client-directory/search";
import { goesByNickname } from "../../lib/client-name";

const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** `Judith "Judy" Alvarez`: the legal first name, the nickname she goes by, the last name, as the Directory writes it. */
export function pickerName(client: Pick<Client, "firstName" | "lastName" | "nickname">): string {
  const first = clean(client.firstName);
  const nickname = goesByNickname(client) ? clean(client.nickname) : null;
  return [first, nickname ? `“${nickname}”` : null, clean(client.lastName)].filter(Boolean).join(" ") || "Unnamed client";
}

export function ClientSelectionDialog({
  clients,
  onSelect,
  onClose,
  onCreateNew,
  open = true,
  title = "Who's this?",
  description = "Choose the client. The session carries on as theirs.",
}: {
  clients: Client[];
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Add a new client and give them this session. */
  onCreateNew?: () => void;
  open?: boolean;
  title?: string;
  description?: string;
}) {
  const [search, setSearch] = useState("");

  const people = useMemo(
    () =>
      clients
        .filter((c): c is Client & { id: string } => !!c?.id)
        .map((c) => ({ client: c, name: pickerName(c) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [clients],
  );
  const index = useMemo(
    () => buildNameIndex(people.map(({ client: c }) => ({ id: c.id, first: c.firstName ?? "", nickname: goesByNickname(c) ? c.nickname : null, last: c.lastName ?? "" }))),
    [people],
  );
  const result = useMemo(() => searchNames(index, search), [index, search]);
  const shown = useMemo(() => {
    if (result.words.length === 0) return people;
    // A quick-find ranks: best tier first, then by name.
    return people
      .filter(({ client: c }) => result.matches.has(c.id))
      .sort((a, b) => compareTier(result.matches.get(a.client.id)!, result.matches.get(b.client.id)!));
  }, [people, result]);

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-112.5 rounded-3xl p-0 overflow-hidden" data-testid="client-picker">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-2 flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Find a client"
              aria-label="Find a client"
              className="pl-10 h-11 rounded-xl"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          {onCreateNew && (
            <button
              type="button"
              onClick={onCreateNew}
              className="w-full min-h-11 px-4 rounded-xl border border-input bg-(--raised) shadow-(--raised-lift) text-[14px] font-bold text-foreground flex items-center gap-2 active:translate-y-px active:shadow-(--press)"
            >
              <UserPlus className="w-4 h-4 text-primary" aria-hidden />
              New client
            </button>
          )}
        </div>

        <div className="max-h-[60dvh] overflow-y-auto px-6 pb-6 pt-2 space-y-2">
          {result.closeOnly && <p className="text-[12px] font-medium text-muted-foreground px-1">No exact match. Close matches:</p>}
          {shown.length > 0 ? (
            shown.map(({ client, name }) => {
              const why = result.matches.get(client.id)?.why ?? null;
              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => onSelect(client.id)}
                  className="w-full text-left p-4 min-h-14 rounded-2xl border border-transparent hover:bg-primary/5 transition-colors flex items-center justify-between gap-3 group"
                >
                  <span className="min-w-0 flex flex-col">
                    <span className="font-bold text-[17px] leading-tight [overflow-wrap:anywhere]" data-testid="client-picker-name">
                      {name}
                    </span>
                    {why && <span className="text-[12px] font-medium text-muted-foreground">{why}</span>}
                  </span>
                  <ChevronRight className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden />
                </button>
              );
            })
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-2" aria-hidden />
              <p className="text-[14px] font-semibold">No clients found</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
