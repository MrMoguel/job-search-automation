/**
 * Adaptador Laborum — exports públicos de platforms/laborum.
 * Wiring a application/index.js lo abre Don Jose; este módulo solo reexporta.
 */

export { discoverLaborum } from "./discovery.js";
export {
  applyLaborum,
  assertOwnStorageState,
  resolveStorageStatePath,
} from "./apply.js";
