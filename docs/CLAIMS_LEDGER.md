# Claims ledger

Last updated: 2026-08-05

Statuses: `PROVED`, `PARTIAL`, `INFERRED`, `PLANNED`, `FALSE`.

| ID | Claim | Status | Evidence or constraint |
| --- | --- | --- | --- |
| RULE-001 | Flare Summer Signal closes on 2026-08-14. | PROVED | Canonical DoraHacks detail page; exact rendered cutoff recorded in `STATUS.md`. |
| RULE-002 | Payment flows using XRP/FXRP or FAssets fit Bounty 1. | PROVED | Canonical DoraHacks track page. |
| RULE-003 | Existing projects and ports are allowed when new work is separated clearly. | PROVED | Canonical event detail page. |
| RULE-004 | Judging uses product usefulness, Flare integration quality, technical execution, evidence of new work, and clarity/future potential. | PROVED | Canonical event detail page; no weights are published. |
| TECH-001 | Coston2 reports chain ID 114 through the selected RPC. | PROVED | Live RPC read recorded in `artifacts/flare-probe.json`. |
| TECH-002 | FXRP can be resolved through the current official discovery mechanism. | PROVED | The Contract Registry resolved `AssetManagerFXRP`; `fAsset()` resolved the token; metadata is recorded in `artifacts/flare-probe.json`. |
| TECH-003 | FTSOv2 returns XRP/USD value, decimals, and feed timestamp on Coston2. | PROVED | The Contract Registry resolved `FtsoV2`; a live `getFeedById` simulation is recorded in `artifacts/flare-probe.json`. |
| TECH-004 | A real user-approved FXRP transfer confirms between two test wallets on Coston2. | PROVED | Transaction `0x4c4394cfa2bbd2bed4a5125c4eacb34db8e7bd1a905e2dc9b9cbdf98e6d4503a` succeeded on chain 114 and moved exactly `0.001 FTestXRP`; receipt, log isolation, and before/after balances are recorded in `artifacts/flare-probe.json`. |
| PROD-001 | ProofPay prevents an underfunded release from silently short-paying the freelancer. | PLANNED | Later contract implementation and tests required. |
| PROD-002 | ProofPay refunds unused FXRP protection to the client. | PLANNED | Later contract implementation and tests required. |
| PROD-003 | ProofPay provides legal escrow or complete dispute resolution. | FALSE | Explicit non-goal and known limitation. |
| PROD-004 | ProofPay supports fiat or Nigerian bank settlement. | FALSE | Explicit non-goal. |
| PROD-005 | ProofPay is production-secure. | FALSE | No audit or production evidence exists. |
| DEPLOY-001 | A ProofPay contract is deployed on Coston2. | PLANNED | Deployment is forbidden before the Phase 1 gate passes. |
