# Computrabajo — apply + discovery

## Apply (asignación #2)

Basado en fixtures reales (`fixtures/META.md`, captura 2026-09-03).

### Flujo determinista

1. Playwright headed (`headless: false` preferible) + `storageState` (`COMPUTRABAJO_STORAGE_STATE` o `secrets/auth-state/computrabajo.json`).
2. `page.goto(posting.url)`.
3. Leer `a[data-href-offer-apply]` → `data-href-offer-apply` (selector del fixture).
4. **`--dry-run` / `dryRun: true`**: devolver esa URL y **cortar ANTES de navegar**.
5. Sin dry-run: `page.goto(applyUrl)` — **esto postula de verdad** (GET, no form).
6. Éxito: `page.title()` match `/Aplicación enviada/i`.
7. Sesión caída (`/acceso/` o `ERR_TOO_MANY_REDIRECTS`) → error `SESION_CAIDA`; pedir  
   `node scripts/export-auth-state.js --platform=computrabajo` — **no reintentar en loop**.

No hay `fill` / `setInputFiles`: el CV es el del perfil del portal.

### CLI

```bash
# Seguro: solo lee la URL de apply
node workers/src/platforms/computrabajo/apply.js --url='https://cl.computrabajo.com/ofertas-de-trabajo/...' --dry-run

# REAL: envía postulación
COMPUTRABAJO_STORAGE_STATE=secrets/auth-state/computrabajo.json \
  node workers/src/platforms/computrabajo/apply.js --url='...'
```

### Selectores (solo del fixture)

| Uso | Selector / señal |
| --- | --- |
| CTA Postularme | `a[data-href-offer-apply]` |
| URL apply | atributo `data-href-offer-apply` |
| Ya postulado | `a.postulated:not(.hide)` |
| Confirmación | title `/Aplicación enviada/i` |

Si aparece oferta con preguntas de filtro, capturar fixture aparte — no inventar CSS.

## Discovery

Ver `discovery.js` (cheerio, HTML público, sin login). Cableado en `runDiscovery`.

## Fuera de alcance

- No editar `workers/src/application/index.js` ni `lib/` (wiring Don Jose).
- No commitir `secrets/auth-state/*.json`.
