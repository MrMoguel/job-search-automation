/**
 * Apply Laborum — stub determinista.
 *
 * Usa ApplicantProfile (workers/src/lib/applicantProfile.js), sin LLM por job.
 * Postulación típica: sesión de cuenta propia (storageState) + Playwright.
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
    env.LABORUM_STORAGE_STATE ||
    env.LABORUM_AUTH_STATE ||
    "/app/.auth-state/laborum.json"
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
      `Laborum apply: falta storageState propio en ${storageStatePath}. ` +
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
 * Stub de postulación Laborum. Valida perfil (+ sesión si hay page);
 * no submitea.
 *
 * @param {{
 *   posting: { id?: number|string, url: string, title?: string, company?: string },
 *   profile?: import('../../lib/applicantProfile.js').ApplicantProfile,
 *   page?: import('playwright').Page,
 * }} args
 * @returns {Promise<ApplyResult>}
 */
export async function applyLaborum({
  posting,
  profile = null,
  page = null,
} = {}) {
  if (!posting?.url) {
    throw new Error("applyLaborum: posting.url es requerido");
  }

  const applicant = profile || loadApplicantProfile();
  const formValues = profileToFormValues(applicant);

  // Smoke del contrato compartido (aliases típicos ES del formulario).
  void resolveFieldValue(applicant, "nombre");
  void resolveFieldValue(applicant, "correo");
  void resolveFieldValue(applicant, "telefono");
  void resolveFieldValue(applicant, "cv");

  if (!page) {
    return {
      status: "stub",
      reason:
        "Scaffolding: sin Page. Wiring real usará storageState + click Postular + mapa NOTES.md.",
      formValuesPreview: {
        email: formValues.email,
        full_name: formValues.full_name,
        phone: formValues.phone,
        resume_path: formValues.resume_path ? "(set)" : "",
      },
    };
  }

  assertOwnStorageState();

  // TODO(laborum): flujo determinista
  // 1) page.goto(posting.url)
  // 2) click Postular / Postularme
  // 3) fill por mapa (NOTES.md) + setInputFiles(resume)
  // 4) preguntas sin alias → skip + log (no inventar)
  // 5) delays humanos; no generar código por job
  throw new Error(
    `applyLaborum: NotImplemented — stub listo para ${posting.url} ` +
      `(perfil: ${applicant.email}). Ver NOTES.md para selectores.`
  );
}
