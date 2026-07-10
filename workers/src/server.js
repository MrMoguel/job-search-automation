import "dotenv/config";
import express from "express";
import { pool } from "./lib/db.js";

import { runDiscovery } from "./discovery/index.js";
import { runScoring } from "./scoring/index.js";
import { runApplication } from "./application/index.js";
import { runTracking } from "./tracking/index.js";

const app = express();
app.use(express.json());

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[workers] escuchando en :${PORT}`);
});
