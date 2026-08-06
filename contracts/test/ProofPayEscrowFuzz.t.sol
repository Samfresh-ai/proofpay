// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { Test } from "forge-std/Test.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { FtsoV2Interface } from "flare-periphery/src/coston2/FtsoV2Interface.sol";

import { ProofPayEscrow } from "../src/ProofPayEscrow.sol";
import { MockFXRP } from "./mocks/MockFXRP.sol";
import { MockFtsoV2 } from "./mocks/MockFtsoV2.sol";

contract ProofPayEscrowMathHarness is ProofPayEscrow {
    constructor(
        IERC20Metadata fxrp_,
        FtsoV2Interface ftsoV2_,
        bytes21 xrpUsdFeedId_,
        uint64 maximumPriceAge_
    ) ProofPayEscrow(fxrp_, ftsoV2_, xrpUsdFeedId_, maximumPriceAge_) { }

    function exposedRequiredFxrp(uint256 usdTarget, uint256 price, int8 priceDecimals)
        external
        pure
        returns (uint256)
    {
        return _requiredFxrp(usdTarget, price, priceDecimals);
    }

    function exposedFundingRequirement(uint256 usdTarget, uint256 price, int8 priceDecimals)
        external
        pure
        returns (uint256)
    {
        return _fundingRequirement(usdTarget, price, priceDecimals);
    }
}

contract ProofPayEscrowFuzzTest is Test {
    bytes21 internal constant XRP_USD_FEED_ID = 0x015852502f55534400000000000000000000000000;
    address internal constant FREELANCER = address(0xF1);
    address internal constant CLIENT = address(0xC1);

    uint256 internal constant MIN_USD_TARGET = 1;
    uint256 internal constant MAX_USD_TARGET = 1_000_000_000_000_000_000;
    uint256 internal constant MIN_NORMALIZED_PRICE_DENOMINATOR = 100;
    uint256 internal constant MAX_NORMALIZED_PRICE = 100;
    uint64 internal constant MAXIMUM_PRICE_AGE = 30;
    bytes32 internal constant SCOPE_HASH = keccak256("proofpay-fuzz-scope");
    bytes32 internal constant EVIDENCE_HASH = keccak256("proofpay-fuzz-evidence");
    string internal constant EVIDENCE_URI = "ipfs://proofpay-fuzz-evidence";

    MockFXRP internal fxrp;
    MockFtsoV2 internal ftso;
    ProofPayEscrowMathHarness internal escrow;
    uint64 internal deliveryDeadline;

    function setUp() external {
        vm.chainId(114);
        vm.warp(1_800_000_000);

        fxrp = new MockFXRP(6);
        ftso = new MockFtsoV2(XRP_USD_FEED_ID);
        escrow = new ProofPayEscrowMathHarness(
            IERC20Metadata(address(fxrp)),
            FtsoV2Interface(address(ftso)),
            XRP_USD_FEED_ID,
            MAXIMUM_PRICE_AGE
        );
        deliveryDeadline = uint64(block.timestamp + 1 days);

        vm.prank(CLIENT);
        fxrp.approve(address(escrow), type(uint256).max);
    }

    function testFuzz_RequiredPayoutRoundsUpAndOneAtomicUnitLessFails(
        uint256 usdSeed,
        uint256 priceSeed,
        uint8 decimalsSeed
    ) external view {
        (uint256 usdTarget, uint256 price, int8 decimals, uint256 scale) =
            _boundFinancialInputs(usdSeed, priceSeed, decimalsSeed);

        uint256 required = escrow.exposedRequiredFxrp(usdTarget, price, decimals);
        uint256 targetNumerator = usdTarget * scale;

        assertEq(required, _ceilDiv(targetNumerator, price));
        assertGe(required * price, targetNumerator);
        assertGt(required, 0);
        assertLt((required - 1) * price, targetNumerator);
    }

    function testFuzz_FundingIsExactlyTwoUpwardRoundedStages(
        uint256 usdSeed,
        uint256 priceSeed,
        uint8 decimalsSeed
    ) external view {
        (uint256 usdTarget, uint256 price, int8 decimals, uint256 scale) =
            _boundFinancialInputs(usdSeed, priceSeed, decimalsSeed);

        uint256 baseRequired = escrow.exposedRequiredFxrp(usdTarget, price, decimals);
        uint256 protectedRequired = escrow.exposedFundingRequirement(usdTarget, price, decimals);
        uint256 expectedBase = _ceilDiv(usdTarget * scale, price);
        uint256 protectedNumerator = expectedBase * 11_000;

        assertEq(baseRequired, expectedBase);
        assertEq(protectedRequired, _ceilDiv(protectedNumerator, 10_000));
        assertGe(protectedRequired * 10_000, protectedNumerator);
        assertLt((protectedRequired - 1) * 10_000, protectedNumerator);
    }

    function testFuzz_EngineeredExactAndOneRemainderBoundaries(
        uint256 quotientSeed,
        uint256 priceSeed
    ) external view {
        uint256 quotient = bound(quotientSeed, 1, 1_000_000_000);
        uint256 price = bound(priceSeed, 2, 1_000_000_000);
        uint256 exactTarget = quotient * price;

        assertEq(escrow.exposedRequiredFxrp(exactTarget, price, 0), quotient);
        assertEq(escrow.exposedRequiredFxrp(exactTarget + 1, price, 0), quotient + 1);
    }

    function testFuzz_NormalizationMatchesAtZeroSixTwelveAndEighteenDecimals(
        uint256 usdSeed,
        uint256 wholeDollarPriceSeed
    ) external view {
        uint256 usdTarget = bound(usdSeed, MIN_USD_TARGET, MAX_USD_TARGET);
        uint256 wholeDollarPrice = bound(wholeDollarPriceSeed, 1, MAX_NORMALIZED_PRICE);
        uint256 expected = _ceilDiv(usdTarget, wholeDollarPrice);
        uint8[4] memory decimalCases = [uint8(0), uint8(6), uint8(12), uint8(18)];

        for (uint256 i = 0; i < decimalCases.length; ++i) {
            uint8 decimals = decimalCases[i];
            uint256 scale = 10 ** decimals;
            uint256 rawPrice = wholeDollarPrice * scale;
            // decimalCases contains only 0, 6, 12, and 18, all representable by int8.
            // forge-lint: disable-next-line(unsafe-typecast)
            assertEq(escrow.exposedRequiredFxrp(usdTarget, rawPrice, int8(decimals)), expected);
        }
    }

    function testFuzz_ReleasePaysTheTargetAndConservesThePriorLock(
        uint256 usdSeed,
        uint256 priceSeed,
        uint8 decimalsSeed
    ) external {
        (uint256 usdTarget, uint256 price, int8 decimals, uint256 scale) =
            _boundFinancialInputs(usdSeed, priceSeed, decimalsSeed);
        _setObservation(price, decimals);

        uint256 invoiceId = _createInvoice(usdTarget);
        (uint256 fundingRequired,,,) = escrow.quoteFunding(invoiceId);
        fxrp.mint(CLIENT, fundingRequired);

        vm.prank(CLIENT);
        escrow.fundInvoice(invoiceId, fundingRequired, uint64(block.timestamp));
        vm.prank(FREELANCER);
        escrow.submitEvidence(invoiceId, EVIDENCE_HASH, EVIDENCE_URI);

        (uint256 payout, uint256 refund, uint256 topUp,,,) = escrow.quoteRelease(invoiceId);
        uint256 freelancerBefore = fxrp.balanceOf(FREELANCER);
        uint256 clientBefore = fxrp.balanceOf(CLIENT);
        uint256 escrowBefore = fxrp.balanceOf(address(escrow));

        assertEq(topUp, 0);
        assertEq(payout + refund, escrowBefore);
        vm.prank(CLIENT);
        escrow.release(invoiceId, payout, uint64(block.timestamp));

        assertEq(fxrp.balanceOf(FREELANCER) - freelancerBefore, payout);
        assertEq(fxrp.balanceOf(CLIENT) - clientBefore, refund);
        assertEq(fxrp.balanceOf(address(escrow)), 0);
        assertEq(escrow.activeFxrpLiabilities(), 0);
        assertGe(payout * price, usdTarget * scale);
        assertLt((payout - 1) * price, usdTarget * scale);
        assertEq(payout + refund, escrowBefore);
    }

    function testFuzz_ReleaseQuoteReturnsExactRefundOrTopUpDifference(
        uint256 usdSeed,
        uint256 fundingPriceSeed,
        uint256 releasePriceSeed,
        uint8 decimalsSeed
    ) external {
        (uint256 usdTarget, uint256 fundingPrice, int8 decimals,) =
            _boundFinancialInputs(usdSeed, fundingPriceSeed, decimalsSeed);
        // _boundFinancialInputs restricts decimals to 0..18, all representable by uint8.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint8 releaseDecimals = uint8(decimals);
        (, uint256 releasePrice,, uint256 scale) =
            _boundFinancialInputs(usdTarget, releasePriceSeed, releaseDecimals);
        _setObservation(fundingPrice, decimals);

        uint256 invoiceId = _createInvoice(usdTarget);
        (uint256 fundingRequired,,,) = escrow.quoteFunding(invoiceId);
        fxrp.mint(CLIENT, fundingRequired);
        vm.prank(CLIENT);
        escrow.fundInvoice(invoiceId, fundingRequired, uint64(block.timestamp));
        vm.prank(FREELANCER);
        escrow.submitEvidence(invoiceId, EVIDENCE_HASH, EVIDENCE_URI);

        _setObservation(releasePrice, decimals);
        (uint256 payout, uint256 refund, uint256 topUp,,,) = escrow.quoteRelease(invoiceId);
        uint256 expectedPayout = _ceilDiv(usdTarget * scale, releasePrice);

        assertEq(payout, expectedPayout);
        if (fundingRequired >= payout) {
            assertEq(refund, fundingRequired - payout);
            assertEq(topUp, 0);
            assertEq(payout + refund, fundingRequired);
        } else {
            assertEq(refund, 0);
            assertEq(topUp, payout - fundingRequired);
            assertEq(fundingRequired + topUp, payout);
        }
    }

    function testSupportedRangeEndpointsDoNotOverflowOrTruncate() external view {
        uint256 tinyPayout = escrow.exposedRequiredFxrp(1, 100 * 1e18, 18);
        uint256 tinyFunding = escrow.exposedFundingRequirement(1, 100 * 1e18, 18);
        assertEq(tinyPayout, 1);
        assertEq(tinyFunding, 2);

        uint256 largePayout = escrow.exposedRequiredFxrp(MAX_USD_TARGET, 1e16, 18);
        uint256 largeFunding = escrow.exposedFundingRequirement(MAX_USD_TARGET, 1e16, 18);
        assertEq(largePayout, 100_000_000_000_000_000_000);
        assertEq(largeFunding, 110_000_000_000_000_000_000);
    }

    function _boundFinancialInputs(uint256 usdSeed, uint256 priceSeed, uint8 decimalsSeed)
        internal
        pure
        returns (uint256 usdTarget, uint256 price, int8 decimals, uint256 scale)
    {
        usdTarget = bound(usdSeed, MIN_USD_TARGET, MAX_USD_TARGET);
        uint8 boundedDecimals = uint8(bound(decimalsSeed, 0, 18));
        // boundedDecimals is restricted to 0..18, all representable by int8.
        // forge-lint: disable-next-line(unsafe-typecast)
        decimals = int8(boundedDecimals);
        scale = 10 ** boundedDecimals;

        uint256 minimumPrice =
            scale < MIN_NORMALIZED_PRICE_DENOMINATOR ? 1 : scale / MIN_NORMALIZED_PRICE_DENOMINATOR;
        uint256 maximumPrice = scale * MAX_NORMALIZED_PRICE;
        price = bound(priceSeed, minimumPrice, maximumPrice);
    }

    function _createInvoice(uint256 usdTarget) internal returns (uint256 invoiceId) {
        vm.prank(FREELANCER);
        invoiceId = escrow.createInvoice(CLIENT, usdTarget, deliveryDeadline, SCOPE_HASH);
    }

    function _setObservation(uint256 price, int8 decimals) internal {
        ftso.setFee(0);
        ftso.setReverts(false, false);
        ftso.setObservation(price, decimals, uint64(block.timestamp));
    }

    function _ceilDiv(uint256 numerator, uint256 denominator) internal pure returns (uint256) {
        return numerator / denominator + (numerator % denominator == 0 ? 0 : 1);
    }
}
