/**
 * Adaptador GOB / Empleos Públicos — exports públicos de platforms/gob.
 * Wiring a application/index.js lo abre Don Jose; este módulo solo reexporta.
 */

export { discoverGob } from "./discovery.js";
export {
  applyGob,
  assertOwnStorageState,
  resolveStorageStatePath,
} from "./apply.js";
