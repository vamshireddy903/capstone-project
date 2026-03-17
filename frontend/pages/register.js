import { useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

export default function Register() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setOk(false);
    const r = await fetch(`${API_BASE}/users/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, full_name: fullName, password })
    });
    const data = await r.json();
    if (!r.ok) {
      setErr(data.error || "registration failed");
      return;
    }
    setOk(true);
  }

  return (
    <div className="authPage">
      <div className="authCard">
        <div className="authBrand">capstoneshop</div>
        <h1>Create account</h1>
        <form onSubmit={submit}>
          <label>Full name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit">Create your account</button>
        </form>
        {err ? <div className="error">{err}</div> : null}
        {ok ? (
          <div className="success">
            Account created. Now <Link href="/login">sign in</Link>.
          </div>
        ) : null}
        <div className="muted">
          Already have an account? <Link href="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}

