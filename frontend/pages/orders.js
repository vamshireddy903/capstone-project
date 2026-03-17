import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api";

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function Orders() {
  const [token, setToken] = useState(null);
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    setToken(localStorage.getItem("token"));
  }, []);

  useEffect(() => {
    async function load() {
      if (!token) return;
      setErr("");
      const r = await fetch(`${API_BASE}/order/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await r.json();
      if (!r.ok) {
        setErr(data.error || "failed to load orders");
        return;
      }
      setOrders(data);
    }
    load();
  }, [token]);

  if (!token) {
    return (
      <div className="container padTop">
        <h1>Your Orders</h1>
        <div className="muted">
          Please <Link href="/login">sign in</Link>.
        </div>
      </div>
    );
  }

  return (
    <div className="container padTop">
      <h1>Your Orders</h1>
      {err ? <div className="error">{err}</div> : null}
      <div className="orders">
        {orders.length === 0 ? (
          <div className="muted">No orders yet. <Link href="/">Shop now</Link>.</div>
        ) : (
          orders.map((o) => (
            <div className="orderCard" key={o.order_id}>
              <div className="orderTop">
                <div>
                  <div className="muted small">ORDER</div>
                  <div className="mono">#{o.order_id}</div>
                </div>
                <div>
                  <div className="muted small">STATUS</div>
                  <div className="pill">{o.status}</div>
                </div>
                <div>
                  <div className="muted small">TOTAL</div>
                  <div className="strong">{money(o.total_cents)}</div>
                </div>
                <div>
                  <div className="muted small">DATE</div>
                  <div>{new Date(o.created_at).toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

