#!/usr/bin/env node
/**
 * export-auth-state.js — exporta el storageState de cada plataforma tras un login MANUAL.
 *
 * Qué hace: abre un Chromium visible (nunca headless) en la URL de login de cada
 * plataforma, espera a que Miguel termine login/captcha/2FA a mano, y guarda las
 * cookies + localStorage en `secrets/auth-state/<key>.json`.
 *
 * Qué NO hace (a propósito): no automatiza el login, no resuelve captchas, no pide
 * ni guarda contraseñas. Solo cuentas propias.
 *
 * Uso:
 *   node scripts/export-auth-state.js                      # las 5, una por una
 *   node scripts/export-auth-state.js --platform=laborum   # una sola
 *   node scripts/export-auth-state.js --platform=linkedin,indeed
 *   node scripts/export-auth-state.js --list
 *
 * Los JSON resultantes se montan en Docker a /app/.auth-state/<key>.json (ver README).
 * Son credenciales de sesión: están en .gitignore y nunca se commitean.
 */
import readline from "node:readline";
import { existsSync, mkdirSync, chmodSync, statSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const DEFAULT_OUT = path.join(REPO_ROOT, "secrets", "auth-state");

/**
 * Orden = el del roadmap. `url` es la pantalla de login (o la home desde donde
 * se entra al login cuando el portal no tiene una URL de login estable).
 */
const PLATFORMS = [
  {
    key: "linkedin",
    label: "LinkedIn",
    url: "https://www.linkedin.com/login",
    hint: "usuario + password (+ 2FA si la tenés activa). Listo = ves tu feed.",
    // Cookie de sesión conocida y estable de LinkedIn.
    sessionCookies: ["li_at"],
  },
  {
    key: "computrabajo",
    label: "Computrabajo Chile",
    url: "https://www.computrabajo.cl",
    hint: "arriba a la derecha: 'Iniciar sesión' (cuenta de candidato). Listo = ves tu nombre en el header.",
    sessionCookies: [],
  },
  {
    key: "laborum",
    label: "Laborum Chile",
    url: "https://www.laborum.cl",
    hint: "arriba a la derecha: 'Ingresar' (cuenta de postulante). Listo = ves tu panel/postulaciones.",
    sessionCookies: [],
  },
  {
    key: "indeed",
    label: "Indeed Chile",
    url: "https://cl.indeed.com",
    hint: "'Iniciar sesión' — suele mandar un código de un solo uso al mail. Listo = ves tu cuenta en el header.",
    sessionCookies: [],
  },
  {
    key: "gob",
    label: "Empleos Públicos (gob)",
    url: "https://www.empleospublicos.cl",
    hint: "login con ClaveÚnica o cuenta con RUN. Listo = ves tu perfil / CV electrónico.",
    sessionCookies: [],
  },
];

const BY_KEY = new Map(PLATFORMS.map((p) => [p.key, p]));

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const opts = { platforms: null, out: DEFAULT_OUT, list: false, help: false };
  for (const arg of argv) {
    const [flag, rawValue] = arg.split(/=(.*)/s);
    const value = rawValue ?? "";
    switch (flag) {
      case "--platform":
      case "--platforms":
        opts.platforms = (opts.platforms ?? []).concat(
          value.split(",").map((s) => s.trim()).filter(Boolean)
        );
        break;
      case "--out":
      case "--out-dir":
        opts.out = path.resolve(value);
        break;
      case "--list":
        opts.list = true;
        break;
      case "-h":
      case "--help":
        opts.help = true;
        break;
      default:
        console.error(`Argumento desconocido: ${arg}`);
        opts.help = true;
    }
  }
  return opts;
}

function usage() {
  console.log(`
export-auth-state.js — login manual → storageState por plataforma

  node scripts/export-auth-state.js                       las ${PLATFORMS.length} en orden
  node scripts/export-auth-state.js --platform=laborum    una sola
  node scripts/export-auth-state.js --platform=a,b        varias
  node scripts/export-auth-state.js --out=/otra/carpeta   destino distinto
  node scripts/export-auth-state.js --list                plataformas disponibles

Destino por defecto: ${DEFAULT_OUT}/<key>.json
`);
}

// ---------------------------------------------------------------- espera manual

/**
 * Espera la señal de "ya me logueé". Dos vías, la que llegue primero:
 *   1. Enter en esta terminal (uso normal, interactivo).
 *   2. Un archivo señal — sirve cuando el script corre sin TTY (background, agente,
 *      `docker exec` sin -it): `touch <signalPath>`.
 * Sin timeout corto: el captcha/2FA puede tardar minutos.
 */
function waitForGo({ signalPath, browser }) {
  return new Promise((resolve) => {
    let settled = false;
    const rl = readline.createInterface({ input: process.stdin });
    const timer = setInterval(() => {
      if (existsSync(signalPath)) {
        rmSync(signalPath, { force: true });
        finish("archivo señal");
      }
    }, 1000);

    function finish(how) {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      rl.close();
      browser.off("disconnected", onDisconnect);
      resolve(how);
    }
    function onDisconnect() {
      finish("browser cerrado");
    }

    rl.on("line", () => finish("Enter"));
    browser.on("disconnected", onDisconnect);
  });
}

// ---------------------------------------------------------------- check de sesión

/** Check simple y no bloqueante: ¿esto parece una sesión logueada? */
function inspectSession(state, platform) {
  const cookies = state.cookies ?? [];
  const expected = platform.sessionCookies ?? [];
  const found = expected.filter((name) => cookies.some((c) => c.name === name));
  // Para los portales sin cookie conocida y estable: heurística por nombre.
  const looksLikeSession = cookies.some((c) =>
    /(^|[._-])(sess|sid|auth|token|jwt|login|logged|remember)/i.test(c.name)
  );
  const persistent = cookies.filter((c) => (c.expires ?? -1) > 0).length;
  const storageOrigins = (state.origins ?? []).length;

  const ok = expected.length ? found.length === expected.length : looksLikeSession;
  const detail = expected.length
    ? `cookies esperadas: ${found.length}/${expected.length} (${expected.join(", ")})`
    : `cookie con pinta de sesión: ${looksLikeSession ? "sí" : "no"}`;

  return {
    ok,
    summary: `${cookies.length} cookies (${persistent} persistentes), ${storageOrigins} origins con storage — ${detail}`,
  };
}

// ---------------------------------------------------------------- flujo por plataforma

async function launchBrowser() {
  // import dinámico: así `--list` y `--help` funcionan aunque falte `npm install`.
  const { chromium } = await import("playwright");
  // Chrome del sistema si está (menos fricción con anti-bot), si no el Chromium de Playwright.
  const common = {
    headless: false, // NUNCA headless: el login es manual y los portales lo detectan.
    args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
  };
  try {
    return await chromium.launch({ ...common, channel: "chrome" });
  } catch {
    return await chromium.launch(common);
  }
}

async function exportPlatform(platform, outDir) {
  const outPath = path.join(outDir, `${platform.key}.json`);
  const signalPath = path.join(outDir, `.listo-${platform.key}`);
  rmSync(signalPath, { force: true });

  console.log(`\n${"─".repeat(72)}`);
  console.log(`▶ ${platform.label}  (${platform.key})`);
  console.log(`${"─".repeat(72)}`);

  const browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: null,
    locale: "es-CL",
    timezoneId: "America/Santiago",
  });
  const page = await context.newPage();

  try {
    await page.goto(platform.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  } catch (err) {
    console.warn(`⚠ No cargó ${platform.url} (${err.message.split("\n")[0]}).`);
    console.warn("  Navegá a mano en la ventana que se abrió y seguí igual.");
  }

  console.log(`\n  Logueate en ${platform.label}: ${platform.hint}`);
  console.log(`  Cuando veas la home logueada, volvé a esta terminal y apretá Enter.`);
  console.log(`  (sin TTY: \`touch ${signalPath}\`)\n`);

  const how = await waitForGo({ signalPath, browser });

  if (how === "browser cerrado" || !browser.isConnected()) {
    console.error(`✗ ${platform.key}: cerraste el browser antes de guardar. No se escribió nada.`);
    return false;
  }
  console.log(`  → señal recibida (${how}), guardando sesión…`);

  const state = await context.storageState({ path: outPath });
  chmodSync(outPath, 0o600);

  const check = inspectSession(state, platform);
  console.log(`  ${check.ok ? "✓" : "⚠"} ${check.summary}`);
  if (!check.ok) {
    console.log("  ⚠ No se ve una cookie de sesión clara. Se guardó igual; si al usarlo");
    console.log("    pide login de nuevo, volvé a correr solo esta plataforma.");
  }
  console.log(`  ✓ ${outPath} (${statSync(outPath).size} bytes, chmod 600)`);

  await context.close();
  await browser.close();
  return true;
}

// ---------------------------------------------------------------- main

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) return usage();
  if (opts.list) {
    console.log("\nPlataformas:\n");
    for (const p of PLATFORMS) console.log(`  ${p.key.padEnd(14)} ${p.url}`);
    console.log();
    return;
  }

  let selected = PLATFORMS;
  if (opts.platforms) {
    const unknown = opts.platforms.filter((k) => !BY_KEY.has(k));
    if (unknown.length) {
      console.error(`\n❌ Plataforma desconocida: ${unknown.join(", ")}`);
      console.error(`   Válidas: ${PLATFORMS.map((p) => p.key).join(", ")}\n`);
      process.exitCode = 1;
      return;
    }
    selected = opts.platforms.map((k) => BY_KEY.get(k));
  }

  mkdirSync(opts.out, { recursive: true });
  chmodSync(opts.out, 0o700); // credenciales de sesión: solo el dueño

  console.log(`\nDestino: ${opts.out}`);
  console.log(`Plataformas: ${selected.map((p) => p.key).join(", ")}`);
  console.log("Login 100% manual — no se automatiza nada del login ni del captcha.");

  const results = [];
  for (const platform of selected) {
    try {
      results.push([platform.key, await exportPlatform(platform, opts.out)]);
    } catch (err) {
      console.error(`✗ ${platform.key}: ${err.message}`);
      results.push([platform.key, false]);
    }
  }

  console.log(`\n${"═".repeat(72)}\nResumen\n`);
  for (const [key, ok] of results) {
    console.log(`  ${ok ? "✓" : "✗"} ${key.padEnd(14)} ${ok ? path.join(opts.out, `${key}.json`) : "sin guardar"}`);
  }
  console.log();
  if (results.some(([, ok]) => !ok)) process.exitCode = 1;
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
