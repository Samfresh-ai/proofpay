# ProofPay demo claims map

Every outward-facing factual assertion in `SCENE_MANIFEST.md`, `VOICEOVER.md`, `ONSCREEN_TEXT.md`, and `SHOT_LIST.md` must resolve to one of the approved claim records below. The canonical source is `docs/CLAIMS_LEDGER.md`; this file narrows wording for the video and does not create new claims.

| Video claim | Approved wording / exact value | Claims-ledger ID(s) | Primary repository evidence | Do not expand into |
| --- | --- | --- | --- | --- |
| VC-01 | ProofPay is publicly served at `https://proofpay.paysmat.xyz`. | `WEB-004`, `WEB-006` | `deployment/vercel.json`, `docs/DEPLOYMENT.md` | Mainnet, audited, or human-production readiness |
| VC-02 | The demonstrated network is Flare Testnet Coston2, chain `114`. | `TECH-001`, `DEPLOY-001` | `deployment/coston2.json`, public invoice/receipt | Flare mainnet activity |
| VC-03 | The deployed, explorer-verified `ProofPayEscrow` address is `0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21`. | `DEPLOY-001`, `DEPLOY-004` | `deployment/coston2.json` | Audit or security certification |
| VC-04 | The mechanism reprices a USD target at funding and release and blocks an underfunded release. | `ARCH-002`, `TECH-006`, `PROD-001` | Contract tests and exact scenario evidence | Guaranteed dollar value, fiat conversion, or automatic release |
| VC-05 | For the illustrative `$100` / `110 FXRP` lock: `$1.25 → 80 paid / 30 refunded`; `$1.00 → 100 / 10`; `$0.95 → 105.263158 / 4.736842`; `$0.90 → blocked / 1.111112 top-up`. | `ARCH-002`, `PROD-001`, `PROD-002`, `UI-025` | `artifacts/escrow-flow-final/03-scenario-rise.png` through `06-scenario-top-up-required.png` | Market forecast, transaction, or investment return |
| VC-06 | Unused FXRP protection is returned to the client. | `PROD-002`, `LIVE-006` | Deterministic tests and invoice-2 receipt | Every future token transfer succeeds |
| VC-07 | The app collects client, USD target, deadline, and scope commitment before funding. | `UI-008`, `UI-011` | `/app`, wallet-action tests | Authentication, database, or cross-device persistence |
| VC-08 | Wallet actions are role-aware, simulated before signing, and exact approval is bounded to the accepted maximum. | `UI-008`, `UI-009`, `UI-010` | Policy/unit/browser suites | Private-key custody, automatic signatures, or unlimited approval |
| VC-09 | Invoice `2` completed browser-originated create, exact approval, funding, evidence, and release on Coston2. | `LIVE-005` | `artifacts/coston2-browser-invoice.json` | Live top-up, cancellation, refund-after-deadline, or every action path |
| VC-10 | Invoice `2`: target `$2.00`; lock `2.126887 FXRP`; payout `1.933309 FXRP`; refund `0.193578 FXRP`; top-up `0`. | `LIVE-006`, `UI-014` | `artifacts/coston2-browser-settlement-receipt.json`, `/receipt/2` | Fiat value received or mainnet value |
| VC-11 | Invoice `2` payout plus refund equals the prior lock, and final active liabilities and contract FXRP balance are zero. | `LIVE-006`, `UI-014` | Independent receipt reconciliation | Global solvency beyond the observed contract state |
| VC-12 | Invoice `2` lifecycle blocks: create `33804596`, fund `33804808`, evidence `33804822`, release `33804839`. | `LIVE-005`, `UI-014` | `artifacts/coston2-browser-invoice.json` | Unrecorded or invented transaction history |
| VC-13 | The funding explorer URL is `https://coston2-explorer.flare.network/tx/0x60aa661a4c755b807a1911cce513603f103912226570ab9d9fafaf272eb3d857`. | `LIVE-005`, `UI-014` | Browser journal and receipt locator | Endorsement by the explorer |
| VC-14 | A scope/evidence commitment proves the integrity of committed bytes, not the truth or quality of delivered work. | `LIVE-004`, `UI-011` | Canonical manifests and onchain commitments | Work verification, oracle attestation, or quality certification |
| VC-15 | FXRP supplies XRP-derived programmable value; FTSOv2 supplies XRP/USD observations; ProofPayEscrow pays, refunds, or blocks; Coston2 exposes public testnet evidence. | `TECH-002`, `TECH-003`, `DEPLOY-001`, `DEPLOY-002`, `PROD-001`, `PROD-002` | Flare discovery probe, deployed immutables, contract behavior | Mainnet FAsset redemption or FDC proof |
| VC-16 | Summer Signal work includes the escrow contract/model, wallet workflow, deterministic evidence commitments, browser journal, public receipt, and Escrow Flow interface. | `ARCH-001`, `UI-009`, `UI-011`, `UI-014`, `UI-023`, `UI-025` | Current code, tests, live artifacts, visual proof | “Built entirely from scratch” or ownership of upstream dependencies |
| VC-17 | The browser journal is local and does not prove cross-browser or cross-device coordination. | `UI-012` | Journal implementation and ledger constraint | Universal replay prevention |
| VC-18 | Coston2 test assets only; no audit; not legal or fiat escrow; not production-ready. | `PROD-003`, `PROD-004`, `PROD-005`, `UI-022` | Claims ledger and persistent UI limitation copy | Production security, regulation, custody, insurance, or legal enforceability |
| VC-19 | Automated browser evidence is not a human-usability study or WCAG-conformance proof. | `UI-005`, `UI-016`, `UI-025` | Browser/a11y evidence manifests | Human validation or certification |
| VC-20 | The tagline is `Keep the milestone in dollars. Settle it in FXRP.` | `UI-025` | Production landing page and Phase 6B2 visual proof | A peg, guarantee, or fiat-settlement promise |

## Exact receipt facts for edit checks

| Field | Exact value | Claim |
| --- | --- | --- |
| Invoice | `2` | VC-09 |
| Milestone | `Verify ProofPay wallet actions on Coston2` | VC-09 |
| Target | `$2.00` | VC-10 |
| Funding price | `$1.034376` | VC-10 |
| Release price | `$1.034496` | VC-10 |
| Locked | `2.126887 FXRP` | VC-10 |
| Paid | `1.933309 FXRP` | VC-10 |
| Refunded | `0.193578 FXRP` | VC-10 |
| Final state | `RELEASED` / visible product label `SETTLED` | VC-09, VC-11 |
| Active liabilities | `0 FXRP` | VC-11 |
| Contract balance | `0 FXRP` | VC-11 |

## Pre-export claim gate

- Reject any cut containing a number, URL, transaction hash, block, network, deployment, capability, limitation, “new work” statement, or architecture role not listed above.
- Reject `stablecoin`, `price guarantee`, `automatic release`, `legal escrow`, `mainnet`, `audited`, `production-ready`, `human-tested`, and `built from scratch` wording.
- Reject any frame that represents `07-funding-preview-fixture.png` as live invoice-2 evidence.
- Reject any edit that removes the word `Illustrative` from a scenario or `Coston2 testnet` from the limitation sequence.
