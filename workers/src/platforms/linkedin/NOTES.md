# LinkedIn platform — notas de selectores y guardrails

Scaffolding (asignación #1). **No apply en prod** hasta mapear UI real y wiring en `application/index.js` (eso lo abre Don Jose).

## Guardrails (código en `guardrails.js`)

| Regla | Constante / API |
| --- | --- |
| Nunca headless | `assertNeverHeadless`, `linkedInBrowserOptions()` → `headless: false` |
| Sesión propia | `LINKEDIN_STORAGE_STATE` (default `/app/.auth-state/linkedin.json`) |
| Rate limit | `DAILY_APPLY_LIMIT` default **8** (env `LINKEDIN_DAILY_APPLY_LIMIT`, rango 5–10) |
| Delays humanos | `HUMAN_DELAY_MS` / `humanPause()` |

## Discovery (pendiente de selectores)

- Feed / search: `https://www.linkedin.com/jobs/search/?keywords=...`
- Cards: TBD (revisar DOM logueado; no scrapear anónimo)
- Campos salida: `source=linkedin`, `source_job_id`, `company`, `title`, `location`, `url`, `description_raw`

## Easy Apply — mapa de campos (contrato ApplicantProfile)

Usar `resolveFieldValue(profile, key)` / `profileToFormValues(profile)` — **sin LLM por postulación**.

| UI LinkedIn (label típico) | Clave canónica |
| --- | --- |
| First name | `first_name` |
| Last name | `last_name` |
| Email | `email` |
| Phone | `phone` |
| City / Location | `city` |
| LinkedIn profile | `linkedin` |
| Resume / CV upload | `resume_path` (`setInputFiles`) |
| Cover letter / message | `cover_letter` |

Selectores CSS/ARIA concretos: **TBD** — actualizar solo cuando cambie la UI.

## Flujo futuro (determinista)

1. Launch con `linkedInBrowserOptions()` (nunca headless + storageState).
2. `assertUnderDailyLimit(countFromDb)`.
3. Goto job URL → Easy Apply.
4. Steps multi-página: fill por mapa; preguntas sin alias → skip + log (no inventar).
5. `humanPause()` entre acciones; no generar código por job.

## Fuera de alcance de este PR

- No edita `workers/src/application/index.js` ni `workers/src/lib/`.
- No merge a main (revisión Don Jose).
