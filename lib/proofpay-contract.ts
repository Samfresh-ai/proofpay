import { defineChain, getAddress, parseAbi } from "viem";

export const PROOFPAY_CHAIN_ID = 114 as const;
export const PROOFPAY_CHAIN_NAME = "Flare Testnet Coston2" as const;
export const PROOFPAY_RPC_URL = "https://coston2-api.flare.network/ext/C/rpc" as const;
export const PROOFPAY_CONTRACT_ADDRESS = getAddress(
  "0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21",
);
export const PROOFPAY_FXRP_ADDRESS = getAddress(
  "0x0b6A3645c240605887a5532109323A3E12273dc7",
);
export const PROOFPAY_FXRP_DECIMALS = 6 as const;
export const PROOFPAY_USD_DECIMALS = 6 as const;
export const PROOFPAY_FUNDING_PROTECTION_BPS = 1_000n;
export const PROOFPAY_BPS_DENOMINATOR = 10_000n;
export const PROOFPAY_DEFAULT_TOLERANCE_BPS = 200n;
export const PROOFPAY_MAX_TOLERANCE_BPS = 500n;
export const PROOFPAY_QUOTE_LIFETIME_SECONDS = 300n;

export const coston2 = defineChain({
  id: PROOFPAY_CHAIN_ID,
  name: PROOFPAY_CHAIN_NAME,
  nativeCurrency: {
    name: "Coston2 Flare",
    symbol: "C2FLR",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [PROOFPAY_RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: "Coston2 Explorer",
      url: "https://coston2-explorer.flare.network",
    },
  },
  testnet: true,
});

export const proofPayAbi = parseAbi([
  "function createInvoice(address client, uint256 usdTarget, uint64 deliveryDeadline, bytes32 scopeHash) returns (uint256 invoiceId)",
  "function quoteFunding(uint256 invoiceId) returns (uint256 requiredFxrp, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "function fundInvoice(uint256 invoiceId, uint256 maxFxrpAmount, uint64 quoteDeadline)",
  "function submitEvidence(uint256 invoiceId, bytes32 evidenceHash, string evidenceURI)",
  "function quoteRelease(uint256 invoiceId) returns (uint256 requiredPayoutFxrp, uint256 clientRefundFxrp, uint256 topUpFxrp, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "function topUp(uint256 invoiceId, uint256 maxTopUpFxrp, uint64 quoteDeadline)",
  "function release(uint256 invoiceId, uint256 maxPayoutFxrp, uint64 quoteDeadline)",
  "function cancelBeforeFunding(uint256 invoiceId)",
  "function refundUnsubmittedAfterDeadline(uint256 invoiceId)",
  "function invoices(uint256 invoiceId) view returns (address freelancer, address client, uint256 usdTarget, uint256 fxrpLocked, uint64 deliveryDeadline, bytes32 scopeHash, bytes32 evidenceHash, uint256 fundingPrice, int8 fundingPriceDecimals, uint64 fundingPriceTimestamp, uint256 releasePrice, int8 releasePriceDecimals, uint64 releasePriceTimestamp, uint8 status)",
  "function activeFxrpLiabilities() view returns (uint256)",
  "error InvoiceNotFound(uint256 invoiceId)",
  "error UnauthorizedCaller(address caller)",
  "error InvalidState(uint256 invoiceId, uint8 actual)",
  "error ExpiredQuote(uint64 quoteDeadline, uint256 currentTimestamp)",
  "error PriceReadFailed()",
  "error StalePrice(uint64 priceTimestamp, uint256 currentTimestamp, uint64 maximumAge)",
  "error InvalidPrice(uint256 value, int8 decimals, uint64 timestamp)",
  "error UnsupportedFtsoFee(uint256 fee)",
  "error AmountAboveClientMaximum(uint256 requiredFxrp, uint256 maximumFxrp)",
  "error InsufficientFXRP(uint256 availableFxrp, uint256 requiredFxrp)",
  "error UnexpectedFXRPReceived(uint256 expectedFxrp, uint256 receivedFxrp)",
  "error TopUpRequired(uint256 requiredFxrp, uint256 lockedFxrp, uint256 shortfallFxrp)",
  "error NoTopUpRequired(uint256 invoiceId)",
  "error DuplicateRelease(uint256 invoiceId)",
  "error DeadlineNotReached(uint64 deliveryDeadline, uint256 currentTimestamp)",
  "error DeliveryDeadlinePassed(uint64 deliveryDeadline, uint256 currentTimestamp)",
  "error InvalidAddress(address account)",
  "error InvalidAmount(uint256 amount)",
  "error InvalidHash()",
  "error InvalidEvidenceURI(uint256 length)",
  "error WrongChain(uint256 expectedChainId, uint256 actualChainId)",
  "error InvalidTokenDecimals(uint8 expectedDecimals, uint8 actualDecimals)",
  "event InvoiceCreated(uint256 indexed invoiceId, address indexed freelancer, address indexed client, uint256 usdTarget, uint64 deliveryDeadline, bytes32 scopeHash)",
  "event InvoiceFunded(uint256 indexed invoiceId, uint256 fxrpLocked, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "event EvidenceSubmitted(uint256 indexed invoiceId, bytes32 indexed evidenceHash, string evidenceURI)",
  "event InvoiceToppedUp(uint256 indexed invoiceId, uint256 amount, uint256 newFxrpLocked, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "event InvoiceReleased(uint256 indexed invoiceId, uint256 freelancerPayout, uint256 clientRefund, uint256 price, int8 priceDecimals, uint64 priceTimestamp)",
  "event InvoiceCancelled(uint256 indexed invoiceId)",
  "event InvoiceRefunded(uint256 indexed invoiceId, uint256 clientRefund)",
]);

export const fxrpAbi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);
