# Contexto del proyecto — leer antes de tocar código

Este es un pipeline de automatización de búsqueda de empleo, de uso personal (Chile).
Corre 100% en Docker (hermes + workers + db) para poder migrar de este entorno
a un servidor Linux sin cambios. El scaffold inicial ya está armado; este archivo
resume las decisiones de diseño para que el desarrollo continúe consistente con
lo ya planificado, no para que se reinicie el diseño desde cero.

## Decisiones ya tomadas (no reabrir sin razón)

- **Orquestador**: Hermes Agent (`nousresearch/hermes-agent`, imagen oficial), corre en
  su propio contenedor. Coordina el pipeline vía cron + skill (`hermes-skills/job-search-pipeline.md`).
- **Ejecución real**: un servicio Node + Playwright separado (`workers/`), porque Hermes
  es Python y el control fino de sesión de browser (storageState persistente, anti-detección,
  rate limiting) necesita determinismo, no un agente browser genérico decidiendo paso a paso.
- **LLM**: Grok (SuperGrok) para todo. El orquestador Hermes usa `grok-4.3` vía xAI Grok
  OAuth (`hermes model`, device-code, tokens en `/opt/data/auth.json`). El scoring/
  clasificación en `workers/` también usa Grok, a través del servicio `hermes-proxy`
  (proxy OpenAI-compatible de Hermes que enruta a Grok con las mismas credenciales OAuth,
  sin API key paga). El proveedor vive aislado en `workers/src/lib/llm.js` (`chatComplete`);
  para cambiarlo (ej. volver a Anthropic vía otro gateway) solo se toca `LLM_BASE_URL`/
  `LLM_MODEL` en `.env`, no el resto del pipeline. Nota: SuperGrok es suscripción de
  consumidor — ojo con rate limits en scoring de volumen.
- **DB**: Postgres, password vía Docker secret (`secrets/db_password.txt`), nunca en env plano.
- **Plataformas**: LinkedIn + portales abiertos (Greenhouse/Lever/etc vía sus APIs públicas).

## Guardrails por plataforma

LinkedIn no ofrece una API pública de empleos para uso individual, así que cualquier
integración depende de la sesión del propio usuario y debe hacerse con criterio y de forma
conservadora. Principios que el proyecto respeta:

- Nunca headless; ritmos y comportamiento similares a los de una persona.
- Reusar la sesión persistente del propio usuario (sin re-login en cada corrida).
- Límites de uso conservadores (pocas acciones por día) con esperas aleatorias.
- Se opera únicamente sobre la cuenta del propio usuario; nunca datos de terceros.

Los portales abiertos (Greenhouse, Lever, etc.) exponen APIs/formularios públicos y no
dependen de una sesión personal, por lo que su automatización es directa.

> **Uso responsable:** cada plataforma tiene sus propios términos de servicio. El uso de
> este proyecto —y cualquier consecuencia— es responsabilidad de quien lo corre. Usalo solo
> sobre tus propias cuentas y de forma respetuosa con cada servicio.

## Estado actual del scaffold

Ver `README.md` para la lista de checkboxes. Resumen: discovery y scoring para
portales abiertos ya son funcionales (Greenhouse de ejemplo). LinkedIn discovery/
application, el mapeo de selectores del primer portal target, y el flujo OAuth
completo de Gmail están pendientes — son los próximos pasos lógicos, en ese orden,
siguiendo el roadmap del README.

## Cómo seguir

1. Levantar el stack (`docker compose up -d db workers hermes`) y validar que
   `GET /health` en workers responde antes de tocar lógica nueva.
2. Definir con Miguel qué empresas/ATS trackear primero para mapear los selectores
   reales de `applyOpenAts` en `workers/src/application/index.js`.
3. Recién después de eso, LinkedIn — con los guardrails de arriba, no antes.
4. Gmail OAuth: el flujo de obtención de `refresh_token` no está documentado todavía
   en este repo, hay que agregarlo como script (`scripts/gmail-oauth-setup.js`) cuando
   se llegue a esa etapa.

No asumas que un TODO en el código es un bug — varios son placeholders deliberados
(ver comentarios en `discovery/index.js` y `application/index.js`) que marcan
etapas del roadmap todavía no implementadas a propósito.
