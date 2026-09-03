/**
 * Discovery GOB / Empleos Públicos (empleospublicos.cl) — scaffold.
 *
 * Etapa scaffolding: firma estable + shape de postings; implementación real de
 * listado (cheerio HTML público o Playwright + storageState si hace falta sesión)
 * queda para un PR posterior. Selectores en NOTES.md (TBD).
 *
 * Playwright determinista: cero código generado por postulación.
 */

/**
 * @typedef {object} GobPosting
 * @property {"gob"} source
 * @property {string} source_job_id
 * @property {string} company
 * @property {string} title
 * @property {string|null} location
 * @property {string} url
 * @property {string|null} description_raw
 */

/**
 * Scaffold: retorna lista vacía hasta mapear selectores del listado.
 *
 * @param {{
 *   queries?: string[],
 *   location?: string,
 *   maxPages?: number,
 *   withDescriptions?: boolean,
 *   requestDelayMs?: number,
 * }} [opts]
 * @returns {Promise<GobPosting[]>}
 */
export async function discoverGob({
  queries = [],
  location = "Chile",
  maxPages = 1,
  withDescriptions = true,
  requestDelayMs = 1500,
} = {}) {
  // Pre-flight de firma: el orquestador podrá pasar estos opts sin romper.
  void queries;
  void location;
  void maxPages;
  void withDescriptions;
  void requestDelayMs;

  // TODO(gob): fetch listado empleospublicos.cl, parsear convocatorias → GobPosting.
  // Confirmar si el HTML es público (cheerio) o requiere sesión (Playwright).
  // Selectores en NOTES.md — no inventar CSS sin DOM real.
  return [];
}
