const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
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
const OTP_TTL_MINUTES = parseInt(process.env.OTP_TTL_MINUTES || "10", 10);

const app = express();
app.use(express.json({ limit: "1mb" }));

let pool;

function signToken(user) {
  return jwt.sign(
    { sub: String(user.user_id), email: user.email, name: user.full_name },
    JWT_SECRET,
    { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: "1h" }
  );
}

async function notify(email, service, action, metadata) {
  if (!email) return;
  try {
    await axios.post(`${NOTIFICATION_URL}/notify/interaction`, { email, service, action, metadata }, { timeout: 1500 });
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

// Step 1: validate password, send OTP email
app.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const [rows] = await pool.query(
    "SELECT user_id, email, password_hash, full_name FROM users WHERE email = ? LIMIT 1",
    [String(email).toLowerCase()]
  );
  if (!rows.length) return res.status(401).json({ error: "invalid credentials" });
  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid credentials" });

  // Send OTP via notification service
  await axios.post(
    `${NOTIFICATION_URL}/otp/generate`,
    { user_id: user.user_id, email: user.email, purpose: "login", ttl_minutes: OTP_TTL_MINUTES },
    { timeout: 3000 }
  );

  // A lightweight "otp_token" so we don't keep server session
  const otp_token = jwt.sign(
    { sub: String(user.user_id), purpose: "login" },
    JWT_SECRET,
    { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: `${OTP_TTL_MINUTES}m` }
  );

  await notify(user.email, "auth", "login_otp_sent", { user_id: user.user_id });
  return res.json({ otp_required: true, otp_token, ttl_minutes: OTP_TTL_MINUTES });
});

// Step 2: verify OTP, return JWT
app.post("/login/verify", async (req, res) => {
  const { otp_token, otp_code } = req.body || {};
  if (!otp_token || !otp_code) return res.status(400).json({ error: "otp_token and otp_code required" });

  let decoded;
  try {
    decoded = jwt.verify(otp_token, JWT_SECRET, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
  } catch (_e) {
    return res.status(401).json({ error: "invalid otp token" });
  }
  if (decoded.purpose !== "login") return res.status(401).json({ error: "invalid purpose" });

  const user_id = parseInt(decoded.sub, 10);
  const [rows] = await pool.query("SELECT user_id, email, full_name FROM users WHERE user_id = ? LIMIT 1", [user_id]);
  if (!rows.length) return res.status(401).json({ error: "user not found" });
  const user = rows[0];

  const vr = await axios.post(
    `${NOTIFICATION_URL}/otp/verify`,
    { user_id, purpose: "login", otp_code: String(otp_code) },
    { timeout: 3000, validateStatus: () => true }
  );
  if (vr.status !== 200 || !vr.data || vr.data.ok !== true) return res.status(401).json({ error: "invalid otp" });

  const token = signToken(user);
  await notify(user.email, "auth", "login_success", { user_id });
  return res.json({ token, user });
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
  app.listen(PORT, () => console.log(`auth listening on ${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

