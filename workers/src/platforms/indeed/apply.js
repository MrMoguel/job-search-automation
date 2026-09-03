/**
 * Apply Indeed — stub determinista.
 *
 * Usa ApplicantProfile (workers/src/lib/applicantProfile.js), sin LLM por job.
 * Postulación típica: sesión de cuenta propia (storageState) + Playwright.
 * Solo Indeed Apply; redirects a ATS externos quedan fuera de este adaptador.
 *
 * Scaffolding: no aplica en prod. Valida precondiciones y retorna stub /
 * NotImplemented — selectores reales en NOTES.md (TBD).
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
    env.INDEED_STORAGE_STATE ||
    env.INDEED_AUTH_STATE ||
    "/app/.auth-state/indeed.json"
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
      `Indeed apply: falta storageState propio en ${storageStatePath}. ` +
        "Exportá la sesión una vez (login manual) y reutilizala."
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
 * Stub de postulación Indeed. Valida perfil (+ sesión si hay page);
 * no submitea.
 *
 * @param {{
 *   posting: { id?: number|string, url: string, title?: string, company?: string },
 *   profile?: import('../../lib/applicantProfile.js').ApplicantProfile,
 *   page?: import('playwright').Page,
 * }} args
 * @returns {Promise<ApplyResult>}
 */
export async function applyIndeed({
  posting,
  profile = null,
  page = null,
} = {}) {
  if (!posting?.url) {
    throw new Error("applyIndeed: posting.url es requerido");
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
        "Scaffolding: sin Page. Wiring real usará storageState + Indeed Apply + mapa NOTES.md.",
      formValuesPreview: {
        email: formValues.email,
        full_name: formValues.full_name,
        phone: formValues.phone,
        resume_path: formValues.resume_path ? "(set)" : "",
      },
    };
  }

  assertOwnStorageState();

  // TODO(indeed): flujo determinista
  // 1) page.goto(posting.url)
  // 2) detectar Indeed Apply vs redirect ATS (skip ATS → otro adaptador)
  // 3) fill por mapa (NOTES.md) + setInputFiles(resume)
  // 4) preguntas sin alias → skip + log (no inventar)
  // 5) delays humanos; no generar código por job
  throw new Error(
    `applyIndeed: NotImplemented — stub listo para ${posting.url} ` +
      `(perfil: ${applicant.email}). Ver NOTES.md para selectores.`
  );
}
