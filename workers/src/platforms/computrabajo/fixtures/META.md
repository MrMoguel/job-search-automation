# Fixtures de postulación — Computrabajo Chile

DOM real capturado con Playwright headed + `storageState` de cuenta propia
(`secrets/auth-state/computrabajo.json`), para mapear selectores sin inventar CSS.

- **Fecha de captura**: 2026-09-03
- **Oferta usada**: "Desarrolladores Backend - Jornada Presencial" (Santiago, Las Condes)
- **URL**: https://cl.computrabajo.com/ofertas-de-trabajo/oferta-de-trabajo-de-desarrolladores-backend-jornada-presencial-en-santiago-las-condes-85113707214ED7E461373E686DCF3405
- **Búsqueda de origen**: `/ofertas-de-trabajo/?q=desarrollador+backend&l=Santiago`

## ⚠️ Hallazgo principal: postularse es un GET, no un POST

**No hay formulario de postulación en este tipo de oferta.** El botón "Postularme" no
submitea nada: lleva la URL en un atributo y una sola navegación GET crea la postulación
del lado del servidor.

```html
<a class="b_primary big w100 t_no_wrap"
   data-href-access="https://candidato.cl.computrabajo.com/match/?oi=<OFFER_ID>&p=57&idb=1"
   data-href-offer-apply="https://candidato.cl.computrabajo.com/match/?oi=<OFFER_ID>&p=57&idb=1&d=32&lc=<origen>">
   Postularme
</a>
```

Consecuencias para `apply.js`:

1. **No existe dry-run gratis.** Cualquier prueba del flujo real envía una postulación
   verdadera a una empresa. Durante esta captura se envió una (asumida por Miguel).
   Un `--dry-run` tiene que cortar ANTES de navegar a `data-href-offer-apply`.
2. Bloquear métodos no-GET como red de seguridad **no protege acá**. Se probó: el submit
   viaja como navegación GET y pasa igual.
3. El flujo determinista es corto: leer `data-href-offer-apply` del DOM de la oferta y
   navegar. No hay `fill()` ni `setInputFiles()` que hacer — el CV que ve la empresa es el
   del perfil de Computrabajo, no uno que se suba por postulación.

## Señal de éxito

Tras la navegación, la página de `candidato.cl.computrabajo.com/match/?oi=...` responde con:

- `<title>Aplicación enviada &lt;título de la oferta&gt; - Computrabajo Chile</title>`
- Sin campos de formulario propios (los `input` que quedan son el buscador del header).

Ver `apply-confirmation.html`. Ese título es el chequeo más barato para confirmar que la
postulación entró.

## Sesión: se rota después de postular

El subdominio `candidato.cl.computrabajo.com` hace un **handshake por POST**
(`/ajax/basicinfo`, `/ajax/getcandidateskills`) antes de servir contenido logueado. Si esos
POST no salen, entra en `ERR_TOO_MANY_REDIRECTS` contra `/acceso/`.

Después de postular, el `storageState` exportado dejó de servir para `candidato.*` (mismo
loop de redirects), mientras `www`/`cl.computrabajo.com` seguía logueado. O sea:

- `apply.js` debe distinguir **sesión caída** (`ERR_TOO_MANY_REDIRECTS` o llegar a `/acceso/`)
  de **fallo real de postulación**, y pedir re-export en vez de reintentar en loop.
- Re-export: `node scripts/export-auth-state.js --platform=computrabajo`

## Archivos

| archivo | qué es |
| --- | --- |
| `offer-page.html` | ficha de oferta logueada, con el botón "Postularme" y sus `data-href-*` |
| `apply-confirmation.html` | página resultante tras postular ("Aplicación enviada") |

`postularme-form.html` **no existe**: esta oferta aplica en un click. Si aparece una oferta
con preguntas de filtro, capturarla aparte con el mismo método y agregarla acá.

## Sanitización

Los HTML están sanitizados y son commiteables: 80 tokens hex (CSRF / ids de usuario /
`rfl=`) reemplazados por `REDACTED_TOKEN`, y patrones de email/teléfono neutralizados.
Se conserva el id público de la oferta (`85113707214ED7E461373E686DCF3405`), que viaja en
la URL. No hay cookies ni `storageState` en estos archivos.

## Cómo re-capturar

```js
// headed + sesión propia; NO bloquear los POST de /ajax/* o el subdominio entra en loop
const ctx = await browser.newContext({ storageState: "secrets/auth-state/computrabajo.json" });
await page.goto(offerUrl);
const applyUrl = await page.getAttribute("a[data-href-offer-apply]", "data-href-offer-apply");
// ⚠️ navegar a applyUrl ES postularse. Para capturar sin postular, quedarse acá.
```
