import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function useSession() {
  const [token, setToken] = useState(null);
  const [email, setEmail] = useState(null);
  useEffect(() => {
    setToken(localStorage.getItem("token"));
    setEmail(localStorage.getItem("email"));
  }, []);
  return { token, email, setToken, setEmail };
}

export default function Home() {
  const { token, email } = useSession();
  const [q, setQ] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const query = useMemo(() => q.trim(), [q]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const url = `${API_BASE}/catalog/products${query ? `?q=${encodeURIComponent(query)}` : ""}`;
      const r = await fetch(url, {
        headers: email ? { "x-user-email": email } : {}
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "failed");
      setItems(data);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function addToCart(product_id) {
    if (!token) {
      window.location.href = "/login";
      return;
    }
    await fetch(`${API_BASE}/cart/cart/items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ product_id, qty: 1 })
    });
    window.location.href = "/cart";
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="brandMark">cap</span>stone<span className="brandMark2">shop</span>
        </div>
        <div className="search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" />
          <button onClick={load}>Search</button>
        </div>
        <nav className="nav">
          {token ? (
            <>
              <span className="hello">Hello, {email}</span>
              <Link href="/orders">Orders</Link>
              <Link href="/cart">Cart</Link>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  localStorage.removeItem("token");
                  localStorage.removeItem("email");
                  window.location.reload();
                }}
              >
                Logout
              </a>
            </>
          ) : (
            <>
              <Link href="/login">Sign in</Link>
              <Link href="/register">Create account</Link>
              <Link href="/cart">Cart</Link>
            </>
          )}
        </nav>
      </header>

      <main className="container">
        <section className="hero">
          <h1>Deals for your capstone.</h1>
          <p>Amazon-like UI, microservices backend, and real OTP email flow (check MailHog).</p>
          <div className="heroActions">
            <a className="primary" href="/register">
              Get started
            </a>
            <a className="secondary" href="http://localhost:8025" target="_blank" rel="noreferrer">
              Open MailHog
            </a>
          </div>
        </section>

        <section className="cardGrid">
          {loading ? (
            <div className="muted">Loading products…</div>
          ) : err ? (
            <div className="error">{err}</div>
          ) : (
            items.map((p) => (
              <div key={p.product_id} className="card">
                <div className="img" />
                <div className="title">{p.name}</div>
                <div className="desc">{p.description}</div>
                <div className="row">
                  <div className="price">{money(p.price_cents)}</div>
                  <div className="stock">{p.stock > 0 ? `${p.stock} in stock` : "Out of stock"}</div>
                </div>
                <button disabled={p.stock <= 0} onClick={() => addToCart(p.product_id)}>
                  Add to Cart
                </button>
              </div>
            ))
          )}
        </section>
      </main>

      <footer className="footer">Capstone E-Commerce • Single entrypoint on :8080</footer>
    </div>
  );
}

