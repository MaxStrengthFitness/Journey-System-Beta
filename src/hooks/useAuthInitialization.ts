import { useState, useEffect } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { Trainer, Studio, FranchiseNetwork } from "../types";
import {
  decideClaim,
  claimedProfile,
  tombstone,
  withoutSuperseded,
} from "../features/trainer-identity/claim";

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
            // Ignoring token claims error
          }

          let trainerData: Trainer | null = null;

          // Microsoft/Azure AD sign-in frequently leaves the top-level email
          // null and only exposes the address on the provider entry. The trainer
          // lookup is keyed on email, so without this fallback a valid Microsoft
          // user is treated as having no profile and sent to Request Access.
          const resolvedEmail =
            u.email || u.providerData?.find((p) => p?.email)?.email || null;

          if (resolvedEmail) {
            try {
              /**
               * UID FIRST, THEN EMAIL.
               *
               * This order used to be reversed, and the reversal is what made
               * the trainer-identity bug permanent. Every Firestore rule asks
               * whether request.auth.uid matches the document id, so
               * trainers/{uid} is the ONLY document a person can actually
               * write. Matching on email first meant that whenever both
               * existed, the app handed them the one they could not use.
               *
               * Looking up the uid first also makes the claim below
               * idempotent: once trainers/{uid} exists it always wins, so a
               * claim that half-finished — new document written, old one not
               * yet superseded — resolves correctly on the next sign-in and
               * can simply be run again.
               */
              if (u.uid) {
                const uidDoc = await getDoc(doc(db, "trainers", u.uid));
                if (uidDoc.exists()) {
                  const rawData = uidDoc.data();
                  trainerData = {
                    id: uidDoc.id,
                    ...rawData,
                    role: rawData.role || "LifeTransformer",
                  } as Trainer;
                }
              }

              if (!trainerData) {
                const trainersRef = collection(db, "trainers");
                const q = query(
                  trainersRef,
                  where("email", "==", resolvedEmail.toLowerCase()),
                );
                const querySnapshot = await getDocs(q);

                // Skip anything a previous claim already superseded, so a
                // leftover document can never be handed back to its owner.
                const live = querySnapshot.docs.filter(
                  (d) => !d.data()?.supersededByUid,
                );

                if (live.length > 0) {
                  const docSnap = live[0];
                  const rawData = docSnap.data();

                  /**
                   * CLAIM. An admin-created placeholder becomes a real
                   * account the first time its owner signs in — because
                   * sign-in is the first moment their uid exists.
                   *
                   * Write the new document FIRST, tombstone the placeholder
                   * SECOND. There is no transaction spanning a create and an
                   * update that the rules will accept here, so the claim can
                   * be interrupted between the two, and the order is what
                   * makes every interruption harmless: stopping after step 1
                   * leaves a working trainers/{uid} that the lookup above
                   * now finds first, and the next sign-in finishes the job.
                   * The reverse order would strand someone with no profile.
                   */
                  const decision = decideClaim(
                    { id: docSnap.id, ...rawData } as any,
                    u.uid,
                    resolvedEmail,
                  );

                  if (decision.kind === "claim") {
                    const nowIso = new Date().toISOString();
                    try {
                      const claimed = claimedProfile(
                        { ...rawData, id: docSnap.id },
                        u.uid,
                        nowIso,
                      );
                      await setDoc(doc(db, "trainers", u.uid), claimed);
                      trainerData = {
                        id: u.uid,
                        ...claimed,
                        role: (claimed.role as string) || "LifeTransformer",
                      } as unknown as Trainer;

                      // Best effort. If this fails the profile still works —
                      // the uid lookup wins from here — and the next sign-in
                      // retries, because decideClaim is a no-op once
                      // trainers/{uid} exists.
                      try {
                        await updateDoc(
                          doc(db, "trainers", docSnap.id),
                          tombstone(u.uid, nowIso),
                        );
                      } catch (tombErr) {
                        console.warn(
                          "Claimed the profile but could not mark the placeholder superseded.",
                          tombErr,
                        );
                      }
                    } catch (claimErr) {
                      // Fall back to the placeholder. They are no worse off
                      // than before this round, and nothing was destroyed.
                      console.warn(
                        "Could not claim trainer profile.",
                        claimErr,
                      );
                    }
                  }

                  if (!trainerData) {
                    trainerData = {
                      id: docSnap.id,
                      ...rawData,
                      role: rawData.role || "LifeTransformer",
                    } as Trainer;
                  }
                }
              }

              // Bootstrap the owner if they have no profile at all
              if (
                !trainerData &&
                resolvedEmail.toLowerCase() === "jurgensaj@gmail.com"
              ) {
                const newTrainer: Trainer = {
                  id: u.uid,
                  fullName: "System Admin",
                  initials: "SA",
                  role: "Admin",
                  email: resolvedEmail.toLowerCase(),
                  primaryHomeStudioId: "system",
                  accessibleStudioIds: ["system"],
                  activeGuestStudioIds: [],
                };
                try {
                  await setDoc(doc(db, "trainers", u.uid), newTrainer);
                  trainerData = newTrainer;
                } catch (err) {
                  // Fallback dynamic profile if writes fail
                  trainerData = newTrainer;
                }
              }
            } catch (e) {
              console.warn("Could not fetch trainer profile.", e);
            }
          }

          setAuthTrainer(trainerData);

          try {
            const studioSnap = await getDocs(collection(db, "studios"));
            setStudios(
              studioSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Studio),
            );
          } catch (e) {
            console.warn("Could not fetch studios collection", e);
          }

          if (!trainerData) {
            setIsAuthReady(true);
            return;
          }

          try {
            const trainersSnap = await getDocs(collection(db, "trainers"));
            setTrainers(
              withoutSuperseded(
                trainersSnap.docs.map(
                  (d) => ({ id: d.id, ...d.data() }) as Trainer,
                ),
              ),
            );
          } catch (e) {}

          try {
            const networksSnap = await getDocs(collection(db, "networks"));
            setNetworks(
              networksSnap.docs.map(
                (d) => ({ id: d.id, ...d.data() }) as FranchiseNetwork,
              ),
            );
          } catch (e) {}
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
