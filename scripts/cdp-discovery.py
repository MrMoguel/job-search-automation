#!/usr/bin/env python3
"""Discovery por CDP para plataformas tras Cloudflare (Indeed, Laborum).

Estas plataformas bloquean el fetch HTTP simple (devuelven el challenge de
Cloudflare), pero cargan bien con el browser REAL logueado de Janna. Este script
scrapea sus listados usando el Chromium persistente vía CDP (127.0.0.1:9222) y
postea las ofertas encontradas al endpoint /discovery/ingest de workers, que las
dedupea e inserta como 'discovered'. Después el scoring las levanta y encola.

Diseño anti-cuelgue: en vez de navegar una pestaña existente (que puede quedar
trabada en un diálogo beforeunload / reCAPTCHA de un apply abandonado), abre una
pestaña NUEVA por cada búsqueda, la scrapea y la cierra. Fresca = sin diálogos.

No usa LLM. Pensado para correr como cron --no-agent (barato y determinista).

Uso:
  cdp-discovery.py            -> scrapea, postea a workers, imprime resumen
  cdp-discovery.py --dry      -> scrapea e imprime lo extraído, NO postea
"""
import asyncio, json, os, sys, urllib.request, urllib.parse
import websockets

CDP = "http://127.0.0.1:9222"
WORKERS = os.environ.get("WORKERS_URL", "http://workers:3000")
TOKEN = os.environ.get("INTERNAL_TOKEN", "")
DRY = "--dry" in sys.argv

# Búsquedas por plataforma. Indeed usa querystring; Laborum usa slug con guiones.
QUERIES = {
    "indeed":  ["automatizacion", "rpa", "python", "analista de datos", "ingeniero de datos",
                "desarrollador python", "backend", "inteligencia artificial", "desarrollador",
                "programador", "ingeniero de software", "analista programador"],
    "laborum": ["automatizacion", "rpa", "python", "analista-de-datos", "ingenieria-de-datos",
                "desarrollador-python", "backend", "inteligencia-artificial", "desarrollador",
                "programador", "ingeniero-de-software", "analista-programador"],
}

# Cuántas páginas por búsqueda (más páginas = más ofertas nuevas por corrida).
PAGES = int(os.environ.get("DISCOVERY_PAGES", "1"))

def search_url(platform, q, page=0):
    if platform == "indeed":
        params = {"q": q, "l": "Santiago"}
        if page:
            params["start"] = page * 10  # Indeed pagina de a 10
        return "https://cl.indeed.com/jobs?" + urllib.parse.urlencode(params)
    # laborum: la paginación va en el path (…-<q>.html?page=N funciona en Laborum)
    base = f"https://www.laborum.cl/empleos-busqueda-{q}.html"
    return f"{base}?page={page+1}" if page else base

# --- Extracción en el DOM (corre dentro de la página vía Runtime.evaluate) ---

INDEED_JS = r"""
(function(){
  var out=[], seen={};
  var cards=document.querySelectorAll('div.job_seen_beacon, div.cardOutline');
  for(var i=0;i<cards.length;i++){
    var c=cards[i];
    var a=c.querySelector('h2 a, a.jcs-JobTitle');
    var jkEl=c.querySelector('[data-jk]');
    var jk=(jkEl&&jkEl.getAttribute('data-jk'))||'';
    if(!jk&&a){var m=(a.href||'').match(/jk=([0-9a-f]+)/);if(m)jk=m[1];}
    if(!jk||seen[jk])continue; seen[jk]=1;
    // Sólo ofertas con Indeed Apply on-site ("Postúlate rápidamente"); las externas no sirven para auto-apply.
    if(!/post[uú]late r[aá]pidamente/i.test(c.innerText))continue;
    var tEl=c.querySelector('h2 a span[title]')||c.querySelector('h2 span')||a;
    var title=((tEl&&(tEl.getAttribute&&tEl.getAttribute('title')))||(tEl&&tEl.innerText)||'').trim();
    var comp=((c.querySelector('[data-testid=company-name]')||{}).innerText||'').trim();
    var loc=((c.querySelector('[data-testid=text-location]')||{}).innerText||'').trim();
    var snip=((c.querySelector('.job-snippet')||c.querySelector('[data-testid=jobsnippet_footer]')||{}).innerText||'').trim();
    if(!title)continue;
    out.push({source:'indeed',source_job_id:jk,url:'https://cl.indeed.com/viewjob?jk='+jk,
              title:title,company:comp,location:loc,description_raw:(title+'. '+snip).slice(0,2000)});
  }
  return JSON.stringify(out);
})()
"""

LABORUM_JS = r"""
(function(){
  var out=[], seen={};
  var as=document.querySelectorAll('a[href*="/empleos/"]');
  var meta=/^(nuevo|actualizado|publicado|hace |postulaci|alta revisi|\d+ postul)/i;
  for(var i=0;i<as.length;i++){
    var a=as[i], h=a.getAttribute('href')||'';
    var m=h.match(/(\d+)\.html/); if(!m)continue;
    var jid=m[1]; if(seen[jid])continue; seen[jid]=1;
    var raw=(a.innerText||'').trim();
    var lines=raw.split('\n').map(function(s){return s.trim();}).filter(Boolean);
    var title='', rest=[];
    for(var j=0;j<lines.length;j++){
      if(!title && !meta.test(lines[j])) title=lines[j];
      else if(title) rest.push(lines[j]);
    }
    if(!title) title=lines.length?lines[lines.length-1]:'';
    if(!title)continue;
    var card=a.closest('article')||a.parentElement||a;
    var cardText=((card&&card.innerText)||raw).replace(/\s+/g,' ').trim();
    var locM=cardText.match(/([A-Za-zÁÉÍÓÚáéíóúñÑ .]+,\s*Regi[oó]n[^,.]*)/);
    out.push({source:'laborum',source_job_id:jid,url:a.href,title:title,
              company:(rest[0]||''),location:(locM?locM[1].trim():''),
              description_raw:cardText.slice(0,2000)});
  }
  return JSON.stringify(out);
})()
"""

JS = {"indeed": INDEED_JS, "laborum": LABORUM_JS}

async def rpc(ws, _id, method, params=None):
    await ws.send(json.dumps({"id": _id, "method": method, "params": params or {}}))
    while True:
        msg = json.loads(await ws.recv())
        if msg.get("id") == _id:
            return msg

def new_tab(url):
    req = urllib.request.Request(CDP + "/json/new?" + urllib.parse.quote(url, safe=""), method="PUT")
    return json.load(urllib.request.urlopen(req, timeout=15))

def close_tab(tid):
    try:
        urllib.request.urlopen(CDP + "/json/close/" + tid, timeout=10).read()
    except Exception:
        pass

async def scrape_one(url, js):
    """Abre pestaña nueva en url, espera carga, extrae, cierra. Devuelve lista."""
    tab = new_tab(url)
    tid = tab["id"]
    try:
        async with websockets.connect(tab["webSocketDebuggerUrl"], max_size=None,
                                       open_timeout=20, close_timeout=5) as ws:
            await rpc(ws, 1, "Runtime.enable")
            # Espera de carga: hasta 12s, cortando apenas la extracción devuelve algo.
            found = []
            for _ in range(6):
                await asyncio.sleep(2)
                res = await rpc(ws, 2, "Runtime.evaluate",
                                {"expression": js, "returnByValue": True, "awaitPromise": True})
                val = res.get("result", {}).get("result", {}).get("value")
                if val:
                    try:
                        found = json.loads(val)
                    except Exception:
                        found = []
                if found:
                    break
            return found
    finally:
        close_tab(tid)

def post_ingest(postings):
    body = json.dumps({"postings": postings}).encode()
    req = urllib.request.Request(WORKERS + "/discovery/ingest", data=body, method="POST",
                                 headers={"content-type": "application/json", "x-internal-token": TOKEN})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

async def main():
    allp = []
    per = {}
    for platform, queries in QUERIES.items():
        for q in queries:
            for page in range(PAGES):
                try:
                    got = await scrape_one(search_url(platform, q, page), JS[platform])
                except Exception as e:
                    print(f"[warn] {platform}/{q}/p{page}: {e}", file=sys.stderr)
                    got = []
                per[platform] = per.get(platform, 0) + len(got)
                allp.extend(got)
                if not got:
                    break  # sin resultados en esta página → no seguir paginando esta búsqueda
    # Dedup global por (source, source_job_id)
    uniq = {}
    for p in allp:
        uniq[(p["source"], p["source_job_id"])] = p
    postings = list(uniq.values())

    print(f"scrapeadas: {len(allp)} | únicas: {len(postings)} | por plataforma: {per}")
    if postings[:3]:
        for p in postings[:3]:
            print(f"  - [{p['source']}] {p['title'][:60]} @ {p['company'][:30]} | {p['location'][:30]}")
    if DRY:
        print("(--dry: no se posteó nada)")
        return
    if postings:
        print("ingest:", post_ingest(postings))
    else:
        print("nada para ingestar")

if __name__ == "__main__":
    asyncio.run(main())
