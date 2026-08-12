# ProofPay judge-path observation

Status: `PASS`

Observed: `2026-08-12T17:00:45.135Z` to `2026-08-12T17:03:58.494Z`

Target: `https://proofpay.paysmat.xyz`

Method: one fresh, unauthenticated in-app browser session with no injected wallet. This is a
structured product audit performed by Codex, not human-usability testing.

## Result

The requested path completed. The automation-inclusive wall-clock time was `193.359` seconds. That
number includes browser-control dispatch and inspection time; measured route loads were approximately
`5.1` seconds for invoice `2`, `5.6` seconds for receipt `2`, and `3.4` seconds for `/app` during the
path. Five semantic clicks and one documented direct navigation were used. No wallet provider was
present, no signature prompt appeared, and no transaction was sent or broadcast.

## Path record

| Step | Action | Observation | Outcome |
| --- | --- | --- | --- |
| 1 | Open `/` | The first viewport states the volatility problem, the 10% protection model, and the USD-to-FXRP settlement mechanism. | PASS |
| 2 | Select `XRP rises to $1.25` | The selected state changed to `80 FXRP payout · 30 FXRP refund`; the illustrative disclosure remained visible. | PASS |
| 3 | Open `/invoice/2` | The public invoice showed `SETTLED`, a `$2.00` target, `1.933309 FXRP` payout, `0.193578 FXRP` refund, and no terminal wallet action. | PASS |
| 4 | Click `View settlement receipt` | `/receipt/2` opened with the permanent settlement document and the expected Coston2 limitation copy. | PASS |
| 5 | Open `How this settlement was confirmed` | Create, fund, evidence, and release transaction identifiers and explorer links became visible. | PASS |
| 6 | Open the create-invoice transaction in the Coston2 explorer | The explorer showed transaction `0xe467d0a5205a4fbdd0ffbb2b8efc0d7cc41682c38245a07266125a59a9d36c7a`, status `Success`, and method `createInvoice`. | PASS |
| 7 | Click `Create a milestone` from the receipt | `/app` opened with `Connect wallet to create a milestone` as the dominant enabled action; the creation form remained full opacity and invoice lookup remained secondary. | PASS |

## Friction and dead ends

- The landing page's real-proof call to action opens receipt `2` directly. It does not link to
  invoice `2`, so this scripted judge path used the documented `/invoice/2` URL before following the
  in-product receipt link. This is minor navigation friction, not a release blocker: the public README
  and submission quick path provide the exact invoice URL.
- The first scenario click incurred browser-control dispatch delay. The product state itself changed
  correctly on the successful semantic click; no product error was observed.
- Live Coston2 reads produced short, visible route delays. No route timed out or substituted fixture
  data.

## Browser and mobile observations

- Console warnings/errors on the judge tab: `0`.
- Page errors observed: `0`.
- Browser wallet provider present: `false`.
- Signature requests: `0`.
- Transaction sends or broadcasts: `0`.
- Horizontal overflow on the audited desktop routes: `false`.
- At `390 × 844`, the landing scenario controls formed a `2 × 2` grid, all visible controls met the
  `44 × 44` target, and horizontal overflow was absent.
- At `390 × 844`, receipt `2` had no paper shadow, no undersized visible control, and no horizontal
  overflow.
- Testnet, test-asset, non-audit, and non-legal-or-fiat-escrow limitations remained visible on every
  ProofPay route in the release audit.

## Release decision

No judge-path blocker was found and no product change was made. The observation does not claim human
testing, accessibility conformance, production readiness, or mainnet behavior.
