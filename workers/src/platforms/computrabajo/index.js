/**
 * Adaptador Computrabajo — exports públicos de platforms/computrabajo.
 * Wiring a application/index.js lo abre Don Jose; este módulo solo reexporta.
 */

export { discoverComputrabajo } from "./discovery.js";
export {
  applyComputrabajo,
  assertOwnStorageState,
  resolveStorageStatePath,
} from "./apply.js";
