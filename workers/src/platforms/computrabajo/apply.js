/**
 * Apply Computrabajo — postulación determinista vía GET.
 *
 * Hallazgo (fixtures/META.md): no hay form. El botón Postularme lleva
 * `data-href-offer-apply`; navegar a esa URL = postular. El CV es el del
 * perfil del portal (sin fill / setInputFiles).
 *
 * ⚠️ Cualquier corrida sin dryRun envía una postulación REAL.
 */

import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { loadApplicantProfile } from "../../lib/applicantProfile.js";

/** Selector del CTA Postularme (fixture offer-page.html). */
export const APPLY_LINK_SELECTOR = "a[data-href-offer-apply]";

/** Título de confirmación (fixture apply-confirmation.html). */
export const SUCCESS_TITLE_RE = /Aplicación enviada/i;

const HUMAN_DELAY_MS = {
  min: Number(process.env.COMPUTRABAJO_DELAY_MIN_MS || 800),
  max: Number(process.env.COMPUTRABAJO_DELAY_MAX_MS || 2200),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function humanDelayMs() {
  const lo = Math.min(HUMAN_DELAY_MS.min, HUMAN_DELAY_MS.max);
  const hi = Math.max(HUMAN_DELAY_MS.min, HUMAN_DELAY_MS.max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export async function humanPause() {
  await sleep(humanDelayMs());
}

/**
 * Path al storageState de la cuenta propia.
 * Preferencia: COMPUTRABAJO_STORAGE_STATE → secrets/auth-state → /app/.auth-state
 */
export function resolveStorageStatePath(env = process.env) {
  if (env.COMPUTRABAJO_STORAGE_STATE) return env.COMPUTRABAJO_STORAGE_STATE;
  if (env.COMPUTRABAJO_AUTH_STATE) return env.COMPUTRABAJO_AUTH_STATE;
  const hostPath = "secrets/auth-state/computrabajo.json";
  if (existsSync(hostPath)) return hostPath;
  return "/app/.auth-state/computrabajo.json";
}

export function assertOwnStorageState(
  storageStatePath = resolveStorageStatePath()
) {
  if (!storageStatePath || !existsSync(storageStatePath)) {
    throw new Error(
      `Computrabajo apply: falta storageState en ${storageStatePath}. ` +
        "Corré: node scripts/export-auth-state.js --platform=computrabajo"
    );
  }
  return storageStatePath;
}

/**
 * Error tipado para sesión rota en candidato.* (/acceso/ o redirect loop).
 */
export class SesionCaidaError extends Error {
  /**
   * @param {string} detail
   */
  constructor(detail) {
    super(
      `SESION_CAIDA: ${detail}. Re-exportá la sesión con: ` +
        "node scripts/export-auth-state.js --platform=computrabajo " +
        "(no reintentar en loop)."
    );
    this.name = "SesionCaidaError";
    this.code = "SESION_CAIDA";
  }
}

function decodeHtmlAttr(url) {
  return String(url || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * @param {import('playwright').Page} page
 * @param {Error} [err]
 */
function detectSesionCaida(page, err) {
  const msg = String(err?.message || err || "");
  if (/ERR_TOO_MANY_REDIRECTS/i.test(msg)) {
    return new SesionCaidaError("ERR_TOO_MANY_REDIRECTS");
  }
  try {
    const url = page.url();
    if (/\/acceso\//i.test(url)) {
      return new SesionCaidaError(`redirigió a ${url}`);
    }
  } catch {
    // page may be closed
  }
  return null;
}

/**
 * @typedef {object} ApplyResult
 * @property {"dry_run"|"applied"|"already_applied"|"skipped"|"failed"} status
 * @property {string} [reason]
 * @property {string} [applyUrl]
 * @property {string} [confirmationTitle]
 * @property {string} [code]
 */

/**
 * Postula a una oferta Computrabajo.
 *
 * @param {{
 *   posting: { id?: number|string, url: string, title?: string, company?: string },
 *   profile?: import('../../lib/applicantProfile.js').ApplicantProfile | null,
 *   dryRun?: boolean,
 *   headless?: boolean,
 *   storageStatePath?: string,
 *   validateProfile?: boolean,
 * }} args
 * @returns {Promise<ApplyResult>}
 */
export async function applyComputrabajo({
  posting,
  profile = null,
  dryRun = false,
  headless = false,
  storageStatePath = null,
  validateProfile = false,
} = {}) {
  if (!posting?.url) {
    throw new Error("applyComputrabajo: posting.url es requerido");
  }

  // ApplicantProfile: sin fill en este flujo; opcional como precóndición.
  if (validateProfile) {
    profile || loadApplicantProfile();
  }

  const statePath = assertOwnStorageState(
    storageStatePath || resolveStorageStatePath()
  );

  if (headless === true) {
    // Preferible false (anti-bot / handshake candidato.*); permitir override explícito.
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: Boolean(headless) });
    const context = await browser.newContext({ storageState: statePath });
    const page = await context.newPage();

    await humanPause();
    try {
      await page.goto(posting.url, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
    } catch (err) {
      const sesion = detectSesionCaida(page, err);
      if (sesion) throw sesion;
      throw err;
    }

    const sesionAfterGoto = detectSesionCaida(page);
    if (sesionAfterGoto) throw sesionAfterGoto;

    await humanPause();

    // Ya postulado: en el fixture el CTA alternativo es a.postulated (sin .hide).
    const alreadyBtn = page.locator("a.postulated:not(.hide)").first();
    if (await alreadyBtn.isVisible().catch(() => false)) {
      return {
        status: "already_applied",
        reason: "UI muestra estado Postulado",
      };
    }

    const link = page.locator(APPLY_LINK_SELECTOR).first();
    const count = await page.locator(APPLY_LINK_SELECTOR).count();
    if (count === 0) {
      throw new Error(
        `applyComputrabajo: no se encontró ${APPLY_LINK_SELECTOR} en ${posting.url}`
      );
    }

    const rawHref = await link.getAttribute("data-href-offer-apply");
    const applyUrl = decodeHtmlAttr(rawHref);
    if (!applyUrl || !/^https?:\/\//i.test(applyUrl)) {
      throw new Error(
        "applyComputrabajo: data-href-offer-apply vacío o inválido"
      );
    }

    if (dryRun) {
      // Cortar ANTES de navegar — navegar = postular de verdad.
      return {
        status: "dry_run",
        reason:
          "dryRun: no se navegó a data-href-offer-apply (postulación real omitida)",
        applyUrl,
      };
    }

    await humanPause();
    try {
      await page.goto(applyUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
    } catch (err) {
      const sesion = detectSesionCaida(page, err);
      if (sesion) throw sesion;
      throw err;
    }

    const sesionAfterApply = detectSesionCaida(page);
    if (sesionAfterApply) throw sesionAfterApply;

    await humanPause();
    const title = await page.title();
    if (!SUCCESS_TITLE_RE.test(title)) {
      return {
        status: "failed",
        reason: `título inesperado tras apply: ${title}`,
        applyUrl,
        confirmationTitle: title,
      };
    }

    return {
      status: "applied",
      applyUrl,
      confirmationTitle: title,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * CLI mínimo: node apply.js --url=... [--dry-run] [--headless]
 * Cada corrida sin --dry-run postula de verdad.
 */
async function mainCli(argv = process.argv.slice(2)) {
  const opts = Object.fromEntries(
    argv
      .filter((a) => a.startsWith("--"))
      .map((a) => {
        const [k, ...rest] = a.replace(/^--/, "").split("=");
        return [k, rest.length ? rest.join("=") : true];
      })
  );
  const url = opts.url || opts.offer;
  if (!url || url === true) {
    console.error(
      "Uso: node workers/src/platforms/computrabajo/apply.js --url=<offerUrl> [--dry-run] [--headless]\n" +
        "⚠️ Sin --dry-run la navegación a data-href-offer-apply ES una postulación real."
    );
    process.exitCode = 2;
    return;
  }
  const result = await applyComputrabajo({
    posting: { url: String(url) },
    dryRun: Boolean(opts["dry-run"] || opts.dryRun),
    headless: Boolean(opts.headless),
    validateProfile: false,
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "failed") process.exitCode = 1;
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  /computrabajo[/\\]apply\.js$/.test(process.argv[1]);

if (isDirectRun) {
  mainCli().catch((err) => {
    console.error(err?.code === "SESION_CAIDA" ? err.message : err);
    process.exitCode = err?.code === "SESION_CAIDA" ? 3 : 1;
  });
}
