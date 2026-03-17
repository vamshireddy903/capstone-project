import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function Cart() {
  const [token, setToken] = useState(null);
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem("token"));
  }, []);

  async function load(t) {
    if (!t) return;
    setErr("");
    const r = await fetch(`${API_BASE}/cart/cart`, {
      headers: { Authorization: `Bearer ${t}` }
    });
    const data = await r.json();
    if (!r.ok) {
      setErr(data.error || "failed to load cart");
      return;
    }
    setItems(data.items || []);
  }

  useEffect(() => {
    if (token) load(token);
  }, [token]);

  const total = items.reduce((s, i) => s + i.price_cents * i.qty, 0);

  async function checkout() {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`${API_BASE}/order/orders/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "checkout failed");
      window.location.href = "/orders";
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="container padTop">
        <h1>Your Cart</h1>
        <div className="muted">
          Please <Link href="/login">sign in</Link>.
        </div>
      </div>
    );
  }

  return (
    <div className="container padTop">
      <h1>Your Cart</h1>
      {err ? <div className="error">{err}</div> : null}
      <div className="cartBox">
        {items.length === 0 ? (
          <div className="muted">Cart is empty. <Link href="/">Browse products</Link>.</div>
        ) : (
          <>
            <div className="cartItems">
              {items.map((i) => (
                <div className="cartRow" key={i.product_id}>
                  <div className="cartTitle">{i.name}</div>
                  <div className="cartQty">Qty: {i.qty}</div>
                  <div className="cartPrice">{money(i.price_cents * i.qty)}</div>
                </div>
              ))}
            </div>
            <div className="cartSummary">
              <div className="sumLine">
                <span>Total</span>
                <strong>{money(total)}</strong>
              </div>
              <button disabled={busy} onClick={checkout}>
                {busy ? "Placing order…" : "Proceed to Checkout"}
              </button>
              <div className="muted small">
                This will create an order via a MySQL stored procedure and then charge a fake payment provider.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

