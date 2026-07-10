import { pool } from "../lib/db.js";
import { chatComplete, parseJsonLoose, LLM_MODEL } from "../lib/llm.js";

const SCORE_THRESHOLD = Number(process.env.SCORE_THRESHOLD || 70);

// System prompt: fija el rol + formato de salida. Tener un system prompt es
// clave para modelos composer/reasoning, que sin él se portan mal (saludan,
// alucinan historial). Formato {score,pros,cons} adaptado de jobhound (MIT).
const SCORING_SYSTEM = `Sos un reclutador experto que evalúa qué tan bien calza una oferta con un candidato.
Puntuás de 0 a 100 (100 = calce ideal). Sé estricto: penalizá seniority/años de
experiencia que el candidato no tiene, stacks totalmente ajenos, o idioma requerido
que no domina. Premiá match real de rol/skills, modalidad y seniority.
Si la descripción está vacía o es muy corta, puntuá por el título.

FORMATO DE SALIDA (obligatorio, exactamente este JSON, sin texto extra ni markdown):
{"score": <entero 0-100>, "pros": "<una línea: qué calza>", "cons": "<una línea: qué no calza>"}`;

const clamp = (n) => Math.max(0, Math.min(100, n));

function coerceScore(value) {
  if (typeof value === "number") return Math.trunc(value);
  const m = String(value ?? "").match(/\d{1,3}/);
  return m ? Number(m[0]) : NaN;
}

/**
 * Scorea un posting contra el perfil del usuario vía el LLM configurado
 * (Grok vía el proxy de Hermes por defecto). Devuelve { score: 0-100, reasoning }.
 *
 * El proveedor vive aislado en lib/llm.js, así que esta función no se acopla
 * a Grok/Anthropic/etc — solo arma el prompt y parsea el JSON de respuesta.
 * El parseo es tolerante (parseJsonLoose) porque los modelos reasoning a veces
 * envuelven el JSON o agregan texto; JSON.parse pelado se rompía con eso.
 */
async function scorePosting(posting, profileText) {
  const description = posting.description_raw
    ? String(posting.description_raw).slice(0, 3500)
    : "(sin descripción, evaluar solo por título/empresa)";

  const prompt = `CANDIDATO (perfil/CV):
${profileText}

OFERTA:
Empresa: ${posting.company}
Título: ${posting.title}
Ubicación: ${posting.location ?? "no especificada"}
Descripción:
${description}

Respondé SOLO con el JSON del formato indicado.`;

  // maxTokens holgado: los modelos reasoning consumen tokens pensando antes de responder.
  const text = await chatComplete(prompt, {
    maxTokens: 800,
    system: SCORING_SYSTEM,
    temperature: 0.1,
    responseFormat: "json_object",
  });

  const parsed = parseJsonLoose(text);
  const score = clamp(coerceScore(parsed.score));
  if (Number.isNaN(score)) {
    throw new Error(`scoring: respuesta sin score parseable: ${text.slice(0, 200)}`);
  }
  const pros = String(parsed.pros ?? "").trim();
  const cons = String(parsed.cons ?? "").trim();
  const reasoning =
    [pros && `✔ ${pros}`, cons && `✘ ${cons}`].filter(Boolean).join(" · ") ||
    String(parsed.reason ?? "").trim();

  return { score, reasoning };
}

export async function runScoring(body) {
  // TODO: reemplazar por el perfil/CV real de Miguel (cargado desde config o DB)
  const profileText = body.profileText ?? process.env.CANDIDATE_PROFILE_TEXT ?? "";

  const client = await pool.connect();
  let scored = 0;
  let queued = 0;
  let rejected = 0;

  try {
    const { rows: postings } = await client.query(
      `SELECT * FROM postings WHERE status = 'discovered' ORDER BY discovered_at DESC LIMIT 50`
    );

    for (const posting of postings) {
      const { score, reasoning } = await scorePosting(posting, profileText);

      await client.query(
        `INSERT INTO scores (posting_id, score, reasoning, model_used) VALUES ($1, $2, $3, $4)`,
        [posting.id, score, reasoning, LLM_MODEL]
      );

      const newStatus = score >= SCORE_THRESHOLD ? "queued_for_application" : "rejected_by_score";
      await client.query(`UPDATE postings SET status = $1 WHERE id = $2`, [newStatus, posting.id]);

      scored++;
      if (newStatus === "queued_for_application") queued++;
      else rejected++;
    }
  } finally {
    client.release();
  }

  return { scored, queued, rejected, threshold: SCORE_THRESHOLD };
}
