/**
 * Discovery Indeed (cl.indeed.com / indeed.com) — scaffold.
 *
 * Etapa scaffolding: firma estable + shape de postings; implementación real de
 * listado (cheerio HTML público o Playwright + storageState si hay wall)
 * queda para un PR posterior. Selectores en NOTES.md (TBD).
 *
 * Playwright determinista: cero código generado por postulación.
 */

/**
 * @typedef {object} IndeedPosting
 * @property {"indeed"} source
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
 *   country?: string,
 *   maxPages?: number,
 *   withDescriptions?: boolean,
 *   requestDelayMs?: number,
 * }} [opts]
 * @returns {Promise<IndeedPosting[]>}
 */
export async function discoverIndeed({
  queries = [],
  location = "Chile",
  country = "cl",
  maxPages = 1,
  withDescriptions = true,
  requestDelayMs = 1500,
} = {}) {
  // Pre-flight de firma: el orquestador podrá pasar estos opts sin romper.
  void queries;
  void location;
  void country;
  void maxPages;
  void withDescriptions;
  void requestDelayMs;

  // TODO(indeed): fetch listado cl.indeed.com/jobs, parsear cards → IndeedPosting.
  // Preferir jk= de URL como source_job_id cuando exista.
  // Confirmar si el HTML es público (cheerio) o requiere sesión (Playwright).
  // Selectores en NOTES.md — no inventar CSS sin DOM real.
  return [];
}
