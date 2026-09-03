# GOB / Empleos Públicos — notas de selectores

Scaffolding (asignación #1). **No apply en prod** hasta mapear UI real y wiring en `application/index.js` (eso lo abre Don Jose).

Portal: [empleospublicos.cl](https://www.empleospublicos.cl) (Dirección Nacional del Servicio Civil, Chile). Playwright determinista — **sin LLM por postulación**.

## Discovery (estado scaffolding)

| Aspecto | Nota |
| --- | --- |
| URL búsqueda típica | Listado público en `https://www.empleospublicos.cl` (confirmar rutas/query params contra DOM/HTML real; ASP.NET legacy) |
| Método previsto | HTML público con cheerio **si** el listado no exige login; postulación y CV electrónico → sesión (ClaveÚnica o cuenta RUN) + Playwright + `storageState` |
| Shape salida | `source=gob`, `source_job_id`, `company`, `title`, `location`, `url`, `description_raw` |
| Selectores cards | **TBD** — capturar DOM/HTML real antes de fijar CSS (markup ASP.NET / WebForms) |
| Dedupe | `source_job_id` estable (id de convocatoria o hash corto de URL canónica) |
| Rate | delay entre requests (~1.5–2s); portal gubernamental, evitar bursts |

`discovery.js` hoy es stub: firma estable + lista vacía hasta fijar selectores. No cablear en `discovery/index.js` aún.

## Apply — requiere sesión

Postulación en Empleos Públicos tipicamente pide cuenta propia (ClaveÚnica o RUN + clave):
- `GOB_STORAGE_STATE` (default `/app/.auth-state/gob.json`)
- Preferible `headless: false` en la 1ª implementación real (ClaveÚnica / captcha / 2FA)
- Delays humanos; cero código generado por job
- Muchas convocatorias piden **currículum electrónico** del portal + documentos adjuntos (título, certificados); el mapa abajo cubre el contrato ApplicantProfile compartido — docs específicos del concurso → skip + log hasta mapeo real

## Mapa de campos (contrato ApplicantProfile)

Usar `loadApplicantProfile` / `profileToFormValues` / `resolveFieldValue` desde `workers/src/lib/applicantProfile.js`.

| UI Empleos Públicos (label típico ES) | Clave canónica |
| --- | --- |
| Nombre / Nombre completo | `full_name` |
| Nombre | `first_name` |
| Apellido(s) | `last_name` |
| Correo / E-mail | `email` |
| Teléfono / Celular | `phone` |
| Ciudad / Comuna | `city` |
| País | `country` |
| LinkedIn / Perfil | `linkedin` |
| Adjuntar CV / Currículum libre | `resume_path` (`setInputFiles`) |
| Carta / Presentación / Mensaje | `cover_letter` |
| Preguntas / requisitos del concurso | `customAnswers[<label>]` o skip + log |

Selectores CSS/ARIA del flujo Postular: **TBD** — actualizar solo cuando se capture el DOM logueado.

## Flujo futuro (determinista)

1. Launch Playwright con `storageState` de cuenta propia (no re-login ClaveÚnica en cada corrida).
2. `page.goto(posting.url)` → click **Postular** / equivalente.
3. Rellenar campos vía mapa + `resolveFieldValue`; CV libre con `setInputFiles(resume_path)` si aplica.
4. Campos/docs del concurso sin alias conocido → **skip + log** (no inventar respuestas ni docs).
5. Pausa humana entre acciones; no auto-submit masivo.

## Fuera de alcance de este PR

- No edita `workers/src/application/index.js` ni `workers/src/lib/`.
- No cablea discovery en `workers/src/discovery/index.js`.
- No merge a main (revisión Don Jose).
