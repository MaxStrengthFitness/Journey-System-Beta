import { useEffect } from "react";
import { signOut } from "firebase/auth";
import { OpeningJourney } from "./features/front-door/CheckingIn";
import { auth } from "./firebase";
import { ActiveStudioProvider } from "./contexts/ActiveStudioContext";
import { ToastProvider } from "./contexts/ToastContext";
import { UnsavedChangesProvider } from "./features/unsaved-changes";
import AppContent from "./AppContent";
import { useAuthInitialization } from "./hooks/useAuthInitialization";
import { migrateClientMachineMetrics } from "./lib/migration-utils";
import { endPersonalSession, personKey } from "./features/sign-out/sign-out";

export default function App() {
  const {
    user,
    isAuthReady,
    authTrainer,
    setAuthTrainer,
    studios,
    setStudios,
    trainers,
    setTrainers,
    networks,
    setNetworks,
    tokenRole,
    setTokenRole,
    signInRefusal,
    trainerLookup,
    lookupStep,
    retryLookup,
  } = useAuthInitialization();

  const handleLogout = async () => {
    /* The next person on this iPad starts fresh (sign-out round, Sep 24
       2026): storage, one-shot handoffs and module memory here, React state
       by the key below. The pinned studio is a property of this device, not
       of the session -- a floor tablet should still open its own studio for
       the next trainer. It is re-checked against that trainer's access before
       it is used, so keeping it cannot grant anyone entry to somewhere they
       can't go. See features/sign-out. */
    endPersonalSession({ local: localStorage, session: sessionStorage });
    setAuthTrainer(null);
    setNetworks([]);
    setTokenRole(null);
    await signOut(auth);
  };

  useEffect(() => {
    (window as any).migrateClientMachineMetrics = migrateClientMachineMetrics;
  }, []);

  // Before Firebase has answered: the front door's three squares, so the
  // first frame of every visit is already Journey's (features/front-door).
  if (!isAuthReady) return <OpeningJourney />;

  return (
    <>
      {/* No MindbodyHealthProvider here any more: the webhook's health is
          watched by Operations → Mindbody alone (the speed round, Oct 5
          2026; features/admin/mindbody/AdminMindbodyTab.tsx). */}
      <ToastProvider>
        {/* Keyed on the person, so a sign-out unmounts every screen, mode,
            selection and the in-memory studio with it, and the next person
            mounts fresh. The only way to be sure nothing is carried over,
            including state added after this was written. */}
        <ActiveStudioProvider
          key={personKey(user, authTrainer)}
          studios={studios}
          networks={networks}
          authTrainer={authTrainer}
          isAdmin={
            tokenRole === "Admin" ||
            authTrainer?.role === "Admin" ||
            tokenRole === "Founder" ||
            authTrainer?.role === "Founder"
          }
          userEmail={user?.email || undefined}
          tokenRole={tokenRole || authTrainer?.role || undefined}
          onLogout={handleLogout}
        >
          {/* Above AppContent so every screen can say "I hold unsaved
              typing" and every navigation can ask first. See
              features/unsaved-changes/README.md. */}
          <UnsavedChangesProvider>
          <AppContent
            user={user!}
            authTrainer={authTrainer!}
            setAuthTrainer={setAuthTrainer}
            studios={studios}
            setStudios={setStudios}
            trainers={trainers}
            setTrainers={setTrainers}
            networks={networks}
            setNetworks={setNetworks}
            handleLogout={handleLogout}
            tokenRole={tokenRole}
            signInRefusal={signInRefusal}
            trainerLookup={trainerLookup}
            lookupStep={lookupStep}
            retryLookup={retryLookup}
          />
          </UnsavedChangesProvider>
        </ActiveStudioProvider>
      </ToastProvider>
    </>
  );
}
