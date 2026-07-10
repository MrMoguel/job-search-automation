/**
 * Adaptador de discovery para GetOnBoard (getonbrd.com).
 *
 * GetOnBoard expone una API pública JSON:API. El endpoint /search/jobs no
 * requiere login, así que el discovery es bajo riesgo (a diferencia de la
 * POSTULACIÓN, que sí necesita sesión logueada — ver platforms/getonboard/apply.js).
 *
 * Doc de referencia del shape observado (2026-07): cada job trae
 * attributes.{title,description,functions,desirable,remote,remote_modality,
 * countries,location_cities,min_salary,max_salary,category_name} y
 * links.public_url (la URL donde se postula).
 */
const API_BASE = "https://www.getonbrd.com/api/v0";
const UA = "job-search-automation (uso personal)";

function stripHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function buildLocation(a) {
  if (a.remote) {
    const modality = a.remote_modality ? ` (${a.remote_modality})` : "";
    return `Remote${modality}`.trim();
  }
  const cities = (a.location_cities?.data ?? [])
    .map((c) => c.attributes?.name)
    .filter(Boolean);
  if (cities.length) return cities.join(", ");
  // countries es un array (ej. ["Chile"]); lo normalizamos a string
  const countries = Array.isArray(a.countries)
    ? a.countries.filter(Boolean)
    : a.countries
    ? [a.countries]
    : [];
  return countries.length ? countries.join(", ") : null;
}

/**
 * Resuelve el nombre de la empresa. El /search/jobs trae solo el id de la
 * relación company (ej. {data:{id:4457}}); el nombre se obtiene de
 * /companies/{id}. Se cachea por companyId para no repetir llamadas
 * (varias vacantes pueden ser de la misma empresa).
 */
const _companyCache = new Map(); // companyId -> name | null
async function resolveCompany(job) {
  const rel = job.attributes?.company?.data;
  if (rel?.attributes?.name) return rel.attributes.name; // por si algún día viene inline
  const id = rel?.id;
  if (id == null) return null;
  if (_companyCache.has(id)) return _companyCache.get(id);

  let name = null;
  try {
    const res = await fetch(`${API_BASE}/companies/${id}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (res.ok) {
      name = (await res.json())?.data?.attributes?.name ?? null;
    }
  } catch {
    /* red intermitente: null y usamos fallback en mapJob */
  }
  _companyCache.set(id, name);
  return name;
}

function mapJob(job, company) {
  const a = job.attributes ?? {};
  const description = [a.description, a.functions, a.desirable]
    .map(stripHtml)
    .filter(Boolean)
    .join("\n\n");
  return {
    source: "getonboard",
    source_job_id: job.id,
    company: company || "GetOnBoard (empresa no especificada)", // company es NOT NULL en DB
    title: a.title,
    location: buildLocation(a),
    url: job.links?.public_url ?? `https://www.getonbrd.com/jobs/${job.id}`,
    description_raw: description || null,
  };
}

/**
 * @param {{ queries?: string[], perPage?: number, maxPages?: number }} opts
 *   queries  — términos de búsqueda (ej. ["backend", "react", "devops"])
 *   perPage  — resultados por página (máx razonable 50)
 *   maxPages — cuántas páginas recorrer por query (rate-limit friendly)
 * @returns {Promise<object[]>} postings listos para upsert
 */
export async function discoverGetOnBoard({ queries = [], perPage = 50, maxPages = 1 } = {}) {
  const postings = [];
  const seen = new Set(); // dedupe intra-corrida (un job puede matchear varias queries)

  for (const query of queries) {
    for (let page = 1; page <= maxPages; page++) {
      const url = `${API_BASE}/search/jobs?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`GetOnBoard search "${query}" p${page}: HTTP ${res.status}`);
      }
      const body = await res.json();
      const jobs = body.data ?? [];

      for (const job of jobs) {
        if (seen.has(job.id)) continue;
        seen.add(job.id);
        const company = await resolveCompany(job);
        postings.push(mapJob(job, company));
      }

      if (jobs.length < perPage) break; // última página de esta query
    }
  }

  return postings;
}
