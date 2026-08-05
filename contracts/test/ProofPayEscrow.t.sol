// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { Test } from "forge-std/Test.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { FtsoV2Interface } from "flare-periphery/src/coston2/FtsoV2Interface.sol";
import { ProofPayEscrow } from "../src/ProofPayEscrow.sol";
import { MockFXRP } from "./mocks/MockFXRP.sol";
import { MockFtsoV2 } from "./mocks/MockFtsoV2.sol";

contract ProofPayEscrowTest is Test {
    bytes21 internal constant XRP_USD_FEED_ID = 0x015852502f55534400000000000000000000000000;
    address internal constant FREELANCER = address(0xF1);
    address internal constant CLIENT = address(0xC1);
    address internal constant STRANGER = address(0xB0B);

    uint256 internal constant USD_TARGET = 100_000_000;
    uint256 internal constant FUNDING_AT_ONE_DOLLAR = 110_000_000;
    uint64 internal constant MAXIMUM_PRICE_AGE = 120;
    bytes32 internal constant SCOPE_HASH = keccak256("proofpay-scope");
    bytes32 internal constant EVIDENCE_HASH = keccak256("proofpay-evidence-manifest");
    string internal constant EVIDENCE_URI = "ipfs://proofpay-evidence-manifest";

    MockFXRP internal fxrp;
    MockFtsoV2 internal ftso;
    ProofPayEscrow internal escrow;
    uint64 internal deliveryDeadline;

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

        deliveryDeadline = uint64(block.timestamp + 7 days);
        fxrp.mint(CLIENT, 1_000_000_000_000_000);
        vm.prank(CLIENT);
        fxrp.approve(address(escrow), type(uint256).max);
    }

    function testCreateInvoiceStoresOnlyCreationTermsAndEmitsReceiptData() external {
        vm.expectEmit(true, true, true, true, address(escrow));
        emit InvoiceCreated(1, FREELANCER, CLIENT, USD_TARGET, deliveryDeadline, SCOPE_HASH);

        uint256 invoiceId = _createInvoice(USD_TARGET, deliveryDeadline);
        ProofPayEscrow.Invoice memory invoice = _invoice(invoiceId);

        assertEq(invoiceId, 1);
        assertEq(invoice.freelancer, FREELANCER);
        assertEq(invoice.client, CLIENT);
        assertEq(invoice.usdTarget, USD_TARGET);
        assertEq(invoice.fxrpLocked, 0);
        assertEq(invoice.deliveryDeadline, deliveryDeadline);
        assertEq(invoice.scopeHash, SCOPE_HASH);
        assertEq(invoice.evidenceHash, bytes32(0));
        assertEq(invoice.fundingPrice, 0);
        assertEq(invoice.fundingPriceTimestamp, 0);
        assertEq(invoice.releasePrice, 0);
        assertEq(invoice.releasePriceTimestamp, 0);
        assertEq(uint8(invoice.status), uint8(ProofPayEscrow.InvoiceStatus.CREATED));

        uint256 secondInvoiceId = _createInvoice(1, deliveryDeadline + 1);
        assertEq(secondInvoiceId, 2);
    }

    function testCreateInvoiceRejectsInvalidInputs() external {
        vm.startPrank(FREELANCER);

        vm.expectRevert(abi.encodeWithSelector(ProofPayEscrow.InvalidAddress.selector, address(0)));
        escrow.createInvoice(address(0), USD_TARGET, deliveryDeadline, SCOPE_HASH);

        vm.expectRevert(abi.encodeWithSelector(ProofPayEscrow.InvalidAddress.selector, FREELANCER));
        escrow.createInvoice(FREELANCER, USD_TARGET, deliveryDeadline, SCOPE_HASH);

        vm.expectRevert(abi.encodeWithSelector(ProofPayEscrow.InvalidAmount.selector, 0));
        escrow.createInvoice(CLIENT, 0, deliveryDeadline, SCOPE_HASH);

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.DeliveryDeadlinePassed.selector,
                uint64(block.timestamp),
                block.timestamp
            )
        );
        escrow.createInvoice(CLIENT, USD_TARGET, uint64(block.timestamp), SCOPE_HASH);

        vm.expectRevert(ProofPayEscrow.InvalidHash.selector);
        escrow.createInvoice(CLIENT, USD_TARGET, deliveryDeadline, bytes32(0));

        vm.stopPrank();
    }

    function testNamedRolesAreEnforcedForEveryLifecycleAction() external {
        uint256 submittedInvoice = _createInvoice(USD_TARGET, deliveryDeadline);

        vm.expectRevert(
            abi.encodeWithSelector(ProofPayEscrow.UnauthorizedCaller.selector, STRANGER)
        );
        vm.prank(STRANGER);
        escrow.fundInvoice(submittedInvoice, FUNDING_AT_ONE_DOLLAR, uint64(block.timestamp + 1));
        _fundInvoice(submittedInvoice);

        vm.expectRevert(
            abi.encodeWithSelector(ProofPayEscrow.UnauthorizedCaller.selector, STRANGER)
        );
        vm.prank(STRANGER);
        escrow.submitEvidence(submittedInvoice, EVIDENCE_HASH, EVIDENCE_URI);
        _submitEvidence(submittedInvoice);

        ftso.setObservation(900_000, 6, uint64(block.timestamp));
        vm.expectRevert(
            abi.encodeWithSelector(ProofPayEscrow.UnauthorizedCaller.selector, STRANGER)
        );
        vm.prank(STRANGER);
        escrow.topUp(submittedInvoice, type(uint256).max, uint64(block.timestamp + 1));

        vm.expectRevert(
            abi.encodeWithSelector(ProofPayEscrow.UnauthorizedCaller.selector, FREELANCER)
        );
        vm.prank(FREELANCER);
        escrow.release(submittedInvoice, type(uint256).max, uint64(block.timestamp + 1));

        uint256 createdInvoice = _createInvoice(USD_TARGET, deliveryDeadline);
        vm.expectRevert(abi.encodeWithSelector(ProofPayEscrow.UnauthorizedCaller.selector, CLIENT));
        vm.prank(CLIENT);
        escrow.cancelBeforeFunding(createdInvoice);

        ftso.setObservation(1_000_000, 6, uint64(block.timestamp));
        uint256 refundableInvoice = _createInvoice(USD_TARGET, deliveryDeadline);
        _fundInvoice(refundableInvoice);
        vm.warp(uint256(deliveryDeadline) + 1);

        vm.expectRevert(
            abi.encodeWithSelector(ProofPayEscrow.UnauthorizedCaller.selector, FREELANCER)
        );
        vm.prank(FREELANCER);
        escrow.refundUnsubmittedAfterDeadline(refundableInvoice);
    }

    function testUndefinedStateTransitionsAreRejected() external {
        uint256 invoiceId = _createInvoice(USD_TARGET, deliveryDeadline);

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidState.selector,
                invoiceId,
                ProofPayEscrow.InvoiceStatus.CREATED
            )
        );
        vm.prank(FREELANCER);
        escrow.submitEvidence(invoiceId, EVIDENCE_HASH, EVIDENCE_URI);

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidState.selector,
                invoiceId,
                ProofPayEscrow.InvoiceStatus.CREATED
            )
        );
        vm.prank(CLIENT);
        escrow.topUp(invoiceId, type(uint256).max, uint64(block.timestamp + 1));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidState.selector,
                invoiceId,
                ProofPayEscrow.InvoiceStatus.CREATED
            )
        );
        vm.prank(CLIENT);
        escrow.release(invoiceId, type(uint256).max, uint64(block.timestamp + 1));

        _fundInvoice(invoiceId);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidState.selector, invoiceId, ProofPayEscrow.InvoiceStatus.FUNDED
            )
        );
        vm.prank(CLIENT);
        escrow.topUp(invoiceId, type(uint256).max, uint64(block.timestamp + 1));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidState.selector, invoiceId, ProofPayEscrow.InvoiceStatus.FUNDED
            )
        );
        vm.prank(CLIENT);
        escrow.release(invoiceId, type(uint256).max, uint64(block.timestamp + 1));

        _submitEvidence(invoiceId);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidState.selector,
                invoiceId,
                ProofPayEscrow.InvoiceStatus.SUBMITTED
            )
        );
        vm.prank(CLIENT);
        escrow.fundInvoice(invoiceId, type(uint256).max, uint64(block.timestamp + 1));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidState.selector,
                invoiceId,
                ProofPayEscrow.InvoiceStatus.SUBMITTED
            )
        );
        vm.prank(FREELANCER);
        escrow.cancelBeforeFunding(invoiceId);

        vm.prank(CLIENT);
        escrow.release(invoiceId, USD_TARGET, uint64(block.timestamp + 1));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidState.selector,
                invoiceId,
                ProofPayEscrow.InvoiceStatus.RELEASED
            )
        );
        vm.prank(CLIENT);
        escrow.refundUnsubmittedAfterDeadline(invoiceId);

        uint256 cancelled = _createInvoice(USD_TARGET, deliveryDeadline);
        vm.prank(FREELANCER);
        escrow.cancelBeforeFunding(cancelled);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidState.selector,
                cancelled,
                ProofPayEscrow.InvoiceStatus.CANCELLED
            )
        );
        vm.prank(FREELANCER);
        escrow.submitEvidence(cancelled, EVIDENCE_HASH, EVIDENCE_URI);

        uint64 shortDeadline = uint64(block.timestamp + 10);
        uint256 refunded = _createInvoice(USD_TARGET, shortDeadline);
        _fundInvoice(refunded);
        vm.warp(uint256(shortDeadline) + 1);
        vm.prank(CLIENT);
        escrow.refundUnsubmittedAfterDeadline(refunded);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidState.selector,
                refunded,
                ProofPayEscrow.InvoiceStatus.REFUNDED
            )
        );
        vm.prank(CLIENT);
        escrow.release(refunded, type(uint256).max, uint64(block.timestamp + 1));
    }

    function testFundingTransfersExactAmountAndPersistsObservation() external {
        uint256 invoiceId = _createInvoice(USD_TARGET, deliveryDeadline);
        uint256 clientBefore = fxrp.balanceOf(CLIENT);

        vm.expectEmit(true, false, false, true, address(escrow));
        emit InvoiceFunded(invoiceId, FUNDING_AT_ONE_DOLLAR, 1_000_000, 6, uint64(block.timestamp));
        vm.prank(CLIENT);
        escrow.fundInvoice(invoiceId, FUNDING_AT_ONE_DOLLAR, uint64(block.timestamp + 60));

        ProofPayEscrow.Invoice memory invoice = _invoice(invoiceId);
        assertEq(invoice.fxrpLocked, FUNDING_AT_ONE_DOLLAR);
        assertEq(invoice.fundingPrice, 1_000_000);
        assertEq(invoice.fundingPriceDecimals, 6);
        assertEq(invoice.fundingPriceTimestamp, uint64(block.timestamp));
        assertEq(uint8(invoice.status), uint8(ProofPayEscrow.InvoiceStatus.FUNDED));
        assertEq(clientBefore - fxrp.balanceOf(CLIENT), FUNDING_AT_ONE_DOLLAR);
        assertEq(fxrp.balanceOf(address(escrow)), FUNDING_AT_ONE_DOLLAR);
        assertEq(escrow.activeFxrpLiabilities(), FUNDING_AT_ONE_DOLLAR);
        _assertSolvent();
    }

    function testDuplicateAndLateFundingRevertWithoutTransfer() external {
        uint256 invoiceId = _createInvoice(USD_TARGET, deliveryDeadline);
        _fundInvoice(invoiceId);
        uint256 clientAfterFunding = fxrp.balanceOf(CLIENT);
        uint256 escrowAfterFunding = fxrp.balanceOf(address(escrow));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidState.selector, invoiceId, ProofPayEscrow.InvoiceStatus.FUNDED
            )
        );
        vm.prank(CLIENT);
        escrow.fundInvoice(invoiceId, type(uint256).max, uint64(block.timestamp + 1));

        assertEq(fxrp.balanceOf(CLIENT), clientAfterFunding);
        assertEq(fxrp.balanceOf(address(escrow)), escrowAfterFunding);

        uint64 nearDeadline = uint64(block.timestamp + 10);
        uint256 lateInvoice = _createInvoice(USD_TARGET, nearDeadline);
        vm.warp(nearDeadline);
        ftso.setObservation(1_000_000, 6, nearDeadline);

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.DeliveryDeadlinePassed.selector, nearDeadline, nearDeadline
            )
        );
        vm.prank(CLIENT);
        escrow.fundInvoice(lateInvoice, type(uint256).max, nearDeadline);

        assertEq(_invoice(lateInvoice).fxrpLocked, 0);
        assertEq(escrow.activeFxrpLiabilities(), FUNDING_AT_ONE_DOLLAR);
    }

    function testFundingQuoteDeadlineEqualityPassesAndOneSecondLateFails() external {
        uint256 atBoundary = _createInvoice(USD_TARGET, deliveryDeadline);
        vm.prank(CLIENT);
        escrow.fundInvoice(atBoundary, FUNDING_AT_ONE_DOLLAR, uint64(block.timestamp));
        assertEq(_invoice(atBoundary).fxrpLocked, FUNDING_AT_ONE_DOLLAR);

        uint256 expired = _createInvoice(USD_TARGET, deliveryDeadline);
        uint64 quoteDeadline = 1_800_000_000;
        vm.warp(uint256(quoteDeadline) + 1);
        ftso.setObservation(1_000_000, 6, quoteDeadline + 1);
        uint256 clientBefore = fxrp.balanceOf(CLIENT);

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.ExpiredQuote.selector, quoteDeadline, uint256(quoteDeadline) + 1
            )
        );
        vm.prank(CLIENT);
        escrow.fundInvoice(expired, FUNDING_AT_ONE_DOLLAR, quoteDeadline);

        assertEq(fxrp.balanceOf(CLIENT), clientBefore);
        assertEq(_invoice(expired).fxrpLocked, 0);
    }

    function testFundingMaximumBalanceAndIncomingDeltaChecksRollBackAllEffects() external {
        uint256 aboveMaximum = _createInvoice(USD_TARGET, deliveryDeadline);
        uint256 clientBefore = fxrp.balanceOf(CLIENT);

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.AmountAboveClientMaximum.selector,
                FUNDING_AT_ONE_DOLLAR,
                FUNDING_AT_ONE_DOLLAR - 1
            )
        );
        vm.prank(CLIENT);
        escrow.fundInvoice(aboveMaximum, FUNDING_AT_ONE_DOLLAR - 1, uint64(block.timestamp + 1));
        assertEq(fxrp.balanceOf(CLIENT), clientBefore);
        assertEq(escrow.activeFxrpLiabilities(), 0);

        uint256 mismatch = _createInvoice(USD_TARGET, deliveryDeadline);
        fxrp.setIncomingShortfall(1);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.UnexpectedFXRPReceived.selector,
                FUNDING_AT_ONE_DOLLAR,
                FUNDING_AT_ONE_DOLLAR - 1
            )
        );
        vm.prank(CLIENT);
        escrow.fundInvoice(mismatch, FUNDING_AT_ONE_DOLLAR, uint64(block.timestamp + 1));

        assertEq(fxrp.balanceOf(CLIENT), clientBefore);
        assertEq(fxrp.balanceOf(address(escrow)), 0);
        assertEq(_invoice(mismatch).fxrpLocked, 0);
        assertEq(uint8(_invoice(mismatch).status), uint8(ProofPayEscrow.InvoiceStatus.CREATED));
        assertEq(escrow.activeFxrpLiabilities(), 0);
    }

    function testFundingRejectsInsufficientClientBalanceWithoutStateChange() external {
        address poorClient = address(0xCAFE);
        vm.prank(FREELANCER);
        uint256 invoiceId =
            escrow.createInvoice(poorClient, USD_TARGET, deliveryDeadline, SCOPE_HASH);

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InsufficientFXRP.selector, 0, FUNDING_AT_ONE_DOLLAR
            )
        );
        vm.prank(poorClient);
        escrow.fundInvoice(invoiceId, FUNDING_AT_ONE_DOLLAR, uint64(block.timestamp + 1));

        assertEq(_invoice(invoiceId).fxrpLocked, 0);
        assertEq(escrow.activeFxrpLiabilities(), 0);
    }

    function testUnknownInvoiceAndZeroFundingMaximumFailBeforeAnyTransfer() external {
        vm.expectRevert(abi.encodeWithSelector(ProofPayEscrow.InvoiceNotFound.selector, 999));
        escrow.quoteFunding(999);

        uint256 invoiceId = _createInvoice(USD_TARGET, deliveryDeadline);
        uint256 clientBefore = fxrp.balanceOf(CLIENT);
        vm.expectRevert(abi.encodeWithSelector(ProofPayEscrow.InvalidAmount.selector, 0));
        vm.prank(CLIENT);
        escrow.fundInvoice(invoiceId, 0, uint64(block.timestamp + 1));

        assertEq(fxrp.balanceOf(CLIENT), clientBefore);
        assertEq(fxrp.balanceOf(address(escrow)), 0);
        assertEq(_invoice(invoiceId).fxrpLocked, 0);
        assertEq(escrow.activeFxrpLiabilities(), 0);
    }

    function testEvidenceSubmissionPersistsHashEmitsURIAndCannotBeReplaced() external {
        uint256 invoiceId = _fundedInvoice();

        vm.expectEmit(true, true, false, true, address(escrow));
        emit EvidenceSubmitted(invoiceId, EVIDENCE_HASH, EVIDENCE_URI);
        _submitEvidence(invoiceId);

        ProofPayEscrow.Invoice memory invoice = _invoice(invoiceId);
        assertEq(invoice.evidenceHash, EVIDENCE_HASH);
        assertEq(uint8(invoice.status), uint8(ProofPayEscrow.InvoiceStatus.SUBMITTED));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidState.selector,
                invoiceId,
                ProofPayEscrow.InvoiceStatus.SUBMITTED
            )
        );
        vm.prank(FREELANCER);
        escrow.submitEvidence(invoiceId, keccak256("replacement"), "ipfs://replacement");

        assertEq(_invoice(invoiceId).evidenceHash, EVIDENCE_HASH);
    }

    function testEvidenceHashUriAndDeadlineBounds() external {
        uint256 zeroHash = _fundedInvoice();
        vm.expectRevert(ProofPayEscrow.InvalidHash.selector);
        vm.prank(FREELANCER);
        escrow.submitEvidence(zeroHash, bytes32(0), EVIDENCE_URI);

        uint256 emptyUri = _fundedInvoice();
        vm.expectRevert(abi.encodeWithSelector(ProofPayEscrow.InvalidEvidenceURI.selector, 0));
        vm.prank(FREELANCER);
        escrow.submitEvidence(emptyUri, EVIDENCE_HASH, "");

        uint256 longUri = _fundedInvoice();
        string memory uri257 = string(new bytes(257));
        vm.expectRevert(abi.encodeWithSelector(ProofPayEscrow.InvalidEvidenceURI.selector, 257));
        vm.prank(FREELANCER);
        escrow.submitEvidence(longUri, EVIDENCE_HASH, uri257);

        uint256 maxUri = _fundedInvoice();
        vm.prank(FREELANCER);
        escrow.submitEvidence(maxUri, EVIDENCE_HASH, string(new bytes(256)));
        assertEq(uint8(_invoice(maxUri).status), uint8(ProofPayEscrow.InvoiceStatus.SUBMITTED));

        uint64 exactDeadline = uint64(block.timestamp + 10);
        uint256 exact = _createInvoice(USD_TARGET, exactDeadline);
        _fundInvoice(exact);
        vm.warp(exactDeadline);
        vm.prank(FREELANCER);
        escrow.submitEvidence(exact, EVIDENCE_HASH, EVIDENCE_URI);

        uint64 missedDeadline = exactDeadline + 10;
        uint256 late = _createInvoice(USD_TARGET, missedDeadline);
        ftso.setObservation(1_000_000, 6, exactDeadline);
        _fundInvoice(late);
        vm.warp(uint256(missedDeadline) + 1);

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.DeliveryDeadlinePassed.selector,
                missedDeadline,
                uint256(missedDeadline) + 1
            )
        );
        vm.prank(FREELANCER);
        escrow.submitEvidence(late, EVIDENCE_HASH, EVIDENCE_URI);
    }

    function testFreelancerCancelsOnlyBeforeFundingAndEventIsEmitted() external {
        uint256 invoiceId = _createInvoice(USD_TARGET, deliveryDeadline);
        uint256 clientBefore = fxrp.balanceOf(CLIENT);

        vm.expectEmit(true, false, false, true, address(escrow));
        emit InvoiceCancelled(invoiceId);
        vm.prank(FREELANCER);
        escrow.cancelBeforeFunding(invoiceId);

        assertEq(uint8(_invoice(invoiceId).status), uint8(ProofPayEscrow.InvoiceStatus.CANCELLED));
        assertEq(fxrp.balanceOf(CLIENT), clientBefore);
        assertEq(fxrp.balanceOf(address(escrow)), 0);
        assertEq(escrow.activeFxrpLiabilities(), 0);

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidState.selector,
                invoiceId,
                ProofPayEscrow.InvoiceStatus.CANCELLED
            )
        );
        vm.prank(CLIENT);
        escrow.fundInvoice(invoiceId, FUNDING_AT_ONE_DOLLAR, uint64(block.timestamp + 1));

        uint256 fundedInvoice = _fundedInvoice();
        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidState.selector,
                fundedInvoice,
                ProofPayEscrow.InvoiceStatus.FUNDED
            )
        );
        vm.prank(FREELANCER);
        escrow.cancelBeforeFunding(fundedInvoice);
    }

    function testRefundIsStrictlyAfterDeadlineAndReturnsTheFullLockedAmount() external {
        uint64 shortDeadline = uint64(block.timestamp + 10);
        uint256 invoiceId = _createInvoice(USD_TARGET, shortDeadline);
        _fundInvoice(invoiceId);
        uint256 clientAfterFunding = fxrp.balanceOf(CLIENT);

        vm.warp(shortDeadline);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.DeadlineNotReached.selector, shortDeadline, shortDeadline
            )
        );
        vm.prank(CLIENT);
        escrow.refundUnsubmittedAfterDeadline(invoiceId);

        assertEq(fxrp.balanceOf(CLIENT), clientAfterFunding);
        assertEq(fxrp.balanceOf(address(escrow)), FUNDING_AT_ONE_DOLLAR);
        assertEq(escrow.activeFxrpLiabilities(), FUNDING_AT_ONE_DOLLAR);

        vm.warp(uint256(shortDeadline) + 1);
        vm.expectEmit(true, false, false, true, address(escrow));
        emit InvoiceRefunded(invoiceId, FUNDING_AT_ONE_DOLLAR);
        vm.prank(CLIENT);
        escrow.refundUnsubmittedAfterDeadline(invoiceId);

        assertEq(uint8(_invoice(invoiceId).status), uint8(ProofPayEscrow.InvoiceStatus.REFUNDED));
        assertEq(fxrp.balanceOf(CLIENT), clientAfterFunding + FUNDING_AT_ONE_DOLLAR);
        assertEq(fxrp.balanceOf(address(escrow)), 0);
        assertEq(escrow.activeFxrpLiabilities(), 0);
        _assertSolvent();
    }

    function testSubmittedInvoiceCannotUseMissedDeadlineRefundAndTransfersNothing() external {
        uint256 invoiceId = _fundedAndSubmittedInvoice();
        vm.warp(uint256(deliveryDeadline) + 1);
        uint256 clientBefore = fxrp.balanceOf(CLIENT);
        uint256 escrowBefore = fxrp.balanceOf(address(escrow));

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidState.selector,
                invoiceId,
                ProofPayEscrow.InvoiceStatus.SUBMITTED
            )
        );
        vm.prank(CLIENT);
        escrow.refundUnsubmittedAfterDeadline(invoiceId);

        assertEq(fxrp.balanceOf(CLIENT), clientBefore);
        assertEq(fxrp.balanceOf(address(escrow)), escrowBefore);
        assertEq(escrow.activeFxrpLiabilities(), FUNDING_AT_ONE_DOLLAR);
        assertEq(uint8(_invoice(invoiceId).status), uint8(ProofPayEscrow.InvoiceStatus.SUBMITTED));
    }

    function _createInvoice(uint256 usdTarget, uint64 deadline)
        internal
        returns (uint256 invoiceId)
    {
        vm.prank(FREELANCER);
        invoiceId = escrow.createInvoice(CLIENT, usdTarget, deadline, SCOPE_HASH);
    }

    function _fundInvoice(uint256 invoiceId) internal {
        vm.prank(CLIENT);
        escrow.fundInvoice(invoiceId, type(uint256).max, uint64(block.timestamp + 60));
    }

    function _fundedInvoice() internal returns (uint256 invoiceId) {
        invoiceId = _createInvoice(USD_TARGET, deliveryDeadline);
        _fundInvoice(invoiceId);
    }

    function _submitEvidence(uint256 invoiceId) internal {
        vm.prank(FREELANCER);
        escrow.submitEvidence(invoiceId, EVIDENCE_HASH, EVIDENCE_URI);
    }

    function _fundedAndSubmittedInvoice() internal returns (uint256 invoiceId) {
        invoiceId = _fundedInvoice();
        _submitEvidence(invoiceId);
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

    function _assertSolvent() internal view {
        assertGe(fxrp.balanceOf(address(escrow)), escrow.activeFxrpLiabilities());
    }
}
