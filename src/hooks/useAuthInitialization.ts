import { useState, useEffect } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Trainer, Studio, FranchiseNetwork } from "../types";

export function useAuthInitialization() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authTrainer, setAuthTrainer] = useState<Trainer | null>(null);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [networks, setNetworks] = useState<FranchiseNetwork[]>([]);
  const [tokenRole, setTokenRole] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          let claimsRole: string | null = null;
          try {
            const idTokenResult = await u.getIdTokenResult();
            claimsRole = (idTokenResult.claims.role as string) || null;
            setTokenRole(claimsRole);
          } catch (err) {
            console.error("Failed to fetch custom user claims: ", err);
          }

          // Fetch base data needed for provider
          const trainerRef = doc(db, "trainers", u.uid);
          const trainerSnap = await getDoc(trainerRef);

          let trainerData: Trainer | null = null;
          const isSystemAdmin =
            claimsRole === "Admin" ||
            claimsRole === "Founder" ||
            claimsRole === "Overseer" ||
            (trainerSnap.exists() &&
              (trainerSnap.data().role === "Admin" ||
                trainerSnap.data().role === "Founder")) ||
            u.email === "jurgensaj@gmail.com";

          if (trainerSnap.exists()) {
            trainerData = {
              id: trainerSnap.id,
              ...trainerSnap.data(),
            } as Trainer;
          } else if (isSystemAdmin) {
            // Create a dynamic profile for the system admin without hardcoded names
            const name = u.displayName || "System Administrator";
            trainerData = {
              id: u.uid,
              fullName: name,
              initials: name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .substring(0, 2)
                .toUpperCase(),
              role: (claimsRole as any) || "Admin",
              pin: "",
              primaryHomeStudioId: "",
              accessibleStudioIds: [],
              activeGuestStudioIds: [],
            } as Trainer;
          }

          setAuthTrainer(trainerData);

          if (!trainerData) {
            // Logged-in user is not a registered trainer or super admin!
            // End authentication cycle and do NOT make calls to secure databases to prevent permission-denied crashes.
            setIsAuthReady(true);
            return;
          }

          const studioSnap = await getDocs(collection(db, "studios"));
          setStudios(
            studioSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Studio)
          );

          const trainersSnap = await getDocs(collection(db, "trainers"));
          setTrainers(
            trainersSnap.docs.map(
              (d) => ({ id: d.id, ...d.data() }) as Trainer
            )
          );

          const networksSnap = await getDocs(collection(db, "networks"));
          setNetworks(
            networksSnap.docs.map(
              (d) => ({ id: d.id, ...d.data() }) as FranchiseNetwork
            )
          );
        } catch (error) {
          console.error("Auth initialization failed", error);
        }
      } else {
        setAuthTrainer(null);
        setNetworks([]);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  return {
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
  };
}
