# Summer Signal judging matrix

The event page publishes five criteria and no weights. This matrix maps each
criterion to evidence a judge can inspect without trusting a slide or sending a
new transaction. Public-repository links remain provisional until the Phase 7A
publication gate is complete.

| Criterion | ProofPay case | Exact evidence | Fast public check | Honest boundary |
| --- | --- | --- | --- | --- |
| Product usefulness | A freelancer can keep one milestone denominated in USD while a client funds with FXRP. At release, the contract pays the full target and refunds surplus, or transfers nothing and requires a top-up. | Claims `PROD-001`, `PROD-002`, `LIVE-003`, `LIVE-006`; four exact scenario tests in `tests/illustrative-scenarios.test.ts`; preserved settlements in `artifacts/coston2-settlement-receipt.json` and `artifacts/coston2-browser-settlement-receipt.json`. | Change one scenario on the [landing page](https://proofpay.paysmat.xyz), then compare [invoice 2](https://proofpay.paysmat.xyz/invoice/2) with [receipt 2](https://proofpay.paysmat.xyz/receipt/2). | No users, adoption, partner, revenue, or human-usability result is claimed. This is a focused one-milestone prototype. |
| Flare integration quality | FXRP is the actual escrowed asset, and FTSOv2 XRP/USD is causal to funding, top-up, payout, and refund math. Coston2 holds the verified contract and public lifecycle evidence. | Claims `TECH-002`, `TECH-003`, `TECH-006`, `DEPLOY-001`–`DEPLOY-004`, `LIVE-001`–`LIVE-006`; `contracts/src/ProofPayEscrow.sol`; `artifacts/flare-probe.json`; `artifacts/ftso-tolerance.json`; `deployment/coston2.json`. | Inspect the [verified contract](https://coston2-explorer.flare.network/address/0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21), [deployment transaction](https://coston2-explorer.flare.network/tx/0xa223570423d92e6dc972452ff00da35c2d59d5c0c4c9f3a971e7cd6dabf5f93a), and [invoice-2 release](https://coston2-explorer.flare.network/tx/0x6e1b8c009e9021aa05d5aeabaf1e7effcbf0b15402ef7a4b153bfcf26a82d921). | Coston2 and FTestXRP only. The 30-second FTSO age limit is a ProofPay fail-closed policy, not a Flare guarantee. |
| Technical execution | The contract has explicit roles and lifecycle transitions, integer-safe upward rounding, quote deadlines, aggregate liability accounting, exact transfer-delta checks, reentrancy protection, and no admin withdrawal. The web app prepares bounded wallet intents and independently reconstructs receipts. | Claims `ARCH-001`, `ARCH-002`, `PROD-007`, `PROD-008`, `UI-008`–`UI-015`, `UI-018`–`UI-025`, `WEB-004`, `WEB-006`; 69 Foundry tests, 65 web unit tests, 27 deterministic browser tests, one hydration test, and `artifacts/escrow-flow-final/visual-proof.json` with 17 captures. | Use [receipt 2](https://proofpay.paysmat.xyz/receipt/2) to reveal exact event/block topology, commitments, prices, payout/refund, and zero final liabilities. | Automated test and accessibility evidence is not an audit, WCAG certification, production-security proof, or human test. |
| Evidence of new work | ProofPay progressed from a fresh project record through sponsor-operation proof, an original escrow, economic tests, Coston2 deployment, two settlements, wallet actions, receipt verification, and the production Escrow Flow interface. | Git milestones `9c14a64`, `8f0a0ce`, `7244d3e`, `9a32091`, `2aa2a2a`, `a2c37b4`, `b61c6bc`, `3a09a57`, `78cfde3`, and `8f9958e`; `docs/UPSTREAM.md` records the reference-only FAssets-demo inspection and no-copy decision. The intended public source is `https://github.com/Samfresh-ai/proofpay`, pending publication verification. | Review the repository history, `contracts/src/ProofPayEscrow.sol`, wallet/receipt code, committed machine artifacts, and deployment record once the public clone gate passes. | Upstream Flare, OpenZeppelin, Foundry, and npm dependencies are attributed and remain under their own licenses. No claim is made that dependency code is original. |
| Clarity and future potential | The first viewport states the dollar-priced/FXRP-settled mechanism; illustrative outcomes are labelled; terminal invoices lead to a permanent decoded receipt. The roadmap extends resolution, milestones, review, FDC proof, and journal portability without pretending those features exist. | Claims `UI-021`, `UI-024`, `UI-025`, `WEB-006`; `docs/DESIGN_DIRECTION.md`; `docs/INTERFACE_SPEC.md`; `docs/DORAHACKS_SUBMISSION.md`; `artifacts/escrow-flow-final/`; partial/false limitations in `docs/CLAIMS_LEDGER.md`. | Follow the five-step judge path in `docs/DORAHACKS_SUBMISSION.md` from landing page to invoice 2, receipt 2, explorer, and `/app`. | No arbitration, forced release, legal/fiat escrow, generic receipt index, audit, mainnet, or production-readiness claim is made. |

## Cross-criterion proof anchors

| Anchor | Value |
| --- | --- |
| Production | [https://proofpay.paysmat.xyz](https://proofpay.paysmat.xyz) |
| Production deployment | `dpl_FAW3WmZqyeRunaxSkFqkPBu1T5Ny` from application commit `78cfde3f3eeb3025f8eecdc4cb2d3db69f4c3d55` |
| Contract | [`0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21`](https://coston2-explorer.flare.network/address/0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21) |
| Invoice 1 | [invoice](https://proofpay.paysmat.xyz/invoice/1) · [receipt](https://proofpay.paysmat.xyz/receipt/1) |
| Invoice 2 | [invoice](https://proofpay.paysmat.xyz/invoice/2) · [receipt](https://proofpay.paysmat.xyz/receipt/2) |
| Current UI proof | `artifacts/escrow-flow-final/visual-proof.json` binds 17 captures to `78cfde3f3eeb3025f8eecdc4cb2d3db69f4c3d55` |
| Public source | `https://github.com/Samfresh-ai/proofpay` — pending final visibility, push, tag, clone, and link checks |

## Submission-claim guardrail

Before submission, compare every sentence and video caption with
`docs/CLAIMS_LEDGER.md`. Do not convert `PARTIAL`, `PLANNED`, or `FALSE` entries
into positive claims. In particular, do not claim mainnet activity, real funds,
an audit, production security, human testing, WCAG conformance, users, partners,
cross-device conflict prevention, generic historical receipt discovery, or a
complete live exercise of every action path.
