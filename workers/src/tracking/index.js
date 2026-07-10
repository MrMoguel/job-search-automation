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
  const prompt = `Clasificá este email de respuesta a una postulación laboral en una sola palabra:
rejection, interview_request, info_request, auto_ack, o unknown.

Asunto: ${subject}
Contenido: ${snippet}

Respondé solo la palabra.`.trim();

  // maxTokens holgado aunque la respuesta sea una palabra: grok-4.3 razona antes
  // de responder y con un presupuesto muy chico devolvería content vacío.
  const raw = await chatComplete(prompt, { maxTokens: 256 });
  const text = raw.trim().toLowerCase().replace(/[^a-z_]/g, "");
  const valid = ["rejection", "interview_request", "info_request", "auto_ack", "unknown"];
  return valid.includes(text) ? text : "unknown";
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
