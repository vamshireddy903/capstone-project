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
    await axios.post(`${NOTIFICATION_URL}/notify/interaction`, { email, service: "cart", action, metadata }, { timeout: 1500 });
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

app.get("/cart", auth, async (req, res) => {
  const user_id = parseInt(req.user.sub, 10);
  const email = req.user.email;
  await pool.query("INSERT IGNORE INTO carts(user_id) VALUES (?)", [user_id]);
  const [rows] = await pool.query(
    `SELECT ci.product_id, p.name, p.price_cents, ci.qty
       FROM carts c
       JOIN cart_items ci ON ci.cart_id = c.cart_id
       JOIN products p ON p.product_id = ci.product_id
      WHERE c.user_id = ?
      ORDER BY ci.cart_item_id DESC`,
    [user_id]
  );
  await notify(email, "view_cart", { items: rows.length });
  res.json({ items: rows });
});

app.post("/cart/items", auth, async (req, res) => {
  const user_id = parseInt(req.user.sub, 10);
  const email = req.user.email;
  const { product_id, qty } = req.body || {};
  if (!product_id || !qty) return res.status(400).json({ error: "product_id and qty required" });
  await pool.query("INSERT IGNORE INTO carts(user_id) VALUES (?)", [user_id]);
  const [cRows] = await pool.query("SELECT cart_id FROM carts WHERE user_id = ? LIMIT 1", [user_id]);
  const cart_id = cRows[0].cart_id;
  await pool.query(
    `INSERT INTO cart_items (cart_id, product_id, qty)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty)`,
    [cart_id, product_id, qty]
  );
  await notify(email, "add_to_cart", { product_id, qty });
  res.status(201).json({ ok: true });
});

app.delete("/cart/items/:productId", auth, async (req, res) => {
  const user_id = parseInt(req.user.sub, 10);
  const email = req.user.email;
  const product_id = parseInt(req.params.productId, 10);
  const [cRows] = await pool.query("SELECT cart_id FROM carts WHERE user_id = ? LIMIT 1", [user_id]);
  if (!cRows.length) return res.json({ ok: true });
  await pool.query("DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?", [cRows[0].cart_id, product_id]);
  await notify(email, "remove_from_cart", { product_id });
  res.json({ ok: true });
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
  app.listen(PORT, () => console.log(`cart listening on ${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

