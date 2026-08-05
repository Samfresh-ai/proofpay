# ProofPay contract architecture

Last verified: 2026-08-05

Phase 2 locks the contract model and compile-time integration surface. It does not implement,
deploy, or claim to secure an escrow contract.

## Scope

The locked MVP has one future Coston2 escrow, one FXRP token, one XRP/USD FTSOv2 feed, and one
milestone per invoice. A freelancer defines a USD target and delivery deadline. The named client
locks FXRP, the freelancer submits immutable evidence, and the client decides whether to release.

The MVP has no mediator, arbitration, automatic release, admin, fee, treasury, pause mechanism,
upgradeability, factory, batch operation, or second token. The client can refuse release after
evidence is submitted. In that case the FXRP remains locked because the MVP has no dispute or
timeout path from `SUBMITTED`.

## Evidence baseline

Phase 1 supplies the network facts used here:

| Fact | Phase 1 evidence |
| --- | --- |
| Network | Coston2, chain ID `114` |
| Flare Contract Registry | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` |
| FXRP resolution | `AssetManagerFXRP` from the registry, then `IAssetManager.fAsset()` |
| Resolved Phase 1 FXRP | `0x0b6A3645c240605887a5532109323A3E12273dc7`, six token decimals |
| FTSOv2 resolution | `FtsoV2` from the registry |
| XRP/USD feed | `0x015852502f55534400000000000000000000000000` |
| Price ABI | `getFeedById(bytes21)` returns `uint256 value`, `int8 decimals`, `uint64 timestamp` |
| Live compatibility | Zero-value XRP/USD read and confirmed FXRP ERC-20 transfer on Coston2 |

The addresses resolved in Phase 1 prove the checkpoint; they are not hardcoded into the future
escrow. The deployment path resolves them again through the same official registry interface.
The Phase 1 burner addresses are test infrastructure and never appear in contract source or
constructor arguments.

Primary interface references:

- https://dev.flare.network/network/guides/flare-contracts-registry
- https://dev.flare.network/fassets/developer-guides/fassets-asset-manager-address-contracts-registry
- https://dev.flare.network/ftso/solidity-reference/FtsoV2Interface
- https://dev.flare.network/ftso/feeds

## Components and trust boundaries

| Component | Responsibility | Trust boundary |
| --- | --- | --- |
| Freelancer | Creates the invoice and submits evidence | Controls only its own invoice actions; cannot move locked FXRP |
| Client | Funds, tops up, releases, or reclaims a missed unsubmitted invoice | Release remains an explicit client decision |
| ProofPay escrow | Enforces roles, state, deadlines, price checks, and token accounting | Accounts for active liabilities; unsolicited surplus remains inert |
| FXRP | ERC-20 asset transferred with `SafeERC20` | Fixed immutable token resolved for Coston2 at deployment |
| FTSOv2 | Supplies XRP/USD value, decimals, and feed timestamp | Every price-dependent action fails closed on bad or stale data |
| Flare Contract Registry | Resolves current Coston2 AssetManager and FTSOv2 addresses | Used by the deployment script, not as an admin surface |
| Evidence manifest | Contains the public delivery URL and short completion note | Contract binds its raw bytes by hash but does not trust or parse its URI |

Wallets sign their own transactions. ProofPay never receives a private key, mnemonic, or seed.

## Deployment resolution

The later deployment script must:

1. require `block.chainid == 114`;
2. bind `IFlareContractRegistry` to the official Coston2 registry;
3. resolve `AssetManagerFXRP` and reject a zero or code-less address;
4. call `IAssetManager.fAsset()` and reject a zero or code-less token address;
5. require the resolved token to report six decimals;
6. resolve `FtsoV2` and reject a zero or code-less address;
7. pass the resolved FXRP and FTSOv2 addresses to the escrow constructor.

The contract stores those two dependencies as immutables. It does not hardcode a resolved FXRP or
FTSOv2 address, and it does not look up mutable protocol addresses during settlement. The chain-ID
check is repeated in the constructor so a misconfigured script cannot deploy the Coston2-only MVP
to another chain.

The Coston2 registry address, chain ID, and XRP/USD feed ID are network identifiers rather than
user or deployment output. The compile probe pins only those identifiers.

## State model

Persistent states are:

```text
CREATED -> FUNDED -> SUBMITTED -> RELEASED
   |          |
   |          `-> REFUNDED
   `-> CANCELLED
```

`TOP_UP_REQUIRED` is derived from the latest accepted price and `fxrpLocked`. It is returned by a
release quote or raised by `release`; it is never stored.

| Current state | Action | Authorized caller | Next state |
| --- | --- | --- | --- |
| none | `createInvoice` | Caller becomes the freelancer | `CREATED` |
| `CREATED` | `fundInvoice` | Named client | `FUNDED` |
| `CREATED` | `cancelBeforeFunding` | Freelancer | `CANCELLED` |
| `FUNDED` | `submitEvidence` | Freelancer | `SUBMITTED` |
| `FUNDED` | `refundUnsubmittedAfterDeadline` | Named client | `REFUNDED` |
| `SUBMITTED` | `topUp` | Named client | `SUBMITTED` |
| `SUBMITTED` | `release` | Named client | `RELEASED` |

All other transitions revert. `CANCELLED`, `REFUNDED`, and `RELEASED` are terminal. A failed
release caused by insufficient FXRP changes neither state nor token balances.

Deadline boundaries are exact:

- creation requires `deliveryDeadline > block.timestamp`;
- funding requires `block.timestamp < deliveryDeadline`;
- evidence may be submitted while `block.timestamp <= deliveryDeadline`;
- a missed-delivery refund requires `block.timestamp > deliveryDeadline`;
- a guarded price action accepts a quote while `block.timestamp <= quoteDeadline`.

The equality boundary belongs to evidence submission, so submission and refund are never both
valid in the same timestamp.

## Authority and immutability

- The transaction sender creates an invoice as its freelancer.
- The freelancer supplies one distinct, nonzero client address.
- Anyone may simulate or call a quote function.
- Only the client may fund, top up, release, or refund a funded but unsubmitted missed invoice.
- Only the freelancer may submit evidence or cancel before funding.
- There is no privileged party and no unrestricted withdrawal recipient.

After funding, `freelancer`, `client`, `usdTarget`, `deliveryDeadline`, and `scopeHash` never
change. The funding price observation is written once. `fxrpLocked` may only increase through an
exact client top-up. `evidenceHash` is written once on submission. The release observation is
written once on a successful release. No function rewrites funded terms.

## Onchain record

The invoice mapping key is the invoice ID. The record contains only enforcement or durable-proof
data:

| Field | Purpose |
| --- | --- |
| `freelancer` | Creation, evidence, cancellation, and payout authority |
| `client` | Funding, top-up, release, refund authority and refund recipient |
| `usdTarget` | Fixed invoice target in six-decimal USD units |
| `fxrpLocked` | Total FXRP atomic units deposited for the invoice |
| `deliveryDeadline` | Submission/refund boundary |
| `scopeHash` | Immutable commitment to the agreed scope bytes |
| `evidenceHash` | Immutable commitment to the submitted evidence-manifest bytes |
| `fundingPrice`, `fundingPriceDecimals`, `fundingPriceTimestamp` | Durable funding quote observation |
| `releasePrice`, `releasePriceDecimals`, `releasePriceTimestamp` | Durable successful-release observation |
| `status` | Enforced state-machine position |

FTSO decimals are stored with each raw price because Flare requires consumers to use the decimals
returned by the feed and warns that feed precision can change. A raw price without its decimals is
not durable proof.

`fxrpLocked` remains the historical deposited total after a terminal transition. It is an active
liability only while the status is `FUNDED` or `SUBMITTED`. Payout and refund amounts are recorded
in terminal events instead of duplicated in storage.

The record does not store its mapping key, display names, invoice text, creation time, evidence
URI, completion note, payout, refund, or derived top-up. Events and block data supply the durable
receipt; offchain content supplies display data.

## Public evidence and settlement receipt

The contract stores `evidenceHash = keccak256(manifestBytes)` and emits the manifest URI in
`EvidenceSubmitted`. The manifest contains the public evidence URL and completion note. Hashing
the exact served bytes avoids an onchain JSON or URL parser.

The event URI must be nonempty and at most 256 bytes. The contract treats it as opaque, untrusted
text and does not validate schemes, fetch content, or claim that the content proves delivery. A
public receipt can combine:

- `InvoiceCreated` for parties, target, deadline, and scope hash;
- `InvoiceFunded` for locked FXRP and the funding observation;
- `EvidenceSubmitted` for the evidence hash and retrieval URI;
- optional `InvoiceToppedUp` events;
- one terminal release, cancellation, or refund event.

Clients that render the URI must sanitize it and allow only explicitly supported schemes. Client
approval, not URL validity, authorizes release.

## XRP/USD price boundary

The contract uses the production `FtsoV2Interface` and the Phase 1 XRP/USD feed ID. The interface
method is payable and not declared `view`; therefore contract quote functions are also non-view,
although a frontend can preview them through `eth_call` simulation.

The current block-latency feed is free to query and Phase 1 proved a call with zero native value.
ProofPay forwards no native value and has no C2FLR custody or withdrawal path. If the feed later
requires a nonzero fee, oracle-dependent actions revert until the architecture is revised.

`MAX_PRICE_AGE` is fixed at 30 seconds. Flare documents block-latency updates at approximately
1.8 seconds, so 30 seconds tolerates roughly sixteen expected update opportunities while still
failing closed well outside normal cadence. This is a ProofPay risk rule, not a Flare-mandated
constant.

Each oracle read accepts only:

- `value > 0`;
- `0 <= decimals <= 18`;
- a nonzero timestamp no later than `block.timestamp`;
- an age no greater than 30 seconds.

A zero, future, malformed, stale, or reverting read blocks quotes, funding, top-up, and release.
There is no cached fallback and no general-purpose oracle framework. Cancellation, evidence
submission, and the full-token missed-delivery refund do not depend on a USD price.

The integer formulas and four release scenarios are locked in `CONTRACT_SPEC.md`.

## Threat model and controls

| Threat | Locked response |
| --- | --- |
| Reentrancy | `SafeERC20`, `ReentrancyGuard`, checks-effects-interactions, and exact token-delta checks on financial entry points |
| Stale FTSO data | Timestamp validation and a fixed 30-second maximum age; no cache |
| Zero or malformed price | Reject zero value, future/zero timestamp, and decimals outside `0..18` |
| Rounding underpayment | Full-precision multiplication/division with upward rounding for every required amount |
| Quote movement before confirmation | Transaction rereads the feed and enforces caller-supplied maximum plus absolute quote deadline |
| Double funding or release | Explicit states; effects are committed before external transfers and reverts roll back atomically |
| Unauthorized evidence or release | Freelancer-only evidence and client-only release checks |
| Client refusal after delivery | Explicit unresolved MVP limitation; no false automatic-settlement claim |
| Malicious evidence URI | Hash exact bytes, cap event length, treat URI as opaque, sanitize in clients |
| Wrong-chain deployment | Deployment and constructor require chain ID `114`; resolved addresses and code are checked |
| Unsolicited FXRP transfer | Active liabilities may be lower than the contract balance; surplus has no withdrawal path |

## Security invariants

- A successful release pays an FXRP amount whose rational USD value meets or exceeds the target
  under the accepted release observation.
- Freelancer payout plus client refund equals, and therefore never exceeds, `fxrpLocked` for a
  successful release.
- An insufficient release transfers nothing and preserves `SUBMITTED`.
- One invoice cannot fund, submit, refund, cancel, or release twice.
- Only the client can fund, top up, release, and invoke the missed-delivery refund.
- Only the freelancer can submit evidence and cancel an unfunded invoice.
- Neither party can rewrite funded terms.
- Stale or invalid data blocks every price-dependent financial action.
- The contract FXRP balance is never below the sum of active `FUNDED` and `SUBMITTED` liabilities.
- Terminal records never become active again.
- No admin, arbitrary-recipient, rescue, fee, or unrestricted withdrawal path exists.

Direct unsolicited FXRP can make the contract balance greater than active liabilities. Equality is
not a valid invariant for an ERC-20 contract because a sender can transfer tokens without calling
ProofPay.

## Pinned compile probe

The Foundry project under `contracts/` pins:

| Dependency | Pin | Required surface |
| --- | --- | --- |
| Flare Foundry periphery | `0.1.52` / `ca264d6a31ddfb53d1bef7cb7bd1942aa89d323a` | Coston2 `IFlareContractRegistry`, `IAssetManager`, `FtsoV2Interface` |
| OpenZeppelin Contracts | `v5.7.0` / `cab19933c33c2ad1d4c7a84864a3601dddfd16f3` | `IERC20`, `SafeERC20`, `ReentrancyGuard` |
| forge-std | `v1.16.2` / `bf647bd6046f2f7da30d0c2bf435e5c76a780c1b` | Phase 3 Foundry tests and the narrow Phase 2 constant check |

`Phase2InterfaceProbe` is abstract, has no external entry point, and cannot be deployed. It proves
only that the pinned project compiles the registry-to-AssetManager-to-ERC-20 resolution, production
FTSOv2 read, SafeERC20 call, and ReentrancyGuard modifier. It is not `ProofPayEscrow` and contains
no invoice or settlement logic.

## Phase boundary

Phase 3 may implement the exact specification and test matrix in `CONTRACT_SPEC.md`. It must not
infer that the Phase 2 compile probe proves contract behavior, deployed addresses, economic safety,
or production security.
