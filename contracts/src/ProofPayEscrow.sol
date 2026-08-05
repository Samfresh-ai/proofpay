// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { FtsoV2Interface } from "flare-periphery/src/coston2/FtsoV2Interface.sol";

/// @notice One-milestone FXRP escrow for USD-targeted invoices on Coston2.
/// @dev Submitted invoices have no arbitration, timeout refund, or forced-release path.
contract ProofPayEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant COSTON2_CHAIN_ID = 114;
    uint8 public constant USD_DECIMALS = 6;
    uint8 public constant FXRP_DECIMALS = 6;
    uint16 public constant PROTECTION_BPS = 1_000;
    uint16 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_EVIDENCE_URI_BYTES = 256;

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

    struct PriceObservation {
        uint256 value;
        int8 decimals;
        uint64 timestamp;
    }

    IERC20Metadata public immutable fxrp;
    FtsoV2Interface public immutable ftsoV2;
    bytes21 public immutable xrpUsdFeedId;
    uint64 public immutable maximumPriceAge;

    mapping(uint256 invoiceId => Invoice invoice) public invoices;
    uint256 public activeFxrpLiabilities;

    uint256 private nextInvoiceId = 1;

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
        uint256 indexed invoiceId, bytes32 indexed evidenceHash, string evidenceURI
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

    error InvoiceNotFound(uint256 invoiceId);
    error UnauthorizedCaller(address caller);
    error InvalidState(uint256 invoiceId, InvoiceStatus actual);
    error ExpiredQuote(uint64 quoteDeadline, uint256 currentTimestamp);
    error PriceReadFailed();
    error StalePrice(uint64 priceTimestamp, uint256 currentTimestamp, uint64 maximumAge);
    error InvalidPrice(uint256 value, int8 decimals, uint64 timestamp);
    error UnsupportedFtsoFee(uint256 fee);
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

    constructor(
        IERC20Metadata fxrp_,
        FtsoV2Interface ftsoV2_,
        bytes21 xrpUsdFeedId_,
        uint64 maximumPriceAge_
    ) {
        if (block.chainid != COSTON2_CHAIN_ID) {
            revert WrongChain(COSTON2_CHAIN_ID, block.chainid);
        }
        if (address(fxrp_) == address(0) || address(fxrp_).code.length == 0) {
            revert InvalidAddress(address(fxrp_));
        }
        if (address(ftsoV2_) == address(0) || address(ftsoV2_).code.length == 0) {
            revert InvalidAddress(address(ftsoV2_));
        }
        if (xrpUsdFeedId_ == bytes21(0)) revert InvalidHash();
        if (maximumPriceAge_ == 0) revert InvalidAmount(maximumPriceAge_);

        uint8 actualDecimals = fxrp_.decimals();
        if (actualDecimals != FXRP_DECIMALS) {
            revert InvalidTokenDecimals(FXRP_DECIMALS, actualDecimals);
        }

        fxrp = fxrp_;
        ftsoV2 = ftsoV2_;
        xrpUsdFeedId = xrpUsdFeedId_;
        maximumPriceAge = maximumPriceAge_;
    }

    function createInvoice(
        address client,
        uint256 usdTarget,
        uint64 deliveryDeadline,
        bytes32 scopeHash
    ) external returns (uint256 invoiceId) {
        if (client == address(0) || client == msg.sender) {
            revert InvalidAddress(client);
        }
        if (usdTarget == 0) revert InvalidAmount(usdTarget);
        if (deliveryDeadline <= block.timestamp) {
            revert DeliveryDeadlinePassed(deliveryDeadline, block.timestamp);
        }
        if (scopeHash == bytes32(0)) revert InvalidHash();

        invoiceId = nextInvoiceId;
        nextInvoiceId = invoiceId + 1;

        Invoice storage invoice = invoices[invoiceId];
        invoice.freelancer = msg.sender;
        invoice.client = client;
        invoice.usdTarget = usdTarget;
        invoice.deliveryDeadline = deliveryDeadline;
        invoice.scopeHash = scopeHash;
        invoice.status = InvoiceStatus.CREATED;

        emit InvoiceCreated(invoiceId, msg.sender, client, usdTarget, deliveryDeadline, scopeHash);
    }

    function quoteFunding(uint256 invoiceId)
        external
        returns (uint256 requiredFxrp, uint256 price, int8 priceDecimals, uint64 priceTimestamp)
    {
        Invoice storage invoice = _existingInvoice(invoiceId);
        _requireState(invoiceId, invoice, InvoiceStatus.CREATED);
        if (block.timestamp >= invoice.deliveryDeadline) {
            revert DeliveryDeadlinePassed(invoice.deliveryDeadline, block.timestamp);
        }

        PriceObservation memory observation = _readFreshXrpUsdPrice();
        requiredFxrp =
            _fundingRequirement(invoice.usdTarget, observation.value, observation.decimals);
        return (requiredFxrp, observation.value, observation.decimals, observation.timestamp);
    }

    function fundInvoice(uint256 invoiceId, uint256 maxFxrpAmount, uint64 quoteDeadline)
        external
        nonReentrant
    {
        Invoice storage invoice = _existingInvoice(invoiceId);
        _requireCaller(invoice.client);
        _requireState(invoiceId, invoice, InvoiceStatus.CREATED);
        if (block.timestamp >= invoice.deliveryDeadline) {
            revert DeliveryDeadlinePassed(invoice.deliveryDeadline, block.timestamp);
        }
        _requireLiveQuote(quoteDeadline, maxFxrpAmount);

        PriceObservation memory observation = _readFreshXrpUsdPrice();
        uint256 requiredFxrp =
            _fundingRequirement(invoice.usdTarget, observation.value, observation.decimals);
        if (requiredFxrp > maxFxrpAmount) {
            revert AmountAboveClientMaximum(requiredFxrp, maxFxrpAmount);
        }

        uint256 availableFxrp = fxrp.balanceOf(invoice.client);
        if (availableFxrp < requiredFxrp) {
            revert InsufficientFXRP(availableFxrp, requiredFxrp);
        }
        uint256 balanceBefore = fxrp.balanceOf(address(this));
        _requireCurrentSolvency(balanceBefore);

        invoice.fxrpLocked = requiredFxrp;
        invoice.fundingPrice = observation.value;
        invoice.fundingPriceDecimals = observation.decimals;
        invoice.fundingPriceTimestamp = observation.timestamp;
        invoice.status = InvoiceStatus.FUNDED;
        activeFxrpLiabilities += requiredFxrp;

        IERC20(address(fxrp)).safeTransferFrom(invoice.client, address(this), requiredFxrp);
        _requireExactIncomingBalance(balanceBefore, requiredFxrp);

        emit InvoiceFunded(
            invoiceId, requiredFxrp, observation.value, observation.decimals, observation.timestamp
        );
    }

    function submitEvidence(uint256 invoiceId, bytes32 evidenceHash, string calldata evidenceURI)
        external
    {
        Invoice storage invoice = _existingInvoice(invoiceId);
        _requireCaller(invoice.freelancer);
        _requireState(invoiceId, invoice, InvoiceStatus.FUNDED);
        if (block.timestamp > invoice.deliveryDeadline) {
            revert DeliveryDeadlinePassed(invoice.deliveryDeadline, block.timestamp);
        }
        if (evidenceHash == bytes32(0)) revert InvalidHash();

        uint256 uriLength = bytes(evidenceURI).length;
        if (uriLength == 0 || uriLength > MAX_EVIDENCE_URI_BYTES) {
            revert InvalidEvidenceURI(uriLength);
        }

        invoice.evidenceHash = evidenceHash;
        invoice.status = InvoiceStatus.SUBMITTED;

        emit EvidenceSubmitted(invoiceId, evidenceHash, evidenceURI);
    }

    function quoteRelease(uint256 invoiceId)
        external
        returns (
            uint256 requiredPayoutFxrp,
            uint256 clientRefundFxrp,
            uint256 topUpFxrp,
            uint256 price,
            int8 priceDecimals,
            uint64 priceTimestamp
        )
    {
        Invoice storage invoice = _existingInvoice(invoiceId);
        _requireState(invoiceId, invoice, InvoiceStatus.SUBMITTED);

        PriceObservation memory observation = _readFreshXrpUsdPrice();
        requiredPayoutFxrp =
            _requiredFxrp(invoice.usdTarget, observation.value, observation.decimals);
        if (invoice.fxrpLocked >= requiredPayoutFxrp) {
            clientRefundFxrp = invoice.fxrpLocked - requiredPayoutFxrp;
        } else {
            topUpFxrp = requiredPayoutFxrp - invoice.fxrpLocked;
        }
        return (
            requiredPayoutFxrp,
            clientRefundFxrp,
            topUpFxrp,
            observation.value,
            observation.decimals,
            observation.timestamp
        );
    }

    function topUp(uint256 invoiceId, uint256 maxTopUpFxrp, uint64 quoteDeadline)
        external
        nonReentrant
    {
        Invoice storage invoice = _existingInvoice(invoiceId);
        _requireCaller(invoice.client);
        _requireState(invoiceId, invoice, InvoiceStatus.SUBMITTED);
        _requireLiveQuote(quoteDeadline, maxTopUpFxrp);

        PriceObservation memory observation = _readFreshXrpUsdPrice();
        uint256 requiredPayout =
            _requiredFxrp(invoice.usdTarget, observation.value, observation.decimals);
        if (requiredPayout <= invoice.fxrpLocked) revert NoTopUpRequired(invoiceId);

        uint256 shortfall = requiredPayout - invoice.fxrpLocked;
        if (shortfall > maxTopUpFxrp) {
            revert AmountAboveClientMaximum(shortfall, maxTopUpFxrp);
        }

        uint256 availableFxrp = fxrp.balanceOf(invoice.client);
        if (availableFxrp < shortfall) revert InsufficientFXRP(availableFxrp, shortfall);
        uint256 balanceBefore = fxrp.balanceOf(address(this));
        _requireCurrentSolvency(balanceBefore);

        invoice.fxrpLocked += shortfall;
        activeFxrpLiabilities += shortfall;

        IERC20(address(fxrp)).safeTransferFrom(invoice.client, address(this), shortfall);
        _requireExactIncomingBalance(balanceBefore, shortfall);

        emit InvoiceToppedUp(
            invoiceId,
            shortfall,
            invoice.fxrpLocked,
            observation.value,
            observation.decimals,
            observation.timestamp
        );
    }

    function release(uint256 invoiceId, uint256 maxPayoutFxrp, uint64 quoteDeadline)
        external
        nonReentrant
    {
        Invoice storage invoice = _existingInvoice(invoiceId);
        if (invoice.status == InvoiceStatus.RELEASED) revert DuplicateRelease(invoiceId);
        _requireCaller(invoice.client);
        _requireState(invoiceId, invoice, InvoiceStatus.SUBMITTED);
        _requireLiveQuote(quoteDeadline, maxPayoutFxrp);

        PriceObservation memory observation = _readFreshXrpUsdPrice();
        uint256 requiredPayout =
            _requiredFxrp(invoice.usdTarget, observation.value, observation.decimals);
        if (requiredPayout > maxPayoutFxrp) {
            revert AmountAboveClientMaximum(requiredPayout, maxPayoutFxrp);
        }
        if (invoice.fxrpLocked < requiredPayout) {
            revert TopUpRequired(
                requiredPayout, invoice.fxrpLocked, requiredPayout - invoice.fxrpLocked
            );
        }

        uint256 lockedFxrp = invoice.fxrpLocked;
        uint256 balanceBefore = fxrp.balanceOf(address(this));
        _requireCurrentSolvency(balanceBefore);
        uint256 clientRefund = lockedFxrp - requiredPayout;

        invoice.releasePrice = observation.value;
        invoice.releasePriceDecimals = observation.decimals;
        invoice.releasePriceTimestamp = observation.timestamp;
        invoice.status = InvoiceStatus.RELEASED;
        activeFxrpLiabilities -= lockedFxrp;

        IERC20(address(fxrp)).safeTransfer(invoice.freelancer, requiredPayout);
        if (clientRefund != 0) {
            IERC20(address(fxrp)).safeTransfer(invoice.client, clientRefund);
        }
        _requireExactOutgoingBalance(balanceBefore, lockedFxrp);

        emit InvoiceReleased(
            invoiceId,
            requiredPayout,
            clientRefund,
            observation.value,
            observation.decimals,
            observation.timestamp
        );
    }

    function cancelBeforeFunding(uint256 invoiceId) external {
        Invoice storage invoice = _existingInvoice(invoiceId);
        _requireCaller(invoice.freelancer);
        _requireState(invoiceId, invoice, InvoiceStatus.CREATED);

        invoice.status = InvoiceStatus.CANCELLED;
        emit InvoiceCancelled(invoiceId);
    }

    function refundUnsubmittedAfterDeadline(uint256 invoiceId) external nonReentrant {
        Invoice storage invoice = _existingInvoice(invoiceId);
        _requireCaller(invoice.client);
        _requireState(invoiceId, invoice, InvoiceStatus.FUNDED);
        if (block.timestamp <= invoice.deliveryDeadline) {
            revert DeadlineNotReached(invoice.deliveryDeadline, block.timestamp);
        }

        uint256 lockedFxrp = invoice.fxrpLocked;
        uint256 balanceBefore = fxrp.balanceOf(address(this));
        _requireCurrentSolvency(balanceBefore);

        invoice.status = InvoiceStatus.REFUNDED;
        activeFxrpLiabilities -= lockedFxrp;

        IERC20(address(fxrp)).safeTransfer(invoice.client, lockedFxrp);
        _requireExactOutgoingBalance(balanceBefore, lockedFxrp);

        emit InvoiceRefunded(invoiceId, lockedFxrp);
    }

    function _existingInvoice(uint256 invoiceId) internal view returns (Invoice storage invoice) {
        invoice = invoices[invoiceId];
        if (invoice.freelancer == address(0)) revert InvoiceNotFound(invoiceId);
    }

    function _requireCaller(address expectedCaller) internal view {
        if (msg.sender != expectedCaller) revert UnauthorizedCaller(msg.sender);
    }

    function _requireState(uint256 invoiceId, Invoice storage invoice, InvoiceStatus expectedStatus)
        internal
        view
    {
        if (invoice.status != expectedStatus) {
            revert InvalidState(invoiceId, invoice.status);
        }
    }

    function _requireLiveQuote(uint64 quoteDeadline, uint256 maximumAmount) internal view {
        if (block.timestamp > quoteDeadline) {
            revert ExpiredQuote(quoteDeadline, block.timestamp);
        }
        if (maximumAmount == 0) revert InvalidAmount(maximumAmount);
    }

    function _readFreshXrpUsdPrice() internal returns (PriceObservation memory observation) {
        uint256 fee;
        try ftsoV2.calculateFeeById(xrpUsdFeedId) returns (uint256 calculatedFee) {
            fee = calculatedFee;
        } catch {
            revert PriceReadFailed();
        }
        if (fee != 0) revert UnsupportedFtsoFee(fee);

        uint256 value;
        int8 decimals;
        uint64 timestamp;
        try ftsoV2.getFeedById{ value: 0 }(xrpUsdFeedId) returns (
            uint256 feedValue, int8 feedDecimals, uint64 feedTimestamp
        ) {
            value = feedValue;
            decimals = feedDecimals;
            timestamp = feedTimestamp;
        } catch {
            revert PriceReadFailed();
        }

        if (
            value == 0 || decimals < 0 || decimals > 18 || timestamp == 0
                || timestamp > block.timestamp
        ) {
            revert InvalidPrice(value, decimals, timestamp);
        }
        if (block.timestamp - timestamp > maximumPriceAge) {
            revert StalePrice(timestamp, block.timestamp, maximumPriceAge);
        }
        observation = PriceObservation({ value: value, decimals: decimals, timestamp: timestamp });
    }

    function _requiredFxrp(uint256 usdTarget, uint256 price, int8 priceDecimals)
        internal
        pure
        returns (uint256)
    {
        // The only caller passes the 0..18 value validated by _readFreshXrpUsdPrice.
        uint256 scale = 10 ** uint8(priceDecimals);
        return Math.mulDiv(usdTarget, scale, price, Math.Rounding.Ceil);
    }

    function _fundingRequirement(uint256 usdTarget, uint256 price, int8 priceDecimals)
        internal
        pure
        returns (uint256)
    {
        uint256 baseRequired = _requiredFxrp(usdTarget, price, priceDecimals);
        return Math.mulDiv(
            baseRequired, BPS_DENOMINATOR + PROTECTION_BPS, BPS_DENOMINATOR, Math.Rounding.Ceil
        );
    }

    function _requireExactIncomingBalance(uint256 balanceBefore, uint256 expectedAmount)
        internal
        view
    {
        uint256 balanceAfter = fxrp.balanceOf(address(this));
        uint256 received = balanceAfter >= balanceBefore ? balanceAfter - balanceBefore : 0;
        if (received != expectedAmount) {
            revert UnexpectedFXRPReceived(expectedAmount, received);
        }
    }

    function _requireCurrentSolvency(uint256 currentBalance) internal view {
        if (currentBalance < activeFxrpLiabilities) {
            revert InsufficientFXRP(currentBalance, activeFxrpLiabilities);
        }
    }

    function _requireExactOutgoingBalance(uint256 balanceBefore, uint256 expectedAmount)
        internal
        view
    {
        uint256 balanceAfter = fxrp.balanceOf(address(this));
        uint256 sent = balanceBefore >= balanceAfter ? balanceBefore - balanceAfter : 0;
        if (sent != expectedAmount) revert UnexpectedFXRPReceived(expectedAmount, sent);
    }
}
