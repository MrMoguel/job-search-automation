/**
 * gmail-oauth-setup.js — flujo OAuth2 de una sola vez para obtener el refresh_token de Gmail.
 *
 * Por qué acá y no en /scripts del repo: solo `./workers/src` está montado en el
 * contenedor (`/app/src`), así corre sin rebuild y con el `googleapis` ya instalado.
 *
 * Requisitos previos (los hace Miguel una vez en Google Cloud Console):
 *   1. Crear proyecto → habilitar "Gmail API".
 *   2. Pantalla de consentimiento OAuth (tipo "Externo"), agregarse como test user.
 *   3. Credenciales → ID de cliente OAuth → tipo "App de escritorio" (Desktop app).
 *   4. Copiar Client ID y Client Secret a .env:
 *        GMAIL_CLIENT_ID=...
 *        GMAIL_CLIENT_SECRET=...
 *        GMAIL_REDIRECT_URI=http://localhost   (para app de escritorio)
 *
 * Cómo correrlo (con -it para poder pegar el código):
 *   docker exec -it jobsearch-workers node src/scripts/gmail-oauth-setup.js
 *
 * Pega el refresh_token que imprime en .env (GMAIL_REFRESH_TOKEN) y reiniciá workers.
 */
import "dotenv/config";
import readline from "node:readline";
import { google } from "googleapis";

// Solo lectura: alcanza para listar/leer/clasificar respuestas. Menos permisos = consentimiento más simple.
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

async function main() {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET } = process.env;
  const GMAIL_REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || "http://localhost";

  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET) {
    console.error("\n❌ Falta GMAIL_CLIENT_ID y/o GMAIL_CLIENT_SECRET en .env.");
    console.error("   Completá primero los pasos de Google Cloud Console (ver cabecera de este archivo).\n");
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",   // necesario para recibir refresh_token
    prompt: "consent",         // fuerza refresh_token aunque ya hayas autorizado antes
    scope: SCOPES,
  });

  console.log("\n1) Abrí esta URL en tu navegador (logueado con tu Gmail) y autorizá:\n");
  console.log("   " + authUrl + "\n");
  console.log("2) Después de aceptar, el navegador intentará ir a http://localhost/?code=...&scope=...");
  console.log("   No va a cargar (no hay servidor) — es normal. Copiá SOLO el valor de `code`");
  console.log("   de la barra de direcciones (lo que va entre `code=` y `&scope`).\n");

  const code = await ask("3) Pegá el code acá y Enter: ");
  if (!code) { console.error("\n❌ No se ingresó ningún code.\n"); process.exit(1); }

  // Google URL-encodea el code (%2F por /). Si lo pegan codificado, lo decodificamos.
  const cleanCode = /%2F/i.test(code) ? decodeURIComponent(code) : code;

  try {
    const { tokens } = await oauth2Client.getToken(cleanCode);
    if (!tokens.refresh_token) {
      console.error("\n⚠️  No vino refresh_token. Suele pasar si ya autorizaste antes sin revocar.");
      console.error("   Revocá el acceso en https://myaccount.google.com/permissions y volvé a correr.\n");
      process.exit(1);
    }
    console.log("\n✅ Listo. Pegá esto en .env y reiniciá workers (docker compose up -d workers):\n");
    console.log("GMAIL_REFRESH_TOKEN=" + tokens.refresh_token + "\n");
  } catch (err) {
    console.error("\n❌ Error al canjear el code:", err?.response?.data ?? err.message ?? err);
    console.error("   (El code vence en ~minutos y es de un solo uso — reintentá el flujo completo.)\n");
    process.exit(1);
  }
}

main();
