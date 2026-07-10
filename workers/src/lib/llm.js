/**
 * Cliente LLM aislado (única dependencia del proveedor en todo workers).
 *
 * Por defecto apunta al proxy OpenAI-compatible de Hermes (`hermes proxy start
 * --provider xai`), que enruta a Grok usando las credenciales SuperGrok OAuth
 * sin API key paga. Como el proxy es OpenAI-compatible, cambiar de proveedor
 * (ej. volver a Anthropic vía otro gateway, u OpenRouter) es solo cambiar
 * LLM_BASE_URL / LLM_MODEL en el entorno — no se toca el resto del pipeline.
 */
const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://hermes-proxy:8645/v1";
const LLM_API_KEY = process.env.LLM_API_KEY || "hermes-proxy"; // el proxy adjunta la credencial real; cualquier bearer sirve
export const LLM_MODEL = process.env.LLM_MODEL || "grok-4.3";

/**
 * Completa un prompt y devuelve el texto de la respuesta.
 *
 * Nota: algunos modelos (composer/reasoning) se portan mal SIN un system prompt
 * y responden mejor con `responseFormat: "json_object"` cuando se espera JSON.
 * Por eso el cliente expone esas opciones sin acoplarse a un modelo puntual.
 *
 * @param {string} prompt  contenido del mensaje de usuario
 * @param {{ maxTokens?: number, model?: string, system?: string,
 *           temperature?: number, responseFormat?: "json_object"|null }} [opts]
 * @returns {Promise<string>}
 */
export async function chatComplete(
  prompt,
  { maxTokens = 300, model = LLM_MODEL, system = null, temperature, responseFormat = null } = {}
) {
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const payload = { model, max_tokens: maxTokens, messages };
  if (typeof temperature === "number") payload.temperature = temperature;
  if (responseFormat === "json_object") payload.response_format = { type: "json_object" };

  const res = await fetch(`${LLM_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LLM HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("LLM: respuesta sin content (¿max_tokens agotado por razonamiento?)");
  }
  return text;
}

/**
 * Extrae un objeto JSON de la respuesta de un LLM de forma tolerante.
 * Adaptado de la estrategia de jobhound (MIT): probar JSON completo → objeto
 * embebido (raw_decode desde la primera "{") → regex clave/valor. Sirve para
 * modelos que a veces envuelven el JSON en markdown, bloques <think>, o texto.
 * @param {string} text
 * @returns {object}  {} si no se pudo extraer nada
 */
export function parseJsonLoose(text) {
  if (typeof text !== "string") return {};
  // sacar bloques <think>...</think> y fences de markdown
  let clean = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```json|```/gi, "")
    .trim();

  // 1) JSON completo
  try {
    const full = JSON.parse(clean);
    if (full && typeof full === "object") return full;
  } catch {
    /* sigue */
  }

  // 2) primer objeto {...} balanceado embebido en el texto
  const start = clean.indexOf("{");
  if (start !== -1) {
    for (let end = clean.length; end > start; end--) {
      const slice = clean.slice(start, end);
      if (!slice.endsWith("}")) continue;
      try {
        const obj = JSON.parse(slice);
        if (obj && typeof obj === "object") return obj;
      } catch {
        /* probar un cierre más corto */
      }
    }
  }

  // 3) fallback regex clave/valor (score + reason)
  const scoreMatch = clean.match(/["']?\bscore\b["']?\s*[:=]\s*(\d{1,3})/i);
  if (scoreMatch) {
    const reasonMatch = clean.match(/["']?\breason\b["']?\s*[:=]\s*(.+)/i);
    return {
      score: Number(scoreMatch[1]),
      reason: reasonMatch ? reasonMatch[1].trim().replace(/[,}]+$/, "").replace(/^["']|["']$/g, "").trim() : "",
    };
  }

  return {};
}
