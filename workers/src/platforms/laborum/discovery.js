/**
 * Discovery Laborum (laborum.cl) — listado vía API pública JSON.
 *
 * Hallazgo (fixture real): `GET/HTML /empleo/?q=...` es SPA shell (`#root` loader),
 * sin cards de ofertas en el HTML estático. El listado público vive en
 * `POST /api/avisos/searchV2` con header `x-site-id: BMCL` (SITE_ID Laborum Chile).
 * Ver `fixtures/searchV2-python-page0.json` y `fixtures/listing-empleo-spa-shell.html`.
 *
 * Sin login. Sin inventar CSS. Apply sigue en stub (otra asignación).
 */

const API_BASE = "https://www.laborum.cl/api/avisos/searchV2";
const SITE_ID = "BMCL"; // window.SITE_ID en /candidate/js/keys.js
const DETAIL_URL = (id) => `https://www.laborum.cl/empleos/-${id}.html`;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json",
  Origin: "https://www.laborum.cl",
  Referer: "https://www.laborum.cl/empleo/",
  "Accept-Language": "es-CL,es;q=0.9",
  "x-site-id": SITE_ID,
};

const REQUEST_TIMEOUT_MS = 15000;
const DESCRIPTION_LIMIT = 3000;
const DEFAULT_PAGE_SIZE = 20; // API acepta hasta ~100; mantenemos conservador

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @typedef {object} LaborumPosting
 * @property {"laborum"} source
 * @property {string} source_job_id
 * @property {string} company
 * @property {string} title
 * @property {string|null} location
 * @property {string} url
 * @property {string|null} description_raw
 */

/**
 * Mapea un item de `content[]` (searchV2) al shape de postings del repo.
 * Campos tomados del fixture real — no inventados.
 * @param {Record<string, unknown>} aviso
 * @returns {LaborumPosting|null}
 */
function mapAviso(aviso) {
  const id = aviso?.id;
  if (id == null) return null;
  const title = String(aviso.titulo || "").trim();
  if (!title) return null;

  const confidencial = Boolean(aviso.confidencial);
  const empresa = String(aviso.empresa || "").trim();
  const company =
    empresa ||
    (confidencial ? "Confidencial" : "Laborum (empresa no especificada)");

  const location = aviso.localizacion
    ? String(aviso.localizacion).trim()
    : null;

  let description = aviso.detalle ? String(aviso.detalle).trim() : "";
  if (description.length > DESCRIPTION_LIMIT) {
    description = description.slice(0, DESCRIPTION_LIMIT);
  }

  return {
    source: "laborum",
    source_job_id: String(id),
    company,
    title,
    location: location || null,
    url: DETAIL_URL(id),
    description_raw: description || null,
  };
}

/**
 * @param {string} query
 * @param {number} page  0-indexed (la API con page=1 a veces devuelve content:[])
 * @param {number} pageSize
 * @returns {Promise<{ total: number, content: object[] }|null>}
 */
async function fetchSearchPage(query, page, pageSize) {
  const url = `${API_BASE}?pageSize=${pageSize}&page=${page}&sort=RELEVANTES`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        filtros: [],
        query: query || "",
        internacional: false,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.error(`[laborum] searchV2 HTTP ${res.status} page=${page} q=${query}`);
      return null;
    }
    const data = await res.json();
    return {
      total: Number(data?.total) || 0,
      content: Array.isArray(data?.content) ? data.content : [],
    };
  } catch (err) {
    console.error(`[laborum] searchV2 error page=${page}: ${err.message || err}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {{
 *   queries?: string[],
 *   location?: string,
 *   maxPages?: number,
 *   withDescriptions?: boolean,
 *   requestDelayMs?: number,
 *   pageSize?: number,
 * }} [opts]
 * @returns {Promise<LaborumPosting[]>}
 */
export async function discoverLaborum({
  queries = [],
  location = "Chile",
  maxPages = 1,
  withDescriptions = true,
  requestDelayMs = 1500,
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) {
  void location; // Laborum filtra provincia vía filtros; no aplicado en este PR

  const qList = queries.length ? queries : [""];
  const postings = [];
  const seen = new Set();

  for (const query of qList) {
    for (let page = 0; page < maxPages; page++) {
      const result = await fetchSearchPage(query, page, pageSize);
      if (requestDelayMs) await sleep(requestDelayMs);
      if (!result) break;

      let pageNew = 0;
      for (const aviso of result.content) {
        const job = mapAviso(aviso);
        if (!job || seen.has(job.source_job_id)) continue;
        seen.add(job.source_job_id);
        if (!withDescriptions) job.description_raw = null;
        postings.push(job);
        pageNew++;
      }

      // sin items nuevos o ya cubrimos total → stop
      if (pageNew === 0) break;
      const fetched = (page + 1) * pageSize;
      if (fetched >= result.total) break;
    }
  }

  return postings;
}
