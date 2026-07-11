import "dotenv/config";
import express from "express";
import { pool } from "./lib/db.js";

import { runDiscovery, ingestPostings } from "./discovery/index.js";
import { runScoring } from "./scoring/index.js";
import { runApplication } from "./application/index.js";
import { runTracking } from "./tracking/index.js";
import { getNextPosting, markApplied, queueStats } from "./queue/index.js";

const app = express();
app.use(express.json({ limit: "4mb" })); // ingesta de discovery puede traer 100+ ofertas con descripción

// Auth simple entre contenedores (no exponer este puerto a internet)
function requireInternalToken(req, res, next) {
  const token = req.header("x-internal-token");
  if (!process.env.INTERNAL_TOKEN || token !== process.env.INTERNAL_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}
app.use(requireInternalToken);

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    res.status(500).json({ status: "db_unreachable", detail: String(err) });
  }
});

// Hermes dispara cada etapa como un job independiente vía cron -> curl POST
app.post("/discovery/run", async (req, res) => {
  try {
    const result = await runDiscovery(req.body ?? {});
    res.json(result);
  } catch (err) {
    console.error("[discovery] error", err);
    res.status(500).json({ error: String(err) });
  }
});

// Ingesta de ofertas ya scrapeadas por el browser (Indeed/Laborum, tras Cloudflare).
// El scraper CDP corre en Hermes y postea acá; nosotros dedupeamos e insertamos.
app.post("/discovery/ingest", async (req, res) => {
  try {
    const result = await ingestPostings(req.body ?? {});
    res.json(result);
  } catch (err) {
    console.error("[discovery/ingest] error", err);
    res.status(500).json({ error: String(err) });
  }
});

app.post("/scoring/run", async (req, res) => {
  try {
    const result = await runScoring(req.body ?? {});
    res.json(result);
  } catch (err) {
    console.error("[scoring] error", err);
    res.status(500).json({ error: String(err) });
  }
});

app.post("/application/run", async (req, res) => {
  try {
    const result = await runApplication(req.body ?? {});
    res.json(result);
  } catch (err) {
    console.error("[application] error", err);
    res.status(500).json({ error: String(err) });
  }
});

app.post("/tracking/run", async (req, res) => {
  try {
    const result = await runTracking(req.body ?? {});
    res.json(result);
  } catch (err) {
    console.error("[tracking] error", err);
    res.status(500).json({ error: String(err) });
  }
});

// --- Cola de postulación (discovery-first): el agente pide la próxima oferta ya
// elegida y reporta el resultado, en vez de buscar a mano. ---

// GET /postings/next?source=getonboard&limit=1  -> próximas ofertas encoladas + score
app.get("/postings/next", async (req, res) => {
  try {
    const rows = await getNextPosting({ source: req.query.source ?? null, limit: req.query.limit });
    res.json({ count: rows.length, postings: rows });
  } catch (err) {
    console.error("[queue] next error", err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /postings/applied  body: { postingId, ok, method?, error? }
app.post("/postings/applied", async (req, res) => {
  try {
    const result = await markApplied(req.body ?? {});
    res.json(result);
  } catch (err) {
    console.error("[queue] applied error", err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /postings/stats  -> conteo por plataforma/estado (monitoreo)
app.get("/postings/stats", async (_req, res) => {
  try {
    res.json({ stats: await queueStats() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[workers] escuchando en :${PORT}`);
});
