/**
 * Easy Apply LinkedIn — stub determinista.
 *
 * - Usa ApplicantProfile (workers/src/lib/applicantProfile.js), sin LLM por job.
 * - Respeta guardrails (nunca headless, storageState, rate limit diario).
 * - No genera Playwright por postulación: selectores fijos / mapa de campos.
 *
 * Scaffolding: no aplica en prod. Lanza NotImplemented tras validar precondiciones.
 */

import {
  loadApplicantProfile,
  profileToFormValues,
  resolveFieldValue,
} from "../../lib/applicantProfile.js";
import {
  assertNeverHeadless,
  assertOwnStorageState,
  assertUnderDailyLimit,
  humanPause,
  linkedInBrowserOptions,
  resolveStorageStatePath,
} from "./guardrails.js";

/**
 * @typedef {object} ApplyResult
 * @property {"stub"|"applied"|"skipped"|"failed"} status
 * @property {string} [reason]
 * @property {Record<string, string>} [formValuesPreview]
 */

/**
 * Stub de Easy Apply. Valida sesión + rate limit + perfil; no submitea.
 *
 * @param {{
 *   posting: { id?: number|string, url: string, title?: string, company?: string },
 *   profile?: import('../../lib/applicantProfile.js').ApplicantProfile,
 *   page?: import('playwright').Page,
 *   alreadyAppliedToday?: number,
 * }} args
 * @returns {Promise<ApplyResult>}
 */
export async function applyLinkedIn({
  posting,
  profile = null,
  page = null,
  alreadyAppliedToday = 0,
} = {}) {
  if (!posting?.url) {
    throw new Error("applyLinkedIn: posting.url es requerido");
  }

  assertUnderDailyLimit(alreadyAppliedToday);
  assertOwnStorageState(resolveStorageStatePath());
  assertNeverHeadless({ headless: false });

  const applicant = profile || loadApplicantProfile();
  const formValues = profileToFormValues(applicant);

  // Smoke del contrato compartido (aliases típicos de Easy Apply).
  void resolveFieldValue(applicant, "email");
  void resolveFieldValue(applicant, "phone");
  void resolveFieldValue(applicant, "resume");
  void linkedInBrowserOptions; // disponible para el wiring real

  if (!page) {
    return {
      status: "stub",
      reason:
        "Scaffolding: sin Page. Wiring real usará linkedInBrowserOptions() + Easy Apply selectors (NOTES.md).",
      formValuesPreview: {
        email: formValues.email,
        first_name: formValues.first_name,
        last_name: formValues.last_name,
        resume_path: formValues.resume_path ? "(set)" : "",
      },
    };
  }

  await humanPause();

  // TODO(linkedin): flujo determinista
  // 1) page.goto(posting.url)
  // 2) click Easy Apply
  // 3) por cada step: mapear label → resolveFieldValue / setInputFiles(resume)
  // 4) NO auto-submit preguntas desconocidas — skip + log
  // 5) humanPause entre steps; respetar DAILY_APPLY_LIMIT
  throw new Error(
    `applyLinkedIn: NotImplemented — stub listo para ${posting.url} ` +
      `(perfil: ${applicant.email}). Ver NOTES.md para selectores.`
  );
}
