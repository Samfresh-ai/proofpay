# ProofPay demo voiceover

Target delivery: calm, direct, approximately 142 words per minute.
Locked runtime: **02:15**.
Bracketed claim IDs are production notes and are not spoken.

## 00:00–00:15 · Problem

“A milestone can be agreed in dollars but funded with a crypto asset whose price changes before release. Funding alone does not preserve the agreement. ProofPay prices the target again before payment moves.”
[`ARCH-002`, `PROD-001`, `UI-025`]

## 00:15–00:35 · Mechanism

“This one-hundred-dollar example is illustrative; no transaction is being sent. The client locks one hundred FXRP plus ten percent protection. If XRP rises, the freelancer receives eighty FXRP and thirty returns. At one dollar, one hundred pays and ten returns. A five-cent fall stays inside the buffer. A ten-cent fall blocks release until the exact shortfall is topped up.”
[`ARCH-002`, `PROD-001`, `PROD-002`, `UI-025`]

## 00:35–01:05 · Working product

“The production app starts with the milestone agreement: client, dollar target, deadline, and a commitment to the scope. Wallet actions are role-aware, simulated before signing, and bounded to the accepted FXRP amount. Here is real invoice two on Coston2. Its target is two dollars. It locked 2.126887 FXRP, accepted delivery evidence, and is settled. No further wallet action is required.”
[`UI-008`, `UI-009`, `UI-010`, `UI-011`, `LIVE-005`, `LIVE-006`, `WEB-006`]

## 01:05–01:35 · Real proof

“The permanent receipt decodes the confirmed settlement. Funding paid 2.126887 FXRP into escrow. At release, 1.933309 FXRP paid the freelancer and 0.193578 FXRP returned to the client. Their sum equals the original lock. The receipt links the create, funding, evidence, and release transactions, and the final read shows zero active liabilities and zero FXRP left in the contract. The evidence commitment proves the committed bytes, not the truth or quality of the work.”
[`LIVE-004`, `LIVE-005`, `LIVE-006`, `UI-014`]

## 01:35–01:55 · Why Flare

“Flare supplies each settlement layer. FXRP brings XRP-derived programmable value. FTSOv2 supplies the XRP-to-dollar price at funding and release. ProofPayEscrow uses that price to pay, refund, or block. Coston2 exposes the contract state and transactions as public testnet evidence.”
[`TECH-002`, `TECH-003`, `DEPLOY-001`, `DEPLOY-002`, `PROD-001`, `PROD-002`]

## 01:55–02:15 · New work and limitation

“During Summer Signal, ProofPay added its escrow contract, protection math, wallet workflow, deterministic evidence commitments, browser journal, public receipts, and production Escrow Flow interface. This is still a Coston2 prototype using test assets. It is not audited, legal escrow, fiat settlement, or production-ready. Keep the milestone in dollars. Settle it in FXRP.”
[`ARCH-001`, `UI-009`, `UI-011`, `UI-012`, `UI-014`, `UI-022`, `UI-025`, `WEB-006`]
