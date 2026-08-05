# ProofPay escrow contract specification

Last verified: 2026-08-05

This is the implementation contract for Phase 3. Solidity business logic does not exist in Phase
2. The abstract interface probe under `contracts/src/` is not the escrow.

## Constants and dependencies

```solidity
uint256 constant COSTON2_CHAIN_ID = 114;
uint8 constant USD_DECIMALS = 6;
uint8 constant FXRP_DECIMALS = 6;
uint16 constant PROTECTION_BPS = 1_000;
uint16 constant BPS_DENOMINATOR = 10_000;
uint64 constant MAX_PRICE_AGE = 30 seconds;
uint256 constant MAX_EVIDENCE_URI_BYTES = 256;

bytes21 constant XRP_USD_FEED_ID =
    0x015852502f55534400000000000000000000000000;
```

The future contract receives one `IERC20Metadata` FXRP address and one `FtsoV2Interface` address
as constructor arguments resolved by the Coston2 deployment script. Both are immutable. The
constructor requires chain ID `114`, nonzero addresses with code, and FXRP decimals equal to six.
No party address is a constructor argument.

The implementation uses OpenZeppelin `SafeERC20`, `ReentrancyGuard`, and `Math.mulDiv`. It has no
owner or admin role.

## Persistent types and storage

```solidity
enum InvoiceStatus {
    CREATED,
    FUNDED,
    SUBMITTED,
    RELEASED,
    CANCELLED,
    REFUNDED
}

struct Invoice {
    address freelancer;
    address client;
    uint256 usdTarget;
    uint256 fxrpLocked;
    uint64 deliveryDeadline;
    bytes32 scopeHash;
    bytes32 evidenceHash;
    uint256 fundingPrice;
    int8 fundingPriceDecimals;
    uint64 fundingPriceTimestamp;
    uint256 releasePrice;
    int8 releasePriceDecimals;
    uint64 releasePriceTimestamp;
    InvoiceStatus status;
}

mapping(uint256 invoiceId => Invoice invoice) public invoices;
uint256 private nextInvoiceId = 1;
```

`usdTarget` is in `10^-6 USD`. `fxrpLocked` is in `10^-6 FXRP`. Price values retain the raw FTSO
integer and its returned decimals. Invoice IDs start at one; `freelancer == address(0)` identifies
an unused mapping entry.

`fxrpLocked` is the total amount deposited for the invoice. It only increases while active and is
preserved after release or refund as historical receipt data. The active liability is zero for a
terminal status.

Fields written at creation become immutable after funding. Funding, evidence, and release
observations are each written at most once. Top-up does not overwrite the original funding
observation.

## Constructor

```solidity
constructor(IERC20Metadata fxrp_, FtsoV2Interface ftsoV2_);
```

Required behavior:

1. Revert unless `block.chainid == 114`.
2. Reject either zero address or either address without contract code.
3. Require `fxrp_.decimals() == 6`.
4. Store both dependencies as immutables.
5. Create no owner, admin, treasury, or withdrawal authority.

The deployment script resolves the token through
`IFlareContractRegistry -> AssetManagerFXRP -> IAssetManager.fAsset()` and resolves `FtsoV2`
through the same registry. The escrow never embeds a burner wallet or a Phase 1 resolved protocol
address.

## Exact function surface

```solidity
function createInvoice(
    address client,
    uint256 usdTarget,
    uint64 deliveryDeadline,
    bytes32 scopeHash
) external returns (uint256 invoiceId);

function quoteFunding(
    uint256 invoiceId
) external returns (
    uint256 requiredFxrp,
    uint256 price,
    int8 priceDecimals,
    uint64 priceTimestamp
);

function fundInvoice(
    uint256 invoiceId,
    uint256 maxFxrpAmount,
    uint64 quoteDeadline
) external;

function submitEvidence(
    uint256 invoiceId,
    bytes32 evidenceHash,
    string calldata evidenceURI
) external;

function quoteRelease(
    uint256 invoiceId
) external returns (
    uint256 requiredPayoutFxrp,
    uint256 clientRefundFxrp,
    uint256 topUpFxrp,
    uint256 price,
    int8 priceDecimals,
    uint64 priceTimestamp
);

function topUp(
    uint256 invoiceId,
    uint256 maxTopUpFxrp,
    uint64 quoteDeadline
) external;

function release(
    uint256 invoiceId,
    uint256 maxPayoutFxrp,
    uint64 quoteDeadline
) external;

function cancelBeforeFunding(uint256 invoiceId) external;

function refundUnsubmittedAfterDeadline(uint256 invoiceId) external;
```

`quoteFunding` and `quoteRelease` are not `view` because the official production
`FtsoV2Interface.getFeedById` function is payable and not declared `view`. They change no ProofPay
storage and are intended to be previewed with `eth_call` or an equivalent simulation.

## Function behavior

### `createInvoice`

Caller: anyone; the caller becomes the freelancer.

Checks:

- `client` is nonzero and differs from `msg.sender`;
- `usdTarget > 0`;
- `deliveryDeadline > block.timestamp`;
- `scopeHash != bytes32(0)`.

Effects:

- allocate the current `nextInvoiceId`, then increment it;
- store the parties, target, deadline, scope hash, and `CREATED`;
- leave funding, evidence, release, and locked-amount fields zero;
- emit `InvoiceCreated`.

### `quoteFunding`

Caller: anyone.

Checks:

- invoice exists and is `CREATED`;
- `block.timestamp < deliveryDeadline`;
- the XRP/USD observation passes every validity and freshness rule.

Returns the two-stage upward-rounded amount defined under Price and rounding, plus the exact raw
price observation used. It does not reserve a price or mutate the invoice.

### `fundInvoice`

Caller: the named client only. Modifier: `nonReentrant`.

Checks, in order:

1. invoice exists, caller is the client, and status is `CREATED`;
2. `block.timestamp < deliveryDeadline`;
3. `block.timestamp <= quoteDeadline` and `maxFxrpAmount > 0`;
4. a new XRP/USD read is valid and fresh;
5. calculated protected funding is not above `maxFxrpAmount`;
6. the client has at least the calculated FXRP amount; token allowance and transfer succeed;
7. the escrow balance increases by exactly the calculated amount.

Effects and interactions:

- write `fxrpLocked`, the raw funding price, returned decimals, and feed timestamp;
- set status to `FUNDED` before the external token call;
- call `safeTransferFrom(client, address(this), requiredFxrp)` for only the calculated amount;
- verify the balance delta and emit `InvoiceFunded`.

Any failure reverts the complete transaction, including the status change.

### `submitEvidence`

Caller: the freelancer only.

Checks:

- invoice exists and is `FUNDED`;
- `block.timestamp <= deliveryDeadline`;
- `evidenceHash != bytes32(0)`;
- `bytes(evidenceURI).length` is between one and 256 inclusive.

Effects:

- store the evidence hash once;
- set status to `SUBMITTED`;
- emit the same hash and the opaque URI in `EvidenceSubmitted`.

The hash is `keccak256` of the exact evidence-manifest bytes. The manifest may contain the public
delivery URL and short completion note. The contract does not fetch, parse, sanitize, or judge it.

### `quoteRelease`

Caller: anyone.

Checks:

- invoice exists and is `SUBMITTED`;
- a new XRP/USD read is valid and fresh.

Returns the upward-rounded payout requirement and exact observation. When `fxrpLocked` is
sufficient, `clientRefundFxrp = fxrpLocked - requiredPayoutFxrp` and `topUpFxrp = 0`. When it is
insufficient, the refund is zero and `topUpFxrp = requiredPayoutFxrp - fxrpLocked`. The function
does not transfer or mutate anything.

### `topUp`

Caller: the client only. Modifier: `nonReentrant`.

Checks:

1. invoice exists and is `SUBMITTED`;
2. `block.timestamp <= quoteDeadline` and `maxTopUpFxrp > 0`;
3. a new XRP/USD read is valid and fresh;
4. the current payout requirement exceeds `fxrpLocked`;
5. the exact shortfall is not above `maxTopUpFxrp`;
6. the client has at least the shortfall; token allowance and transfer succeed;
7. the escrow balance increases by exactly the shortfall.

Effects and interactions:

- increase `fxrpLocked` by only the shortfall and keep status `SUBMITTED`;
- perform `safeTransferFrom` after the effect;
- verify the balance delta;
- emit `InvoiceToppedUp` with the top-up observation.

A later release always reads the feed again. If XRP falls further, another exact top-up can be
required. If the price rises, release refunds the new excess.

### `release`

Caller: the client only. Modifier: `nonReentrant`.

Checks, in order:

1. an existing `RELEASED` invoice raises `DuplicateRelease`;
2. otherwise the invoice must be `SUBMITTED` and the caller must be its client;
3. `block.timestamp <= quoteDeadline` and `maxPayoutFxrp > 0`;
4. a new XRP/USD read is valid and fresh;
5. the payout requirement is not above `maxPayoutFxrp`;
6. `fxrpLocked` covers the payout requirement.

If coverage fails, raise `TopUpRequired` with the required, locked, and shortfall amounts. No state
or balance changes.

When coverage succeeds:

- calculate `clientRefund = fxrpLocked - requiredPayout`;
- store the raw release price, returned decimals, and feed timestamp;
- set status to `RELEASED` before external calls;
- `safeTransfer` the required payout to the freelancer;
- if nonzero, `safeTransfer` the refund to the client;
- emit `InvoiceReleased`.

The caller-supplied maximum protects the client from a lower XRP price consuming more locked FXRP
than the preview showed. The quote deadline limits the time in which that guard can be used.

### `cancelBeforeFunding`

Caller: the freelancer only.

The invoice must be `CREATED`. Set `CANCELLED` and emit `InvoiceCancelled`. No token or oracle call
occurs. Neither party can cancel after funding.

### `refundUnsubmittedAfterDeadline`

Caller: the client only. Modifier: `nonReentrant`.

The invoice must be `FUNDED`, and `block.timestamp` must be strictly greater than
`deliveryDeadline`. Set `REFUNDED` before calling `safeTransfer(client, fxrpLocked)`, then emit
`InvoiceRefunded`. Return the full locked FXRP; no price read is needed.

This path is unavailable after evidence moves the invoice to `SUBMITTED`. A refusing client cannot
use it to reclaim submitted work, and the freelancer has no unilateral release path.

## Price validity and freshness

Every quote, funding, top-up, or release calls:

```solidity
ftsoV2.getFeedById(XRP_USD_FEED_ID)
```

with zero native value and consumes all three returned values. One internal
`_readFreshXrpUsdPrice()` helper is enough; no generic oracle adapter is introduced.

Validation order:

1. If the call reverts, raise `PriceReadFailed` and do not use cached data.
2. Reject `value == 0`.
3. Reject `decimals < 0` or `decimals > 18`.
4. Reject `timestamp == 0` or `timestamp > block.timestamp`.
5. Reject `block.timestamp - timestamp > 30 seconds` as stale.

An observation exactly 30 seconds old is accepted. The returned timestamp is the feed update
timestamp, not the transaction timestamp. The raw value and decimals are returned by quote
functions and persisted for funding or successful release.

Flare documents block-latency feeds as updating approximately every 1.8 seconds. Thirty seconds is
a ProofPay fail-closed policy with roughly sixteen expected update opportunities, not an official
guarantee. If the currently free feed starts requiring a fee, zero-value reads revert and the MVP
halts price-dependent actions rather than accepting C2FLR it cannot withdraw.

## Price and rounding math

Let:

- `U` be `usdTarget` in `10^-6 USD`;
- `P` be the positive raw XRP/USD FTSO value;
- `d` be its validated returned decimals;
- one FXRP atomic unit be `10^-6 FXRP`.

The six decimals on USD and FXRP cancel algebraically. Required FXRP atomic units are:

```text
required(U, P, d) = ceil(U * 10^d / P)
```

The implementation must use full-precision multiplication and upward rounding:

```solidity
uint256 scale = 10 ** uint8(d);
uint256 required = Math.mulDiv(U, scale, P, Math.Rounding.Ceil);
```

Do not multiply and divide naively, convert through floating point, or use an addition-based ceil
formula that can overflow.

### Funding

Funding protection is fixed at 10%:

```text
baseRequired = required(U, fundingPrice, fundingDecimals)
fundingRequired = ceil(baseRequired * 11_000 / 10_000)
```

The two upward-rounded stages are intentional. The freelancer cannot lose an atomic unit to either
the target conversion or the buffer calculation. `fundInvoice` rejects
`fundingRequired > maxFxrpAmount` and transfers exactly `fundingRequired`.

### Release

```text
payoutRequired = required(U, releasePrice, releaseDecimals)

if fxrpLocked >= payoutRequired:
    freelancerPayout = payoutRequired
    clientRefund = fxrpLocked - payoutRequired
    topUp = 0
else:
    freelancerPayout = 0
    clientRefund = 0
    topUp = payoutRequired - fxrpLocked
```

The sufficient branch gives `freelancerPayout + clientRefund == fxrpLocked`. The insufficient
branch transfers zero, so a refund can never cause the sum to exceed locked FXRP.

### Worked integer examples

Use a `$100.000000` invoice:

```text
U = 100_000_000
funding P = 1_000_000
funding d = 6

baseRequired = ceil(100_000_000 * 1_000_000 / 1_000_000)
             = 100_000_000 atomic FXRP

fxrpLocked = ceil(100_000_000 * 11_000 / 10_000)
           = 110_000_000 atomic FXRP
           = 110.000000 FXRP
```

| Scenario | Release `P`, `d=6` | Upward-rounded payout | Client refund | Exact top-up |
| --- | ---: | ---: | ---: | ---: |
| XRP price rises to `$1.250000` | `1_250_000` | `80.000000 FXRP` | `30.000000 FXRP` | `0` |
| Price remains `$1.000000` | `1_000_000` | `100.000000 FXRP` | `10.000000 FXRP` | `0` |
| Price falls to `$0.950000` | `950_000` | `105.263158 FXRP` | `4.736842 FXRP` | `0` |
| Price falls to `$0.900000` | `900_000` | `111.111112 FXRP` | `0` | `1.111112 FXRP` |

For `$0.950000`, integer division yields `105_263_157` with a remainder, so payout rounds up to
`105_263_158`. For `$0.900000`, it rounds up to `111_111_112`, which is `1_111_112` atomic units
above the locked amount. Release transfers nothing until the shortfall is supplied.

A 10% token buffer covers a price decline only to `1 / 1.10`, about 9.09%, because the required
token quantity is reciprocal to price. The `$0.900000` example is therefore correctly beyond the
buffer.

## Events

```solidity
event InvoiceCreated(
    uint256 indexed invoiceId,
    address indexed freelancer,
    address indexed client,
    uint256 usdTarget,
    uint64 deliveryDeadline,
    bytes32 scopeHash
);

event InvoiceFunded(
    uint256 indexed invoiceId,
    uint256 fxrpLocked,
    uint256 price,
    int8 priceDecimals,
    uint64 priceTimestamp
);

event EvidenceSubmitted(
    uint256 indexed invoiceId,
    bytes32 indexed evidenceHash,
    string evidenceURI
);

event InvoiceToppedUp(
    uint256 indexed invoiceId,
    uint256 amount,
    uint256 newFxrpLocked,
    uint256 price,
    int8 priceDecimals,
    uint64 priceTimestamp
);

event InvoiceReleased(
    uint256 indexed invoiceId,
    uint256 freelancerPayout,
    uint256 clientRefund,
    uint256 price,
    int8 priceDecimals,
    uint64 priceTimestamp
);

event InvoiceCancelled(uint256 indexed invoiceId);

event InvoiceRefunded(uint256 indexed invoiceId, uint256 clientRefund);
```

No generic status-change, quote, or duplicate transfer event is emitted. The seven lifecycle
events are the public settlement receipt.

## Custom errors

```solidity
error InvoiceNotFound(uint256 invoiceId);
error UnauthorizedCaller(address caller);
error InvalidState(uint256 invoiceId, InvoiceStatus actual);
error ExpiredQuote(uint64 quoteDeadline, uint256 currentTimestamp);
error PriceReadFailed();
error StalePrice(uint64 priceTimestamp, uint256 currentTimestamp, uint64 maximumAge);
error InvalidPrice(uint256 value, int8 decimals, uint64 timestamp);
error AmountAboveClientMaximum(uint256 requiredFxrp, uint256 maximumFxrp);
error InsufficientFXRP(uint256 availableFxrp, uint256 requiredFxrp);
error UnexpectedFXRPReceived(uint256 expectedFxrp, uint256 receivedFxrp);
error TopUpRequired(uint256 requiredFxrp, uint256 lockedFxrp, uint256 shortfallFxrp);
error NoTopUpRequired(uint256 invoiceId);
error DuplicateRelease(uint256 invoiceId);
error DeadlineNotReached(uint64 deliveryDeadline, uint256 currentTimestamp);
error DeliveryDeadlinePassed(uint64 deliveryDeadline, uint256 currentTimestamp);
error InvalidAddress(address account);
error InvalidAmount(uint256 amount);
error InvalidHash();
error InvalidEvidenceURI(uint256 length);
error WrongChain(uint256 expectedChainId, uint256 actualChainId);
error InvalidTokenDecimals(uint8 expectedDecimals, uint8 actualDecimals);
```

Use custom errors at the contract boundary and preserve OpenZeppelin token-call errors when the
fixed FXRP contract rejects an allowance or transfer. Do not add generic string reverts.

## Checks, effects, and interactions

Financial functions are `nonReentrant` and follow this order:

1. verify existence, state, role, deadline, maximum, and fresh price;
2. calculate with full-precision upward rounding;
3. write the next legal state or locked amount;
4. call FXRP through `SafeERC20`;
5. verify incoming balance deltas where FXRP enters;
6. emit the lifecycle event.

A revert from any later check rolls back the earlier effect. No external call occurs before role,
state, deadline, and quote protection are accepted.

There is no arbitrary token recipient. Payout goes only to the stored freelancer; excess and
missed-delivery refunds go only to the stored client.

## Phase 3 test matrix

### Unit tests

| Case | Required observation |
| --- | --- |
| Successful creation | Sequential ID, exact fields, `CREATED`, `InvoiceCreated` |
| Invalid creation | Zero/same address, zero target/hash, nonfuture deadline revert |
| Unauthorized actions | Every state-changing function rejects the wrong role |
| Exact funding quote | Fixed mock value/decimals/timestamp returns exact two-stage amount |
| Upward rounding | One-atomic-unit remainder rounds up at base, buffer, and payout |
| Expired quote | Equality accepted; one second later rejected for fund/top-up/release |
| Stale price | Age 30 accepted; age 31 rejected; no state change |
| Invalid price | Zero, future/zero timestamp, negative or greater-than-18 decimals, oracle revert |
| Successful funding | Exact transfer, balance delta, funding observation, `FUNDED` |
| Incoming token mismatch | Short or otherwise unexpected funding/top-up balance delta reverts all effects |
| Duplicate or late funding | Second funding and funding at/after delivery deadline revert |
| Evidence submission | Hash stored, URI emitted, equality deadline accepted, duplicate rejected |
| Invalid evidence | Zero hash, empty or 257-byte URI, and submission after the deadline revert |
| Price increase at release | `$1.25` example pays 80 and refunds 30 |
| Stable price | `$1.00` example pays 100 and refunds 10 |
| Decrease within buffer | `$0.95` example pays `105.263158` and refunds `4.736842` |
| Decrease beyond buffer | `$0.90` exposes `1.111112`, transfers zero, preserves `SUBMITTED` |
| Exact top-up | Transfers only current shortfall and keeps `SUBMITTED` |
| Top-up guards | Wrong state, no shortfall, expired quote, and above-maximum revert |
| Successful release | Stores release observation; payout plus refund equals locked |
| Double release | Explicit `DuplicateRelease`; no second transfer |
| Cancellation | Freelancer only, `CREATED` only, terminal afterward |
| Missed-deadline refund | Client only, strictly after deadline, full locked FXRP returned |
| Submitted refusal limit | `SUBMITTED` cannot use missed-deadline refund or unilateral release |
| Reentrancy attempt | Malicious token callbacks fail on fund, top-up, release, and refund |
| Constructor guards | Wrong chain, zero/code-less dependencies, and non-six-decimal FXRP revert |

### Fuzz tests

- For bounded `U > 0`, `P > 0`, and `d` in `0..18`, `required * P >= U * 10^d`
  using full-precision comparison.
- When `required > 0`, one fewer atomic unit fails the rational target inequality.
- Funding always equals the upward-rounded base followed by the upward-rounded 10% buffer.
- For arbitrary sufficient `fxrpLocked`, payout plus refund equals locked FXRP.
- For arbitrary insufficient `fxrpLocked`, top-up equals required minus locked and all transfers are
  zero.
- Maximum guards accept equality and reject a required amount one unit above the maximum.
- Deadline and freshness guards accept equality and reject one second beyond it.

### Stateful invariants

- Only the documented state transitions are reachable.
- No invoice funds, submits, refunds, cancels, or releases twice.
- Terminal state and funded terms remain immutable under arbitrary authorized/unauthorized calls.
- The contract FXRP balance never falls below the sum of active invoice liabilities.
- Successful outgoing FXRP attributed to one invoice never exceeds that invoice's deposits.
- Every successful release meets the USD target under its recorded accepted observation.
- Invalid or stale oracle actions leave status, `fxrpLocked`, and token balances unchanged.
- Only the role-authorized handler can cause each transition.
- No callable path transfers FXRP to an arbitrary address or privileged administrator.

Phase 2 contains only the constant/import compile check. These unit, fuzz, and invariant tests are
required with the Phase 3 implementation and are not claimed as run here.

## Explicit limitations and non-goals

- A client may refuse release forever after evidence is submitted.
- Evidence hash and URI establish an immutable public submission, not truth, quality, copyright,
  or legal delivery.
- No mediator, arbitration, automatic release, emergency withdrawal, admin pause, upgradeability,
  fee, treasury, token rescue, multi-token support, factory, batch operation, or cross-chain path
  exists.
- A future nonzero FTSOv2 read fee requires an architecture revision.
- Unsolicited FXRP sent directly to the contract is stranded because no withdrawal path exists.
- Production security requires the implemented Phase 3 tests, deployment checks, and later review;
  this specification and compile probe are not an audit.
