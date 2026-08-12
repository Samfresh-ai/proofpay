# ProofPay demo video scene manifest

Status: Phase 7A evidence-first preproduction
Target runtime: **02:15** (within the required 02:00–02:20 window)
Canonical application: `https://proofpay.paysmat.xyz` [`WEB-004`, `WEB-006`]
Network shown: Flare Testnet Coston2, chain `114` [`TECH-001`, `DEPLOY-001`]

## Evidence lock

- Product frames must come from `video/captures/`; each file is traced in its manifest. [`UI-025`, `WEB-006`]
- The production route frames are unauthenticated, read-only captures from the Phase 7A audit window beginning `2026-08-12T17:00:45.135Z`. [`WEB-006`]
- The four scenario frames are deterministic Phase 6B2 product captures. Their visible label, `Illustrative $100 milestone · no transaction is being sent`, must remain unobscured. [`ARCH-002`, `UI-025`]
- The funding-action frame is a deterministic wallet fixture, never live transaction evidence. If used, retain a persistent `DETERMINISTIC PREVIEW · NOT A LIVE TRANSACTION` caption. [`UI-009`, `UI-010`, `WEB-003`]
- Do not generate UI, transactions, cursor movement, wallet prompts, people, partner logos, or metrics. Do not request a signature or send a transaction. [`UI-015`, `UI-016`, `UI-022`]
- Final recording may replace a reference still only with the same real route/state and must preserve the Coston2/testnet labels and exact values below. [`LIVE-005`, `LIVE-006`, `UI-014`]

## Locked timeline

| Scene | Time | Duration | Real visual and action | Audio / text refs | Claims-ledger IDs | Evidence guard |
| --- | --- | ---: | --- | --- | --- | --- |
| 01 · Problem | 00:00–00:15 | 15s | Begin directly on `01-landing-production.png`; slow crop into the real headline and steady-price mechanism. In the final recording, make one real scenario selection on `/`; no fake cursor. | VO 01; OS 01–02 | `ARCH-002`, `PROD-001`, `UI-025`, `WEB-006` | Keep the exact illustrative label visible. The scenario is explanatory math, not a transaction. |
| 02 · Mechanism | 00:15–00:35 | 20s | Cut through `02-scenario-refund.png`, `03-scenario-exact-coverage.png`, `04-scenario-buffer-protection.png`, and `05-scenario-top-up-required.png`. Use direct cuts or short pans; do not animate different numbers between frames. | VO 02; OS 03–06 | `ARCH-002`, `PROD-001`, `PROD-002`, `UI-025` | Preserve all exact FXRP amounts. The fourth outcome is a blocked release, not a failed payout. |
| 03 · Working product | 00:35–01:05 | 30s | Show `06-app-production.png`, then the actual `/app` creation hierarchy. Optional two-second insert: `07-funding-preview-fixture.png` with the fixture caption. Cut to `08-invoice-2-settled-production.png` and hold on the target, lock, settled state, payout, and refund. | VO 03; OS 07–10 | `UI-008`, `UI-009`, `UI-010`, `UI-011`, `LIVE-005`, `LIVE-006`, `WEB-006` | Never imply the optional fixture was invoice 2. Invoice 2 is the separate real Coston2 proof. |
| 04 · Real proof | 01:05–01:35 | 30s | Follow the real receipt link to `/receipt/2`. Establish with `09-receipt-2-production.png`, then use `10-receipt-2-expanded-live.png` to reveal create, fund, evidence, release, payout/refund, and final zero-liability state. In the final recording, open the exact funding transaction explorer URL from the receipt and return. | VO 04; OS 11–15 | `LIVE-004`, `LIVE-005`, `LIVE-006`, `UI-014` | Explorer destination: `https://coston2-explorer.flare.network/tx/0x60aa661a4c755b807a1911cce513603f103912226570ab9d9fafaf272eb3d857`. Opening it is read-only. |
| 05 · Why Flare | 01:35–01:55 | 20s | Scroll the real landing page to Built on Flare or use `11-built-on-flare.png`. Move once across the real FXRP, FTSOv2, ProofPayEscrow, and Coston2 columns. | VO 05; OS 16 | `TECH-002`, `TECH-003`, `DEPLOY-001`, `DEPLOY-002`, `PROD-001`, `PROD-002` | Use the product’s existing architecture copy; no invented chain diagram or partner mark. |
| 06 · New work + honest limit | 01:55–02:15 | 20s | Return to the landing hero, briefly show the mobile proof frame if pacing allows, then end on the real tagline. Keep the persistent testnet limitation visible for the final five seconds. | VO 06; OS 17–19 | `ARCH-001`, `UI-009`, `UI-011`, `UI-014`, `UI-022`, `UI-025`, `WEB-006` | Say `built during Summer Signal`, not `built from scratch`. End with Coston2/test-assets/no-audit language. |

## Final-recording continuity

1. Use one clean browser session at `https://proofpay.paysmat.xyz`; keep the page’s own network labels visible. [`WEB-004`, `WEB-006`]
2. Record only direct product interactions: scenario selection, route navigation, evidence expansion, and one explorer-link open. [`UI-014`, `UI-025`]
3. Do not connect a wallet for the final demo. The existing invoice and receipt are public read-only proof. [`UI-002`, `UI-014`, `LIVE-006`]
4. Use crop, cut, speed-ramp, and gentle pan only. Do not simulate loading, alter a value, composite a fictional screen, or add a fake cursor. [`UI-016`, `UI-025`]
5. The final frame must read: `Keep the milestone in dollars. Settle it in FXRP.` and `Coston2 testnet · test assets only · not audited`. [`UI-022`, `UI-025`]
