import { pool } from "../lib/db.js";
import { discoverGetOnBoard } from "../platforms/getonboard/discovery.js";
import { discoverComputrabajo } from "../platforms/computrabajo/discovery.js";
import { discoverRemoteOK } from "../platforms/remoteok/discovery.js";

/**
 * Discovery vía APIs abiertas de ATS (Greenhouse, Lever, etc).
 * Estos son endpoints públicos JSON, sin login, bajo riesgo.
 * Ejemplo real: Greenhouse expone /v1/boards/{company}/jobs para cualquier empresa
 * que use su job board público.
 */
async function discoverGreenhouse(companySlug) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${companySlug}/jobs`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Greenhouse API ${companySlug}: HTTP ${res.status}`);
  }
  const data = await res.json();
  return (data.jobs ?? []).map((job) => ({
    source: "greenhouse",
    source_job_id: String(job.id),
    company: companySlug,
    title: job.title,
    location: job.location?.name ?? null,
    url: job.absolute_url,
    description_raw: null, // requiere un fetch adicional por job si se quiere el detalle
  }));
}

/**
 * Discovery de LinkedIn: NO implementado acá todavía a propósito.
 * Requiere Playwright con storageState persistente, anti-detección,
 * y rate limiting agresivo (5-10 acciones/día) para no arriesgar la cuenta.
 * Se implementa en su propio módulo cuando lleguemos a esa etapa del roadmap,
 * con revisión humana obligatoria antes de cada postulación (approved_by_human).
 */
async function discoverLinkedIn(_params) {
  throw new Error("discoverLinkedIn: pendiente de implementación (etapa 5 del roadmap)");
}

async function upsertPosting(client, posting) {
  const query = `
    INSERT INTO postings (source, source_job_id, company, title, location, url, description_raw)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (source, source_job_id) DO NOTHING
    RETURNING id
  `;
  const values = [
    posting.source,
    posting.source_job_id,
    posting.company,
    posting.title,
    posting.location,
    posting.url,
    posting.description_raw,
  ];
  const { rows } = await client.query(query, values);
  return rows[0]?.id ?? null; // null si ya existía (dedupe)
}

/**
 * Punto de entrada llamado por Hermes vía cron. Enruta por plataforma.
 * body esperado:
 *   {
 *     greenhouse: string[],              // slugs de boards de Greenhouse
 *     getonboard: { queries: string[], perPage?, maxPages? },  // búsquedas en GetOnBoard
 *     computrabajo: { queries: string[], country?, maxPages?, withDescriptions? }, // scraping HTML público
 *     remoteok:   true | { tags?: string[], includeRecent?, requestDelayMs? }, // API pública JSON (remoto/USD)
 *     companies:  string[]               // (legacy) alias de greenhouse
 *   }
 * Cualquier clave puede omitirse; se corren solo las plataformas presentes.
 */
export async function runDiscovery(body) {
  const greenhouseSlugs = body.greenhouse ?? body.companies ?? [];
  const getonboard = body.getonboard ?? null;
  const computrabajo = body.computrabajo ?? null;
  const remoteok = body.remoteok ?? null;

  const client = await pool.connect();
  let inserted = 0;
  let skipped = 0;
  const bySource = {};

  const ingest = async (postings, sourceLabel) => {
    for (const posting of postings) {
      const id = await upsertPosting(client, posting);
      if (id) inserted++;
      else skipped++;
    }
    bySource[sourceLabel] = (bySource[sourceLabel] ?? 0) + postings.length;
  };

  try {
    for (const slug of greenhouseSlugs) {
      await ingest(await discoverGreenhouse(slug), "greenhouse");
    }

    if (getonboard?.queries?.length) {
      const postings = await discoverGetOnBoard({
        queries: getonboard.queries,
        perPage: getonboard.perPage ?? 50,
        maxPages: getonboard.maxPages ?? 1,
      });
      await ingest(postings, "getonboard");
    }

    if (computrabajo?.queries?.length) {
      const postings = await discoverComputrabajo({
        queries: computrabajo.queries,
        country: computrabajo.country ?? "chile",
        maxPages: computrabajo.maxPages ?? 1,
        withDescriptions: computrabajo.withDescriptions ?? true,
      });
      await ingest(postings, "computrabajo");
    }

    // RemoteOK: `true` usa los defaults, o un objeto para ajustar tags/opciones.
    if (remoteok) {
      const opts = typeof remoteok === "object" ? remoteok : {};
      const postings = await discoverRemoteOK({
        tags: opts.tags,
        includeRecent: opts.includeRecent ?? true,
        requestDelayMs: opts.requestDelayMs ?? 800,
      });
      await ingest(postings, "remoteok");
    }
  } finally {
    client.release();
  }

  if (inserted === 0 && skipped === 0) {
    return { inserted: 0, skipped: 0, note: "no se configuró ninguna plataforma en el request" };
  }
  return { inserted, skipped, seen_by_source: bySource };
}
