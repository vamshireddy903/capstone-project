import { useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

export default function Login() {
  const [step, setStep] = useState("password"); // password | otp
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [err, setErr] = useState("");

  async function submitPassword(e) {
    e.preventDefault();
    setErr("");
    const r = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await r.json();
    if (!r.ok) {
      setErr(data.error || "login failed");
      return;
    }
    setOtpToken(data.otp_token);
    setStep("otp");
  }

  async function submitOtp(e) {
    e.preventDefault();
    setErr("");
    const r = await fetch(`${API_BASE}/auth/login/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otp_token: otpToken, otp_code: otp })
    });
    const data = await r.json();
    if (!r.ok) {
      setErr(data.error || "OTP failed");
      return;
    }
    localStorage.setItem("token", data.token);
    localStorage.setItem("email", data.user.email);
    window.location.href = "/";
  }

  return (
    <div className="authPage">
      <div className="authCard">
        <div className="authBrand">capstoneshop</div>
        <h1>Sign in</h1>

        {step === "password" ? (
          <form onSubmit={submitPassword}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="submit">Continue</button>
          </form>
        ) : (
          <form onSubmit={submitOtp}>
            <div className="muted">
              OTP sent to your email. Open <a href="http://localhost:8025" target="_blank" rel="noreferrer">MailHog</a> to view it.
            </div>
            <label>OTP code</label>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" required />
            <button type="submit">Verify & Sign in</button>
          </form>
        )}

        {err ? <div className="error">{err}</div> : null}

        <div className="muted">
          New here? <Link href="/register">Create your account</Link>
        </div>
      </div>
    </div>
  );
}

