# ProofPay demo shot list

The edit must feel like one product walkthrough, not a title-card slideshow. Static evidence frames are edit references and safe fallback inserts. The final capture session should reproduce the listed actions on the real public routes without a wallet connection.

## Capture and edit plan

| Shot | Time | Source / route | Exact action and framing | Edit | Claims-ledger IDs |
| --- | --- | --- | --- | --- | --- |
| S01 | 00:00–00:07 | `01-landing-production.png` / `https://proofpay.paysmat.xyz/` | Open on the real first viewport. Hold headline, explanatory paragraph, both actions, and mechanism in one frame. | One gentle 103% push; no title card. | `UI-025`, `WEB-006` |
| S02 | 00:07–00:15 | `/` mechanism | In the final capture, tab or click once from the steady scenario to `XRP falls to $0.95`. Record the real state transition and keep the illustrative disclosure visible. | Natural click only; no cursor replacement. | `ARCH-002`, `UI-025` |
| S03 | 00:15–00:20 | `02-scenario-refund.png` | Show `$1.25`, `80 FXRP` payout, and `30 FXRP` refund. | Hard cut; 100% pixels. | `ARCH-002`, `PROD-002` |
| S04 | 00:20–00:25 | `03-scenario-exact-coverage.png` | Show `$1.00`, `100 FXRP` payout, and `10 FXRP` refund. | Hard cut; match mechanism position. | `ARCH-002`, `PROD-002` |
| S05 | 00:25–00:30 | `04-scenario-buffer-protection.png` | Show `$0.95`, `105.263158 FXRP` payout, and `4.736842 FXRP` refund. | Hard cut; preserve green settlement rail. | `ARCH-002`, `PROD-001`, `PROD-002` |
| S06 | 00:30–00:35 | `05-scenario-top-up-required.png` | Show `$0.90`, blocked release, and exact `1.111112 FXRP` shortfall. | Hard cut; preserve amber barrier. | `ARCH-002`, `PROD-001` |
| S07 | 00:35–00:45 | `06-app-production.png` / `https://proofpay.paysmat.xyz/app` | Navigate through the real `Create a milestone` action. Establish the create hierarchy and disconnected-wallet state; do not connect. | One continuous route transition. | `UI-008`, `UI-009`, `WEB-006` |
| S08 | 00:45–00:50 | `07-funding-preview-fixture.png` | Optional insert only: crop to the real action-preview component and its `Not confirmed` state. | Keep OS-08 for the entire insert. Drop this shot if the fixture caption cannot remain readable. | `UI-009`, `UI-010`, `WEB-003` |
| S09 | 00:50–01:05 | `08-invoice-2-settled-production.png` / `https://proofpay.paysmat.xyz/invoice/2` | Open the real invoice directly. Hold the settled lifecycle, `$2.00` target, `2.126887 FXRP` lock, `1.933309 FXRP` payout, `0.193578 FXRP` refund, and receipt action. | Slow vertical reframing only if needed. | `LIVE-005`, `LIVE-006`, `WEB-006` |
| S10 | 01:05–01:12 | `09-receipt-2-production.png` / `https://proofpay.paysmat.xyz/receipt/2` | Follow the actual receipt link. Establish `SETTLEMENT RECEIPT · INVOICE #2`, `SETTLED`, and Coston2. | Direct navigation; no transition graphic. | `UI-014`, `WEB-006` |
| S11 | 01:12–01:28 | `10-receipt-2-expanded-live.png` / `/receipt/2` | In final capture, expand `How this settlement was confirmed`, then `Commitments and final contract state`. Pause on create/fund/evidence/release rows, then zero liabilities and balance. | Two real disclosure clicks; no fake cursor. | `LIVE-004`, `LIVE-005`, `LIVE-006`, `UI-014` |
| S12 | 01:28–01:35 | Funding explorer URL | Click the receipt’s funding `Explorer` link. Show hash `0x60aa…3d857`, confirmed transaction context, and block `33804808`; return to the app. | Read-only external page. Record fresh for final cut; no source frame is fabricated in this package. | `LIVE-005`, `UI-014` |
| S13 | 01:35–01:55 | `11-built-on-flare.png` / landing `Built on Flare` section | Return to `/` and scroll to the real four-column architecture. Move left-to-right once across FXRP, FTSOv2, ProofPayEscrow, and Coston2. | Linear pan or the real scroll; no regenerated diagram. | `TECH-002`, `TECH-003`, `DEPLOY-001`, `DEPLOY-002` |
| S14 | 01:55–02:03 | `06-app-production.png`, `10-receipt-2-expanded-live.png` | Two short product cuts: agreement workflow, then decoded receipt. | Avoid feature-count animation or invented metrics. | `ARCH-001`, `UI-009`, `UI-011`, `UI-014` |
| S15 | 02:03–02:10 | `12-landing-mobile-production.png` or `13-receipt-2-mobile-production.png` | Show the real mobile layout with its Coston2 label. | One 100% crop; no device mockup. | `UI-005`, `UI-022`, `WEB-006` |
| S16 | 02:10–02:15 | `01-landing-production.png` / `/` | Return to the actual headline and keep the limitation caption visible. | End on product pixels; 8-frame fade to black after 02:15. | `UI-022`, `UI-025` |

## Required final-capture actions

1. Load `https://proofpay.paysmat.xyz/` in a fresh unauthenticated session. [`WEB-004`, `WEB-006`]
2. Change exactly one real illustrative scenario. Do not connect a wallet. [`ARCH-002`, `UI-025`]
3. Open `/app`, then the public invoice `/invoice/2`, then its public receipt `/receipt/2`. [`LIVE-005`, `UI-014`]
4. Expand both receipt disclosure regions and open the invoice-2 funding transaction explorer link. [`LIVE-005`, `LIVE-006`, `UI-014`]
5. Return to the landing architecture and final headline. [`UI-025`, `WEB-006`]

## Capture safety

- Record browser audio off; add narration in post.
- Hide bookmarks, extensions, profile controls, and notifications. Never record a wallet profile or local filesystem path.
- Do not use a connected wallet, invoke `eth_requestAccounts`, request `eth_sendTransaction`, or approve any wallet prompt. [`UI-009`, `UI-015`]
- Explorer navigation is read-only. Stop if any unexpected signing or transaction surface appears. [`UI-014`]
- The provided Phase 7A production stills are viewport crops from the fresh public audit source; the upstream full-page exports repeated viewport segments, so only intact first-viewport pixels were retained. No content was reconstructed.
