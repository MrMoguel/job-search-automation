/**
 * Apply Get on Board (getonbrd.com) — stub determinista.
 *
 * Usa ApplicantProfile (workers/src/lib/applicantProfile.js), sin LLM por job.
 * Postulación típica: sesión de cuenta propia (storageState) + Playwright.
 * Discovery ya está en discovery.js (API pública); este módulo no la toca.
 *
 * Scaffolding: no aplica en prod. Valida precondiciones y retorna stub /
 * NotImplemented — selectores reales en NOTES.md (TBD, sin inventar CSS).
 */

import { existsSync } from "node:fs";
import {
  loadApplicantProfile,
  profileToFormValues,
  resolveFieldValue,
} from "../../lib/applicantProfile.js";

/** Path al storageState de la cuenta propia. */
export function resolveStorageStatePath(env = process.env) {
  return (
    env.GETONBOARD_STORAGE_STATE ||
    env.GETONBRD_STORAGE_STATE ||
    env.GETONBOARD_AUTH_STATE ||
    "/app/.auth-state/getonboard.json"
  );
}

/**
 * @param {string} [storageStatePath]
 */
export function assertOwnStorageState(
  storageStatePath = resolveStorageStatePath()
) {
  if (!storageStatePath || !existsSync(storageStatePath)) {
    throw new Error(
      `Get on Board apply: falta storageState propio en ${storageStatePath}. ` +
        "Exportá la sesión una vez (login manual) y reutilizala " +
        "(secrets/auth-state/getonboard.json → GETONBOARD_STORAGE_STATE)."
    );
  }
  return storageStatePath;
}

/**
 * @typedef {object} ApplyResult
 * @property {"stub"|"applied"|"skipped"|"failed"} status
 * @property {string} [reason]
 * @property {Record<string, string>} [formValuesPreview]
 */

/**
 * Stub de postulación Get on Board. Valida perfil (+ sesión si hay page);
 * no submitea.
 *
 * @param {{
 *   posting: { id?: number|string, url: string, title?: string, company?: string },
 *   profile?: import('../../lib/applicantProfile.js').ApplicantProfile,
 *   page?: import('playwright').Page,
 * }} args
 * @returns {Promise<ApplyResult>}
 */
export async function applyGetOnBoard({
  posting,
  profile = null,
  page = null,
} = {}) {
  if (!posting?.url) {
    throw new Error("applyGetOnBoard: posting.url es requerido");
  }

  const applicant = profile || loadApplicantProfile();
  const formValues = profileToFormValues(applicant);

  // Smoke del contrato compartido (aliases típicos ES/EN del formulario).
  void resolveFieldValue(applicant, "nombre");
  void resolveFieldValue(applicant, "email");
  void resolveFieldValue(applicant, "phone");
  void resolveFieldValue(applicant, "resume");

  if (!page) {
    return {
      status: "stub",
      reason:
        "Scaffolding: sin Page. Wiring real usará storageState + Apply/Postular + mapa NOTES.md.",
      formValuesPreview: {
        email: formValues.email,
        full_name: formValues.full_name,
        phone: formValues.phone,
        resume_path: formValues.resume_path ? "(set)" : "",
      },
    };
  }

  assertOwnStorageState();

  // TODO(getonboard): flujo determinista
  // 1) page.goto(posting.url)
  // 2) click Apply / Postular
  // 3) fill por mapa (NOTES.md) + setInputFiles(resume) — selectores desde DOM real
  // 4) preguntas sin alias → skip + log (no inventar)
  // 5) delays humanos; no generar código por job
  throw new Error(
    `applyGetOnBoard: NotImplemented — stub listo para ${posting.url} ` +
      `(perfil: ${applicant.email}). Ver NOTES.md para selectores (TBD).`
  );
}
