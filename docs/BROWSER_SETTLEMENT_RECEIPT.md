# Phase 5B2 browser settlement receipt

Status: `PASS` with the delivery-window limitation recorded below.

Invoice `2`, **Verify ProofPay wallet actions on Coston2**, was created, approved, funded,
submitted, and released through the visible ProofPay browser controls on Flare Testnet Coston2.
The injected EIP-1193 bridge kept the two existing burner private keys in the Node test process;
the page received public addresses and provider responses only. The durable record is
`artifacts/coston2-browser-invoice.json`, and the separate public-only verification result is
`artifacts/browser-settlement-verification.json`.

## Preflight

- Chain ID: `114`.
- Runtime bytecode hash:
  `0xd455d0ee1c99f901d571e25c4cf25902249097d8212d485417e7032ee3ff5338`.
- Existing invoices: `1`; next predicted invoice: `2`.
- Active liabilities and contract FXRP balance: `0`.
- Client balances: `5.180252 FXRP`, `97.34732885 C2FLR`.
- Freelancer balances: `4.819748 FXRP`, `0.8682255 C2FLR`; no setup transfer was required.
- FTSO fee: `0`; the pinned XRP/USD observation was fresh at age `0` seconds.

## Confirmed browser transactions

| Action | Coston2 transaction |
| --- | --- |
| Create invoice | [`0xe467…36c7a`](https://coston2-explorer.flare.network/tx/0xe467d0a5205a4fbdd0ffbb2b8efc0d7cc41682c38245a07266125a59a9d36c7a) |
| Exact approval 1 · `2.167766 FXRP` | [`0xd207…f4c11`](https://coston2-explorer.flare.network/tx/0xd20702d104759670b06b3e8b0b48aa52c1259e08797c8d1f6ab1074a336f4c11) |
| Exact approval 2 · `2.168627 FXRP` | [`0xf843…de43`](https://coston2-explorer.flare.network/tx/0xf843a43e19f1a899874095e5bcecb4dfcc64a3f6f69ac739c7a290ea14dfde43) |
| Exact approval 3 · `2.168893 FXRP` | [`0x601f…96c9c`](https://coston2-explorer.flare.network/tx/0x601fd5134b75b8a94d4353e6765ccb95e1b2d0ea6e65e5fd121da0adf6596c9c) |
| Exact approval 4 · `2.169425 FXRP` | [`0x70f4…ecb0`](https://coston2-explorer.flare.network/tx/0x70f48a8ab45e54bcd85cbdfb90a9121147231fbef58f17a858df62afe728ecb0) |
| Fund invoice | [`0x60aa…d857`](https://coston2-explorer.flare.network/tx/0x60aa661a4c755b807a1911cce513603f103912226570ab9d9fafaf272eb3d857) |
| Submit evidence | [`0x91c0…c281`](https://coston2-explorer.flare.network/tx/0x91c0336de07ff5741c9f6d8e380d65e80d367c496da7abdae3d1373a6a6ec281) |
| Release payment | [`0x6e1b…d921`](https://coston2-explorer.flare.network/tx/0x6e1b8c009e9021aa05d5aeabaf1e7effcbf0b15402ef7a4b153bfcf26a82d921) |

The live quote moved between approval confirmation and the next funding preview. Each prior exact
approval became a few atomic units too small, so the UI requested a new bounded exact approval.
No approval was replayed, and every preserved transaction has broadcast count `1`.

## Commitments and settlement

- Scope commitment:
  `0x8b7690474f3fb8ffd5f96c15fd8e500aab3e11ea991f9dd5c1eefd0d5a220891`.
- Evidence commitment:
  `0xb98859ff3db3f2bb2f06bb2e8ef96f60bfa47432080fde6159476e2547ecacda`.
- Evidence URL: the confirmed funding transaction on the Coston2 explorer.
- Funding observation: XRP/USD `1.034376`; confirmed lock `2.126887 FXRP`.
- Release observation: XRP/USD `1.034496`.
- Freelancer payout: `1.933309 FXRP`.
- Client refund: `0.193578 FXRP`.
- Top-up: `0`; none was manufactured or requested.
- Conservation: `1.933309 + 0.193578 = 2.126887 FXRP`.
- Final client balance: `3.246943 FXRP`.
- Final freelancer balance: `6.753057 FXRP`.
- Final state: `RELEASED`; active liabilities `0`; contract FXRP balance `0`.

The public `/receipt/2` view decoded the four ProofPay lifecycle transactions, displayed the target,
historical lock, payout, refund, funding and release prices, both commitments, evidence URL, current
zero-liability state, and explorer links. The read-only verifier independently compared the browser
journal, canonical manifest bytes, transaction senders and targets, exact events, current contract
state, party balances, and receipt values.

## Browser evidence and observed friction

Ten desktop/mobile images are preserved under `artifacts/browser-settlement/`. Automated Axe scans
found no serious or critical violations on the action and receipt states, and both 390-pixel views
had no horizontal overflow. The replay run completed with no increase in broadcast count.

Observed counts: `0` network switches, `6` quote refreshes, `8` wallet prompts, `4` approval prompts,
`0` rejected actions, `0` duplicate actions, and `1` reload reconciliation. Confirmed-action waits
ranged from `2.368` to `3.050` seconds in the captured durations.

The browser's `datetime-local` value was interpreted in its local timezone. The confirmed deadline
was `82,853` seconds after creation, not exactly `86,400`; the contract requires the deadline before
the creation receipt exists, so this invoice cannot be corrected. A development-only React
hydration warning also appeared when restored injected-wallet state differed from the server's
disconnected render; client rendering recovered and the checked flows completed. These are recorded
for interface refinement, not presented as usability validation.

This is Coston2 test evidence. It does not prove mainnet, audit, legal escrow, production security,
delivery quality, or human usability.
