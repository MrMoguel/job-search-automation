# Laborum platform — notas de selectores

Scaffolding (asignación #1). **No apply en prod** hasta mapear UI real y wiring en `application/index.js` (eso lo abre Don Jose).

Portal: [laborum.cl](https://www.laborum.cl) (Chile). Playwright determinista — **sin LLM por postulación**.

## Discovery (estado scaffolding)

| Aspecto | Nota |
| --- | --- |
| URL búsqueda típica | `https://www.laborum.cl/empleo/?q=...` (confirmar query params contra DOM/HTML real) |
| Método previsto | HTML público con cheerio **si** el listado no exige login; si hay wall/anti-bot → Playwright + `storageState` |
| Shape salida | `source=laborum`, `source_job_id`, `company`, `title`, `location`, `url`, `description_raw` |
| Selectores cards | **TBD** — capturar DOM/HTML real antes de fijar CSS |
| Dedupe | `source_job_id` estable (id de oferta o hash corto de URL canónica) |
| Rate | delay entre requests (estilo Computrabajo ~1.5s) |

`discovery.js` hoy es stub: firma estable + lista vacía hasta fijar selectores. No cablear en `discovery/index.js` aún.

## Apply — requiere sesión

Postulación en Laborum tipicamente pide cuenta propia:
- `LABORUM_STORAGE_STATE` (default `/app/.auth-state/laborum.json`)
- Preferible `headless: false` en la 1ª implementación real (anti-bot / captcha)
- Delays humanos; cero código generado por job

## Mapa de campos (contrato ApplicantProfile)

Usar `loadApplicantProfile` / `profileToFormValues` / `resolveFieldValue` desde `workers/src/lib/applicantProfile.js`.

| UI Laborum (label típico ES) | Clave canónica |
| --- | --- |
| Nombre / Nombre completo | `full_name` |
| Nombre | `first_name` |
| Apellido(s) | `last_name` |
| Correo / E-mail | `email` |
| Teléfono / Celular | `phone` |
| Ciudad / Comuna | `city` |
| País | `country` |
| LinkedIn / Perfil | `linkedin` |
| Adjuntar CV / Currículum | `resume_path` (`setInputFiles`) |
| Carta / Presentación / Mensaje | `cover_letter` |
| Preguntas de selección (texto libre) | `customAnswers[<label>]` o skip + log |

Selectores CSS/ARIA del formulario "Postular": **TBD** — actualizar solo cuando se capture el DOM logueado.

## Flujo futuro (determinista)

1. Launch Playwright con `storageState` de cuenta propia (no re-login en cada corrida).
2. `page.goto(posting.url)` → click **Postular** / equivalente.
3. Rellenar campos vía mapa + `resolveFieldValue`; CV con `setInputFiles(resume_path)`.
4. Preguntas sin alias conocido → **skip + log** (no inventar respuestas).
5. Pausa humana entre acciones; no auto-submit masivo.

## Fuera de alcance de este PR

- No edita `workers/src/application/index.js` ni `workers/src/lib/`.
- No cablea discovery en `workers/src/discovery/index.js`.
- No merge a main (revisión Don Jose).
