/**
 * Adaptador Computrabajo — exports públicos de platforms/computrabajo.
 * Wiring a application/index.js lo abre Don Jose; este módulo solo reexporta.
 */

export { discoverComputrabajo } from "./discovery.js";
export {
  APPLY_LINK_SELECTOR,
  SUCCESS_TITLE_RE,
  SesionCaidaError,
  applyComputrabajo,
  assertOwnStorageState,
  humanDelayMs,
  humanPause,
  resolveStorageStatePath,
} from "./apply.js";
