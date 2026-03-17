## Capstone E-Commerce (Local Docker Compose → GCP-ready)

This is a **3-tier e-commerce** capstone with:
- **Frontend**: Next.js “Amazon-like” UI
- **Backend**: Microservices (`user`, `auth` with OTP, `catalog`, `cart`, `order`, `payment`, `notification`)
- **Database**: MySQL (tables + indexes + trigger + stored procedure)
- **Email**: MailHog (local inbox UI)
- **Single entrypoint**: Nginx API gateway on **`http://localhost:8080`**

### Run locally (simple)

From this folder:

```bash
cd capstone-project
docker compose up --build
```

Open:
- **App**: `http://localhost:8080`
- **Emails (MailHog)**: `http://localhost:8025`

Stop:

```bash
Ctrl+C
```

### How OTP login works

1. Register on `Create account`
2. Sign in (email + password)
3. An **OTP email** is sent (open MailHog)
4. Enter OTP → you get a JWT and can checkout

### Microservice API paths (behind the gateway)

- `POST /api/users/users` (register)
- `POST /api/auth/login` (password step → sends OTP email)
- `POST /api/auth/login/verify` (OTP verify → returns JWT)
- `GET /api/catalog/products`
- `GET /api/cart/cart` (JWT)
- `POST /api/cart/cart/items` (JWT)
- `POST /api/order/orders/checkout` (JWT)
- `GET /api/order/orders` (JWT)

### Database objects (Cloud SQL compatible)

See `db/init.sql` for:
- **Tables**: `users`, `products`, `carts`, `cart_items`, `orders`, `order_items`, `payments`, `otps`
- **Indexes**: e.g. `ux_users_email`, `ix_orders_user_created`
- **Trigger**: `trg_order_items_qty`
- **Procedure**: `sp_place_order(...)`

### GCP deployment later (no code changes)

This code is already “GCP-shape” friendly:
- Frontend can be deployed to **Cloud Run**
- Microservices can be deployed to **GKE**
- MySQL schema is compatible with **Cloud SQL (MySQL)**
- Inter-service notification calls are HTTP to `notification` service (you’ll deploy it privately and update only env/service DNS)

