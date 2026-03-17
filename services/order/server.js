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
const PAYMENT_URL = required("PAYMENT_URL", process.env.PAYMENT_URL);

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
    await axios.post(`${NOTIFICATION_URL}/notify/interaction`, { email, service: "order", action, metadata }, { timeout: 1500 });
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

app.get("/orders", auth, async (req, res) => {
  const user_id = parseInt(req.user.sub, 10);
  const email = req.user.email;
  const [rows] = await pool.query("SELECT order_id, status, total_cents, created_at FROM orders WHERE user_id = ? ORDER BY order_id DESC LIMIT 50", [
    user_id
  ]);
  await notify(email, "list_orders", { count: rows.length });
  res.json(rows);
});

// Checkout: create order from cart items via stored procedure
app.post("/orders/checkout", auth, async (req, res) => {
  const user_id = parseInt(req.user.sub, 10);
  const email = req.user.email;

  const [cRows] = await pool.query("SELECT cart_id FROM carts WHERE user_id = ? LIMIT 1", [user_id]);
  if (!cRows.length) return res.status(400).json({ error: "cart empty" });
  const cart_id = cRows[0].cart_id;

  const [items] = await pool.query("SELECT product_id, qty FROM cart_items WHERE cart_id = ? ORDER BY cart_item_id ASC", [cart_id]);
  if (!items.length) return res.status(400).json({ error: "cart empty" });

  const itemsJson = JSON.stringify(items.map((i) => ({ product_id: i.product_id, qty: i.qty })));

  try {
    const [rows] = await pool.query("CALL sp_place_order(?, ?)", [user_id, itemsJson]);
    const out = rows[0] && rows[0][0] ? rows[0][0] : null; // mysql2 returns [ [rows], ... ]
    const order_id = out.order_id;
    const total_cents = out.total_cents;

    // clear cart
    await pool.query("DELETE FROM cart_items WHERE cart_id = ?", [cart_id]);

    // charge payment
    const pay = await axios.post(
      `${PAYMENT_URL}/payments/charge`,
      { order_id, amount_cents: total_cents },
      { headers: { Authorization: req.headers.authorization }, timeout: 5000 }
    );

    await pool.query("UPDATE orders SET status = 'PAID' WHERE order_id = ?", [order_id]);
    await notify(email, "order_placed", { order_id, total_cents, payment: pay.data });
    res.status(201).json({ order_id, total_cents, payment: pay.data });
  } catch (e) {
    await notify(email, "order_failed", { error: String(e.message || e) });
    res.status(400).json({ error: "checkout failed", details: String(e.message || e) });
  }
});

async function main() {
  pool = await mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: true
  });
  app.listen(PORT, () => console.log(`order listening on ${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

