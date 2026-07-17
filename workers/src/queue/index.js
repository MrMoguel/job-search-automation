import { pool } from "../lib/db.js";

/**
 * Cola de postulación: postings en estado `queued_for_application` (los que pasaron
 * el umbral de scoring), ordenados por score. El agente (Janna) pide el próximo,
 * postula por la URL exacta (sin explorar), y reporta el resultado.
 *
 * Esto desacopla DESCUBRIR (scraper/API, barato) de POSTULAR (browser), que es el
 * fix para que Janna no gaste iteraciones buscando a mano.
 */

/**
 * Devuelve las próximas ofertas encoladas (con su score), opcionalmente filtradas
 * por plataforma. NO cambia el estado — el agente reporta después vía markApplied.
 * @param {{ source?: string, limit?: number }} opts
 */
export async function getNextPosting({ source = null, limit = 1 } = {}) {
  const { rows } = await pool.query(
    `SELECT p.id, p.source, p.company, p.title, p.location, p.url, p.description_raw,
            s.score, s.reasoning
       FROM postings p
       JOIN LATERAL (
         SELECT score, reasoning FROM scores
         WHERE posting_id = p.id ORDER BY scored_at DESC LIMIT 1
       ) s ON true
      WHERE p.status = 'queued_for_application'
        AND ($1::source_platform IS NULL OR p.source = $1::source_platform)
      -- Servir las MÁS NUEVAS primero (menos chance de estar vencidas), y entre
      -- fechas cercanas la de mayor score. El apply recorre varias y saltea las
      -- cerradas, así que priorizar frescura maximiza postulaciones exitosas.
      ORDER BY p.discovered_at DESC, s.score DESC
      LIMIT $2`,
    [source, Math.max(1, Math.min(20, Number(limit) || 1))]
  );
  return rows;
}

/**
 * Marca el resultado de una postulación e inserta la fila en `applications`.
 * @param {{ postingId: string, ok: boolean, method?: string, error?: string }} opts
 */
export async function markApplied({ postingId, ok, method = "browser_auto", error = null }) {
  if (!postingId) throw new Error("markApplied: falta postingId");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const newStatus = ok ? "applied" : "application_failed";
    const { rowCount } = await client.query(
      `UPDATE postings SET status = $1 WHERE id = $2`,
      [newStatus, postingId]
    );
    if (rowCount === 0) {
      await client.query("ROLLBACK");
      return { updated: false, note: "posting_id no existe" };
    }
    await client.query(
      `INSERT INTO applications (posting_id, applied_at, method, error_message)
       VALUES ($1, $2, $3, $4)`,
      [postingId, ok ? new Date() : null, method, ok ? null : error]
    );
    await client.query("COMMIT");
    return { updated: true, status: newStatus };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Registra una postulación hecha FUERA de la cola (ej. LinkedIn, que es
 * end-to-end en el browser y no pasa por discovery/scoring). Inserta el posting
 * como 'applied' y su fila en applications, así queda medible en las stats.
 * @param {{ source: string, title?: string, company?: string, url: string, method?: string }} opts
 */
export async function logExternalApplication({ source, title, company, url, method = "browser_auto" }) {
  if (!source || !url) throw new Error("logExternalApplication: falta source o url");
  const jobId = String(url).trim().slice(0, 400);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO postings (source, source_job_id, company, title, url, status)
       VALUES ($1, $2, $3, $4, $5, 'applied')
       ON CONFLICT (source, source_job_id) DO UPDATE SET status = 'applied'
       RETURNING id`,
      [source, jobId, String(company || "(sin empresa)").slice(0, 300), String(title || "(sin titulo)").slice(0, 400), url]
    );
    const postingId = rows[0].id;
    await client.query(
      `INSERT INTO applications (posting_id, applied_at, method) VALUES ($1, now(), $2)`,
      [postingId, method]
    );
    await client.query("COMMIT");
    return { logged: true, postingId };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Resumen de la cola por estado y plataforma (para monitoreo). */
export async function queueStats() {
  const { rows } = await pool.query(
    `SELECT source, status, count(*)::int AS n
       FROM postings GROUP BY source, status ORDER BY source, status`
  );
  return rows;
}
