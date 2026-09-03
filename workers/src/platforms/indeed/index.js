/**
 * Adaptador Indeed — exports públicos de platforms/indeed.
 * Wiring a application/index.js lo abre Don Jose; este módulo solo reexporta.
 */

export { discoverIndeed } from "./discovery.js";
export {
  applyIndeed,
  assertOwnStorageState,
  resolveStorageStatePath,
} from "./apply.js";
