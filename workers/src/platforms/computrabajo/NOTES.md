# Computrabajo — auditoría discovery + mapa de apply

Scaffolding (asignación #1). **No apply en prod** hasta mapear UI logueada real y wiring en `application/index.js` (eso lo abre Don Jose).

## Auditoría de `discovery.js` (estado actual)

| Aspecto | Hallazgo |
| --- | --- |
| Método | Cheerio + `fetch` HTML público (`/ofertas-de-trabajo/?q=...`) — **sin login** |
| Riesgo | Bajo para listado; no toca sesión |
| Cableado | Ya importado en `workers/src/discovery/index.js` vía `discoverComputrabajo` |
| País default | `chile` → `https://www.computrabajo.cl` (`COMPUTRABAJO_TLDS`) |
| Selectores listado | `article.box_offer, div.offer_item, article[data-id]` (+ fallback `article`) |
| Título | `h2 a, h3 a, a.js-o-link, a[class*='title']` |
| Empresa | `a.fc_base.t_ellipsis` (fallback string si vacío — DB NOT NULL) |
| Ubicación | `p.fs16.fc_base.mt5:not(.dFlex)` |
| Descripción | fetch extra por URL si `withDescriptions` (varios selectores) |
| Dedupe | `source_job_id` = SHA1 corto de URL canónica |
| Rate | `requestDelayMs` default 1500 entre requests |
| Fragilidad | Selectores CSS pueden cambiar sin aviso (documentado en el propio módulo) |

### Gaps / follow-ups (no este PR)

- Validar selectores contra HTML real de `.cl` (smoke test manual o fixture).
- No mezclar discovery (público) con apply (sesión): apply vive en Playwright + `storageState`.
- Este PR **no modifica** `discovery.js` — solo documenta y agrega stub de apply.

## Apply — requiere sesión

Postulación en Computrabajo **no** es HTML anónimo: hace falta cuenta propia + cookie/sesión.
- `COMPUTRABAJO_STORAGE_STATE` (default `/app/.auth-state/computrabajo.json`)
- Delays humanos entre clicks; sin generar código por job
- Headless: preferible `false` en la primera implementación real (anti-bot / captcha); stub no lanza browser

## Mapa de campos (contrato ApplicantProfile)

Usar `loadApplicantProfile` / `profileToFormValues` / `resolveFieldValue` desde `workers/src/lib/applicantProfile.js` — **sin LLM por postulación**.

| UI Computrabajo (label típico ES) | Clave canónica |
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

Selectores CSS/ARIA concretos del modal/formulario "Postularme": **TBD** — actualizar solo cuando se capture el DOM logueado.

## Flujo futuro (determinista)

1. Launch Playwright con `storageState` de cuenta propia (no re-login en cada corrida).
2. `page.goto(posting.url)` → click **Postularme** / equivalente.
3. Rellenar campos vía mapa + `resolveFieldValue`; CV con `setInputFiles(resume_path)`.
4. Preguntas sin alias conocido → **skip + log** (no inventar respuestas).
5. Pausa humana entre acciones; no auto-submit masivo.

## Fuera de alcance de este PR

- No edita `workers/src/application/index.js` ni `workers/src/lib/`.
- No cambia `discovery.js` ni el wiring de `runDiscovery`.
- No merge a main (revisión Don Jose).
