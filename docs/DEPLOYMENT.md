# ProofPay deployment

ProofPay is publicly available on Flare Testnet Coston2. This page records only
the information needed to inspect or reproduce the public application and
contract deployment.

## Public application

- Canonical origin: [https://proofpay.paysmat.xyz](https://proofpay.paysmat.xyz)
- Create or locate a milestone: [https://proofpay.paysmat.xyz/app](https://proofpay.paysmat.xyz/app)
- Invoice 1: [https://proofpay.paysmat.xyz/invoice/1](https://proofpay.paysmat.xyz/invoice/1)
- Receipt 1: [https://proofpay.paysmat.xyz/receipt/1](https://proofpay.paysmat.xyz/receipt/1)
- Invoice 2: [https://proofpay.paysmat.xyz/invoice/2](https://proofpay.paysmat.xyz/invoice/2)
- Receipt 2: [https://proofpay.paysmat.xyz/receipt/2](https://proofpay.paysmat.xyz/receipt/2)

The application is hosted on Vercel behind the custom domain above. Canonical
metadata is set through `NEXT_PUBLIC_SITE_URL`. The deployed interface reads
the official public Coston2 RPC and does not need a private key to display the
two preserved invoices and receipts.

## Coston2 contract

| Field | Value |
| --- | --- |
| Network | Flare Testnet Coston2 |
| Chain ID | `114` |
| Contract | [`0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21`](https://coston2-explorer.flare.network/address/0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21) |
| Deployment transaction | [`0xa223570423d92e6dc972452ff00da35c2d59d5c0c4c9f3a971e7cd6dabf5f93a`](https://coston2-explorer.flare.network/tx/0xa223570423d92e6dc972452ff00da35c2d59d5c0c4c9f3a971e7cd6dabf5f93a) |
| Deployment block | `33775801` |
| FXRP | [`0x0b6A3645c240605887a5532109323A3E12273dc7`](https://coston2-explorer.flare.network/address/0x0b6A3645c240605887a5532109323A3E12273dc7) |
| FTSOv2 | `0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d` |
| XRP/USD feed | `0x015852502f55534400000000000000000000000000` |
| Maximum price age | `30` seconds |

The explorer reports the contract source as verified. The recorded build uses
Solidity `0.8.25`, optimizer `200`, via IR, and Cancun EVM. The expected and
deployed runtime bytecode hashes match:

`0xd455d0ee1c99f901d571e25c4cf25902249097d8212d485417e7032ee3ff5338`

`deployment/coston2.json` preserves the constructor inputs, creation receipt,
runtime-bytecode comparison, and explorer verification response. It also
contains historical local command paths as provenance; those paths are not
credentials and are not used by the application.

## Runtime evidence inputs

Production receipt rendering keeps these committed files at stable paths:

```text
deployment/coston2.json
artifacts/coston2-live-invoice.json
artifacts/coston2-settlement-receipt.json
artifacts/live-scope-manifest.json
artifacts/live-evidence-manifest.json
artifacts/coston2-browser-invoice.json
artifacts/coston2-browser-settlement-receipt.json
artifacts/browser-scope-manifest.json
artifacts/browser-evidence-manifest.json
```

The JSON receipts and journals locate known transactions. Scope and evidence
manifests are re-hashed before display. Current invoice status, liabilities,
balances, blocks, and decoded events are read from Coston2; the application does
not silently substitute illustrative values when a live read fails.

## Build and run

```bash
git clone https://github.com/Samfresh-ai/proofpay.git
cd proofpay
git submodule update --init
npm ci
NEXT_PUBLIC_SITE_URL=https://proofpay.paysmat.xyz npm run build
npm run start
```

The Vercel upload intentionally excludes contracts, tests, internal tooling,
and non-runtime artifacts. `.vercelignore` explicitly retains only the Coston2
deployment record and the eight receipt locator/manifest inputs above.

## Verification

Safe local checks:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:e2e
npm run test:e2e:production
npm run scan:browser-secrets
npm run reconcile:interface:coston2
```

Contract checks:

```bash
cd contracts
forge fmt --check
forge build --force
forge test
```

The interface reconciliation command uses public RPC reads only. Tools named
`deploy:coston2`, `live:coston2`, `probe:flare`, and
`test:e2e:browser-live` are intentionally separate because they can use
owner-controlled test wallets or write evidence. They are not part of ordinary
read-only verification.

## Testnet warning

This deployment uses Coston2, FTestXRP, and C2FLR. The assets have no represented
real-world value. The deployment is not an audit, production-security approval,
legal escrow service, fiat settlement system, or mainnet readiness claim.
