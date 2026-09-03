/**
 * Adaptador LinkedIn — exports públicos de la carpeta platforms/linkedin.
 * Wiring a application/index.js lo abre Don Jose; este módulo solo reexporta.
 */

export {
  DAILY_APPLY_LIMIT,
  HUMAN_DELAY_MS,
  assertNeverHeadless,
  assertOwnStorageState,
  assertUnderDailyLimit,
  humanDelayMs,
  humanPause,
  linkedInBrowserOptions,
  resolveStorageStatePath,
  sleep,
} from "./guardrails.js";

export { discoverLinkedIn } from "./discovery.js";
export { applyLinkedIn } from "./apply.js";
