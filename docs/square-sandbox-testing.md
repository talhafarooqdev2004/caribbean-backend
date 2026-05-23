# Square sandbox: test cards and error scenarios

Use these values only in **Square Sandbox** with the Web Payments SDK (your checkout page when sandbox mode is on). Official reference: [Sandbox Payments](https://developer.squareup.com/docs/devtools/sandbox/payments).

## Web Payments SDK: 403 on `main-iframe.html` or “unable to be initialized in time”

The browser loads `square.js` (we proxy that from Next) and then Square loads **`https://sandbox.web.squarecdn.com/.../main-iframe.html?...&hostname=...`** directly. If that request returns **403**, Square is rejecting your **page origin** (e.g. `http://localhost:3000` or your Amplify URL).

1. Open [Square Developer Dashboard](https://developer.squareup.com/apps) → **your application** (the same **Application ID** as in your env).
2. Find **Web / website / allowed domains** (wording varies) for **Web Payments** / **In-App Payments**.
3. Add **exactly** the origin you use in the browser, including scheme and port:
   - Local: `http://localhost:3000` (match your Next port; `127.0.0.1` is a different origin—add both if you use both).
   - Staging/production: `https://your-domain.com` and any preview hosts (e.g. `https://main.xxxxx.amplifyapp.com`).
4. Sandbox vs production: allowlist entries apply per environment; use the **Sandbox** app when `sandbox` / test mode is on. The `applicationId=` in the failing `main-iframe.html` URL must be the app you are editing.
5. Save, wait a minute, hard-refresh checkout, then retry.

Official quickstart (web client setup): [Set Up the Web Client Application](https://developer.squareup.com/docs/web-payments/quickstart/set-up-web-client-app). Open your apps from [developer.squareup.com/apps](https://developer.squareup.com/apps).

### Why it can break “suddenly” when it used to work

- **Different Application ID in env** — `.env` / Amplify now points at another Square app than the one you allowlisted. The `applicationId=` in the failing `main-iframe.html` URL must match the app you edit in the dashboard (Sandbox toggle on).
- **Square or CDN policy changes** — New Web Payments SDK builds load from versioned paths (e.g. `/1.83.x/`). Square can tighten origin checks; re-check allowlisted URLs.
- **Square secure context (Oct 1, 2025)** — Square [announced](https://developer.squareup.com/docs/changelog/webpaymentsdk/2025-10-01) that the Web Payments SDK requires a **secure context** for **HTTPS sites**. `http://localhost` is still a secure context in major browsers, but anything like `http://192.168.x.x` often is not—use HTTPS (e.g. `next dev --experimental-https`) or a tunnel (ngrok) and add that **exact** origin in Square.
- **Forum reference** — Others hit the same **403 on `main-iframe.html`**: [Square Developer Forums — 403 Access Denied on GET sandbox main-iframe.html](https://developer.squareup.com/forums/t/403-access-denied-on-get-sandbox-main-iframe-html/22887).

There is **no application code change** that can override a **403 from Square’s CDN**; the browser must be allowed for that application.

### `pci-connect.squareupsandbox.com` — many POSTs and **204 No Content**

That traffic is **normal**. Square’s Web Payments SDK talks to PCI / metrics endpoints; **HTTP 204** means “success, empty body.” It is **not** the same problem as **403** on `main-iframe.html`. The SDK may retry or send several beacons while the card field initializes—repeated requests do not mean your server is wrong.

## Successful card-not-present (Web Payments SDK)

| Brand            | Card number           | CVV  |
| ---------------- | --------------------- | ---- |
| Visa             | 4111 1111 1111 1111   | 111  |
| Mastercard       | 5105 1051 0510 5100   | 111  |
| Discover         | 6011 0000 0000 0004   | 111  |
| American Express | 3400 000000 00009     | 1111 |

- Use **any future** expiration month/year (e.g. **12 / 2030**).
- For **USD**, use a valid postal/ZIP in the card form (e.g. **94103**).

## Trigger errors from the card form (Sandbox)

These values cause predictable failures when the token is sent to **CreatePayment**:

| What to enter        | Expected error scenario        |
| -------------------- | -------------------------------- |
| CVV **911**          | CVV incorrect                    |
| Postal **99999**     | Postal code incorrect            |
| Expiration **01/40** | Expiration incorrect             |
| Card **4000000000000002** | Card declined (by number)   |

Success baseline: **4111 1111 1111 1111**, CVV **111**, future exp, valid postal.

## Optional: test CreatePayment without the card UI

Sandbox `source_id` strings (server-side tests only), e.g. `cnon:card-nonce-declined`, `cnon:card-nonce-rejected-cvv` — see Square’s “Source IDs for testing the CreatePayment endpoint” in the same doc.
