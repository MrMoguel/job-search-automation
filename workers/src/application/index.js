import { chromium } from "playwright";
import { pool } from "../lib/db.js";

const AUTH_STATE_DIR = "/app/.auth-state";

/**
 * Postulación en portales de ATS abiertos (Greenhouse/Lever/etc).
 * Formularios predecibles -> full-auto es seguro acá, no hay riesgo de cuenta
 * porque no hay login persistente involucrado en la mayoría de estos boards.
 */
async function applyOpenAts(posting) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(posting.url, { waitUntil: "domcontentloaded" });

    // TODO: mapear selectores reales una vez definamos el primer portal target.
    // Estructura esperada: nombre, email, teléfono, upload CV, cover letter opcional.
    throw new Error("applyOpenAts: selectores de formulario pendientes de mapear");
  } finally {
    await browser.close();
  }
}

/**
 * Postulación LinkedIn Easy Apply.
 * Guardrails obligatorios (definidos en el diseño del proyecto):
 * - NUNCA headless
 * - storageState persistente (sesión ya logueada, sin re-login)
 * - Rate limit: 5-10 aplicaciones/día máximo
 * - Delays humanos randomizados entre acciones
 * - Requiere approved_by_human = true antes de ejecutar (gate manual)
 */
async function applyLinkedIn(_posting) {
  throw new Error("applyLinkedIn: pendiente de implementación (etapa 5 del roadmap, con guardrails de rate-limit)");
}

export async function runApplication(_body) {
  const client = await pool.connect();
  let applied = 0;
  let failed = 0;

  try {
    const { rows: postings } = await client.query(
      `SELECT * FROM postings WHERE status = 'queued_for_application' ORDER BY discovered_at ASC LIMIT 10`
    );

    for (const posting of postings) {
      try {
        if (posting.source === "linkedin") {
          await applyLinkedIn(posting);
        } else {
          await applyOpenAts(posting);
        }

        await client.query(
          `INSERT INTO applications (posting_id, applied_at, method, approved_by_human) VALUES ($1, now(), $2, $3)`,
          [posting.id, posting.source === "linkedin" ? "easy_apply_semi" : "playwright_auto", posting.source !== "linkedin"]
        );
        await client.query(`UPDATE postings SET status = 'applied' WHERE id = $1`, [posting.id]);
        applied++;
      } catch (err) {
        await client.query(
          `INSERT INTO applications (posting_id, method, error_message) VALUES ($1, $2, $3)`,
          [posting.id, "playwright_auto", String(err)]
        );
        await client.query(`UPDATE postings SET status = 'application_failed' WHERE id = $1`, [posting.id]);
        failed++;
      }
    }
  } finally {
    client.release();
  }

  return { applied, failed };
}
