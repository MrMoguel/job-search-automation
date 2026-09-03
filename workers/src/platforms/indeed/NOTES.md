# Indeed platform — notas de selectores

Scaffolding (asignación #1). **No apply en prod** hasta mapear UI real y wiring en `application/index.js` (eso lo abre Don Jose).

Portal: [cl.indeed.com](https://cl.indeed.com) / [indeed.com](https://www.indeed.com). Playwright determinista — **sin LLM por postulación**.

## Discovery (estado scaffolding)

| Aspecto | Nota |
| --- | --- |
| URL búsqueda típica (CL) | `https://cl.indeed.com/jobs?q=...&l=Chile` (confirmar params contra DOM real) |
| Método previsto | Listado a menudo HTML público (cheerio) **si** no hay wall; si anti-bot/login wall → Playwright + `storageState` |
| Shape salida | `source=indeed`, `source_job_id`, `company`, `title`, `location`, `url`, `description_raw` |
| Selectores cards | **TBD** — capturar DOM/HTML real antes de fijar CSS (Indeed cambia markup con frecuencia) |
| Dedupe | `source_job_id` estable (jk= de URL o hash corto de URL canónica) |
| Rate | delay entre requests (~1.5–2s); evitar bursts |

`discovery.js` hoy es stub: firma estable + lista vacía hasta fijar selectores. No cablear en `discovery/index.js` aún.

## Apply — requiere sesión / Easy Apply

Indeed mezcla **Indeed Apply** (formulario propio) y redirects a ATS externos:
- `INDEED_STORAGE_STATE` (default `/app/.auth-state/indeed.json`)
- Preferible `headless: false` en la 1ª implementación real (captcha / anti-bot)
- Delays humanos; cero código generado por job
- Si la oferta redirige a Greenhouse/Lever/etc. → **fuera de alcance** de este adaptador (lo maneja ATS abiertos)

## Mapa de campos (contrato ApplicantProfile)

Usar `loadApplicantProfile` / `profileToFormValues` / `resolveFieldValue` desde `workers/src/lib/applicantProfile.js`.

| UI Indeed (label típico ES/EN) | Clave canónica |
| --- | --- |
| Nombre / Full name | `full_name` |
| Nombre / First name | `first_name` |
| Apellido(s) / Last name | `last_name` |
| Correo / Email | `email` |
| Teléfono / Phone | `phone` |
| Ciudad / City | `city` |
| País / Country | `country` |
| LinkedIn / Profile URL | `linkedin` |
| Adjuntar CV / Resume | `resume_path` (`setInputFiles`) |
| Carta / Cover letter / Message | `cover_letter` |
| Preguntas adicionales | `customAnswers[<label>]` o skip + log |

Selectores CSS/ARIA del formulario Indeed Apply: **TBD** — actualizar solo cuando se capture el DOM logueado.

## Flujo futuro (determinista)

1. Launch Playwright con `storageState` de cuenta propia (no re-login en cada corrida).
2. `page.goto(posting.url)` → detectar Indeed Apply vs redirect ATS.
3. Si Indeed Apply: rellenar vía mapa + `resolveFieldValue`; CV con `setInputFiles(resume_path)`.
4. Preguntas sin alias conocido → **skip + log** (no inventar respuestas).
5. Pausa humana entre acciones; no auto-submit masivo.

## Fuera de alcance de este PR

- No edita `workers/src/application/index.js` ni `workers/src/lib/`.
- No cablea discovery en `workers/src/discovery/index.js`.
- No merge a main (revisión Don Jose).
