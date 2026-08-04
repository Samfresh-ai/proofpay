# Claims ledger

Last updated: 2026-08-04

Statuses: `PROVED`, `PARTIAL`, `INFERRED`, `PLANNED`, `FALSE`.

| ID | Claim | Status | Evidence or constraint |
| --- | --- | --- | --- |
| RULE-001 | Flare Summer Signal closes on 2026-08-14. | PROVED | Canonical DoraHacks detail page; exact rendered cutoff recorded in `STATUS.md`. |
| RULE-002 | Payment flows using XRP/FXRP or FAssets fit Bounty 1. | PROVED | Canonical DoraHacks track page. |
| RULE-003 | Existing projects and ports are allowed when new work is separated clearly. | PROVED | Canonical event detail page. |
| RULE-004 | Judging uses product usefulness, Flare integration quality, technical execution, evidence of new work, and clarity/future potential. | PROVED | Canonical event detail page; no weights are published. |
| TECH-001 | Coston2 reports chain ID 114 through the selected RPC. | PLANNED | Must be read in Phase 1. |
| TECH-002 | FXRP can be resolved through the current official discovery mechanism. | PLANNED | Must be proved in Phase 1. |
| TECH-003 | FTSOv2 returns XRP/USD value, decimals, and feed timestamp on Coston2. | PLANNED | Must be proved in Phase 1. |
| TECH-004 | A real user-approved FXRP transfer confirms between two test wallets on Coston2. | PLANNED | Must be proved in Phase 1; no private key may enter the project. |
| PROD-001 | ProofPay prevents an underfunded release from silently short-paying the freelancer. | PLANNED | Later contract implementation and tests required. |
| PROD-002 | ProofPay refunds unused FXRP protection to the client. | PLANNED | Later contract implementation and tests required. |
| PROD-003 | ProofPay provides legal escrow or complete dispute resolution. | FALSE | Explicit non-goal and known limitation. |
| PROD-004 | ProofPay supports fiat or Nigerian bank settlement. | FALSE | Explicit non-goal. |
| PROD-005 | ProofPay is production-secure. | FALSE | No audit or production evidence exists. |
| DEPLOY-001 | A ProofPay contract is deployed on Coston2. | PLANNED | Deployment is forbidden before the Phase 1 gate passes. |

