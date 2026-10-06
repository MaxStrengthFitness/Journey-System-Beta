import { useState, useEffect, useCallback, useRef } from "react";
import { onAuthStateChanged, signOut, User as FirebaseUser } from "firebase/auth";
import {
  doc,
  getDoc,
  getDocFromCache,
  collection,
  getDocs,
  getDocsFromCache,
  onSnapshot,
  query,
  where,
  setDoc,
  updateDoc,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { SWITCHED_OFF_SENTENCE, isSwitchedOff } from "../features/sign-out/account-off";
import { auth, db } from "../firebase";
import { Trainer, Studio, FranchiseNetwork } from "../types";
import {
  decideClaim,
  claimedProfile,
  tombstone,
  withoutSuperseded,
} from "../features/trainer-identity/claim";
import { endPersonalSession, personChanged } from "../features/sign-out/sign-out";
import {
  NOTHING_KNOWN,
  TIMED_OUT,
  accessChanged,
  recordChanged,
  levelOf,
  listAnswerCounts,
  listSeen,
  markListSeen,
  raise,
  trainerFromDoc,
  withTimeout,
  type BootKnowledge,
  type ReadLevel,
} from "../features/front-door/boot-lookup";
import { markBoot } from "../features/boot-timing/boot-timing";

/** What a live listener says about its answer, so an empty one from the cache alone doesn't count. */
export interface LiveMeta {
  fromCache?: boolean;
}

type BootList = keyof BootKnowledge;

/** This device's local storage, or null where there is none. */
function deviceStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Whether an answer for a list counts (boot-lookup.ts): the server's always,
 * the iPad's copy only once the server has answered in full here before. A
 * server answer is remembered for next time.
 */
function answerCountsFor(list: BootList, count: number, fromCache: boolean): boolean {
  const storage = deviceStorage();
  if (!listAnswerCounts(list, count, fromCache, listSeen(storage, list))) return false;
  if (!fromCache) markListSeen(storage, list);
  return true;
}

/**
 * How long opening Journey waits for the person's role claim before it
 * carries on without it (the speed round, Oct 5 2026). The token is read
 * locally while it is fresh; after an hour asleep it is refreshed from the
 * server, which on dead Wi-Fi can take Auth's own thirty seconds. Past this
 * the app opens and the claim is checked when it lands.
 */
const CLAIM_WAIT_MS = 2000;

/**
 * How long opening waits for a FRESH token once the claim is known to
 * disagree with the record (a leader just promoted or demoted). Rare, and the
 * listeners the app starts carry the token they start with: a leader-only
 * listener started on the old one is refused by the rules and never comes
 * back until a reload, so this waits as long as Checking you in's own slow
 * line (the speed round's review, Oct 5 2026). Before the speed round it had
 * no limit at all.
 */
const CLAIM_REFRESH_WAIT_MS = 10000;

export function useAuthInitialization() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authTrainer, setAuthTrainer] = useState<Trainer | null>(null);
  const [studios, setStudiosState] = useState<Studio[]>([]);
  const [trainers, setTrainersState] = useState<Trainer[]>([]);
  const [networks, setNetworksState] = useState<FranchiseNetwork[]>([]);
  /**
   * How much is known about each list (the speed round, Oct 5 2026, R4):
   * unknown, the iPad's own copy, or the server. features/front-door/
   * boot-lookup.ts says why the screens need it.
   */
  const [known, setKnown] = useState<BootKnowledge>(NOTHING_KNOWN);
  const [tokenRole, setTokenRole] = useState<string | null>(null);
  /** Why the last sign-in was turned away (a switched-off account), for the sign-in screen. */
  const [signInRefusal, setSignInRefusal] = useState<string | null>(null);
  /**
   * Where finding the signed-in person has got to (the front door, Oct 3
   * 2026). Firebase answers "signed in" before Journey has found the trainer
   * record, and AppContent used to read that gap as "no record": every
   * returning trainer saw the Request Access form flash, and anyone whose read
   * FAILED (bad Wi-Fi) was treated as a stranger. "checking" is the gap,
   * "failed" a read that never answered: neither is "not on a team".
   * features/front-door/README.md.
   */
  const [trainerLookup, setTrainerLookup] = useState<TrainerLookup>("idle");
  /** How many of the three check steps are done: signed in, record, studios. */
  const [lookupStep, setLookupStep] = useState(0);
  const resolveRef = useRef<((u: FirebaseUser | null, opts?: ResolveOptions) => void) | null>(null);
  /** Look the signed-in person up again (Try again on "Can't check"). */
  const retryLookup = useCallback(() => {
    if (auth.currentUser) resolveRef.current?.(auth.currentUser);
  }, []);

  /**
   * Which lists a live listener (AppContent's useStudios, useTrainers,
   * useNetworks) or an explicit refresh has already filled. The boot's own
   * read of a list never overwrites one of those: it is older by definition.
   */
  const liveRef = useRef<Record<BootList, boolean>>({ studios: false, trainers: false, networks: false });

  const markKnown = useCallback((list: BootList, level: ReadLevel) => {
    setKnown((prev) => {
      const next = raise(prev[list], level);
      return next === prev[list] ? prev : { ...prev, [list]: next };
    });
  }, []);

  /* The setters handed to the rest of the app: a listener's answer, or a
     refresh. An empty answer from the cache alone changes nothing. */
  const setStudios = useCallback(
    (list: Studio[], meta?: LiveMeta) => {
      const fromCache = Boolean(meta?.fromCache);
      if (!answerCountsFor("studios", list.length, fromCache)) return;
      liveRef.current.studios = true;
      setStudiosState(list);
      markKnown("studios", levelOf(fromCache));
    },
    [markKnown],
  );
  const setTrainers = useCallback(
    (list: Trainer[], meta?: LiveMeta) => {
      const fromCache = Boolean(meta?.fromCache);
      if (!answerCountsFor("trainers", list.length, fromCache)) return;
      liveRef.current.trainers = true;
      setTrainersState(list);
      markKnown("trainers", levelOf(fromCache));
    },
    [markKnown],
  );
  const setNetworks = useCallback(
    (list: FranchiseNetwork[], meta?: LiveMeta) => {
      const fromCache = Boolean(meta?.fromCache);
      if (!answerCountsFor("networks", list.length, fromCache)) return;
      liveRef.current.networks = true;
      setNetworksState(list);
      markKnown("networks", levelOf(fromCache));
    },
    [markKnown],
  );

  /** Which lookup is current: an answer for an older one (a sign-out, Try again) is dropped. */
  const generationRef = useRef(0);

  /**
   * While signed in, watch the person's own trainer record (one document).
   * An account switched off by an administrator signs them out at once
   * rather than at their next sign-in (Oct 2 2026). Since the speed round
   * (Oct 5 2026) it is also the correction for opening on the iPad's own
   * copy of the record: when the server's copy says the person's access
   * changed (role, studios, switched on or off), the app takes it, and a
   * changed role fetches a fresh role claim. A record the server says is
   * gone runs the lookup again. A failed read changes nothing.
   */
  const watchedTrainerId = authTrainer?.id && authTrainer.id !== "owner-temp" ? authTrainer.id : null;
  /* The record as the app holds it now, for the watch to compare against. */
  const authTrainerRef = useRef<Trainer | null>(authTrainer);
  authTrainerRef.current = authTrainer;
  useEffect(() => {
    if (!watchedTrainerId) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const refreshClaim = () => {
      const run = () => {
        const u = auth.currentUser;
        if (!u) return;
        u.getIdTokenResult(true)
          .then((r) => setTokenRole((r.claims.role as string) || null))
          .catch(() => {});
      };
      run();
      // The claim is set by a Cloud Function a moment after the record
      // changes; ask once more after it has had time to run.
      timers.push(setTimeout(run, 8000));
    };
    const unsub = onSnapshot(
      doc(db, "trainers", watchedTrainerId),
      (snap) => {
        const fromCache = snap.metadata.fromCache;
        if (!snap.exists()) {
          // Gone on the server (not merely missing from the iPad's copy):
          // find the person again, QUIETLY. The screen stays as it is (never
          // Checking you in over the Hub or a running session); only a record
          // found under another id is taken, and anything else waits for the
          // next open (the speed round's review, Oct 5 2026).
          if (!fromCache && auth.currentUser) resolveRef.current?.(auth.currentUser, { quiet: true });
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        if (isSwitchedOff(data as { isActive?: boolean })) {
          setSignInRefusal(SWITCHED_OFF_SENTENCE);
          endPersonalSession({ local: localStorage, session: sessionStorage });
          setAuthTrainer(null);
          setUser(null);
          void signOut(auth).catch((err) => console.warn("Could not sign a switched-off account out.", err));
          return;
        }
        const fresh = trainerFromDoc<Trainer>(snap.id, data);
        const prev = authTrainerRef.current;
        if (!prev || prev.id !== fresh.id) return;
        const was = prev as unknown as Record<string, unknown>;
        const now = fresh as unknown as Record<string, unknown>;
        // The server's copy is taken whole when anything differs (the name and
        // initials Start stamps on a session, a photo, a list): the app may
        // have opened on a days-old copy (the speed round's final review).
        // The iPad's own copy is taken only when access changed.
        if (fromCache ? !accessChanged(was, now) : !recordChanged(was, now)) return;
        setAuthTrainer(fresh);
        if (prev.role !== fresh.role) refreshClaim();
      },
      (err) => console.warn("Could not watch the signed-in trainer's record.", err),
    );
    return () => {
      unsub();
      timers.forEach(clearTimeout);
    };
  }, [watchedTrainerId]);

  useEffect(() => {
    /* Whose sign-in the app last saw: undefined until Firebase first answers. */
    let lastUid: string | null | undefined = undefined;

    /**
     * One list, read for the boot: the iPad's own copy first, so a warm iPad
     * paints at once; the server only when the copy has nothing, or nothing
     * this iPad can trust to be the whole list (boot-lookup.ts,
     * cacheAnswerUsable). Either way
     * AppContent's live listener starts beside it and brings the server's
     * answer, which always wins (liveRef). A read that fails, or the server
     * unreachable with nothing stored, leaves the list unknown, never empty.
     */
    const bootRead = async (list: BootList, generation: number): Promise<void> => {
      const apply = (docs: QueryDocumentSnapshot[], level: ReadLevel) => {
        if (generation !== generationRef.current || liveRef.current[list]) return;
        if (list === "studios") {
          setStudiosState(docs.map((d) => ({ id: d.id, ...d.data() }) as Studio));
        } else if (list === "trainers") {
          setTrainersState(withoutSuperseded(docs.map((d) => ({ id: d.id, ...d.data() }) as Trainer)));
        } else {
          setNetworksState(docs.map((d) => ({ id: d.id, ...d.data() }) as FranchiseNetwork));
        }
        markKnown(list, level);
      };
      const ref = collection(db, list);
      try {
        const cached = await getDocsFromCache(ref);
        if (answerCountsFor(list, cached.size, true)) {
          apply(cached.docs, "cache");
          return;
        }
      } catch {
        /* Nothing stored for it: ask the server. */
      }
      try {
        const snap = await getDocs(ref);
        if (!answerCountsFor(list, snap.size, snap.metadata.fromCache)) return;
        apply(snap.docs, levelOf(snap.metadata.fromCache));
      } catch (e) {
        console.warn(`Could not read the ${list} collection.`, e);
      }
    };

    const resolve = async (u: FirebaseUser | null, opts?: ResolveOptions) => {
      // Firebase has said who is signed in (R30; once a page load).
      markBoot("auth-ready");
      /* A look-up again while someone is already in (the self-watch): it
         changes nothing on screen unless it finds their record. */
      const quiet = Boolean(opts?.quiet && u && authTrainerRef.current && u.uid === lastUid);
      // A quiet look-up doesn't make the boot's own reads of the lists stale.
      const generation = quiet ? generationRef.current : ++generationRef.current;
      const current = () => generation === generationRef.current;
      /* A sign-out that did not come through the menu — another tab, an
         expired account, a Microsoft account from outside the company turned
         away by the sign-in screen — must forget the last person too. The
         menu's handleLogout has usually done this already; twice is harmless.
         Sign-out round, Sep 24 2026 (features/sign-out). */
      const uid = u?.uid ?? null;
      if (personChanged(lastUid, uid)) {
        endPersonalSession({ local: localStorage, session: sessionStorage });
      }
      lastUid = uid;
      setUser(u);
      if (u) {
        if (!quiet) {
          setTrainerLookup("checking");
          setLookupStep(1);
        }
        /* A read of the trainer record that threw: unknown, never "none". */
        let lookupFailed = false;
        try {
          /* The role claim, read beside the record rather than before it.
             Locally while the token is fresh; see CLAIM_WAIT_MS. */
          const claimsPromise: Promise<string | null> = u
            .getIdTokenResult()
            .then((r) => (r.claims.role as string) || null);
          void claimsPromise
            .then((role) => {
              if (current()) setTokenRole(role);
            })
            .catch(() => {
              // Ignoring token claims error
            });

          let trainerData: Trainer | null = null;

          // Microsoft/Azure AD sign-in frequently leaves the top-level email
          // null and only exposes the address on the provider entry. The trainer
          // lookup is keyed on email, so without this fallback a valid Microsoft
          // user is treated as having no profile and sent to Request Access.
          const resolvedEmail =
            u.email || u.providerData?.find((p) => p?.email)?.email || null;

          /*
           * THE iPAD'S OWN COPY FIRST (the speed round, Oct 5 2026, R4). On
           * an iPad that has opened Journey before, trainers/{uid} is in the
           * offline cache: the app opens on it at once, and the self-watch
           * above brings the server's copy a round trip later and corrects
           * anything that changed. A copy that says switched off is not
           * trusted to refuse anyone: the server decides that.
           */
          if (resolvedEmail && u.uid && !quiet) {
            try {
              const cached = await getDocFromCache(doc(db, "trainers", u.uid));
              if (cached.exists()) {
                const fromCopy = trainerFromDoc<Trainer>(cached.id, cached.data());
                if (!isSwitchedOff(fromCopy)) trainerData = fromCopy;
              }
            } catch {
              /* Not in the iPad's copy: the server lookup below. */
            }
          }

          if (resolvedEmail && !trainerData) {
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
                  trainerData = trainerFromDoc<Trainer>(uidDoc.id, uidDoc.data());
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
                    trainerData = trainerFromDoc<Trainer>(docSnap.id, rawData);
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
              lookupFailed = true;
            }
          }

          if (!current()) return;

          /**
           * SWITCHED OFF (Oct 2 2026). A former trainer's account an
           * administrator switched off is refused here, at the door: signed
           * straight out, with a sentence on the sign-in screen that says why.
           * See features/sign-out/account-off.ts.
           */
          if (isSwitchedOff(trainerData)) {
            setSignInRefusal(SWITCHED_OFF_SENTENCE);
            setAuthTrainer(null);
            try {
              await signOut(auth);
            } catch (err) {
              console.warn("Could not sign a switched-off account out.", err);
            }
            // Never the Request Access screen for them: they are refused, not new.
            setUser(null);
            setIsAuthReady(true);
            return;
          }
          if (trainerData) setSignInRefusal(null);

          /* Quiet: nothing found, or nothing readable, changes nothing now. */
          if (quiet && !trainerData) return;

          /* The record couldn't be read: "Can't check", never Request Access. */
          if (!trainerData && lookupFailed) {
            setAuthTrainer(null);
            setTrainerLookup("failed");
            setIsAuthReady(true);
            return;
          }

          /* Nobody: the access request, which names a studio, so it waits
             for the studios. */
          if (!trainerData) {
            setAuthTrainer(null);
            await bootRead("studios", generation);
            if (!current()) return;
            setTrainerLookup("done");
            setIsAuthReady(true);
            return;
          }

          /**
           * ROLE CLAIM (cost round, Sep 2026). The Cloud Function
           * syncTrainerClaims mirrors trainers/{uid}.role onto the token, and
           * firestore.rules read the token's role before the document — so
           * with the claim present, every role check stops costing a read.
           * An ID token is minted for an hour, so the claim a role change (or
           * the first deploy) set can lag the document. When they disagree,
           * refresh the token ONCE before the app opens, so every listener it
           * starts carries the new one; disagreeing after the refresh means
           * the function has not run for this person yet (or their document
           * id is not their uid), and the rules then fall back to the
           * document exactly as before. Since the speed round (Oct 5 2026)
           * reading the claim waits at most CLAIM_WAIT_MS (past it the app
           * opens, and the check finishes when the token arrives), and a
           * claim known to disagree waits up to CLAIM_REFRESH_WAIT_MS for the
           * fresh token.
           */
          const record = trainerData;
          const settleClaim = async (claimsRole: string | null) => {
            if (record.role === claimsRole) return;
            try {
              const refreshed = await u.getIdTokenResult(true);
              if (current()) setTokenRole((refreshed.claims.role as string) || null);
            } catch (err) {
              // Ignoring token refresh error
            }
          };
          const claimsRole = await withTimeout(claimsPromise, CLAIM_WAIT_MS);
          if (!current()) return;
          if (claimsRole === TIMED_OUT) {
            void claimsPromise.then(settleClaim).catch(() => {});
          } else {
            await withTimeout(settleClaim(claimsRole), CLAIM_REFRESH_WAIT_MS);
            if (!current()) return;
          }

          /*
           * THE APP OPENS HERE (the speed round, Oct 5 2026, R4): on the
           * trainer record, not after every studio, trainer and network has
           * been read one after another. The three lists are read together
           * below, from the iPad's copy first; AppContent's listeners start
           * now and bring the server's answers; and every screen that would
           * say something off a list asks whether it is known first.
           */
          if (quiet) {
            const prev = authTrainerRef.current;
            if (
              !prev ||
              prev.id !== record.id ||
              accessChanged(prev as unknown as Record<string, unknown>, record as unknown as Record<string, unknown>)
            ) {
              setAuthTrainer(record);
            }
            return;
          }
          setAuthTrainer(record);
          setLookupStep(2);
          setTrainerLookup("done");
          setIsAuthReady(true);
          markBoot("trainer-ready");
          void Promise.all([
            bootRead("studios", generation),
            bootRead("trainers", generation),
            bootRead("networks", generation),
          ]).then(() => {
            if (current()) setLookupStep(3);
          });
          return;
        } catch (error) {
          console.error("Auth initialization failed", error);
          if (current() && !quiet) setTrainerLookup("failed");
        }
      } else {
        setTrainerLookup("idle");
        setLookupStep(0);
        setAuthTrainer(null);
        setNetworksState([]);
        liveRef.current = { studios: false, trainers: false, networks: false };
        setKnown((prev) => ({ ...prev, networks: "unknown" }));
        // The last person's role claim. Left here it would still answer
        // "is this an administrator" for whoever signs in next, until their
        // own token was read — and forever, if that read failed.
        setTokenRole(null);
      }
      setIsAuthReady(true);
    };
    resolveRef.current = (u, opts) => void resolve(u, opts);
    const unsubscribe = onAuthStateChanged(auth, (u) => void resolve(u));

    return () => {
      resolveRef.current = null;
      unsubscribe();
    };
  }, [markKnown]);

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
    /** A list has answered (the iPad's copy or the server): screens may say what it holds. */
    studiosKnown: known.studios !== "unknown",
    trainersKnown: known.trainers !== "unknown",
    networksKnown: known.networks !== "unknown",
    /** The server has answered for the studios: only then is a studio missing from it really gone. */
    studiosConfirmed: known.studios === "server",
    tokenRole,
    setTokenRole,
    signInRefusal,
    trainerLookup,
    lookupStep,
    retryLookup,
  };
}

export type TrainerLookup = "idle" | "checking" | "done" | "failed";

/** quiet: look the signed-in person up again without touching the screen (the self-watch). */
interface ResolveOptions {
  quiet?: boolean;
}
