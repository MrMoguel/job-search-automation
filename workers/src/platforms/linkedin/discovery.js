/**
 * Discovery LinkedIn Jobs — scaffold.
 *
 * A diferencia de Computrabajo/RemoteOK, LinkedIn NO tiene listado útil sin sesión.
 * Este adaptador asume Playwright + storageState (cuenta propia) vía guardrails.
 *
 * Etapa scaffolding: firma estable + shape de postings; implementación real de
 * selectores / scroll del feed queda para un PR posterior (no apply en prod aún).
 */

import {
  assertNeverHeadless,
  assertOwnStorageState,
  humanPause,
  resolveStorageStatePath,
} from "./guardrails.js";

/**
 * @typedef {object} LinkedInPosting
 * @property {"linkedin"} source
 * @property {string} source_job_id
 * @property {string} company
 * @property {string} title
 * @property {string|null} location
 * @property {string} url
 * @property {string|null} description_raw
 */

/**
 * Scaffold: valida guardrails y retorna lista vacía hasta mapear selectores del feed.
 *
 * @param {{
 *   queries?: string[],
 *   location?: string,
 *   maxResults?: number,
 *   page?: import('playwright').Page,
 * }} [opts]
 * @returns {Promise<LinkedInPosting[]>}
 */
export async function discoverLinkedIn({
  queries = [],
  location = "Chile",
  maxResults = 25,
  page = null,
} = {}) {
  // Pre-flight: aunque el stub no navegue, fallamos temprano si la sesión no está lista.
  assertOwnStorageState(resolveStorageStatePath());
  assertNeverHeadless({ headless: false });

  void queries;
  void location;
  void maxResults;

  if (!page) {
    // Sin page inyectada no scrapemos: el orquestador debe pasar un Page con sesión.
    // Evita lanzar browser desde discovery en scaffolding.
    return [];
  }

  // TODO(linkedin): navegar a /jobs/search, aplicar queries, paginar con delays humanos,
  // extraer cards → LinkedInPosting. Selectores en NOTES.md.
  await humanPause();
  return [];
}
