# Laborum platform — notas de discovery / selectores

Portal: [laborum.cl](https://www.laborum.cl) (Chile, Navent / SITE_ID `BMCL`). Playwright determinista — **sin LLM por postulación**.

## Discovery (implementado)

| Aspecto | Real (capturado) |
| --- | --- |
| HTML `/empleo/?q=...` | **SPA shell** — `#root` + loader; **cero cards** de ofertas en HTML estático. Fixture: `fixtures/listing-empleo-spa-shell.html` |
| Listado público | `POST https://www.laborum.cl/api/avisos/searchV2?pageSize=&page=&sort=RELEVANTES` |
| Header obligatorio | `x-site-id: BMCL` (`window.SITE_ID` en `/candidate/js/keys.js`) |
| Body | `{ "filtros": [], "query": "<término>", "internacional": false }` |
| Paginación | **`page` es 0-indexed**. Con `page=1` a veces `content: []` aunque `total > 0` |
| Login | No requerido para searchV2 |
| Fixture API | `fixtures/searchV2-python-page0.json` (query `python`, captura live) |

### Mapeo de campos (desde fixture real)

| Campo API (`content[]`) | Posting repo |
| --- | --- |
| `id` | `source_job_id` (+ URL) |
| `titulo` | `title` |
| `empresa` / `confidencial` | `company` |
| `localizacion` | `location` |
| `detalle` | `description_raw` (truncado) |
| — | `source = "laborum"` |
| — | `url = https://www.laborum.cl/empleos/-{id}.html` (verificado 200; slug opcional) |

No se usan selectores CSS de listado (no existen en el HTML estático). **No inventar CSS.**

### Fuera de alcance de este PR

- No cablea `workers/src/discovery/index.js` ni `application/index.js`.
- No apply real (stub intacto).
- Filtros por provincia / detalle `fichaAviso*` (algunos paths 403 Cloudflare desde DC).

## Apply — requiere sesión (hold)

- `LABORUM_STORAGE_STATE` (default `/app/.auth-state/laborum.json`)
- Selectores del form Postular: **TBD** con fixture/DOM logueado (asignación posterior)
- Preferible `headless: false`; delays humanos; sin LLM por job

## Mapa de campos apply (contrato ApplicantProfile)

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
| Preguntas sin alias | `customAnswers[<label>]` o skip + log |

## Fuera de alcance general

- No edita `workers/src/application/index.js` ni `workers/src/lib/`.
- No merge a main (revisión Don Jose).
