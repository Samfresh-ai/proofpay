// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { StdInvariant } from "forge-std/StdInvariant.sol";
import { Test } from "forge-std/Test.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { FtsoV2Interface } from "flare-periphery/src/coston2/FtsoV2Interface.sol";

import { ProofPayEscrow } from "../src/ProofPayEscrow.sol";
import { MockFXRP } from "./mocks/MockFXRP.sol";
import { MockFtsoV2 } from "./mocks/MockFtsoV2.sol";

contract ProofPayEscrowHandler is Test {
    bytes21 internal constant XRP_USD_FEED_ID = 0x015852502f55534400000000000000000000000000;
    address internal constant FREELANCER = address(0xF1);
    address internal constant CLIENT = address(0xC1);
    address internal constant UNAUTHORIZED = address(0xBAD);

    uint256 public constant CLIENT_LIQUIDITY = 1e36;
    uint256 internal constant MIN_INVARIANT_USD_TARGET = 1_000_000;
    uint256 internal constant MAX_INVARIANT_USD_TARGET = 1_000_000_000_000;
    uint256 internal constant MAX_INVOICES = 8;
    uint64 internal constant MAXIMUM_PRICE_AGE = 30;
    string internal constant EVIDENCE_URI = "ipfs://proofpay-invariant-evidence";

    struct ExpectedRecord {
        bytes32 creationTermsHash;
        bool fundingRecorded;
        uint256 fundingPrice;
        int8 fundingPriceDecimals;
        uint64 fundingPriceTimestamp;
        bool evidenceRecorded;
        bytes32 evidenceHash;
        bool terminalRecorded;
        bytes32 terminalInvoiceHash;
    }

    struct Snapshot {
        bytes32 invoiceHash;
        uint256 liabilities;
        uint256 contractBalance;
        uint256 clientBalance;
        uint256 freelancerBalance;
        uint256 unauthorizedBalance;
        uint256 handlerBalance;
        uint256 totalSupply;
    }

    ProofPayEscrow public immutable escrow;
    MockFXRP public immutable fxrp;
    MockFtsoV2 public immutable ftso;

    uint256[] internal trackedInvoiceIds;
    mapping(uint256 invoiceId => ExpectedRecord expected) internal expectedRecords;
    mapping(uint256 invoiceId => uint256 count) public successfulReleases;
    mapping(uint256 invoiceId => uint256 count) public successfulRefunds;
    mapping(uint256 invoiceId => uint256 count) public successfulCancellations;

    uint256 public ghostActiveLiabilities;
    uint256 public ghostDonations;
    uint256 public ghostClientDeposits;
    uint256 public ghostClientRefunds;
    uint256 public ghostFreelancerPayouts;

    constructor(ProofPayEscrow escrow_, MockFXRP fxrp_, MockFtsoV2 ftso_) {
        escrow = escrow_;
        fxrp = fxrp_;
        ftso = ftso_;

        fxrp.mint(CLIENT, CLIENT_LIQUIDITY);
        vm.prank(CLIENT);
        fxrp.approve(address(escrow), type(uint256).max);
    }

    function createInvoice(uint256 usdSeed, uint256 deadlineSeed, uint256 scopeSeed) external {
        if (trackedInvoiceIds.length >= MAX_INVOICES) return;

        uint256 usdTarget = bound(usdSeed, MIN_INVARIANT_USD_TARGET, MAX_INVARIANT_USD_TARGET);
        uint256 deadlineDelta = bound(deadlineSeed, 1 hours, 7 days);
        if (block.timestamp > type(uint64).max - deadlineDelta) return;
        // The preceding bound check proves this sum is representable by uint64.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint64 deliveryDeadline = uint64(block.timestamp + deadlineDelta);
        bytes32 scopeHash = keccak256(
            abi.encode("proofpay-invariant-scope", trackedInvoiceIds.length, scopeSeed)
        );

        vm.prank(FREELANCER);
        uint256 invoiceId = escrow.createInvoice(CLIENT, usdTarget, deliveryDeadline, scopeHash);
        ProofPayEscrow.Invoice memory invoice = _invoice(invoiceId);

        trackedInvoiceIds.push(invoiceId);
        expectedRecords[invoiceId].creationTermsHash = _creationTermsHash(invoice);
        assertEq(uint8(invoice.status), uint8(ProofPayEscrow.InvoiceStatus.CREATED));
        assertEq(invoice.fxrpLocked, 0);
    }

    function fundInvoice(uint256 invoiceSeed) external {
        (bool found, uint256 invoiceId) = _selectInvoice(invoiceSeed);
        if (!found) return;
        Snapshot memory beforeState = _snapshot(invoiceId);
        ProofPayEscrow.Invoice memory beforeInvoice = _invoice(invoiceId);

        (bool success,) = _callAs(
            CLIENT,
            abi.encodeCall(
                ProofPayEscrow.fundInvoice, (invoiceId, type(uint256).max, uint64(block.timestamp))
            )
        );
        if (!success) {
            _assertUnchanged(beforeState, _snapshot(invoiceId));
            return;
        }

        ProofPayEscrow.Invoice memory afterInvoice = _invoice(invoiceId);
        uint256 deposited = afterInvoice.fxrpLocked - beforeInvoice.fxrpLocked;
        assertEq(uint8(beforeInvoice.status), uint8(ProofPayEscrow.InvoiceStatus.CREATED));
        assertEq(uint8(afterInvoice.status), uint8(ProofPayEscrow.InvoiceStatus.FUNDED));
        _assertIncomingTransfer(beforeState, _snapshot(invoiceId), deposited);

        ghostActiveLiabilities += deposited;
        ghostClientDeposits += deposited;
        ExpectedRecord storage expected = expectedRecords[invoiceId];
        expected.fundingRecorded = true;
        expected.fundingPrice = afterInvoice.fundingPrice;
        expected.fundingPriceDecimals = afterInvoice.fundingPriceDecimals;
        expected.fundingPriceTimestamp = afterInvoice.fundingPriceTimestamp;
    }

    function submitEvidence(uint256 invoiceSeed, uint256 evidenceSeed) external {
        (bool found, uint256 invoiceId) = _selectInvoice(invoiceSeed);
        if (!found) return;
        Snapshot memory beforeState = _snapshot(invoiceId);
        ProofPayEscrow.Invoice memory beforeInvoice = _invoice(invoiceId);
        bytes32 evidenceHash = evidenceSeed % 5 == 0
            ? bytes32(0)
            : keccak256(abi.encode("proofpay-invariant-evidence", invoiceId, evidenceSeed));

        (bool success,) = _callAs(
            FREELANCER,
            abi.encodeCall(ProofPayEscrow.submitEvidence, (invoiceId, evidenceHash, EVIDENCE_URI))
        );
        if (!success) {
            _assertUnchanged(beforeState, _snapshot(invoiceId));
            return;
        }

        ProofPayEscrow.Invoice memory afterInvoice = _invoice(invoiceId);
        assertEq(uint8(beforeInvoice.status), uint8(ProofPayEscrow.InvoiceStatus.FUNDED));
        assertEq(uint8(afterInvoice.status), uint8(ProofPayEscrow.InvoiceStatus.SUBMITTED));
        assertEq(afterInvoice.fxrpLocked, beforeInvoice.fxrpLocked);
        assertEq(afterInvoice.evidenceHash, evidenceHash);
        _assertNoTokenOrLiabilityChange(beforeState, _snapshot(invoiceId));

        ExpectedRecord storage expected = expectedRecords[invoiceId];
        expected.evidenceRecorded = true;
        expected.evidenceHash = evidenceHash;
    }

    function topUp(uint256 invoiceSeed) external {
        (bool found, uint256 invoiceId) = _selectInvoice(invoiceSeed);
        if (!found) return;
        Snapshot memory beforeState = _snapshot(invoiceId);
        ProofPayEscrow.Invoice memory beforeInvoice = _invoice(invoiceId);

        (bool success,) = _callAs(
            CLIENT,
            abi.encodeCall(
                ProofPayEscrow.topUp, (invoiceId, type(uint256).max, uint64(block.timestamp))
            )
        );
        if (!success) {
            _assertUnchanged(beforeState, _snapshot(invoiceId));
            return;
        }

        ProofPayEscrow.Invoice memory afterInvoice = _invoice(invoiceId);
        uint256 deposited = afterInvoice.fxrpLocked - beforeInvoice.fxrpLocked;
        assertEq(uint8(beforeInvoice.status), uint8(ProofPayEscrow.InvoiceStatus.SUBMITTED));
        assertEq(uint8(afterInvoice.status), uint8(ProofPayEscrow.InvoiceStatus.SUBMITTED));
        assertGt(deposited, 0);
        _assertIncomingTransfer(beforeState, _snapshot(invoiceId), deposited);

        ghostActiveLiabilities += deposited;
        ghostClientDeposits += deposited;
    }

    function release(uint256 invoiceSeed) external {
        (bool found, uint256 invoiceId) = _selectInvoice(invoiceSeed);
        if (!found) return;
        Snapshot memory beforeState = _snapshot(invoiceId);
        ProofPayEscrow.Invoice memory beforeInvoice = _invoice(invoiceId);

        (bool success,) = _callAs(
            CLIENT,
            abi.encodeCall(
                ProofPayEscrow.release, (invoiceId, type(uint256).max, uint64(block.timestamp))
            )
        );
        if (!success) {
            _assertUnchanged(beforeState, _snapshot(invoiceId));
            return;
        }

        ProofPayEscrow.Invoice memory afterInvoice = _invoice(invoiceId);
        Snapshot memory afterState = _snapshot(invoiceId);
        uint256 freelancerPayout = afterState.freelancerBalance - beforeState.freelancerBalance;
        uint256 clientRefund = afterState.clientBalance - beforeState.clientBalance;
        uint256 scale = 10 ** uint8(afterInvoice.releasePriceDecimals);

        assertEq(uint8(beforeInvoice.status), uint8(ProofPayEscrow.InvoiceStatus.SUBMITTED));
        assertEq(uint8(afterInvoice.status), uint8(ProofPayEscrow.InvoiceStatus.RELEASED));
        assertEq(afterInvoice.fxrpLocked, beforeInvoice.fxrpLocked);
        assertEq(beforeState.contractBalance - afterState.contractBalance, beforeInvoice.fxrpLocked);
        assertEq(freelancerPayout + clientRefund, beforeInvoice.fxrpLocked);
        assertGe(freelancerPayout * afterInvoice.releasePrice, afterInvoice.usdTarget * scale);
        assertLt((freelancerPayout - 1) * afterInvoice.releasePrice, afterInvoice.usdTarget * scale);
        assertEq(afterState.unauthorizedBalance, beforeState.unauthorizedBalance);
        assertEq(afterState.handlerBalance, beforeState.handlerBalance);
        assertEq(afterState.totalSupply, beforeState.totalSupply);

        ghostActiveLiabilities -= beforeInvoice.fxrpLocked;
        ghostFreelancerPayouts += freelancerPayout;
        ghostClientRefunds += clientRefund;
        successfulReleases[invoiceId] += 1;
        _recordTerminal(invoiceId, afterInvoice);
    }

    function cancelBeforeFunding(uint256 invoiceSeed) external {
        (bool found, uint256 invoiceId) = _selectInvoice(invoiceSeed);
        if (!found) return;
        Snapshot memory beforeState = _snapshot(invoiceId);
        ProofPayEscrow.Invoice memory beforeInvoice = _invoice(invoiceId);

        (bool success,) =
            _callAs(FREELANCER, abi.encodeCall(ProofPayEscrow.cancelBeforeFunding, (invoiceId)));
        if (!success) {
            _assertUnchanged(beforeState, _snapshot(invoiceId));
            return;
        }

        ProofPayEscrow.Invoice memory afterInvoice = _invoice(invoiceId);
        assertEq(uint8(beforeInvoice.status), uint8(ProofPayEscrow.InvoiceStatus.CREATED));
        assertEq(uint8(afterInvoice.status), uint8(ProofPayEscrow.InvoiceStatus.CANCELLED));
        _assertNoTokenOrLiabilityChange(beforeState, _snapshot(invoiceId));
        successfulCancellations[invoiceId] += 1;
        _recordTerminal(invoiceId, afterInvoice);
    }

    function refundUnsubmittedAfterDeadline(uint256 invoiceSeed) external {
        (bool found, uint256 invoiceId) = _selectInvoice(invoiceSeed);
        if (!found) return;
        Snapshot memory beforeState = _snapshot(invoiceId);
        ProofPayEscrow.Invoice memory beforeInvoice = _invoice(invoiceId);

        (bool success,) = _callAs(
            CLIENT, abi.encodeCall(ProofPayEscrow.refundUnsubmittedAfterDeadline, (invoiceId))
        );
        if (!success) {
            _assertUnchanged(beforeState, _snapshot(invoiceId));
            return;
        }

        ProofPayEscrow.Invoice memory afterInvoice = _invoice(invoiceId);
        Snapshot memory afterState = _snapshot(invoiceId);
        assertEq(uint8(beforeInvoice.status), uint8(ProofPayEscrow.InvoiceStatus.FUNDED));
        assertEq(uint8(afterInvoice.status), uint8(ProofPayEscrow.InvoiceStatus.REFUNDED));
        assertEq(afterInvoice.fxrpLocked, beforeInvoice.fxrpLocked);
        assertEq(beforeState.contractBalance - afterState.contractBalance, beforeInvoice.fxrpLocked);
        assertEq(afterState.clientBalance - beforeState.clientBalance, beforeInvoice.fxrpLocked);
        assertEq(afterState.freelancerBalance, beforeState.freelancerBalance);
        assertEq(afterState.unauthorizedBalance, beforeState.unauthorizedBalance);
        assertEq(afterState.handlerBalance, beforeState.handlerBalance);
        assertEq(afterState.totalSupply, beforeState.totalSupply);

        ghostActiveLiabilities -= beforeInvoice.fxrpLocked;
        ghostClientRefunds += beforeInvoice.fxrpLocked;
        successfulRefunds[invoiceId] += 1;
        _recordTerminal(invoiceId, afterInvoice);
    }

    function advanceTime(uint256 secondsSeed) external {
        uint256 delta = bound(secondsSeed, 1, 10 days);
        vm.warp(block.timestamp + delta);
    }

    function setValidPrice(uint256 priceSeed, uint8 decimalsSeed) external {
        uint8 decimals = uint8(bound(decimalsSeed, 0, 18));
        uint256 scale = 10 ** decimals;
        uint256 minimumPrice = scale < 4 ? 1 : scale / 4;
        uint256 maximumPrice = scale * 5;
        uint256 price = bound(priceSeed, minimumPrice, maximumPrice);

        ftso.setFee(0);
        ftso.setReverts(false, false);
        // decimals is bounded to 0..18, all representable by int8.
        // forge-lint: disable-next-line(unsafe-typecast)
        ftso.setObservation(price, int8(decimals), uint64(block.timestamp));
    }

    function setInvalidPrice(uint256 kindSeed, uint256 valueSeed) external {
        uint256 kind = kindSeed % 9;
        uint256 value = bound(valueSeed, 1, 5_000_000);
        ftso.setFee(0);
        ftso.setReverts(false, false);
        ftso.setObservation(value, 6, uint64(block.timestamp));

        if (kind == 0) ftso.setObservation(0, 6, uint64(block.timestamp));
        else if (kind == 1) ftso.setObservation(value, -1, uint64(block.timestamp));
        else if (kind == 2) ftso.setObservation(value, 19, uint64(block.timestamp));
        else if (kind == 3) ftso.setObservation(value, 6, 0);
        else if (kind == 4) ftso.setObservation(value, 6, uint64(block.timestamp + 1));
        else if (kind == 5) ftso.setFee(1);
        else if (kind == 6) ftso.setReverts(true, false);
        else if (kind == 7) ftso.setReverts(false, true);
        else ftso.setObservation(value, 6, uint64(block.timestamp - MAXIMUM_PRICE_AGE - 1));
    }

    function donateDirectly(uint256 donationSeed) external {
        uint256 donation = bound(donationSeed, 1, 1e18);
        uint256 liabilitiesBefore = escrow.activeFxrpLiabilities();
        uint256 contractBefore = fxrp.balanceOf(address(escrow));

        fxrp.mint(address(this), donation);
        assertTrue(fxrp.transfer(address(escrow), donation));

        ghostDonations += donation;
        assertEq(escrow.activeFxrpLiabilities(), liabilitiesBefore);
        assertEq(fxrp.balanceOf(address(escrow)), contractBefore + donation);
    }

    function unauthorizedAction(uint256 invoiceSeed, uint256 actionSeed) external {
        (bool found, uint256 invoiceId) = _selectInvoice(invoiceSeed);
        if (!found) return;
        Snapshot memory beforeState = _snapshot(invoiceId);
        bytes memory callData;

        uint256 action = actionSeed % 6;
        if (action == 0) {
            callData = abi.encodeCall(
                ProofPayEscrow.fundInvoice, (invoiceId, type(uint256).max, uint64(block.timestamp))
            );
        } else if (action == 1) {
            callData = abi.encodeCall(
                ProofPayEscrow.submitEvidence,
                (invoiceId, keccak256("unauthorized-evidence"), EVIDENCE_URI)
            );
        } else if (action == 2) {
            callData = abi.encodeCall(
                ProofPayEscrow.topUp, (invoiceId, type(uint256).max, uint64(block.timestamp))
            );
        } else if (action == 3) {
            callData = abi.encodeCall(
                ProofPayEscrow.release, (invoiceId, type(uint256).max, uint64(block.timestamp))
            );
        } else if (action == 4) {
            callData = abi.encodeCall(ProofPayEscrow.cancelBeforeFunding, (invoiceId));
        } else {
            callData = abi.encodeCall(ProofPayEscrow.refundUnsubmittedAfterDeadline, (invoiceId));
        }

        (bool success,) = _callAs(UNAUTHORIZED, callData);
        assertFalse(success);
        _assertUnchanged(beforeState, _snapshot(invoiceId));
    }

    function repeatTerminalAction(uint256 invoiceSeed) external {
        (bool found, uint256 invoiceId) = _selectInvoice(invoiceSeed);
        if (!found) return;
        ProofPayEscrow.Invoice memory invoice = _invoice(invoiceId);
        Snapshot memory beforeState = _snapshot(invoiceId);
        bool success;

        if (invoice.status == ProofPayEscrow.InvoiceStatus.RELEASED) {
            (success,) = _callAs(
                CLIENT,
                abi.encodeCall(
                    ProofPayEscrow.release, (invoiceId, type(uint256).max, uint64(block.timestamp))
                )
            );
        } else if (invoice.status == ProofPayEscrow.InvoiceStatus.CANCELLED) {
            (success,) = _callAs(
                FREELANCER, abi.encodeCall(ProofPayEscrow.cancelBeforeFunding, (invoiceId))
            );
        } else if (invoice.status == ProofPayEscrow.InvoiceStatus.REFUNDED) {
            (success,) = _callAs(
                CLIENT, abi.encodeCall(ProofPayEscrow.refundUnsubmittedAfterDeadline, (invoiceId))
            );
        } else {
            return;
        }

        assertFalse(success);
        _assertUnchanged(beforeState, _snapshot(invoiceId));
    }

    function attemptUnderfundedRelease(uint256 invoiceSeed) external {
        (bool found, uint256 invoiceId) = _selectInvoice(invoiceSeed);
        if (!found) return;
        ProofPayEscrow.Invoice memory invoice = _invoice(invoiceId);
        if (invoice.status != ProofPayEscrow.InvoiceStatus.SUBMITTED) return;

        uint256 requiredAtMinimumPrice = invoice.usdTarget * 1e18;
        if (invoice.fxrpLocked >= requiredAtMinimumPrice) return;
        ftso.setFee(0);
        ftso.setReverts(false, false);
        ftso.setObservation(1, 18, uint64(block.timestamp));
        Snapshot memory beforeState = _snapshot(invoiceId);

        (bool success, bytes memory returnData) = _callAs(
            CLIENT,
            abi.encodeCall(
                ProofPayEscrow.release, (invoiceId, type(uint256).max, uint64(block.timestamp))
            )
        );
        assertFalse(success);
        assertEq(_revertSelector(returnData), ProofPayEscrow.TopUpRequired.selector);
        _assertUnchanged(beforeState, _snapshot(invoiceId));
    }

    function trackedInvoiceCount() external view returns (uint256) {
        return trackedInvoiceIds.length;
    }

    function trackedInvoiceId(uint256 index) external view returns (uint256) {
        return trackedInvoiceIds[index];
    }

    function activeLockSum() external view returns (uint256 sum) {
        for (uint256 i = 0; i < trackedInvoiceIds.length; ++i) {
            ProofPayEscrow.Invoice memory invoice = _invoice(trackedInvoiceIds[i]);
            if (
                invoice.status == ProofPayEscrow.InvoiceStatus.FUNDED
                    || invoice.status == ProofPayEscrow.InvoiceStatus.SUBMITTED
            ) {
                sum += invoice.fxrpLocked;
            }
        }
    }

    function recordsAreStable() external view returns (bool) {
        for (uint256 i = 0; i < trackedInvoiceIds.length; ++i) {
            uint256 invoiceId = trackedInvoiceIds[i];
            ProofPayEscrow.Invoice memory invoice = _invoice(invoiceId);
            ExpectedRecord storage expected = expectedRecords[invoiceId];

            if (_creationTermsHash(invoice) != expected.creationTermsHash) return false;
            if (
                expected.fundingRecorded
                    && (invoice.fundingPrice != expected.fundingPrice
                        || invoice.fundingPriceDecimals != expected.fundingPriceDecimals
                        || invoice.fundingPriceTimestamp != expected.fundingPriceTimestamp)
            ) return false;
            if (expected.evidenceRecorded && invoice.evidenceHash != expected.evidenceHash) {
                return false;
            }
            if (
                expected.terminalRecorded
                    && keccak256(abi.encode(invoice)) != expected.terminalInvoiceHash
            ) return false;
        }
        return true;
    }

    function terminalActionsOccurAtMostOnce() external view returns (bool) {
        for (uint256 i = 0; i < trackedInvoiceIds.length; ++i) {
            uint256 invoiceId = trackedInvoiceIds[i];
            if (
                successfulReleases[invoiceId] > 1 || successfulRefunds[invoiceId] > 1
                    || successfulCancellations[invoiceId] > 1
            ) return false;
            uint256 terminalCount = successfulReleases[invoiceId] + successfulRefunds[invoiceId]
                + successfulCancellations[invoiceId];
            if (terminalCount > 1) return false;
        }
        return true;
    }

    function _recordTerminal(uint256 invoiceId, ProofPayEscrow.Invoice memory invoice) internal {
        ExpectedRecord storage expected = expectedRecords[invoiceId];
        assertFalse(expected.terminalRecorded);
        expected.terminalRecorded = true;
        expected.terminalInvoiceHash = keccak256(abi.encode(invoice));
    }

    function _assertIncomingTransfer(
        Snapshot memory beforeState,
        Snapshot memory afterState,
        uint256 amount
    ) internal pure {
        assertEq(beforeState.clientBalance - afterState.clientBalance, amount);
        assertEq(afterState.contractBalance - beforeState.contractBalance, amount);
        assertEq(afterState.freelancerBalance, beforeState.freelancerBalance);
        assertEq(afterState.unauthorizedBalance, beforeState.unauthorizedBalance);
        assertEq(afterState.handlerBalance, beforeState.handlerBalance);
        assertEq(afterState.totalSupply, beforeState.totalSupply);
    }

    function _assertNoTokenOrLiabilityChange(
        Snapshot memory beforeState,
        Snapshot memory afterState
    ) internal pure {
        assertEq(afterState.liabilities, beforeState.liabilities);
        assertEq(afterState.contractBalance, beforeState.contractBalance);
        assertEq(afterState.clientBalance, beforeState.clientBalance);
        assertEq(afterState.freelancerBalance, beforeState.freelancerBalance);
        assertEq(afterState.unauthorizedBalance, beforeState.unauthorizedBalance);
        assertEq(afterState.handlerBalance, beforeState.handlerBalance);
        assertEq(afterState.totalSupply, beforeState.totalSupply);
    }

    function _assertUnchanged(Snapshot memory beforeState, Snapshot memory afterState)
        internal
        pure
    {
        assertEq(afterState.invoiceHash, beforeState.invoiceHash);
        _assertNoTokenOrLiabilityChange(beforeState, afterState);
    }

    function _selectInvoice(uint256 seed) internal view returns (bool found, uint256 invoiceId) {
        if (trackedInvoiceIds.length == 0) return (false, 0);
        return (true, trackedInvoiceIds[seed % trackedInvoiceIds.length]);
    }

    function _callAs(address caller, bytes memory callData)
        internal
        returns (bool success, bytes memory returnData)
    {
        vm.prank(caller);
        return address(escrow).call(callData);
    }

    function _snapshot(uint256 invoiceId) internal view returns (Snapshot memory state) {
        state.invoiceHash = keccak256(abi.encode(_invoice(invoiceId)));
        state.liabilities = escrow.activeFxrpLiabilities();
        state.contractBalance = fxrp.balanceOf(address(escrow));
        state.clientBalance = fxrp.balanceOf(CLIENT);
        state.freelancerBalance = fxrp.balanceOf(FREELANCER);
        state.unauthorizedBalance = fxrp.balanceOf(UNAUTHORIZED);
        state.handlerBalance = fxrp.balanceOf(address(this));
        state.totalSupply = fxrp.totalSupply();
    }

    function _invoice(uint256 invoiceId)
        internal
        view
        returns (ProofPayEscrow.Invoice memory invoice)
    {
        (bool success, bytes memory returnData) =
            address(escrow).staticcall(abi.encodeWithSignature("invoices(uint256)", invoiceId));
        require(success, "invoice getter failed");
        invoice = abi.decode(returnData, (ProofPayEscrow.Invoice));
    }

    function _creationTermsHash(ProofPayEscrow.Invoice memory invoice)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                invoice.freelancer,
                invoice.client,
                invoice.usdTarget,
                invoice.deliveryDeadline,
                invoice.scopeHash
            )
        );
    }

    function _revertSelector(bytes memory returnData) internal pure returns (bytes4 selector) {
        if (returnData.length < 4) return bytes4(0);
        assembly ("memory-safe") {
            selector := mload(add(returnData, 0x20))
        }
    }
}

contract ProofPayEscrowInvariantTest is StdInvariant, Test {
    bytes21 internal constant XRP_USD_FEED_ID = 0x015852502f55534400000000000000000000000000;
    address internal constant FREELANCER = address(0xF1);
    address internal constant CLIENT = address(0xC1);
    address internal constant UNAUTHORIZED = address(0xBAD);
    uint64 internal constant MAXIMUM_PRICE_AGE = 30;

    MockFXRP internal fxrp;
    MockFtsoV2 internal ftso;
    ProofPayEscrow internal escrow;
    ProofPayEscrowHandler internal handler;

    function setUp() external {
        vm.chainId(114);
        vm.warp(1_800_000_000);

        fxrp = new MockFXRP(6);
        ftso = new MockFtsoV2(XRP_USD_FEED_ID);
        ftso.setObservation(1_000_000, 6, uint64(block.timestamp));
        escrow = new ProofPayEscrow(
            IERC20Metadata(address(fxrp)),
            FtsoV2Interface(address(ftso)),
            XRP_USD_FEED_ID,
            MAXIMUM_PRICE_AGE
        );
        handler = new ProofPayEscrowHandler(escrow, fxrp, ftso);

        handler.createInvoice(100_000_000, 7 days, 1);
        handler.createInvoice(50_000_000, 7 days, 2);
        handler.createInvoice(25_000_000, 7 days, 3);
        handler.fundInvoice(0);
        handler.fundInvoice(1);
        handler.submitEvidence(0, 1);

        bytes4[] memory selectors = new bytes4[](14);
        selectors[0] = handler.createInvoice.selector;
        selectors[1] = handler.fundInvoice.selector;
        selectors[2] = handler.submitEvidence.selector;
        selectors[3] = handler.topUp.selector;
        selectors[4] = handler.release.selector;
        selectors[5] = handler.cancelBeforeFunding.selector;
        selectors[6] = handler.refundUnsubmittedAfterDeadline.selector;
        selectors[7] = handler.advanceTime.selector;
        selectors[8] = handler.setValidPrice.selector;
        selectors[9] = handler.setInvalidPrice.selector;
        selectors[10] = handler.donateDirectly.selector;
        selectors[11] = handler.unauthorizedAction.selector;
        selectors[12] = handler.repeatTerminalAction.selector;
        selectors[13] = handler.attemptUnderfundedRelease.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({ addr: address(handler), selectors: selectors }));
    }

    function invariant_ActiveLiabilitiesEqualTheSumOfAllActiveInvoiceLocks() external view {
        uint256 activeLockSum = handler.activeLockSum();
        assertEq(escrow.activeFxrpLiabilities(), activeLockSum);
        assertEq(handler.ghostActiveLiabilities(), activeLockSum);
    }

    function invariant_LiabilitiesRemainSolventAndDonationsStaySurplus() external view {
        uint256 liabilities = escrow.activeFxrpLiabilities();
        uint256 balance = fxrp.balanceOf(address(escrow));
        assertGe(balance, liabilities);
        assertEq(balance, liabilities + handler.ghostDonations());
    }

    function invariant_FundedTermsEvidenceAndTerminalRecordsStayImmutable() external view {
        assertTrue(handler.recordsAreStable());
    }

    function invariant_TerminalActionsAndTransfersCannotOccurTwice() external view {
        assertTrue(handler.terminalActionsOccurAtMostOnce());
    }

    function invariant_OnlyTheNamedPartiesReceiveEscrowOutflows() external view {
        assertEq(fxrp.balanceOf(UNAUTHORIZED), 0);
        assertEq(fxrp.balanceOf(FREELANCER), handler.ghostFreelancerPayouts());
        assertEq(
            fxrp.balanceOf(CLIENT),
            handler.CLIENT_LIQUIDITY() - handler.ghostClientDeposits()
                + handler.ghostClientRefunds()
        );
    }

    function invariant_NoSequenceCreatesAnUnrestrictedWithdrawalPath() external view {
        uint256 accountedBalances = fxrp.balanceOf(CLIENT) + fxrp.balanceOf(FREELANCER)
            + fxrp.balanceOf(address(escrow)) + fxrp.balanceOf(address(handler))
            + fxrp.balanceOf(UNAUTHORIZED);
        assertEq(accountedBalances, fxrp.totalSupply());
        assertEq(fxrp.balanceOf(address(handler)), 0);
    }
}
