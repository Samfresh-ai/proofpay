// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { Test } from "forge-std/Test.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { FtsoV2Interface } from "flare-periphery/src/coston2/FtsoV2Interface.sol";
import { ProofPayEscrow } from "../src/ProofPayEscrow.sol";
import { MockFXRP } from "./mocks/MockFXRP.sol";
import { MockFtsoV2 } from "./mocks/MockFtsoV2.sol";

contract ProofPayEscrowSettlementTest is Test {
    bytes21 internal constant XRP_USD_FEED_ID = 0x015852502f55534400000000000000000000000000;
    address internal constant FREELANCER = address(0xF1);
    address internal constant CLIENT = address(0xC1);
    address internal constant LOSS_RECIPIENT = address(0xDEAD);

    uint256 internal constant USD_TARGET = 100_000_000;
    uint256 internal constant LOCKED_AT_ONE_DOLLAR = 110_000_000;
    uint256 internal constant PAYOUT_AT_ONE_TWENTY_FIVE = 80_000_000;
    uint256 internal constant PAYOUT_AT_ONE_DOLLAR = 100_000_000;
    uint256 internal constant PAYOUT_AT_NINETY_FIVE_CENTS = 105_263_158;
    uint256 internal constant PAYOUT_AT_NINETY_CENTS = 111_111_112;
    uint256 internal constant TOP_UP_AT_NINETY_CENTS = 1_111_112;
    uint64 internal constant MAXIMUM_PRICE_AGE = 120;
    bytes32 internal constant SCOPE_HASH = keccak256("proofpay-settlement-scope");
    bytes32 internal constant EVIDENCE_HASH = keccak256("proofpay-settlement-evidence");
    string internal constant EVIDENCE_URI = "ipfs://proofpay-settlement-evidence";
    bytes4 internal constant REENTRANCY_SELECTOR =
        bytes4(keccak256("ReentrancyGuardReentrantCall()"));

    MockFXRP internal fxrp;
    MockFtsoV2 internal ftso;
    ProofPayEscrow internal escrow;
    uint64 internal deliveryDeadline;

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

    function setUp() external {
        vm.chainId(114);
        vm.warp(1_800_000_000);

        fxrp = new MockFXRP(6);
        ftso = new MockFtsoV2(XRP_USD_FEED_ID);
        _setPrice(1_000_000);
        escrow = new ProofPayEscrow(
            IERC20Metadata(address(fxrp)),
            FtsoV2Interface(address(ftso)),
            XRP_USD_FEED_ID,
            MAXIMUM_PRICE_AGE
        );

        deliveryDeadline = uint64(block.timestamp + 7 days);
        fxrp.mint(CLIENT, 1_000_000_000_000_000);
        vm.prank(CLIENT);
        fxrp.approve(address(escrow), type(uint256).max);
    }

    function testReleaseAtOneTwentyFivePaysEightyAndRefundsThirty() external {
        _assertSuccessfulRelease(1_250_000, PAYOUT_AT_ONE_TWENTY_FIVE, 30_000_000);
    }

    function testReleaseAtOneDollarPaysOneHundredAndRefundsTen() external {
        _assertSuccessfulRelease(1_000_000, PAYOUT_AT_ONE_DOLLAR, 10_000_000);
    }

    function testReleaseAtNinetyFiveCentsRoundsUpAndRefundsRemainder() external {
        _assertSuccessfulRelease(950_000, PAYOUT_AT_NINETY_FIVE_CENTS, 4_736_842);
    }

    function testReleaseAtNinetyCentsRequiresExactTopUpAndTransfersNothing() external {
        uint256 invoiceId = _submittedAtOneDollar();
        _setPrice(900_000);

        (
            uint256 requiredPayout,
            uint256 refund,
            uint256 topUpRequired,
            uint256 price,
            int8 decimals,
            uint64 timestamp
        ) = escrow.quoteRelease(invoiceId);
        assertEq(requiredPayout, PAYOUT_AT_NINETY_CENTS);
        assertEq(refund, 0);
        assertEq(topUpRequired, TOP_UP_AT_NINETY_CENTS);
        assertEq(price, 900_000);
        assertEq(decimals, 6);
        assertEq(timestamp, uint64(block.timestamp));

        uint256 clientBefore = fxrp.balanceOf(CLIENT);
        uint256 freelancerBefore = fxrp.balanceOf(FREELANCER);
        uint256 escrowBefore = fxrp.balanceOf(address(escrow));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.TopUpRequired.selector,
                PAYOUT_AT_NINETY_CENTS,
                LOCKED_AT_ONE_DOLLAR,
                TOP_UP_AT_NINETY_CENTS
            )
        );
        vm.prank(CLIENT);
        escrow.release(invoiceId, PAYOUT_AT_NINETY_CENTS, uint64(block.timestamp));

        ProofPayEscrow.Invoice memory invoice = _invoice(invoiceId);
        assertEq(uint8(invoice.status), uint8(ProofPayEscrow.InvoiceStatus.SUBMITTED));
        assertEq(invoice.fxrpLocked, LOCKED_AT_ONE_DOLLAR);
        assertEq(invoice.releasePrice, 0);
        assertEq(invoice.releasePriceTimestamp, 0);
        assertEq(fxrp.balanceOf(CLIENT), clientBefore);
        assertEq(fxrp.balanceOf(FREELANCER), freelancerBefore);
        assertEq(fxrp.balanceOf(address(escrow)), escrowBefore);
        assertEq(escrow.activeFxrpLiabilities(), LOCKED_AT_ONE_DOLLAR);
    }

    function testExactTopUpThenReleaseSettlesWithoutRefund() external {
        uint256 invoiceId = _submittedAtOneDollar();
        vm.warp(uint256(deliveryDeadline) + 1);
        _setPrice(900_000);
        uint256 clientBeforeTopUp = fxrp.balanceOf(CLIENT);

        vm.expectEmit(true, false, false, true, address(escrow));
        emit InvoiceToppedUp(
            invoiceId,
            TOP_UP_AT_NINETY_CENTS,
            PAYOUT_AT_NINETY_CENTS,
            900_000,
            6,
            uint64(block.timestamp)
        );
        vm.prank(CLIENT);
        escrow.topUp(invoiceId, type(uint256).max, uint64(block.timestamp));

        assertEq(_invoice(invoiceId).fxrpLocked, PAYOUT_AT_NINETY_CENTS);
        assertEq(clientBeforeTopUp - fxrp.balanceOf(CLIENT), TOP_UP_AT_NINETY_CENTS);
        assertEq(fxrp.balanceOf(address(escrow)), PAYOUT_AT_NINETY_CENTS);
        assertEq(escrow.activeFxrpLiabilities(), PAYOUT_AT_NINETY_CENTS);

        uint256 lockedBeforeRelease = _invoice(invoiceId).fxrpLocked;
        uint256 freelancerBefore = fxrp.balanceOf(FREELANCER);
        uint256 clientBeforeRelease = fxrp.balanceOf(CLIENT);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit InvoiceReleased(
            invoiceId, PAYOUT_AT_NINETY_CENTS, 0, 900_000, 6, uint64(block.timestamp)
        );
        vm.prank(CLIENT);
        escrow.release(invoiceId, PAYOUT_AT_NINETY_CENTS, uint64(block.timestamp));

        ProofPayEscrow.Invoice memory released = _invoice(invoiceId);
        assertEq(uint8(released.status), uint8(ProofPayEscrow.InvoiceStatus.RELEASED));
        assertEq(released.releasePrice, 900_000);
        assertEq(released.releasePriceDecimals, 6);
        assertEq(released.releasePriceTimestamp, uint64(block.timestamp));
        assertEq(fxrp.balanceOf(FREELANCER) - freelancerBefore, PAYOUT_AT_NINETY_CENTS);
        assertEq(fxrp.balanceOf(CLIENT), clientBeforeRelease);
        assertEq(PAYOUT_AT_NINETY_CENTS, lockedBeforeRelease);
        assertEq(fxrp.balanceOf(address(escrow)), 0);
        assertEq(escrow.activeFxrpLiabilities(), 0);
    }

    function testTopUpMaximumAndExpiredQuoteGuardsRollBack() external {
        uint256 aboveMaximum = _submittedAtOneDollar();
        _setPrice(900_000);
        uint256 clientBefore = fxrp.balanceOf(CLIENT);
        uint256 escrowBefore = fxrp.balanceOf(address(escrow));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.AmountAboveClientMaximum.selector,
                TOP_UP_AT_NINETY_CENTS,
                TOP_UP_AT_NINETY_CENTS - 1
            )
        );
        vm.prank(CLIENT);
        escrow.topUp(aboveMaximum, TOP_UP_AT_NINETY_CENTS - 1, uint64(block.timestamp + 1));

        assertEq(_invoice(aboveMaximum).fxrpLocked, LOCKED_AT_ONE_DOLLAR);
        assertEq(fxrp.balanceOf(CLIENT), clientBefore);
        assertEq(fxrp.balanceOf(address(escrow)), escrowBefore);

        uint256 expired = _submittedAtOneDollar();
        _setPrice(900_000);
        uint64 quoteDeadline = uint64(block.timestamp - 1);
        clientBefore = fxrp.balanceOf(CLIENT);
        escrowBefore = fxrp.balanceOf(address(escrow));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.ExpiredQuote.selector, quoteDeadline, block.timestamp
            )
        );
        vm.prank(CLIENT);
        escrow.topUp(expired, TOP_UP_AT_NINETY_CENTS, quoteDeadline);

        assertEq(_invoice(expired).fxrpLocked, LOCKED_AT_ONE_DOLLAR);
        assertEq(fxrp.balanceOf(CLIENT), clientBefore);
        assertEq(fxrp.balanceOf(address(escrow)), escrowBefore);
        assertEq(escrow.activeFxrpLiabilities(), 2 * LOCKED_AT_ONE_DOLLAR);
    }

    function testReleaseMaximumAndExpiredQuoteGuardsRollBack() external {
        uint256 aboveMaximum = _submittedAtOneDollar();
        _setPrice(950_000);
        uint256 clientBefore = fxrp.balanceOf(CLIENT);
        uint256 freelancerBefore = fxrp.balanceOf(FREELANCER);
        uint256 escrowBefore = fxrp.balanceOf(address(escrow));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.AmountAboveClientMaximum.selector,
                PAYOUT_AT_NINETY_FIVE_CENTS,
                PAYOUT_AT_NINETY_FIVE_CENTS - 1
            )
        );
        vm.prank(CLIENT);
        escrow.release(aboveMaximum, PAYOUT_AT_NINETY_FIVE_CENTS - 1, uint64(block.timestamp + 1));

        assertEq(
            uint8(_invoice(aboveMaximum).status), uint8(ProofPayEscrow.InvoiceStatus.SUBMITTED)
        );
        assertEq(fxrp.balanceOf(CLIENT), clientBefore);
        assertEq(fxrp.balanceOf(FREELANCER), freelancerBefore);
        assertEq(fxrp.balanceOf(address(escrow)), escrowBefore);

        vm.prank(CLIENT);
        escrow.release(aboveMaximum, PAYOUT_AT_NINETY_FIVE_CENTS, uint64(block.timestamp));
        assertEq(uint8(_invoice(aboveMaximum).status), uint8(ProofPayEscrow.InvoiceStatus.RELEASED));

        uint256 expired = _submittedAtOneDollar();
        _setPrice(950_000);
        uint64 quoteDeadline = uint64(block.timestamp - 1);
        clientBefore = fxrp.balanceOf(CLIENT);
        freelancerBefore = fxrp.balanceOf(FREELANCER);
        escrowBefore = fxrp.balanceOf(address(escrow));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.ExpiredQuote.selector, quoteDeadline, block.timestamp
            )
        );
        vm.prank(CLIENT);
        escrow.release(expired, PAYOUT_AT_NINETY_FIVE_CENTS, quoteDeadline);

        assertEq(uint8(_invoice(expired).status), uint8(ProofPayEscrow.InvoiceStatus.SUBMITTED));
        assertEq(fxrp.balanceOf(CLIENT), clientBefore);
        assertEq(fxrp.balanceOf(FREELANCER), freelancerBefore);
        assertEq(fxrp.balanceOf(address(escrow)), escrowBefore);
        assertEq(escrow.activeFxrpLiabilities(), LOCKED_AT_ONE_DOLLAR);
    }

    function testTopUpRevertsWhenCurrentEscrowAlreadyCoversPayout() external {
        uint256 invoiceId = _submittedAtOneDollar();
        _setPrice(1_250_000);
        uint256 clientBefore = fxrp.balanceOf(CLIENT);
        uint256 escrowBefore = fxrp.balanceOf(address(escrow));

        vm.expectRevert(abi.encodeWithSelector(ProofPayEscrow.NoTopUpRequired.selector, invoiceId));
        vm.prank(CLIENT);
        escrow.topUp(invoiceId, 1, uint64(block.timestamp));

        assertEq(_invoice(invoiceId).fxrpLocked, LOCKED_AT_ONE_DOLLAR);
        assertEq(uint8(_invoice(invoiceId).status), uint8(ProofPayEscrow.InvoiceStatus.SUBMITTED));
        assertEq(fxrp.balanceOf(CLIENT), clientBefore);
        assertEq(fxrp.balanceOf(address(escrow)), escrowBefore);
        assertEq(escrow.activeFxrpLiabilities(), LOCKED_AT_ONE_DOLLAR);
    }

    function testDoubleReleaseUsesExplicitErrorAndCannotTransferTwice() external {
        uint256 invoiceId = _submittedAtOneDollar();
        _setPrice(1_000_000);
        vm.prank(CLIENT);
        escrow.release(invoiceId, PAYOUT_AT_ONE_DOLLAR, uint64(block.timestamp));

        uint256 clientAfterRelease = fxrp.balanceOf(CLIENT);
        uint256 freelancerAfterRelease = fxrp.balanceOf(FREELANCER);
        uint256 escrowAfterRelease = fxrp.balanceOf(address(escrow));

        vm.expectRevert(abi.encodeWithSelector(ProofPayEscrow.DuplicateRelease.selector, invoiceId));
        vm.prank(CLIENT);
        escrow.release(invoiceId, PAYOUT_AT_ONE_DOLLAR, uint64(block.timestamp));

        assertEq(fxrp.balanceOf(CLIENT), clientAfterRelease);
        assertEq(fxrp.balanceOf(FREELANCER), freelancerAfterRelease);
        assertEq(fxrp.balanceOf(address(escrow)), escrowAfterRelease);
        assertEq(escrow.activeFxrpLiabilities(), 0);
    }

    function testTopUpIncomingMismatchRollsBackLockedAmountAndBalances() external {
        uint256 invoiceId = _submittedAtOneDollar();
        _setPrice(900_000);
        fxrp.setIncomingShortfall(1);
        uint256 clientBefore = fxrp.balanceOf(CLIENT);
        uint256 escrowBefore = fxrp.balanceOf(address(escrow));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.UnexpectedFXRPReceived.selector,
                TOP_UP_AT_NINETY_CENTS,
                TOP_UP_AT_NINETY_CENTS - 1
            )
        );
        vm.prank(CLIENT);
        escrow.topUp(invoiceId, TOP_UP_AT_NINETY_CENTS, uint64(block.timestamp));

        assertEq(_invoice(invoiceId).fxrpLocked, LOCKED_AT_ONE_DOLLAR);
        assertEq(uint8(_invoice(invoiceId).status), uint8(ProofPayEscrow.InvoiceStatus.SUBMITTED));
        assertEq(fxrp.balanceOf(CLIENT), clientBefore);
        assertEq(fxrp.balanceOf(address(escrow)), escrowBefore);
        assertEq(escrow.activeFxrpLiabilities(), LOCKED_AT_ONE_DOLLAR);
    }

    function testTopUpRejectsInsufficientClientBalanceWithoutTransfer() external {
        uint256 invoiceId = _submittedAtOneDollar();
        _setPrice(900_000);

        uint256 remainingClientBalance = fxrp.balanceOf(CLIENT);
        vm.prank(CLIENT);
        assertTrue(fxrp.transfer(LOSS_RECIPIENT, remainingClientBalance));
        uint256 escrowBefore = fxrp.balanceOf(address(escrow));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InsufficientFXRP.selector, 0, TOP_UP_AT_NINETY_CENTS
            )
        );
        vm.prank(CLIENT);
        escrow.topUp(invoiceId, TOP_UP_AT_NINETY_CENTS, uint64(block.timestamp));

        assertEq(fxrp.balanceOf(CLIENT), 0);
        assertEq(fxrp.balanceOf(address(escrow)), escrowBefore);
        assertEq(_invoice(invoiceId).fxrpLocked, LOCKED_AT_ONE_DOLLAR);
        assertEq(escrow.activeFxrpLiabilities(), LOCKED_AT_ONE_DOLLAR);
    }

    function testReleaseOutgoingMismatchRollsBackTerminalStateAndTransfers() external {
        uint256 invoiceId = _submittedAtOneDollar();
        _setPrice(1_000_000);
        fxrp.setOutgoingShortfall(1);
        uint256 clientBefore = fxrp.balanceOf(CLIENT);
        uint256 freelancerBefore = fxrp.balanceOf(FREELANCER);
        uint256 escrowBefore = fxrp.balanceOf(address(escrow));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.UnexpectedFXRPReceived.selector,
                LOCKED_AT_ONE_DOLLAR,
                LOCKED_AT_ONE_DOLLAR - 2
            )
        );
        vm.prank(CLIENT);
        escrow.release(invoiceId, PAYOUT_AT_ONE_DOLLAR, uint64(block.timestamp));

        ProofPayEscrow.Invoice memory invoice = _invoice(invoiceId);
        assertEq(uint8(invoice.status), uint8(ProofPayEscrow.InvoiceStatus.SUBMITTED));
        assertEq(invoice.releasePrice, 0);
        assertEq(invoice.releasePriceTimestamp, 0);
        assertEq(fxrp.balanceOf(CLIENT), clientBefore);
        assertEq(fxrp.balanceOf(FREELANCER), freelancerBefore);
        assertEq(fxrp.balanceOf(address(escrow)), escrowBefore);
        assertEq(escrow.activeFxrpLiabilities(), LOCKED_AT_ONE_DOLLAR);
    }

    function testRefundOutgoingMismatchRollsBackTerminalStateAndTransfer() external {
        uint256 invoiceId = _fundedAtOneDollar();
        vm.warp(uint256(deliveryDeadline) + 1);
        fxrp.setOutgoingShortfall(1);
        uint256 clientBefore = fxrp.balanceOf(CLIENT);
        uint256 escrowBefore = fxrp.balanceOf(address(escrow));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.UnexpectedFXRPReceived.selector,
                LOCKED_AT_ONE_DOLLAR,
                LOCKED_AT_ONE_DOLLAR - 1
            )
        );
        vm.prank(CLIENT);
        escrow.refundUnsubmittedAfterDeadline(invoiceId);

        assertEq(uint8(_invoice(invoiceId).status), uint8(ProofPayEscrow.InvoiceStatus.FUNDED));
        assertEq(fxrp.balanceOf(CLIENT), clientBefore);
        assertEq(fxrp.balanceOf(address(escrow)), escrowBefore);
        assertEq(escrow.activeFxrpLiabilities(), LOCKED_AT_ONE_DOLLAR);
    }

    function testAggregateLiabilitiesTrackTopUpReleaseRefundAndLeaveDonationInert() external {
        uint256 toppedUpInvoice = _submittedAtOneDollar();
        uint256 releasedWithRefundInvoice = _submittedAtOneDollar();
        uint256 missedDeadlineInvoice = _fundedAtOneDollar();
        assertEq(escrow.activeFxrpLiabilities(), 3 * LOCKED_AT_ONE_DOLLAR);
        assertEq(fxrp.balanceOf(address(escrow)), escrow.activeFxrpLiabilities());

        _setPrice(900_000);
        vm.prank(CLIENT);
        escrow.topUp(toppedUpInvoice, TOP_UP_AT_NINETY_CENTS, uint64(block.timestamp));
        assertEq(escrow.activeFxrpLiabilities(), 3 * LOCKED_AT_ONE_DOLLAR + TOP_UP_AT_NINETY_CENTS);
        assertEq(fxrp.balanceOf(address(escrow)), escrow.activeFxrpLiabilities());

        uint256 donation = 7_000_000;
        fxrp.mint(address(this), donation);
        assertTrue(fxrp.transfer(address(escrow), donation));
        assertEq(fxrp.balanceOf(address(escrow)), escrow.activeFxrpLiabilities() + donation);

        vm.prank(CLIENT);
        escrow.release(toppedUpInvoice, PAYOUT_AT_NINETY_CENTS, uint64(block.timestamp));
        assertEq(escrow.activeFxrpLiabilities(), 2 * LOCKED_AT_ONE_DOLLAR);
        assertEq(fxrp.balanceOf(address(escrow)), escrow.activeFxrpLiabilities() + donation);

        _setPrice(1_250_000);
        vm.prank(CLIENT);
        escrow.release(
            releasedWithRefundInvoice, PAYOUT_AT_ONE_TWENTY_FIVE, uint64(block.timestamp)
        );
        assertEq(escrow.activeFxrpLiabilities(), LOCKED_AT_ONE_DOLLAR);
        assertEq(fxrp.balanceOf(address(escrow)), escrow.activeFxrpLiabilities() + donation);

        vm.warp(uint256(deliveryDeadline) + 1);
        vm.prank(CLIENT);
        escrow.refundUnsubmittedAfterDeadline(missedDeadlineInvoice);

        assertEq(escrow.activeFxrpLiabilities(), 0);
        assertEq(fxrp.balanceOf(address(escrow)), donation);
        assertEq(
            uint8(_invoice(toppedUpInvoice).status), uint8(ProofPayEscrow.InvoiceStatus.RELEASED)
        );
        assertEq(
            uint8(_invoice(releasedWithRefundInvoice).status),
            uint8(ProofPayEscrow.InvoiceStatus.RELEASED)
        );
        assertEq(
            uint8(_invoice(missedDeadlineInvoice).status),
            uint8(ProofPayEscrow.InvoiceStatus.REFUNDED)
        );
    }

    function testAggregateSolvencyRejectsCrossSubsidizedSettlement() external {
        uint256 firstInvoice = _submittedAtOneDollar();
        uint256 secondInvoice = _submittedAtOneDollar();
        uint256 donation = 5_000_000;
        fxrp.mint(address(escrow), donation);

        uint256 totalLiability = 2 * LOCKED_AT_ONE_DOLLAR;
        uint256 remainingBalance = LOCKED_AT_ONE_DOLLAR + donation;
        uint256 simulatedLoss = fxrp.balanceOf(address(escrow)) - remainingBalance;
        vm.prank(address(escrow));
        assertTrue(fxrp.transfer(LOSS_RECIPIENT, simulatedLoss));

        assertEq(fxrp.balanceOf(address(escrow)), remainingBalance);
        assertEq(escrow.activeFxrpLiabilities(), totalLiability);
        assertGe(remainingBalance, _invoice(firstInvoice).fxrpLocked);

        uint256 clientBefore = fxrp.balanceOf(CLIENT);
        uint256 freelancerBefore = fxrp.balanceOf(FREELANCER);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InsufficientFXRP.selector, remainingBalance, totalLiability
            )
        );
        vm.prank(CLIENT);
        escrow.release(firstInvoice, PAYOUT_AT_ONE_DOLLAR, uint64(block.timestamp));

        assertEq(fxrp.balanceOf(CLIENT), clientBefore);
        assertEq(fxrp.balanceOf(FREELANCER), freelancerBefore);
        assertEq(fxrp.balanceOf(address(escrow)), remainingBalance);
        assertEq(escrow.activeFxrpLiabilities(), totalLiability);
        assertEq(
            uint8(_invoice(firstInvoice).status), uint8(ProofPayEscrow.InvoiceStatus.SUBMITTED)
        );
        assertEq(
            uint8(_invoice(secondInvoice).status), uint8(ProofPayEscrow.InvoiceStatus.SUBMITTED)
        );
    }

    function testFundingRejectsReentrantCallbackButOuterFundingSucceeds() external {
        _setPrice(1_000_000);
        vm.prank(FREELANCER);
        uint256 invoiceId = escrow.createInvoice(CLIENT, USD_TARGET, deliveryDeadline, SCOPE_HASH);
        bytes memory callbackData = abi.encodeCall(
            ProofPayEscrow.fundInvoice, (invoiceId, LOCKED_AT_ONE_DOLLAR, uint64(block.timestamp))
        );
        fxrp.setCallback(address(escrow), callbackData, false, true);

        vm.prank(CLIENT);
        escrow.fundInvoice(invoiceId, LOCKED_AT_ONE_DOLLAR, uint64(block.timestamp));

        assertEq(fxrp.callbackAttempts(), 1);
        assertFalse(fxrp.callbackSucceeded());
        assertEq(fxrp.callbackRevertSelector(), REENTRANCY_SELECTOR);
        assertEq(uint8(_invoice(invoiceId).status), uint8(ProofPayEscrow.InvoiceStatus.FUNDED));
        assertEq(_invoice(invoiceId).fxrpLocked, LOCKED_AT_ONE_DOLLAR);
        assertEq(escrow.activeFxrpLiabilities(), LOCKED_AT_ONE_DOLLAR);
    }

    function testTopUpRejectsReentrantCallbackButOuterTopUpSucceeds() external {
        uint256 invoiceId = _submittedAtOneDollar();
        _setPrice(900_000);
        bytes memory callbackData = abi.encodeCall(
            ProofPayEscrow.topUp, (invoiceId, TOP_UP_AT_NINETY_CENTS, uint64(block.timestamp))
        );
        fxrp.setCallback(address(escrow), callbackData, false, true);

        vm.prank(CLIENT);
        escrow.topUp(invoiceId, type(uint256).max, uint64(block.timestamp));

        assertEq(fxrp.callbackAttempts(), 1);
        assertFalse(fxrp.callbackSucceeded());
        assertEq(fxrp.callbackRevertSelector(), REENTRANCY_SELECTOR);
        assertEq(uint8(_invoice(invoiceId).status), uint8(ProofPayEscrow.InvoiceStatus.SUBMITTED));
        assertEq(_invoice(invoiceId).fxrpLocked, PAYOUT_AT_NINETY_CENTS);
        assertEq(escrow.activeFxrpLiabilities(), PAYOUT_AT_NINETY_CENTS);
    }

    function testReleaseRejectsReentrantCallbackButOuterSettlementSucceeds() external {
        uint256 invoiceId = _submittedAtOneDollar();
        _setPrice(1_000_000);
        bytes memory callbackData = abi.encodeCall(
            ProofPayEscrow.release, (invoiceId, PAYOUT_AT_ONE_DOLLAR, uint64(block.timestamp))
        );
        fxrp.setCallback(address(escrow), callbackData, true, false);

        uint256 clientBefore = fxrp.balanceOf(CLIENT);
        uint256 freelancerBefore = fxrp.balanceOf(FREELANCER);
        vm.prank(CLIENT);
        escrow.release(invoiceId, PAYOUT_AT_ONE_DOLLAR, uint64(block.timestamp));

        assertEq(fxrp.callbackAttempts(), 1);
        assertFalse(fxrp.callbackSucceeded());
        assertEq(fxrp.callbackRevertSelector(), REENTRANCY_SELECTOR);
        assertEq(uint8(_invoice(invoiceId).status), uint8(ProofPayEscrow.InvoiceStatus.RELEASED));
        assertEq(fxrp.balanceOf(FREELANCER) - freelancerBefore, PAYOUT_AT_ONE_DOLLAR);
        assertEq(fxrp.balanceOf(CLIENT) - clientBefore, 10_000_000);
        assertEq(fxrp.balanceOf(address(escrow)), 0);
        assertEq(escrow.activeFxrpLiabilities(), 0);
    }

    function testRefundRejectsReentrantCallbackButOuterSettlementSucceeds() external {
        uint256 invoiceId = _fundedAtOneDollar();
        vm.warp(uint256(deliveryDeadline) + 1);
        bytes memory callbackData =
            abi.encodeCall(ProofPayEscrow.refundUnsubmittedAfterDeadline, (invoiceId));
        fxrp.setCallback(address(escrow), callbackData, true, false);

        uint256 clientBefore = fxrp.balanceOf(CLIENT);
        vm.prank(CLIENT);
        escrow.refundUnsubmittedAfterDeadline(invoiceId);

        assertEq(fxrp.callbackAttempts(), 1);
        assertFalse(fxrp.callbackSucceeded());
        assertEq(fxrp.callbackRevertSelector(), REENTRANCY_SELECTOR);
        assertEq(uint8(_invoice(invoiceId).status), uint8(ProofPayEscrow.InvoiceStatus.REFUNDED));
        assertEq(fxrp.balanceOf(CLIENT) - clientBefore, LOCKED_AT_ONE_DOLLAR);
        assertEq(fxrp.balanceOf(address(escrow)), 0);
        assertEq(escrow.activeFxrpLiabilities(), 0);
    }

    function _assertSuccessfulRelease(uint256 releasePrice, uint256 payout, uint256 refund)
        internal
    {
        uint256 invoiceId = _submittedAtOneDollar();
        _setPrice(releasePrice);

        (
            uint256 quotedPayout,
            uint256 quotedRefund,
            uint256 quotedTopUp,
            uint256 quotedPrice,
            int8 quotedDecimals,
            uint64 quotedTimestamp
        ) = escrow.quoteRelease(invoiceId);
        assertEq(quotedPayout, payout);
        assertEq(quotedRefund, refund);
        assertEq(quotedTopUp, 0);
        assertEq(quotedPrice, releasePrice);
        assertEq(quotedDecimals, 6);
        assertEq(quotedTimestamp, uint64(block.timestamp));

        uint256 lockedBefore = _invoice(invoiceId).fxrpLocked;
        uint256 clientBefore = fxrp.balanceOf(CLIENT);
        uint256 freelancerBefore = fxrp.balanceOf(FREELANCER);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit InvoiceReleased(invoiceId, payout, refund, releasePrice, 6, uint64(block.timestamp));
        vm.prank(CLIENT);
        escrow.release(invoiceId, payout, uint64(block.timestamp));

        ProofPayEscrow.Invoice memory released = _invoice(invoiceId);
        assertEq(uint8(released.status), uint8(ProofPayEscrow.InvoiceStatus.RELEASED));
        assertEq(released.fxrpLocked, lockedBefore);
        assertEq(released.releasePrice, releasePrice);
        assertEq(released.releasePriceDecimals, 6);
        assertEq(released.releasePriceTimestamp, uint64(block.timestamp));
        assertEq(fxrp.balanceOf(FREELANCER) - freelancerBefore, payout);
        assertEq(fxrp.balanceOf(CLIENT) - clientBefore, refund);
        assertEq(payout + refund, lockedBefore);
        assertEq(fxrp.balanceOf(address(escrow)), 0);
        assertEq(escrow.activeFxrpLiabilities(), 0);
    }

    function _fundedAtOneDollar() internal returns (uint256 invoiceId) {
        _setPrice(1_000_000);
        vm.prank(FREELANCER);
        invoiceId = escrow.createInvoice(CLIENT, USD_TARGET, deliveryDeadline, SCOPE_HASH);
        vm.prank(CLIENT);
        escrow.fundInvoice(invoiceId, LOCKED_AT_ONE_DOLLAR, uint64(block.timestamp));
    }

    function _submittedAtOneDollar() internal returns (uint256 invoiceId) {
        invoiceId = _fundedAtOneDollar();
        vm.prank(FREELANCER);
        escrow.submitEvidence(invoiceId, EVIDENCE_HASH, EVIDENCE_URI);
    }

    function _setPrice(uint256 value) internal {
        ftso.setObservation(value, 6, uint64(block.timestamp));
    }

    function _invoice(uint256 invoiceId)
        internal
        view
        returns (ProofPayEscrow.Invoice memory invoice)
    {
        (bool success, bytes memory returnData) =
            address(escrow).staticcall(abi.encodeWithSignature("invoices(uint256)", invoiceId));
        assertTrue(success);
        invoice = abi.decode(returnData, (ProofPayEscrow.Invoice));
    }
}
