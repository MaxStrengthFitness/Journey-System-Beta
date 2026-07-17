import React, { useEffect } from "react";
import { signOut, User as FirebaseUser } from "firebase/auth";
import { motion } from "motion/react";
import { auth } from "./firebase";
import { ActiveStudioProvider } from "./ActiveStudioContext";
import { MindbodyHealthProvider } from "./contexts/MindbodyHealthContext";
import { ToastProvider } from "./contexts/ToastContext";
import AppContent from "./AppContent";
import { useAuthInitialization } from "./hooks/useAuthInitialization";
import { migrateClientMachineMetrics } from "./lib/migration-utils";

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
    localStorage.clear();
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
        <ActiveStudioProvider
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
