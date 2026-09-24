import { useEffect } from "react";
import { signOut } from "firebase/auth";
import { motion } from "motion/react";
import { auth } from "./firebase";
import { ActiveStudioProvider } from "./contexts/ActiveStudioContext";
import { MindbodyHealthProvider } from "./contexts/MindbodyHealthContext";
import { ToastProvider } from "./contexts/ToastContext";
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

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground font-medium">
            Loading Max Strength...
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <MindbodyHealthProvider>
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
          />
        </ActiveStudioProvider>
      </ToastProvider>
    </MindbodyHealthProvider>
  );
}
