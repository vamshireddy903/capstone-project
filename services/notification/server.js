const express = require("express");
const nodemailer = require("nodemailer");
const mysql = require("mysql2/promise");

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

const SMTP_HOST = required("SMTP_HOST", process.env.SMTP_HOST);
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "1025", 10);
const SMTP_SECURE = (process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "no-reply@example.com";

async function createDbPool() {
  return mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
  });
}

function createMailer() {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });
}

function otpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const app = express();
app.use(express.json({ limit: "1mb" }));

let pool;
let mailer;

app.get("/health", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT 1 AS ok");
    return res.json({ ok: true, db: rows[0].ok === 1 });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// Generic "interaction" notification (call this from any microservice)
app.post("/notify/interaction", async (req, res) => {
  const { email, service, action, metadata } = req.body || {};
  if (!email || !service || !action) return res.status(400).json({ error: "email, service, action required" });

  const subject = `[Capstone] ${service}: ${action}`;
  const text =
    `Hi,\n\n` +
    `We saw activity on your account:\n` +
    `- Service: ${service}\n` +
    `- Action: ${action}\n` +
    `- Time: ${new Date().toISOString()}\n` +
    (metadata ? `\nDetails: ${JSON.stringify(metadata, null, 2)}\n` : "\n") +
    `\nThanks,\nCapstone Shop\n`;

  await mailer.sendMail({ from: EMAIL_FROM, to: email, subject, text });
  return res.json({ ok: true });
});

// OTP generation for login verification
app.post("/otp/generate", async (req, res) => {
  const { user_id, email, purpose, ttl_minutes } = req.body || {};
  if (!user_id || !email || !purpose) return res.status(400).json({ error: "user_id, email, purpose required" });

  const ttl = parseInt(ttl_minutes || "10", 10);
  const code = otpCode();
  const expires = new Date(Date.now() + ttl * 60 * 1000);

  await pool.query(
    "INSERT INTO otps (user_id, purpose, otp_code, expires_at) VALUES (?, ?, ?, ?)",
    [user_id, purpose, code, expires]
  );

  const subject = `[Capstone] Your OTP code`;
  const text = `Your OTP code is: ${code}\n\nIt expires in ${ttl} minutes.\n`;
  await mailer.sendMail({ from: EMAIL_FROM, to: email, subject, text });

  return res.json({ ok: true, expires_at: expires.toISOString() });
});

app.post("/otp/verify", async (req, res) => {
  const { user_id, purpose, otp_code } = req.body || {};
  if (!user_id || !purpose || !otp_code) return res.status(400).json({ error: "user_id, purpose, otp_code required" });

  const [rows] = await pool.query(
    `SELECT otp_id, expires_at, used_at
       FROM otps
      WHERE user_id = ? AND purpose = ? AND otp_code = ?
      ORDER BY otp_id DESC
      LIMIT 1`,
    [user_id, purpose, otp_code]
  );

  if (!rows.length) return res.status(401).json({ ok: false, error: "invalid otp" });
  const r = rows[0];
  if (r.used_at) return res.status(401).json({ ok: false, error: "otp already used" });
  if (new Date(r.expires_at).getTime() < Date.now()) return res.status(401).json({ ok: false, error: "otp expired" });

  await pool.query("UPDATE otps SET used_at = NOW() WHERE otp_id = ?", [r.otp_id]);
  return res.json({ ok: true });
});

async function main() {
  pool = await createDbPool();
  mailer = createMailer();
  app.listen(PORT, () => console.log(`notification listening on ${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

