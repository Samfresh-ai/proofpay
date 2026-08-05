// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { Test } from "forge-std/Test.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { FtsoV2Interface } from "flare-periphery/src/coston2/FtsoV2Interface.sol";

import { ProofPayEscrow } from "../src/ProofPayEscrow.sol";
import { MockFXRP } from "./mocks/MockFXRP.sol";
import { MockFtsoV2 } from "./mocks/MockFtsoV2.sol";

contract ProofPayEscrowOracleTest is Test {
    uint256 internal constant COSTON2_CHAIN_ID = 114;
    uint64 internal constant NOW = 1_000_000;
    uint64 internal constant MAXIMUM_PRICE_AGE = 30;
    bytes21 internal constant XRP_USD_FEED_ID = 0x015852502f55534400000000000000000000000000;

    address internal constant CLIENT = address(0xC11E17);
    bytes32 internal constant SCOPE_HASH = keccak256("proofpay-oracle-test-scope");

    MockFXRP internal fxrp;
    MockFtsoV2 internal ftsoV2;
    ProofPayEscrow internal escrow;

    function setUp() public {
        vm.chainId(COSTON2_CHAIN_ID);
        vm.warp(NOW);

        fxrp = new MockFXRP(6);
        ftsoV2 = new MockFtsoV2(XRP_USD_FEED_ID);
        escrow = _deploy(fxrp, ftsoV2, XRP_USD_FEED_ID, MAXIMUM_PRICE_AGE);
        ftsoV2.setObservation(1_000_000, 6, NOW - 1);
    }

    function testConstructorRejectsWrongChain() public {
        vm.chainId(1);

        vm.expectRevert(
            abi.encodeWithSelector(ProofPayEscrow.WrongChain.selector, COSTON2_CHAIN_ID, uint256(1))
        );
        _deploy(fxrp, ftsoV2, XRP_USD_FEED_ID, MAXIMUM_PRICE_AGE);
    }

    function testConstructorRejectsZeroFxrp() public {
        vm.expectRevert(abi.encodeWithSelector(ProofPayEscrow.InvalidAddress.selector, address(0)));
        new ProofPayEscrow(
            IERC20Metadata(address(0)),
            FtsoV2Interface(address(ftsoV2)),
            XRP_USD_FEED_ID,
            MAXIMUM_PRICE_AGE
        );
    }

    function testConstructorRejectsCodeLessFxrp() public {
        address codeLess = address(0xBEEF);
        assertEq(codeLess.code.length, 0);

        vm.expectRevert(abi.encodeWithSelector(ProofPayEscrow.InvalidAddress.selector, codeLess));
        new ProofPayEscrow(
            IERC20Metadata(codeLess),
            FtsoV2Interface(address(ftsoV2)),
            XRP_USD_FEED_ID,
            MAXIMUM_PRICE_AGE
        );
    }

    function testConstructorRejectsZeroFtsoV2() public {
        vm.expectRevert(abi.encodeWithSelector(ProofPayEscrow.InvalidAddress.selector, address(0)));
        new ProofPayEscrow(
            IERC20Metadata(address(fxrp)),
            FtsoV2Interface(address(0)),
            XRP_USD_FEED_ID,
            MAXIMUM_PRICE_AGE
        );
    }

    function testConstructorRejectsCodeLessFtsoV2() public {
        address codeLess = address(0xF750);
        assertEq(codeLess.code.length, 0);

        vm.expectRevert(abi.encodeWithSelector(ProofPayEscrow.InvalidAddress.selector, codeLess));
        new ProofPayEscrow(
            IERC20Metadata(address(fxrp)),
            FtsoV2Interface(codeLess),
            XRP_USD_FEED_ID,
            MAXIMUM_PRICE_AGE
        );
    }

    function testConstructorRejectsWrongFxrpDecimals() public {
        MockFXRP wrongDecimals = new MockFXRP(5);

        vm.expectRevert(
            abi.encodeWithSelector(ProofPayEscrow.InvalidTokenDecimals.selector, uint8(6), uint8(5))
        );
        _deploy(wrongDecimals, ftsoV2, XRP_USD_FEED_ID, MAXIMUM_PRICE_AGE);
    }

    function testConstructorRejectsZeroFeedId() public {
        vm.expectRevert(ProofPayEscrow.InvalidHash.selector);
        _deploy(fxrp, ftsoV2, bytes21(0), MAXIMUM_PRICE_AGE);
    }

    function testConstructorRejectsZeroMaximumPriceAge() public {
        vm.expectRevert(abi.encodeWithSelector(ProofPayEscrow.InvalidAmount.selector, uint256(0)));
        _deploy(fxrp, ftsoV2, XRP_USD_FEED_ID, 0);
    }

    function testQuoteFundingReturnsExactProtectedAmountAndObservation() public {
        uint256 invoiceId = _createInvoice(100_000_000);
        uint64 feedTimestamp = NOW - 7;
        ftsoV2.setObservation(1_000_000, 6, feedTimestamp);

        (uint256 requiredFxrp, uint256 price, int8 decimals, uint64 timestamp) =
            escrow.quoteFunding(invoiceId);

        assertEq(requiredFxrp, 110_000_000);
        assertEq(price, 1_000_000);
        assertEq(int256(decimals), 6);
        assertEq(uint256(timestamp), uint256(feedTimestamp));
    }

    function testQuoteFundingRoundsUpInTwoDistinctStages() public {
        // Base: ceil(901 / 100) = 10. Buffer: ceil(10 * 1.1) = 11.
        // A single combined ceil would incorrectly return only 10.
        uint256 invoiceId = _createInvoice(901);
        ftsoV2.setObservation(100, 0, NOW);

        (uint256 requiredFxrp,,,) = escrow.quoteFunding(invoiceId);

        assertEq(requiredFxrp, 11);
    }

    function testQuoteFundingUsesOverflowSafeFullPrecisionMulDiv() public {
        uint256 usdTarget = type(uint256).max / 2;
        uint256 invoiceId = _createInvoice(usdTarget);
        ftsoV2.setObservation(1e18, 18, NOW);

        (uint256 requiredFxrp,,,) = escrow.quoteFunding(invoiceId);

        uint256 roundedTenth = usdTarget / 10 + (usdTarget % 10 == 0 ? 0 : 1);
        assertEq(requiredFxrp, usdTarget + roundedTenth);
    }

    function testQuoteFundingUsesActualReturnedFeedDecimals() public {
        uint256 invoiceId = _createInvoice(5_000_000);
        ftsoV2.setObservation(2_000, 3, NOW);

        (uint256 requiredFxrp, uint256 price, int8 decimals,) = escrow.quoteFunding(invoiceId);

        assertEq(requiredFxrp, 2_750_000);
        assertEq(price, 2_000);
        assertEq(int256(decimals), 3);
    }

    function testQuoteFundingDoesNotMutateEscrowStorage() public {
        uint256 invoiceId = _createInvoice(100_000_000);
        bytes memory invoiceBefore = _encodedInvoice(invoiceId);
        uint256 liabilitiesBefore = escrow.activeFxrpLiabilities();

        escrow.quoteFunding(invoiceId);

        assertEq(keccak256(_encodedInvoice(invoiceId)), keccak256(invoiceBefore));
        assertEq(escrow.activeFxrpLiabilities(), liabilitiesBefore);
        assertEq(_createInvoice(1), 2);
    }

    function testQuoteFundingRejectsNonzeroFtsoFeeBeforeFeedRead() public {
        uint256 invoiceId = _createInvoice(100_000_000);
        ftsoV2.setFee(7);

        vm.expectRevert(
            abi.encodeWithSelector(ProofPayEscrow.UnsupportedFtsoFee.selector, uint256(7))
        );
        escrow.quoteFunding(invoiceId);

        assertEq(ftsoV2.getFeedCalls(), 0);
    }

    function testQuoteFundingMapsFeeCalculationRevertToPriceReadFailed() public {
        uint256 invoiceId = _createInvoice(100_000_000);
        ftsoV2.setReverts(true, false);

        vm.expectRevert(ProofPayEscrow.PriceReadFailed.selector);
        escrow.quoteFunding(invoiceId);

        assertEq(ftsoV2.getFeedCalls(), 0);
    }

    function testQuoteFundingMapsFeedReadRevertToPriceReadFailed() public {
        uint256 invoiceId = _createInvoice(100_000_000);
        ftsoV2.setReverts(false, true);

        vm.expectRevert(ProofPayEscrow.PriceReadFailed.selector);
        escrow.quoteFunding(invoiceId);

        assertEq(ftsoV2.getFeedCalls(), 0);
    }

    function testQuoteFundingReadsConfiguredFeedWithExplicitZeroValue() public {
        uint256 invoiceId = _createInvoice(100_000_000);

        escrow.quoteFunding(invoiceId);

        assertEq(ftsoV2.getFeedCalls(), 1);
        assertEq(bytes32(ftsoV2.lastFeedId()), bytes32(XRP_USD_FEED_ID));
        assertEq(ftsoV2.lastMsgValue(), 0);
    }

    function testQuoteFundingRejectsZeroPrice() public {
        uint256 invoiceId = _createInvoice(100_000_000);
        uint64 timestamp = NOW - 1;
        ftsoV2.setObservation(0, 6, timestamp);

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidPrice.selector, uint256(0), int8(6), timestamp
            )
        );
        escrow.quoteFunding(invoiceId);
    }

    function testQuoteFundingRejectsNegativeAndAboveLimitDecimals() public {
        uint256 invoiceId = _createInvoice(100_000_000);
        uint64 timestamp = NOW - 1;

        ftsoV2.setObservation(1_000_000, -1, timestamp);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidPrice.selector, uint256(1_000_000), int8(-1), timestamp
            )
        );
        escrow.quoteFunding(invoiceId);

        ftsoV2.setObservation(1_000_000, 19, timestamp);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidPrice.selector, uint256(1_000_000), int8(19), timestamp
            )
        );
        escrow.quoteFunding(invoiceId);
    }

    function testQuoteFundingRejectsZeroAndFutureTimestamp() public {
        uint256 invoiceId = _createInvoice(100_000_000);

        ftsoV2.setObservation(1_000_000, 6, 0);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidPrice.selector, uint256(1_000_000), int8(6), uint64(0)
            )
        );
        escrow.quoteFunding(invoiceId);

        uint64 futureTimestamp = NOW + 1;
        ftsoV2.setObservation(1_000_000, 6, futureTimestamp);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.InvalidPrice.selector, uint256(1_000_000), int8(6), futureTimestamp
            )
        );
        escrow.quoteFunding(invoiceId);
    }

    function testQuoteFundingAcceptsFreshnessEqualityAndRejectsOneSecondOlder() public {
        uint256 invoiceId = _createInvoice(100_000_000);
        uint64 acceptedTimestamp = NOW - MAXIMUM_PRICE_AGE;
        ftsoV2.setObservation(1_000_000, 6, acceptedTimestamp);

        (,,, uint64 returnedTimestamp) = escrow.quoteFunding(invoiceId);
        assertEq(uint256(returnedTimestamp), uint256(acceptedTimestamp));

        uint64 staleTimestamp = acceptedTimestamp - 1;
        ftsoV2.setObservation(1_000_000, 6, staleTimestamp);
        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.StalePrice.selector, staleTimestamp, NOW, MAXIMUM_PRICE_AGE
            )
        );
        escrow.quoteFunding(invoiceId);
    }

    function testQuoteFundingRejectsInvoiceAtDeliveryDeadline() public {
        uint64 deadline = NOW + 1;
        uint256 invoiceId = escrow.createInvoice(CLIENT, 100_000_000, deadline, SCOPE_HASH);
        vm.warp(deadline);

        vm.expectRevert(
            abi.encodeWithSelector(
                ProofPayEscrow.DeliveryDeadlinePassed.selector, deadline, deadline
            )
        );
        escrow.quoteFunding(invoiceId);
    }

    function _createInvoice(uint256 usdTarget) internal returns (uint256 invoiceId) {
        invoiceId = escrow.createInvoice(CLIENT, usdTarget, NOW + 1 days, SCOPE_HASH);
    }

    function _deploy(MockFXRP fxrp_, MockFtsoV2 ftsoV2_, bytes21 feedId, uint64 maximumPriceAge)
        internal
        returns (ProofPayEscrow deployed)
    {
        deployed = new ProofPayEscrow(
            IERC20Metadata(address(fxrp_)),
            FtsoV2Interface(address(ftsoV2_)),
            feedId,
            maximumPriceAge
        );
    }

    function _encodedInvoice(uint256 invoiceId) internal view returns (bytes memory data) {
        (bool success, bytes memory returnData) = address(escrow)
            .staticcall(abi.encodeWithSelector(bytes4(keccak256("invoices(uint256)")), invoiceId));
        assertTrue(success);
        return returnData;
    }
}
