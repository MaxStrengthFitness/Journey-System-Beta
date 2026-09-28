import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { modelsReadOf, type ModelsRead } from "./models";

/**
 * The model records (`machineModels`), read only while a screen has a use
 * for them (wave 2 of the Machine Catalog room, Catalog R4).
 *
 * `enabled` false costs nothing: the floor asks only when one of its units
 * names a model, and All MSF only while a movement's page is open. One
 * listener on a small collection, everyone signed in may read it (the
 * Machine Codex's rules). A read that fails — the collection's rules not
 * deployed yet, or offline with nothing cached — is "unreadable", and every
 * screen then draws nothing about models rather than saying there are none.
 */
export function useMachineModels(enabled: boolean): ModelsRead {
  const [read, setRead] = useState<ModelsRead>(enabled ? { state: "loading" } : { state: "off" });

  useEffect(() => {
    if (!enabled) {
      setRead({ state: "off" });
      return;
    }
    setRead({ state: "loading" });
    const unsub = onSnapshot(
      collection(db, "machineModels"),
      (snap) => setRead(modelsReadOf(snap.docs.map((d) => ({ id: d.id, data: d.data() })))),
      (error) => {
        // Expected until the model record's rules are deployed: say nothing.
        console.warn("[catalog] machine models couldn't be read:", error?.message ?? error);
        setRead({ state: "unreadable" });
      },
    );
    return () => unsub();
  }, [enabled]);

  return read;
}
