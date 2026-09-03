/**
 * Contrato compartido del perfil del candidato.
 * Los adaptadores Playwright rellenan formularios desde aquí — sin LLM por postulación.
 *
 * Fuente: variables de entorno (ver .env.example). Opcionalmente APPLICANT_PROFILE_JSON
 * puede ser un path a un JSON que sobrescribe campos individuales.
 */

import { readFileSync, existsSync } from "node:fs";

/**
 * @typedef {object} ApplicantProfile
 * @property {string} fullName
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} email
 * @property {string} phone
 * @property {string} country
 * @property {string} city
 * @property {string} linkedinUrl
 * @property {string} resumePath  path dentro del contenedor al CV (pdf)
 * @property {string} [coverLetter]
 * @property {string} [summary]   texto libre para scoring / cartas
 * @property {Record<string, string>} customAnswers  respuestas a preguntas frecuentes
 */

const REQUIRED = ["fullName", "email", "phone", "resumePath"];

function splitName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function loadJsonOverride(path) {
  if (!path || !existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`APPLICANT_PROFILE_JSON inválido (${path}): ${err.message}`);
  }
}

function parseCustomAnswers(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [k, String(v)])
      );
    }
  } catch {
    // ignore — treat as empty
  }
  return {};
}

/**
 * Carga y valida el perfil desde env (+ JSON opcional).
 * @returns {ApplicantProfile}
 */
export function loadApplicantProfile(env = process.env) {
  const fromJson = loadJsonOverride(env.APPLICANT_PROFILE_JSON);

  const fullName =
    fromJson.fullName || env.APPLICANT_FULL_NAME || "";
  const { firstName: fnSplit, lastName: lnSplit } = splitName(fullName);

  /** @type {ApplicantProfile} */
  const profile = {
    fullName,
    firstName: fromJson.firstName || env.APPLICANT_FIRST_NAME || fnSplit,
    lastName: fromJson.lastName || env.APPLICANT_LAST_NAME || lnSplit,
    email: fromJson.email || env.APPLICANT_EMAIL || "",
    phone: fromJson.phone || env.APPLICANT_PHONE || "",
    country: fromJson.country || env.APPLICANT_COUNTRY || "CL",
    city: fromJson.city || env.APPLICANT_CITY || "",
    linkedinUrl: fromJson.linkedinUrl || env.APPLICANT_LINKEDIN_URL || "",
    resumePath: fromJson.resumePath || env.APPLICANT_RESUME_PATH || "",
    coverLetter: fromJson.coverLetter || env.APPLICANT_COVER_LETTER || undefined,
    summary:
      fromJson.summary ||
      env.APPLICANT_SUMMARY ||
      env.CANDIDATE_PROFILE_TEXT ||
      undefined,
    customAnswers: {
      ...parseCustomAnswers(env.APPLICANT_CUSTOM_ANSWERS_JSON),
      ...(fromJson.customAnswers && typeof fromJson.customAnswers === "object"
        ? fromJson.customAnswers
        : {}),
    },
  };

  const missing = REQUIRED.filter((k) => !String(profile[k] || "").trim());
  if (missing.length) {
    throw new Error(
      `ApplicantProfile incompleto — faltan: ${missing.join(", ")}. Ver .env.example`
    );
  }

  return profile;
}

/**
 * Mapa canónico de claves de formulario → valor del perfil.
 * Los adaptadores de plataforma resuelven sus selectores locales a estas claves.
 */
export function profileToFormValues(profile) {
  return {
    full_name: profile.fullName,
    first_name: profile.firstName,
    last_name: profile.lastName,
    email: profile.email,
    phone: profile.phone,
    country: profile.country,
    city: profile.city,
    linkedin: profile.linkedinUrl,
    cover_letter: profile.coverLetter || "",
    resume_path: profile.resumePath,
    ...profile.customAnswers,
  };
}

/**
 * Resuelve una clave de campo (label normalizado o name) contra el mapa canónico
 * y customAnswers. Sin LLM — match exacto / alias conocidos.
 */
const ALIASES = {
  name: "full_name",
  "full name": "full_name",
  nombre: "full_name",
  "nombre completo": "full_name",
  firstname: "first_name",
  "first name": "first_name",
  lastname: "last_name",
  "last name": "last_name",
  apellido: "last_name",
  "e-mail": "email",
  correo: "email",
  "correo electrónico": "email",
  telefono: "phone",
  teléfono: "phone",
  mobile: "phone",
  celular: "phone",
  país: "country",
  pais: "country",
  ciudad: "city",
  "linkedin url": "linkedin",
  "linkedin profile": "linkedin",
  "cover letter": "cover_letter",
  "carta de presentación": "cover_letter",
  cv: "resume_path",
  resume: "resume_path",
  curriculum: "resume_path",
  currículum: "resume_path",
};

export function resolveFieldValue(profile, fieldKey) {
  const values = profileToFormValues(profile);
  const raw = String(fieldKey || "")
    .trim()
    .toLowerCase();
  if (!raw) return undefined;
  if (Object.prototype.hasOwnProperty.call(values, raw)) return values[raw];
  const alias = ALIASES[raw];
  if (alias && Object.prototype.hasOwnProperty.call(values, alias)) {
    return values[alias];
  }
  if (Object.prototype.hasOwnProperty.call(profile.customAnswers, fieldKey)) {
    return profile.customAnswers[fieldKey];
  }
  return undefined;
}
