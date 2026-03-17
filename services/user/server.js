const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
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

async function notify(email, service, action, metadata) {
  if (!email) return;
  try {
    await axios.post(`${NOTIFICATION_URL}/notify/interaction`, { email, service, action, metadata }, { timeout: 1500 });
  } catch (_e) {
    // best-effort
  }
}

app.get("/health", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    res.json({ ok: true, db: rows[0].ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post("/users", async (req, res) => {
  const { email, password, full_name } = req.body || {};
  if (!email || !password || !full_name) return res.status(400).json({ error: "email, password, full_name required" });

  const password_hash = await bcrypt.hash(password, 10);
  try {
    const [r] = await pool.query(
      "INSERT INTO users (email, password_hash, full_name) VALUES (?, ?, ?)",
      [email.toLowerCase(), password_hash, full_name]
    );
    const user_id = r.insertId;
    await pool.query("INSERT IGNORE INTO carts (user_id) VALUES (?)", [user_id]);
    await notify(email, "user", "registered", { user_id });
    return res.status(201).json({ user_id, email: email.toLowerCase(), full_name });
  } catch (e) {
    if (String(e.message || "").includes("Duplicate")) return res.status(409).json({ error: "email already exists" });
    return res.status(500).json({ error: "failed to create user" });
  }
});

app.get("/users/by-email", async (req, res) => {
  const email = String(req.query.email || "").toLowerCase();
  if (!email) return res.status(400).json({ error: "email required" });
  const [rows] = await pool.query(
    "SELECT user_id, email, password_hash, full_name, created_at FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  if (!rows.length) return res.status(404).json({ error: "not found" });
  return res.json(rows[0]);
});

app.get("/users/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [rows] = await pool.query("SELECT user_id, email, full_name, created_at FROM users WHERE user_id = ? LIMIT 1", [
    id
  ]);
  if (!rows.length) return res.status(404).json({ error: "not found" });
  return res.json(rows[0]);
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
  app.listen(PORT, () => console.log(`user listening on ${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

