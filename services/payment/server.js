const express = require("express");
const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");
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

const JWT_SECRET = required("JWT_SECRET", process.env.JWT_SECRET);
const JWT_ISSUER = process.env.JWT_ISSUER || "capstone-ecommerce";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "capstone-ecommerce";

const app = express();
app.use(express.json({ limit: "1mb" }));

let pool;

function auth(req, res, next) {
  const hdr = req.headers.authorization || "";
  const m = /^Bearer (.+)$/.exec(hdr);
  if (!m) return res.status(401).json({ error: "missing token" });
  try {
    req.user = jwt.verify(m[1], JWT_SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    return next();
  } catch (_e) {
    return res.status(401).json({ error: "invalid token" });
  }
}

async function notify(email, action, metadata) {
  if (!email) return;
  try {
    await axios.post(`${NOTIFICATION_URL}/notify/interaction`, { email, service: "payment", action, metadata }, { timeout: 1500 });
  } catch (_e) {}
}

app.get("/health", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: true, db: rows[0].ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Fake payment provider: always succeeds unless amount is 0
app.post("/payments/charge", auth, async (req, res) => {
  const email = req.user.email;
  const { order_id, amount_cents } = req.body || {};
  if (!order_id || !amount_cents) return res.status(400).json({ error: "order_id and amount_cents required" });
  if (amount_cents <= 0) return res.status(400).json({ error: "invalid amount" });

  const provider_ref = `PAY-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  await pool.query(
    "INSERT INTO payments(order_id, status, provider, provider_ref) VALUES (?, 'PAID', 'FAKEPAY', ?) ON DUPLICATE KEY UPDATE status='PAID', provider_ref=VALUES(provider_ref)",
    [order_id, provider_ref]
  );
  await notify(email, "payment_success", { order_id, amount_cents });
  res.json({ ok: true, status: "PAID", provider: "FAKEPAY", provider_ref });
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
  app.listen(PORT, () => console.log(`payment listening on ${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

