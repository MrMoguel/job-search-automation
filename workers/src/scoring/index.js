import { pool } from "../lib/db.js";
import { chatComplete, parseJsonLoose, LLM_MODEL } from "../lib/llm.js";

const SCORE_THRESHOLD = Number(process.env.SCORE_THRESHOLD || 70);

// Backpressure de la cola (por plataforma): se mantiene la cola LLENA hasta
// QUEUE_CAP para que las postulaciones nunca se queden sin material. Se rellena
// en cada corrida siempre que la cola esté por debajo del cap (sin esperar a que
// se vacíe), puntuando las MÁS NUEVAS primero — así las viejas no se cuelan y el
// ritmo de postulación se sostiene. El cap evita acumular ofertas sin límite.
const QUEUE_CAP = Number(process.env.QUEUE_CAP || 25);
const QUEUE_REFILL_AT = Number(process.env.QUEUE_REFILL_AT || QUEUE_CAP - 1);

// System prompt: fija el rol + formato de salida. Tener un system prompt es
// clave para modelos composer/reasoning, que sin él se portan mal (saludan,
// alucinan historial). Formato {score,pros,cons} adaptado de jobhound (MIT).
const SCORING_SYSTEM = `Sos un reclutador técnico que puntúa de 0 a 100 qué tan bien calza una oferta con el candidato.

USÁ TODO EL RANGO, no comprimas hacia abajo:
- 80-100: calce ideal (rol y stack coinciden, seniority alcanzable).
- 60-79: buen calce (la mayoría del rol/stack coincide; faltan detalles menores).
- 40-59: calce parcial (algo coincide pero hay brechas reales).
- 20-39: calce débil. 0-19: no relacionado.
Si el match técnico es fuerte y la seniority es alcanzable, poné 75+; NO lo dejes en 45.

El candidato es de perfil JUNIOR / SEMI-SENIOR y quiere DEJAR un soporte N1 con turnos de noche: busca mejor sueldo y horario DIURNO. Por lo tanto:
- Es BUEN calce (premialo con 70+, NO lo penalices por ser de entrada) CUALQUIER rol técnico donde apliquen sus skills, no solo automatización: desarrollo (backend, fullstack, web, Python, Node), QA / automatización de pruebas / testing, análisis de datos / BI, ingeniería de datos, analista de implementación / funcional, integraciones / APIs, DevOps / cloud junior, RPA / automatización de procesos, IA/LLMs, soporte de aplicaciones diurno. La automatización/IA es un PLUS, NO un requisito: un "Desarrollador Junior", "QA Automation", "Analista de Datos" o "Analista de Implementación" que calce es 70+, no 45.
- Sumá: modalidad remoto LATAM o híbrido/presencial Chile en español, y horario DIURNO.
- Penalizá FUERTE (poné bajo 45): roles de SOPORTE N1/N2, mesa de ayuda, help desk, service desk, monitoreo, NOC, operador, u operaciones con turnos — el candidato se va JUSTAMENTE de un soporte con turnos, no le sirve otro parecido. (Excepción: "soporte/desarrollo de aplicaciones" diurno con foco técnico/desarrollo sí sirve.)
- Penalizá: roles que exijan TURNOS NOCTURNOS o rotativos / 24x7 / on-call nocturno; exigencia de mucha experiencia (senior/lead, 6+ años); inglés fluido/avanzado obligatorio; y dominios totalmente ajenos al software/datos/TI (ventas, salud asistencial, RRHH, diseño gráfico, automatización industrial/eléctrica de terreno).
Si la descripción está vacía o corta, puntuá por el título con criterio; no castigues de más por falta de datos.

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
  const skippedFull = {}; // plataformas que se saltaron por estar llenas/drenando

  try {
    // Cuántas hay encoladas por plataforma (para el cap + histéresis).
    const { rows: qrows } = await client.query(
      `SELECT source, count(*)::int AS n FROM postings WHERE status='queued_for_application' GROUP BY source`
    );
    const queuedBy = {};
    for (const r of qrows) queuedBy[r.source] = r.n;

    // Plataformas que tienen ofertas sin puntuar.
    const { rows: srows } = await client.query(
      `SELECT DISTINCT source FROM postings WHERE status='discovered'`
    );

    for (const { source } of srows) {
      let qc = queuedBy[source] ?? 0;
      // Mantener la cola llena: sólo se salta si ya está en el cap. Mientras esté
      // por debajo, se rellena en cada corrida para que las postulaciones nunca
      // se queden sin material.
      if (qc >= QUEUE_CAP) {
        skippedFull[source] = qc;
        continue;
      }

      // Rellenar hasta el cap, puntuando las MÁS NUEVAS primero.
      const { rows: postings } = await client.query(
        `SELECT * FROM postings WHERE status='discovered' AND source=$1 ORDER BY discovered_at DESC LIMIT 80`,
        [source]
      );

      for (const posting of postings) {
        if (qc >= QUEUE_CAP) break;
        const { score, reasoning } = await scorePosting(posting, profileText);

        await client.query(
          `INSERT INTO scores (posting_id, score, reasoning, model_used) VALUES ($1, $2, $3, $4)`,
          [posting.id, score, reasoning, LLM_MODEL]
        );

        const newStatus = score >= SCORE_THRESHOLD ? "queued_for_application" : "rejected_by_score";
        await client.query(`UPDATE postings SET status = $1 WHERE id = $2`, [newStatus, posting.id]);

        scored++;
        if (newStatus === "queued_for_application") {
          queued++;
          qc++;
        } else {
          rejected++;
        }
      }
    }
  } finally {
    client.release();
  }

  return { scored, queued, rejected, threshold: SCORE_THRESHOLD, cap: QUEUE_CAP, skipped_full: skippedFull };
}
