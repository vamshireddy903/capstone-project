const express = require("express");
const mysql = require("mysql2/promise");
const axios = require("axios");

function required(name, v) {
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const PORT = parseInt(process.env.PORT || "8080", 10);
const DB_HOST = required("DB_HOST", process.env.DB_HOST);
const DB_PORT = parseInt(process.env.DB_PORT || "3306", 10);
const DB_USER = required("DB_USER", process.env.DB_USER);
const DB_PASSWORD = required("DB_PASSWORD", process.env.DB_PASSWORD);
const DB_NAME = required("DB_NAME", process.env.DB_NAME);
const NOTIFICATION_URL = required("NOTIFICATION_URL", process.env.NOTIFICATION_URL);

const app = express();
app.use(express.json({ limit: "1mb" }));

let pool;

async function notify(email, action, metadata) {
  if (!email) return;
  try {
    await axios.post(`${NOTIFICATION_URL}/notify/interaction`, { email, service: "catalog", action, metadata }, { timeout: 1500 });
  } catch (_e) {}
}

function getEmailFromHeader(req) {
  // frontend sends x-user-email after login; for GKE you can also decode JWT in gateway if desired
  return req.headers["x-user-email"] ? String(req.headers["x-user-email"]) : null;
}

app.get("/health", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: true, db: rows[0].ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/products", async (req, res) => {
  const q = String(req.query.q || "").trim();
  const email = getEmailFromHeader(req);
  const [rows] = q
    ? await pool.query(
        "SELECT product_id, sku, name, description, price_cents, stock FROM products WHERE name LIKE ? ORDER BY product_id DESC LIMIT 50",
        [`%${q}%`]
      )
    : await pool.query("SELECT product_id, sku, name, description, price_cents, stock FROM products ORDER BY product_id DESC LIMIT 50");
  await notify(email, "browse_products", { q: q || undefined });
  res.json(rows);
});

app.get("/products/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const email = getEmailFromHeader(req);
  const [rows] = await pool.query(
    "SELECT product_id, sku, name, description, price_cents, stock FROM products WHERE product_id = ? LIMIT 1",
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: "not found" });
  await notify(email, "view_product", { product_id: id });
  res.json(rows[0]);
});

async function main() {
  pool = await mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
  });
  app.listen(PORT, () => console.log(`catalog listening on ${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

