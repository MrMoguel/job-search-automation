import { google } from "googleapis";
import { pool } from "../lib/db.js";
import { chatComplete } from "../lib/llm.js";

/**
 * Cliente de Gmail API vía OAuth2 (NO scraping del webmail).
 * Requiere que el usuario haya completado el flujo OAuth una vez y que
 * el refresh_token esté disponible como variable de entorno / secret.
 */
function getGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

/**
 * Clasifica el contenido de un email de respuesta usando el LLM.
 * Devuelve uno de: rejection | interview_request | info_request | auto_ack | unknown
 */
async function classifyEmail(subject, snippet) {
  // System prompt con definiciones + regla de desempate. Antes el mismo correo
  // ("Envío del cuestionario") caía a veces en info_request y a veces en auto_ack;
  // esto lo hace consistente y sesga los borderline hacia "accionable".
  const system = `Sos un clasificador de emails de respuesta a postulaciones laborales. Devolvés SOLO una de estas etiquetas, en minúscula y sin explicación:
- rejection: rechazan al candidato / no avanza.
- interview_request: lo invitan a una entrevista, llamada o reunión, o le piden coordinar un horario.
- info_request: le piden al candidato HACER algo para avanzar — completar un cuestionario/formulario/test/assessment, enviar información o documentos, agendar, o responder preguntas.
- auto_ack: acuse de recibo automático que NO pide ninguna acción ("recibimos tu postulación", "gracias por aplicar", sin próximos pasos).
- unknown: no calza en ninguna.

Regla de desempate: si el email pide o adjunta algo que el candidato debe completar / responder / enviar (ej. "Envío del cuestionario", "completá esta evaluación", "necesitamos tus datos"), es info_request, NO auto_ack. Ante la duda entre info_request y auto_ack, elegí info_request.`;

  const prompt = `Asunto: ${subject}\nContenido: ${snippet}\n\nEtiqueta:`;

  // temperature 0 = misma entrada, misma etiqueta (antes variaba). maxTokens holgado
  // porque los modelos reasoning consumen tokens pensando antes de responder.
  const raw = (await chatComplete(prompt, { system, temperature: 0, maxTokens: 256 })).toLowerCase();
  // Búsqueda por substring (robusta a texto extra); orden = prioridad de match.
  const valid = ["interview_request", "info_request", "rejection", "auto_ack", "unknown"];
  return valid.find((label) => raw.includes(label)) ?? "unknown";
}

// Clasificaciones que REQUIEREN acción de Miguel para avanzar la postulación.
// rejection/auto_ack no piden nada; interview_request/info_request sí.
const ACTIONABLE = new Set(["interview_request", "info_request"]);

// Link directo al mensaje en el webmail (el id de la API es el hex que usa la URL de Gmail).
function gmailLink(messageId) {
  return `https://mail.google.com/mail/u/0/#all/${messageId}`;
}

export async function runTracking(body) {
  // Ventana acotada + términos amplios; el LLM filtra el ruido después. Se puede
  // sobreescribir con body.query desde el cron.
  const query = body.query ||
    'newer_than:14d (postulación OR application OR entrevista OR interview OR proceso OR selección OR assessment OR evaluación OR "next steps" OR "próximos pasos")';
  const gmail = getGmailClient();

  const client = await pool.connect();
  let processed = 0;
  const actionable = [];

  try {
    const list = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 20 });
    const messages = list.data.messages ?? [];

    for (const msg of messages) {
      const { rows: existing } = await client.query(
        `SELECT 1 FROM email_events WHERE gmail_message_id = $1`,
        [msg.id]
      );
      if (existing.length > 0) continue; // ya procesado

      const full = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "metadata", metadataHeaders: ["From", "Subject", "Date"] });
      const headers = Object.fromEntries((full.data.payload?.headers ?? []).map((h) => [h.name, h.value]));
      const snippet = full.data.snippet ?? "";

      const classification = await classifyEmail(headers.Subject ?? "", snippet);

      await client.query(
        `INSERT INTO email_events (gmail_message_id, from_address, subject, received_at, classified_as, classified_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [msg.id, headers.From, headers.Subject, new Date(headers.Date), classification]
      );
      processed++;

      if (ACTIONABLE.has(classification)) {
        actionable.push({
          from: headers.From ?? "",
          subject: headers.Subject ?? "",
          received_at: headers.Date ?? "",
          classification,
          snippet,
          link: gmailLink(msg.id),
        });
      }
    }
  } finally {
    client.release();
  }

  // `actionable` = lo que Miguel tiene que atender (entrevistas, pedidos de info/assessment).
  return { processed, actionable_count: actionable.length, actionable };
}
