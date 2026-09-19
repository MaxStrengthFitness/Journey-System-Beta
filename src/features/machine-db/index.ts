/**
 * features/machine-db — the MSF machine database: every MSF machine and every
 * machine a studio shared, adoption onto a studio's floor, and what studios
 * shared about each machine. See ./README.md.
 */

export { MachineDatabase } from "./MachineDatabase";
export { NetworkNotes } from "./NetworkNotes";
export { ScopeSwitch, type CatalogScope } from "./ScopeSwitch";
export { ShareToggle } from "./ShareToggle";
export {
  sharedKeysFor,
} from "./database";
export { setMachineShared, setNoteShared, setTipShared } from "./mutations";
