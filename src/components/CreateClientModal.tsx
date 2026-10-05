import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserPlus, Loader2, AlertTriangle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { Client, Studio } from "../types";
import { handleFirestoreError, OperationType } from "../lib/firestore-errors";
import { canSaveNewClient, newClientPayload } from "../lib/consultation-answers";
import { studiosInRealm } from "../features/demo-mode/access";
import {
  ADD_CLIENT_REASONS,
  provisionalStamp,
} from "../features/admin/provisional/provisional";

/*
 * Add Client is a TEMPORARY PROFILE (Oct 2 2026). AJ: "Add Client makes a
 * temporary profile any trainer can start (run a session when Mindbody is
 * down or for a walk-in, attached to her Mindbody record later by the
 * existing merge)". It writes the same marker the Team panel's temporary
 * profiles carry (features/admin/provisional), so she is listed as waiting on
 * My Studio -> Team and the one merge (ReconcileDialog) moves her sessions
 * onto her real record once Mindbody has her. The "Existing client" tab and
 * its route to the legacy chart importer are gone: Journey no longer waits on
 * FileMaker.
 */

interface CreateClientModalProps {
  clients: Client[];
  initialName?: string;
  onClose: () => void;
  onClientCreated: (clientId: string) => void;
  studios: Studio[];
  /**
   * The studio this iPad is working in. The home studio starts on it and can
   * be changed but not left blank: the rules refuse a client with no studio
   * for everyone below super admin.
   */
  activeStudioId?: string | null;
  /** Trainer document id of whoever is adding her (the marker's provisionalBy). */
  authorId?: string;
}

export function CreateClientModal({
  clients,
  initialName = "",
  onClose,
  onClientCreated,
  studios,
  activeStudioId = null,
  authorId = "",
}: CreateClientModalProps) {
  const nameParts = initialName.trim().split(" ");
  const [firstName, setFirstName] = useState(nameParts[0] || "");
  const [lastName, setLastName] = useState(
    nameParts.length > 1 ? nameParts.slice(1).join(" ") : "",
  );
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<string>("");
  const [age, setAge] = useState<string>("");
  const [homeStudioId, setHomeStudioId] = useState<string>(activeStudioId || "");
  const [discoveryNotes, setDiscoveryNotes] = useState("");

  const [reason, setReason] = useState<string>(ADD_CLIENT_REASONS[0]);

  // Submission & Validation States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<Client | null>(null);

  const canSave = canSaveNewClient({ firstName, lastName, homeStudioId });

  // The realm rule (Oct 1 2026): inside Demo Mode the only home studio on
  // offer is Demo Mode, and from anywhere else Demo Mode is never offered.
  const homeStudioChoices = studiosInRealm(studios, activeStudioId);

  const executeSave = async (force: boolean = false) => {
    if (!canSave) return;

    if (!force) {
      const exactMatch = clients.find(
        (c) =>
          c.firstName.toLowerCase() === firstName.toLowerCase() &&
          c.lastName.toLowerCase() === lastName.toLowerCase(),
      );
      if (exactMatch) {
        setDuplicateWarning(exactMatch);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Only what was answered: no placeholder height, no invented package,
      // no blank fields (lib/consultation-answers.ts).
      const clientData = newClientPayload({
        kind: "prospect",
        firstName,
        lastName,
        phone,
        email,
        gender,
        age,
        homeStudioId,
        discoveryNotes,
      });

      const docRef = await addDoc(collection(db, "clients"), {
        ...clientData,
        ...provisionalStamp({ reason, authorId }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      onClientCreated(docRef.id);
      onClose();
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, "clients");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveClick = () => executeSave(false);

  return (
    // Rendered before the app shell exists (AppContent returns it early), so it
    // keeps clear of the iPad status bar and home indicator itself
    // (features/home-screen), and the card may use all the height between.
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4 sm:px-6 pt-safe-4 pb-safe-4 sm:pt-safe-6 sm:pb-safe-6 bg-slate-900/60 dark:bg-slate-950/90 backdrop-blur-sm">
      <Card className="w-full max-w-2xl bg-card border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-full rounded-[32px] overflow-hidden relative text-foreground">
        {duplicateWarning && (
          <div className="absolute inset-0 z-50 bg-slate-950/40 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-6">
            <div className="bg-card border border-amber-500 rounded-[24px] p-8 max-w-md w-full shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-2 bg-amber-500"></div>
              <div className="flex flex-col items-center text-center gap-6">
                <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-[22px] font-extrabold tracking-[-0.015em] text-foreground mb-2">
                    Duplicate found
                  </h3>
                  <p className="text-muted-foreground font-medium text-sm leading-relaxed">
                    A client named{" "}
                    <span className="text-foreground font-bold">
                      {duplicateWarning.firstName} {duplicateWarning.lastName}
                    </span>{" "}
                    already exists. Are you sure you want to create a duplicate
                    profile?
                  </p>
                </div>
                <div className="flex gap-4 w-full mt-4">
                  <Button
                    variant="outline"
                    className="flex-1 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => {
                      if (duplicateWarning.id) {
                        onClientCreated(duplicateWarning.id);
                      }
                      onClose();
                    }}
                  >
                    Cancel and view existing
                  </Button>
                  <Button
                    className="flex-1 bg-amber-500 hover:bg-amber-500 text-cta-foreground shadow-(--elev-1)"
                    onClick={() => executeSave(true)}
                  >
                    Force create
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="p-8 pb-4 shrink-0 border-b border-slate-200 dark:border-slate-800 space-y-2">
          <h2 className="text-[22px] font-extrabold tracking-[-0.015em] text-foreground">
            Add a client
          </h2>
          <p className="text-sm font-medium text-muted-foreground leading-relaxed">
            A temporary profile, for a walk-in or when Mindbody is down. Run the
            sessions on it as usual. Once Mindbody has the client, a leader joins it
            to the real record on My Studio → Team and the sessions move across.
          </p>
        </div>

        <CardContent className="flex-1 p-8 space-y-8 overflow-y-auto custom-scrollbar bg-card">
          {/* Stage 1: Identity & Contact */}
          <div className="space-y-4">
            <h3 className="text-[14px] font-bold text-(--eq-hero-text) border-b border-slate-200 dark:border-slate-800 pb-2">
              Step 1: Contact information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[14px] font-bold text-ink-d2 ml-1">
                  First name
                </Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="h-12 text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-ring rounded-xl font-bold"
                  placeholder="First"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[14px] font-bold text-ink-d2 ml-1">
                  Last name
                </Label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="h-12 text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-ring rounded-xl font-bold"
                  placeholder="Last"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[14px] font-bold text-ink-d2 ml-1">
                  Phone
                </Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-12 text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-ring rounded-xl font-bold"
                  placeholder="555-555-5555"
                  type="tel"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-[14px] font-bold text-ink-d2 ml-1">
                  Email (optional)
                </Label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-ring rounded-xl font-bold"
                  placeholder="name@email.com"
                  type="email"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[14px] font-bold text-ink-d2 ml-1">
                  Gender (optional)
                </Label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full h-12 bg-(--well) border border-input shadow-(--elev-0) text-foreground focus:border-ring focus:ring-0 rounded-xl font-bold px-3"
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-[14px] font-bold text-ink-d2 ml-1">
                  Age (optional)
                </Label>
                <Input
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="h-12 text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-ring rounded-xl font-bold"
                  placeholder="e.g. 40"
                  type="number"
                  min="0"
                  max="120"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label className="text-[14px] font-bold text-ink-d2 ml-1">
                  Home studio
                </Label>
                <select
                  value={homeStudioId}
                  onChange={(e) => setHomeStudioId(e.target.value)}
                  className="w-full h-12 bg-(--well) border border-input shadow-(--elev-0) text-foreground focus:border-ring focus:ring-0 rounded-xl font-bold px-3"
                >
                  <option value="" disabled>
                    Select Studio
                  </option>
                  {homeStudioChoices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {!homeStudioId && (
                  <p className="text-[12px] font-bold text-muted-foreground ml-1">
                    Pick the studio they train at to save.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Discovery Notes */}
          <div className="space-y-4">
            <h3 className="text-[14px] font-bold text-(--eq-hero-text) border-b border-slate-200 dark:border-slate-800 pb-2">
              Discovery notes
            </h3>
            <div className="space-y-2 mt-4">
              <Label className="text-[14px] font-bold text-ink-d2 ml-1">
                Initial context and questions
              </Label>
              <Textarea
                value={discoveryNotes}
                onChange={(e) => setDiscoveryNotes(e.target.value)}
                placeholder="Why are they coming in? What are their initial questions or concerns? Jot down quick notes to reference during the Stage 2 consultation..."
                className="min-h-30 text-foreground rounded-xl font-medium placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-ring resize-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[14px] font-bold text-ink-d2 ml-1">
              Why a temporary profile
            </Label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full h-12 bg-(--well) border border-input shadow-(--elev-0) text-foreground focus:border-ring focus:ring-0 rounded-xl font-bold px-3"
            >
              {ADD_CLIENT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </CardContent>

        <div className="p-6 bg-card border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 shrink-0 z-50 mt-auto">
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full sm:flex-1 h-14 rounded-2xl"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveClick}
            disabled={isSubmitting || !canSave}
            className="w-full sm:flex-2 h-14 rounded-2xl bg-primary hover:bg-primary text-primary-foreground"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <span className="flex items-center justify-center gap-2">
                <UserPlus className="w-4 h-4" />
                Create temporary profile
              </span>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
