# job-search-automation

Pipeline de automatización de búsqueda de empleo: discovery → scoring → aplicación → tracking.
Corre 100% en Docker para poder migrar a un equipo Linux sin cambios.

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

## Estado actual (scaffold inicial)

- [x] Estructura Docker completa (hermes + workers + db)
- [x] Esquema de base de datos (postings, scores, applications, email_events)
- [x] Discovery funcional para Greenhouse (API pública, sin login)
- [x] Scoring funcional vía Grok (proxy OpenAI-compatible de Hermes, sin API key paga)
- [ ] Discovery LinkedIn (Playwright + storageState + anti-detección)
- [ ] Application para portales abiertos (selectores de formulario por mapear)
- [ ] Application LinkedIn Easy Apply (con guardrails de rate-limit + gate de aprobación humana)
- [ ] Gmail OAuth flow completo + tracking end-to-end
- [ ] Skill de Hermes conectado a cron real

## Roadmap (según lo definido en el diseño)

1. Discovery + scoring de portales abiertos (bajo riesgo, valor inmediato) ← estamos acá
2. Application automática para portales abiertos
3. Gmail tracking
4. LinkedIn discovery + Easy Apply semi-automático con guardrails

## Seguridad

- El puerto 8642 (gateway de Hermes) y 3000 (workers) no deben exponerse a internet
  sin un proxy con autenticación propia.
- `secrets/db_password.txt` y `.env` están en `.gitignore` — nunca commitear.
- LinkedIn siempre requiere `approved_by_human = true` antes de postular.
