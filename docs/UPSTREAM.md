# Upstream and reference record

Last inspected: 2026-08-12

## ProofPay license boundary

ProofPay's original source is released under the root MIT License, copyright
2026 Samfresh-ai. That license does not replace, relicense, or remove any
third-party notice. Git submodules and npm packages remain governed by their own
licenses.

The production contract imports narrow interfaces and utilities from pinned
dependencies. The application uses published npm packages. No vendored upstream
code should be presented as original ProofPay work.

## Pinned contract dependencies

| Dependency | Pin | License evidence in the checkout | ProofPay use |
| --- | --- | --- | --- |
| Flare periphery | `0.1.52` / `ca264d6a31ddfb53d1bef7cb7bd1942aa89d323a` | The imported Coston2 `FtsoV2Interface.sol` carries `SPDX-License-Identifier: MIT`; the inspected checkout has no root license file. | Production FTSOv2 interface and Coston2 network contracts |
| OpenZeppelin Contracts | `v5.7.0` / `cab19933c33c2ad1d4c7a84864a3601dddfd16f3` | Root `LICENSE`: MIT | `IERC20`, `IERC20Metadata`, `SafeERC20`, `ReentrancyGuard`, and `Math` |
| forge-std | `v1.16.2` / `bf647bd6046f2f7da30d0c2bf435e5c76a780c1b` | `LICENSE-MIT`, `LICENSE-APACHE`, and package metadata: `(Apache-2.0 OR MIT)` | Solidity deployment scripts and tests only |

The three initialized top-level submodules are recorded in `.gitmodules` and
must remain at these pins. OpenZeppelin's three nested test-only gitlinks are
uninitialized in the reviewed repository; they are not required to compile or
test ProofPay.

## Direct JavaScript dependencies

The versions below are locked by `package-lock.json`; the license values are
from each installed package's metadata at the reviewed lock state.

| Package | Reviewed version | Declared license |
| --- | ---: | --- |
| `@tanstack/react-query` | `5.101.4` | MIT |
| `next` | `16.3.0` | MIT |
| `react`, `react-dom` | `19.2.8` | MIT |
| `viem` | `2.55.11` | MIT |
| `wagmi` | `3.7.6` | MIT |
| `@axe-core/playwright` | `4.12.1` | MPL-2.0 |
| `@playwright/test` | `1.62.1` | Apache-2.0 |
| `@types/node`, `@types/react`, `@types/react-dom` | `26.1.2`, `19.2.18`, `19.2.4` | MIT |
| `eslint`, `eslint-config-next` | `9.39.5`, `16.3.0` | MIT |
| `tsx` | `4.23.7` | MIT |
| `typescript` | `6.0.3` | Apache-2.0 |
| `vitest` | `4.1.10` | MIT |

This table covers direct project packages, not every transitive package. Their
published notices remain authoritative. `node_modules/` is ignored and is not
published as ProofPay source.

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
