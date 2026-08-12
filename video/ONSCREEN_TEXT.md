# ProofPay demo on-screen text

Use the product’s own text whenever it is already visible. Overlays are short evidence locators, never full-screen narration. Do not cover the `Illustrative`, `Coston2 testnet`, `SETTLED`, amount, block, transaction, or limitation labels.

| ID | Time | Exact text | Treatment | Claims-ledger IDs |
| --- | --- | --- | --- | --- |
| OS-01 | 00:00–00:04 | `USD-priced milestone escrow` | Small lower-left locator; remove before the scenario interaction. | `UI-025` |
| OS-02 | 00:09–00:15 | `Illustrative scenario · no transaction` | Only if the product’s longer illustrative label is not fully legible; never replace or obscure it. | `ARCH-002`, `UI-025` |
| OS-03 | 00:15–00:20 | `$1.25 → 80 FXRP paid · 30 refunded` | Bottom rail over the real rise scenario. | `ARCH-002`, `PROD-002` |
| OS-04 | 00:20–00:25 | `$1.00 → 100 FXRP paid · 10 refunded` | Bottom rail over the real steady-price scenario. | `ARCH-002`, `PROD-002` |
| OS-05 | 00:25–00:30 | `$0.95 → 105.263158 paid · 4.736842 refunded` | Bottom rail over the real within-buffer scenario. | `ARCH-002`, `PROD-001`, `PROD-002` |
| OS-06 | 00:30–00:35 | `$0.90 → release blocked · 1.111112 FXRP top-up` | Amber bottom rail over the real top-up-required scenario. | `ARCH-002`, `PROD-001` |
| OS-07 | 00:35–00:42 | `Production · proofpay.paysmat.xyz` | Small top-right URL locator; the browser address remains visible when possible. | `WEB-004`, `WEB-006` |
| OS-08 | optional insert | `DETERMINISTIC PREVIEW · NOT A LIVE TRANSACTION` | Persistent high-contrast label for the funding fixture; do not fade early. | `UI-009`, `UI-010`, `WEB-003` |
| OS-09 | 00:50–00:56 | `Invoice #2 · Coston2 testnet` | Small locator; keep the product’s own testnet badge visible. | `LIVE-005`, `UI-014` |
| OS-10 | 00:56–01:05 | `$2.00 target · 2.126887 FXRP locked` | Bottom rail on the real settled invoice. | `LIVE-006` |
| OS-11 | 01:05–01:12 | `Confirmed Coston2 settlement` | Small locator on receipt arrival. | `LIVE-005`, `UI-014` |
| OS-12 | 01:12–01:18 | `1.933309 FXRP paid` | Align near the visible payout row. | `LIVE-006`, `UI-014` |
| OS-13 | 01:18–01:23 | `0.193578 FXRP returned` | Align near the visible refund row. | `LIVE-006`, `UI-014` |
| OS-14 | 01:23–01:28 | `0 FXRP active liabilities · 0 FXRP contract balance` | Bottom evidence rail while final state is visible. | `LIVE-006`, `UI-014` |
| OS-15 | 01:28–01:35 | `Coston2 explorer · block 33804808` | Lower-left locator while the exact funding transaction is open. | `LIVE-005`, `UI-014` |
| OS-16 | 01:35–01:55 | `FXRP → ProofPayEscrow → payout / refund`<br>`         ↑ FTSOv2 XRP/USD` | Compact architecture annotation only if the product’s four-column explanation is too small. | `TECH-002`, `TECH-003`, `DEPLOY-001`, `PROD-001`, `PROD-002` |
| OS-17 | 01:55–02:03 | `Built during Summer Signal` | Small chapter locator, not a “built from scratch” claim. | `ARCH-001`, `UI-009`, `UI-011`, `UI-014`, `UI-025` |
| OS-18 | 02:03–02:10 | `Coston2 testnet · test assets only · not audited` | Persistent high-contrast limitation line. | `UI-022`, `WEB-006` |
| OS-19 | 02:10–02:15 | `Keep the milestone in dollars. Settle it in FXRP.` | End on the real landing headline; do not rebuild it as a title card. | `UI-025` |

## Exact transaction locator

OS-15 refers only to invoice 2’s confirmed funding transaction:

`https://coston2-explorer.flare.network/tx/0x60aa661a4c755b807a1911cce513603f103912226570ab9d9fafaf272eb3d857`
Block: `33804808`. [`LIVE-005`, `UI-014`]
