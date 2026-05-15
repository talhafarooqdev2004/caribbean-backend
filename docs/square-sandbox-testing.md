# Square sandbox: test cards and error scenarios

Use these values only in **Square Sandbox** with the Web Payments SDK (your checkout page when sandbox mode is on). Official reference: [Sandbox Payments](https://developer.squareup.com/docs/devtools/sandbox/payments).

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
