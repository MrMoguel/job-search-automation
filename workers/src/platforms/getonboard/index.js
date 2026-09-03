/**
 * Adaptador Get on Board — exports públicos de platforms/getonboard.
 * Wiring a application/index.js lo abre Don Jose; este módulo solo reexporta.
 */

export { discoverGetOnBoard } from "./discovery.js";
export {
  applyGetOnBoard,
  assertOwnStorageState,
  resolveStorageStatePath,
} from "./apply.js";
