import pg from "pg";
import { readFileSync } from "node:fs";

const { Pool } = pg;

// Soporta password vía Docker secret (archivo) o variable de entorno directa
function resolvePassword() {
  if (process.env.DB_PASSWORD_FILE) {
    return readFileSync(process.env.DB_PASSWORD_FILE, "utf-8").trim();
  }
  return process.env.DB_PASSWORD;
}

export const pool = new Pool({
  host: process.env.DB_HOST || "db",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "jobsearch",
  user: process.env.DB_USER || "jobsearch",
  password: resolvePassword(),
});
