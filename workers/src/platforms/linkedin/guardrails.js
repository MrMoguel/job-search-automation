/**
 * Guardrails LinkedIn — obligatorios para cualquier browser/sesión de esta plataforma.
 *
 * Principios (CLAUDE.md):
 * - Nunca headless
 * - Reusar storageState de la cuenta propia del usuario
 * - Rate limit conservador (pocas apps/día) + delays humanos
 * - Solo cuenta propia; nunca datos de terceros
 *
 * Playwright determinista: cero código generado por postulación.
 */

import { existsSync } from "node:fs";

/** Máximo de Easy Apply / submits por día calendario (UTC o local del host). */
export const DAILY_APPLY_LIMIT = Number(process.env.LINKEDIN_DAILY_APPLY_LIMIT || 8);

/** Rango de delay humano entre acciones (ms). */
export const HUMAN_DELAY_MS = {
  min: Number(process.env.LINKEDIN_DELAY_MIN_MS || 1200),
  max: Number(process.env.LINKEDIN_DELAY_MAX_MS || 3500),
};

/** Path al storageState persistente (sesión propia). Override con LINKEDIN_STORAGE_STATE. */
export function resolveStorageStatePath(env = process.env) {
  return (
    env.LINKEDIN_STORAGE_STATE ||
    env.LINKEDIN_AUTH_STATE ||
    "/app/.auth-state/linkedin.json"
  );
}

/**
 * Lanza si alguien intenta headless o un launchOptions inseguro.
 * @param {{ headless?: boolean }} launchOptions
 */
export function assertNeverHeadless(launchOptions = {}) {
  if (launchOptions.headless === true || launchOptions.headless === undefined) {
    // undefined también se rechaza: el caller debe pasar headless: false explícito
    if (launchOptions.headless !== false) {
      throw new Error(
        "LinkedIn guardrail: headless está prohibido. Pasá { headless: false }."
      );
    }
  }
}

/**
 * Valida que exista storageState de la cuenta propia antes de lanzar browser.
 */
export function assertOwnStorageState(storageStatePath = resolveStorageStatePath()) {
  if (!storageStatePath || !existsSync(storageStatePath)) {
    throw new Error(
      `LinkedIn guardrail: falta storageState propio en ${storageStatePath}. ` +
        "Exportá la sesión una vez (login manual) y no re-loguees en cada corrida."
    );
  }
  return storageStatePath;
}

/**
 * Opciones de chromium.launch / launchPersistentContext seguras para LinkedIn.
 * Siempre headless: false + storageState path resuelto.
 */
export function linkedInBrowserOptions(env = process.env) {
  const storageState = assertOwnStorageState(resolveStorageStatePath(env));
  const options = {
    headless: false,
    storageState,
  };
  assertNeverHeadless(options);
  return options;
}

/** Delay aleatorio estilo humano. */
export function humanDelayMs() {
  const { min, max } = HUMAN_DELAY_MS;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function humanPause() {
  await sleep(humanDelayMs());
}

/**
 * Gate de rate limit diario. `alreadyAppliedToday` lo provee el caller (DB).
 * @param {number} alreadyAppliedToday
 */
export function assertUnderDailyLimit(alreadyAppliedToday) {
  const n = Number(alreadyAppliedToday) || 0;
  if (n >= DAILY_APPLY_LIMIT) {
    throw new Error(
      `LinkedIn guardrail: rate limit diario alcanzado (${n}/${DAILY_APPLY_LIMIT}). ` +
        "Pará la corrida; no forzar más Easy Apply hoy."
    );
  }
}
