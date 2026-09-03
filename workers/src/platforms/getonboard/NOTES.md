# Get on Board — notas de selectores

Scaffolding apply (asignación activa). **No apply en prod** hasta mapear UI real con sesión + wiring en `application/index.js` (eso lo abre Don Jose).

Portal: [getonbrd.com](https://www.getonbrd.com) / Get on Board. Discovery ya usa API pública JSON:API (`discovery.js`). Postulación requiere sesión — Playwright determinista, **sin LLM por job**, **sin inventar CSS**.

## Discovery (ya existe)

- API: `https://www.getonbrd.com/api/v0/search/jobs` (sin login)
- Shape: `source=getonboard`, `source_job_id`, `company`, `title`, `location`, `url` (`links.public_url`), `description_raw`
- **No tocar** `discovery.js` en este PR

## Apply — requiere sesión

Postulación en Get on Board tipicamente pide cuenta propia:
- `GETONBOARD_STORAGE_STATE` (aliases: `GETONBRD_STORAGE_STATE`, `GETONBOARD_AUTH_STATE`)
- Default path: `/app/.auth-state/getonboard.json` (Compose futuro: `secrets/auth-state/` → `/app/.auth-state`)
- Preferible `headless: false` en la 1ª implementación real (anti-bot / captcha)
- Delays humanos; cero código generado por job
- Selectores CSS/ARIA: **TBD** — solo desde DOM real con storageState o fixture HTML (no inventar)

## Mapa de campos (contrato ApplicantProfile)

Usar `loadApplicantProfile` / `profileToFormValues` / `resolveFieldValue` desde `workers/src/lib/applicantProfile.js`.

| UI Get on Board (label típico ES/EN) | Clave canónica |
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

## Flujo futuro (determinista)

1. Launch Playwright con `storageState` de cuenta propia (no re-login en cada corrida).
2. `page.goto(posting.url)` → click **Apply** / **Postular** / equivalente.
3. Rellenar campos vía mapa + `resolveFieldValue`; CV con `setInputFiles(resume_path)`.
4. Preguntas sin alias conocido → **skip + log** (no inventar respuestas).
5. Pausa humana entre acciones; no auto-submit masivo.

## Fuera de alcance de este PR

- No edita `discovery.js`, `workers/src/application/index.js` ni `workers/src/lib/`.
- No toca `platforms/gob/`.
- No inventa selectores CSS.
- No merge a main (revisión Don Jose).
