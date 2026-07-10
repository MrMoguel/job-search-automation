/**
 * Adaptador de discovery para RemoteOK (remoteok.com).
 *
 * RemoteOK expone una API pública JSON en /api. Sin login → bajo riesgo (a
 * diferencia de plataformas con sesión). Dos modos:
 *   - /api            → los ~100 avisos MÁS recientes (el 1er elemento es un
 *                       aviso legal, se descarta).
 *   - /api?tags=<tag> → filtrado por tag canónico (ej. ai, python, devops).
 *                       Ojo: "automation" NO es tag canónico (devuelve 0);
 *                       usamos tags que sí existen y dejamos que el SCORING
 *                       filtre el fit real de automatización/IA/startup.
 *
 * Son roles remotos GLOBALES (mayormente en inglés y husos US/EU). El scoring
 * y el perfil de Miguel deciden cuáles califican.
 *
 * Shape observado (2026-07): { id, slug, company, position, tags[], description,
 * location, url, apply_url, salary_min, salary_max }.
 */
const API_BASE = "https://remoteok.com/api";
// UA de navegador: RemoteOK bloquea UAs "de bot" con 403/HTML.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 job-search-automation";

// Tags canónicos de RemoteOK afines al perfil (automatización/IA/backend).
// "automation" no existe como tag → se cubre vía scoring sobre estos.
const DEFAULT_TAGS = ["ai", "python", "engineer", "api", "backend", "devops"];

function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function salaryLine(a) {
  if (a.salary_min || a.salary_max) {
    const min = a.salary_min ? `$${a.salary_min.toLocaleString("en-US")}` : "";
    const max = a.salary_max ? `$${a.salary_max.toLocaleString("en-US")}` : "";
    const range = [min, max].filter(Boolean).join(" - ");
    return range ? `Salario (USD/año): ${range}` : "";
  }
  return "";
}

function mapJob(a) {
  const tags = Array.isArray(a.tags) ? a.tags.filter(Boolean) : [];
  const description = [
    stripHtml(a.description),
    salaryLine(a),
    tags.length ? `Tags: ${tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    source: "remoteok",
    source_job_id: String(a.id ?? a.slug),
    company: a.company || "RemoteOK (empresa no especificada)", // company es NOT NULL en DB
    title: a.position,
    location: a.location || "Remote",
    url: a.url || a.apply_url || `https://remoteok.com/remote-jobs/${a.slug ?? a.id}`,
    description_raw: description || null,
  };
}

async function fetchTag(tag) {
  const url = tag ? `${API_BASE}?tags=${encodeURIComponent(tag)}` : API_BASE;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`RemoteOK ${tag || "recent"}: HTTP ${res.status}`);
  const body = await res.json();
  // El 1er elemento es el aviso legal ({legal:...}); los jobs tienen id/position.
  return (Array.isArray(body) ? body : []).filter((j) => j && j.id && j.position);
}

/**
 * @param {{ tags?: string[], includeRecent?: boolean, requestDelayMs?: number }} opts
 *   tags          — tags canónicos a consultar (default: perfil de Miguel)
 *   includeRecent — además, traer /api (últimos ~100 sin filtrar). Default true.
 *   requestDelayMs— delay entre requests (cortesía anti rate-limit). Default 800.
 * @returns {Promise<object[]>} postings listos para upsert
 */
export async function discoverRemoteOK({ tags = DEFAULT_TAGS, includeRecent = true, requestDelayMs = 800 } = {}) {
  const postings = [];
  const seen = new Set(); // dedupe intra-corrida (un job aparece en varios tags)
  const sources = includeRecent ? [null, ...tags] : tags;

  for (const tag of sources) {
    let jobs;
    try {
      jobs = await fetchTag(tag);
    } catch (err) {
      // un tag que falla no debe tumbar toda la corrida
      console.error(`[remoteok] ${err.message}`);
      continue;
    }
    for (const a of jobs) {
      const key = String(a.id ?? a.slug);
      if (seen.has(key)) continue;
      seen.add(key);
      postings.push(mapJob(a));
    }
    if (requestDelayMs) await new Promise((r) => setTimeout(r, requestDelayMs));
  }

  return postings;
}
