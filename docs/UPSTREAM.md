# Upstream and reference record

Last inspected: 2026-08-04

## FAssets Demo

- Repository: https://github.com/flare-foundation/fassets-demo-dapp
- Default branch: `main`
- Exact commit: `16927d9594844350ae4e264464cc8662d48ffcaa`
- Commit date: 2026-05-18
- Repository license signal: `README.md` says `MIT License.`
- License-file check: no `LICENSE`, `LICENSE.md`, or `COPYING` file exists at the inspected commit.
- Package metadata check: the root `package.json` has no `license` field.
- GitHub metadata check: the repository API returns no detected license (`license: null`).

### Reuse decision

No source file or code fragment has been copied or materially adapted into ProofPay. The short README label is not accompanied by the MIT license text or a copyright notice, so upstream source code is reference-only until the maintainer supplies or identifies the controlling license grant and notice. This avoids copying code with ambiguous licensing.

Current attribution requirement inside ProofPay: identify the repository and exact inspected commit when describing reference research. If code is later approved for reuse, this file must list every copied or materially adapted file, the modification, and the full notice obligations before that code is added.

### Inspected stack

- Next.js 16 and React 19
- TypeScript and Tailwind CSS 4
- wagmi 3, viem 2, and TanStack Query
- Flare periphery artifacts and generated wagmi package
- RainbowKit, ethers, XRPL, React Hook Form, and Zod in the demo's wider flow

### Inspected files and useful patterns

| Upstream path | What was inspected | ProofPay use in Phase 0 |
| --- | --- | --- |
| `src/lib/wagmi.ts` | Flare/Coston2 chain selection and injected-wallet configuration | Reference only |
| `src/lib/chainUtils.ts` | Chain IDs, explorers, and artifact-network mapping | Reference only |
| `src/lib/flareContracts.ts` | Address lookup through Flare periphery artifacts/registry wrappers | Reference only |
| `src/hooks/useAssetManager.ts` | AssetManagerFXRP resolution and settings read | Reference only |
| `src/hooks/useFXRPTokenDetails.ts` | FXRP address from AssetManager settings plus token metadata | Reference only |
| `src/lib/ftsoUtils.ts` | XRP/USD feed ID and FTSOv2 read | Reference only; its floating-point display conversion will not be reused for financial logic |
| `src/components/Transfer.tsx` | Wallet-approved ERC-20 transfer and receipt flow | Reference only; its floating-point amount parsing will not be reused |

Observed repository inconsistency: `Transfer.tsx` and `Redeem.tsx` import `src/hooks/useFXRPBalance`, but that file is absent at the inspected commit. ProofPay will rely on official Flare documentation and direct probe evidence rather than assuming the demo currently builds.

## Landing-page prompting guide

- Source: https://x.com/aiwithmayank/status/2080228272911389138
- Inspected: 2026-08-04
- Retained method only: explicitly name product, user, visual thesis, typography, page sequence, interaction, motion, responsiveness, and things to avoid.
- Not retained: glassmorphism, generic SaaS composition, bento grids, testimonials, pricing sections, logo clouds, or other preset aesthetics.

No text, image, or code from this guide has been copied into ProofPay.

