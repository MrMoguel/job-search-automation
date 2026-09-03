/**
 * Adaptador de discovery para Computrabajo (portales de Chile/LATAM).
 *
 * Computrabajo NO tiene API pública, pero el LISTADO de ofertas es HTML público
 * accesible sin login (`/ofertas-de-trabajo/?q=...`). Por eso el discovery es
 * bajo riesgo y vive acá, en workers — a diferencia de la POSTULACIÓN, que sí
 * requiere sesión logueada y corre en ./apply.js con Playwright determinista +
 * storageState propio (ver README, "Sesiones de plataformas").
 *
 * Selectores y patrón de URL adaptados del scraper de jobhound
 * (github.com/jonach1998/jobhound, MIT) — que los tiene validados con tests.
 * Se traen a Node con cheerio, manteniendo la salida en el shape de nuestros
 * postings (source/source_job_id/company/title/location/url/description_raw).
 *
 * ⚠️ Selectores CSS de Computrabajo pueden cambiar sin aviso. Si un día deja de
 * traer resultados, revisar LISTING_SELECTORS / TITLE_SELECTOR contra el HTML real.
 */
import * as cheerio from "cheerio";
import crypto from "node:crypto";

// TLD por país (lowercase). Chile = "cl" -> https://www.computrabajo.cl
const COMPUTRABAJO_TLDS = {
  argentina: "com.ar",
  bolivia: "com.bo",
  chile: "cl",
  colombia: "com.co",
  "costa rica": "co.cr",
  ecuador: "com.ec",
  "el salvador": "com.sv",
  guatemala: "com.gt",
  honduras: "com.hn",
  mexico: "com.mx",
  méxico: "com.mx",
  nicaragua: "com.ni",
  panama: "com.pa",
  paraguay: "com.py",
  peru: "com.pe",
  perú: "com.pe",
  uruguay: "com.uy",
  venezuela: "com.ve",
};

const LISTING_SELECTORS = "article.box_offer, div.offer_item, article[data-id]";
const TITLE_SELECTOR = "h2 a, h3 a, a.js-o-link, a[class*='title']";
const COMPANY_SELECTOR = "a.fc_base.t_ellipsis";
const LOCATION_SELECTOR = "p.fs16.fc_base.mt5:not(.dFlex)";
const DESCRIPTION_SELECTORS = [
  "div.box_detail p.mbB",
  "div.box_detail",
  "div.job_description",
  "section.description",
  "div#job_description",
  "div.offer_description",
  "div[class*='description']",
];

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Accept-Language": "es-CL,es;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const REQUEST_TIMEOUT_MS = 15000;
const DESCRIPTION_LIMIT = 3000;
const DESCRIPTION_MIN_LENGTH = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// id estable para dedupe: hash de la URL canónica (sin hash/query de tracking).
function makeJobId(url) {
  return crypto.createHash("sha1").update(url).digest("hex").slice(0, 16);
}

async function fetchHtml(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null; // red intermitente / timeout: se saltea, no rompe la corrida
  } finally {
    clearTimeout(t);
  }
}

function absolute(baseUrl, href) {
  try {
    return new URL(href.split("#")[0], baseUrl).toString();
  } catch {
    return null;
  }
}

function jobFromCard(baseUrl, $, card) {
  const $card = $(card);
  const $title = $card.find(TITLE_SELECTOR).first();
  const title = $title.text().trim();
  const href = $title.attr("href");
  if (!title || !href) return null;

  const url = absolute(baseUrl, href);
  if (!url) return null;

  const company = $card.find(COMPANY_SELECTOR).first().text().trim();
  const location = $card.find(LOCATION_SELECTOR).first().text().trim();

  return {
    source: "computrabajo",
    source_job_id: makeJobId(url),
    company: company || "Computrabajo (empresa no especificada)", // company es NOT NULL en DB
    title,
    location: location || null,
    url,
    description_raw: null, // se completa con fetchDescription si withDescriptions
  };
}

async function fetchDescription(url) {
  const html = await fetchHtml(url);
  if (!html) return null;
  const $ = cheerio.load(html);
  for (const sel of DESCRIPTION_SELECTORS) {
    const text = $(sel).first().text().replace(/\s+\n/g, "\n").trim();
    if (text.length > DESCRIPTION_MIN_LENGTH) return text.slice(0, DESCRIPTION_LIMIT);
  }
  return null;
}

/**
 * @param {{ queries?: string[], country?: string, maxPages?: number,
 *           withDescriptions?: boolean, requestDelayMs?: number }} opts
 *   queries          — términos de búsqueda (ej. ["backend python", "automatización"])
 *   country          — país (lowercase); default "chile"
 *   maxPages         — páginas por query (default 1; rate-limit friendly)
 *   withDescriptions — si true, hace un fetch extra por oferta para traer la descripción
 *   requestDelayMs   — delay humano entre requests (default 1500)
 * @returns {Promise<object[]>} postings listos para upsert
 */
export async function discoverComputrabajo({
  queries = [],
  country = "chile",
  maxPages = 1,
  withDescriptions = true,
  requestDelayMs = 1500,
} = {}) {
  const tld = COMPUTRABAJO_TLDS[country.toLowerCase()];
  if (!tld) {
    throw new Error(`Computrabajo: país no soportado "${country}" (revisar COMPUTRABAJO_TLDS)`);
  }
  const baseUrl = `https://www.computrabajo.${tld}`;

  const postings = [];
  const seen = new Set(); // dedupe intra-corrida

  for (const query of queries) {
    for (let page = 1; page <= maxPages; page++) {
      let url = `${baseUrl}/ofertas-de-trabajo/?q=${encodeURIComponent(query)}`;
      if (page > 1) url += `&p=${page}`;

      const html = await fetchHtml(url);
      await sleep(requestDelayMs);
      if (!html) break;

      const $ = cheerio.load(html);
      let cards = $(LISTING_SELECTORS).toArray();
      if (cards.length === 0) cards = $("article").toArray(); // fallback

      let pageNew = 0;
      for (const card of cards) {
        const job = jobFromCard(baseUrl, $, card);
        if (!job || seen.has(job.source_job_id)) continue;
        seen.add(job.source_job_id);
        pageNew++;
        postings.push(job);
      }

      if (pageNew === 0) break; // sin resultados nuevos: última página útil
    }
  }

  if (withDescriptions) {
    for (const posting of postings) {
      posting.description_raw = await fetchDescription(posting.url);
      await sleep(requestDelayMs);
    }
  }

  return postings;
}
