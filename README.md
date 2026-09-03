# job-search-automation

Pipeline de automatización de búsqueda de empleo: discovery → scoring → aplicación → tracking.
Corre 100% en Docker para poder migrar a un equipo Linux sin cambios.

## Aviso

Proyecto **personal y educativo**. Automatiza tareas sobre las **propias cuentas** de quien
lo usa (portales de empleo, correo), de forma conservadora y respetuosa con cada servicio.
Cada plataforma tiene sus propios términos de servicio: el uso responsable —y cualquier
consecuencia— es responsabilidad de quien corre el proyecto. Se entrega **sin garantía** de
ningún tipo. No está afiliado ni respaldado por LinkedIn, Google ni ninguna de las
plataformas mencionadas.

## Arquitectura

- **hermes** — orquestador (imagen oficial `nousresearch/hermes-agent`), maneja cron y el
  workflow general. Configuración e instalación de modelo (Grok OAuth / Anthropic) se hace
  después de levantar el contenedor, vía `hermes setup` dentro de él.
- **workers** — servicio Node + Playwright que hace el trabajo pesado: discovery de APIs
  abiertas de ATS, scoring vía LLM, aplicación automática, tracking de Gmail.
- **db** — Postgres, guarda el estado de cada posting a través del pipeline.

## Setup inicial

```bash
cp .env.example .env
# editar .env con tus valores reales

mkdir -p secrets
echo "un-password-fuerte-random" > secrets/db_password.txt

docker compose up -d db
docker compose up -d workers
docker compose up -d hermes
```

Primera vez con Hermes (setup interactivo, incluye login OAuth de modelo):

```bash
docker exec -it jobsearch-hermes hermes setup
```

Verificar que workers está sano:

```bash
curl -H "x-internal-token: $INTERNAL_TOKEN" http://localhost:3000/health
```

## Sesiones de plataformas (storageState)

El login de cada portal (captcha, 2FA, ClaveÚnica) se hace **a mano, una vez**. El script
`scripts/export-auth-state.js` abre un Chromium visible, espera a que termines de loguearte
y guarda cookies + localStorage en `secrets/auth-state/<key>.json`.

```bash
npm install                                              # playwright en el host
npx playwright install chromium                          # browser (1 vez)

node scripts/export-auth-state.js                        # las 5, una por una
node scripts/export-auth-state.js --platform=laborum     # solo una
node scripts/export-auth-state.js --list                 # ver plataformas
```

Por cada plataforma: se abre la ventana → te logueás → volvés a la terminal y apretás Enter
→ se guarda el JSON. No hay timeout corto, podés tardar lo que necesites. Si corrés el
script sin TTY (background, `docker exec` sin `-it`), en vez de Enter usá el archivo señal
que el script imprime: `touch secrets/auth-state/.listo-<key>`.

| key | portal | URL de arranque |
| --- | --- | --- |
| `linkedin` | LinkedIn | https://www.linkedin.com/login |
| `computrabajo` | Computrabajo Chile | https://www.computrabajo.cl |
| `laborum` | Laborum Chile | https://www.laborum.cl |
| `indeed` | Indeed Chile | https://cl.indeed.com |
| `gob` | Empleos Públicos | https://www.empleospublicos.cl |

### Cómo los consume `workers`

Cada adapter resuelve el path con `resolveStorageStatePath()`, que respeta una env var por
plataforma y cae al default de Docker:

| plataforma | env var (override) | default |
| --- | --- | --- |
| linkedin | `LINKEDIN_STORAGE_STATE` | `/app/.auth-state/linkedin.json` |
| computrabajo | `COMPUTRABAJO_STORAGE_STATE` | `/app/.auth-state/computrabajo.json` |
| laborum | `LABORUM_STORAGE_STATE` | `/app/.auth-state/laborum.json` |
| indeed | `INDEED_STORAGE_STATE` | `/app/.auth-state/indeed.json` |
| gob | `GOB_STORAGE_STATE` | `/app/.auth-state/gob.json` |

**Con Docker**: montar el *directorio* completo, no archivo por archivo — así agregar o
regenerar una sesión no toca el compose. Reemplaza al volume `playwright_profile` (dos
mounts no pueden convivir en el mismo path):

```yaml
    volumes:
      - ./workers/src:/app/src
      - ./secrets/auth-state:/app/.auth-state:ro
```

**Sin Docker** (workers con node en el host): setear las env vars a los paths locales
absolutos — están comentadas en `.env.example`.

> Estos JSON son **credenciales de sesión**: `secrets/auth-state/` está en `.gitignore`,
> se guardan con `chmod 600` y nunca se commitean. Se usan solo sobre cuentas propias; si
> una sesión expira, volvé a correr el script para esa plataforma.

## Estado actual (scaffold inicial)

- [x] Estructura Docker completa (hermes + workers + db)
- [x] Esquema de base de datos (postings, scores, applications, email_events)
- [x] Discovery funcional para Greenhouse (API pública, sin login)
- [x] Scoring funcional vía Grok (proxy OpenAI-compatible de Hermes, sin API key paga)
- [ ] Discovery LinkedIn (Playwright + storageState + anti-detección)
- [ ] Application para portales abiertos (selectores de formulario por mapear)
- [ ] Application LinkedIn Easy Apply (uso conservador: ritmos humanos, límites, solo cuenta propia)
- [ ] Gmail OAuth flow completo + tracking end-to-end
- [ ] Skill de Hermes conectado a cron real

## Roadmap (según lo definido en el diseño)

1. Discovery + scoring de portales abiertos (bajo riesgo, valor inmediato) ← estamos acá
2. Application automática para portales abiertos
3. Gmail tracking
4. LinkedIn discovery + Easy Apply con uso conservador (ritmos humanos, límites, solo cuenta propia)

## Seguridad

- El puerto 8642 (gateway de Hermes) y 3000 (workers) no deben exponerse a internet
  sin un proxy con autenticación propia.
- `secrets/db_password.txt` y `.env` están en `.gitignore` — nunca commitear.
- LinkedIn se opera de forma conservadora y solo sobre la cuenta del propio usuario;
  respetá los términos de servicio de cada plataforma.
