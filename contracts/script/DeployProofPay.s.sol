// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { ContractRegistry } from "flare-periphery/src/coston2/ContractRegistry.sol";
import { FtsoV2Interface } from "flare-periphery/src/coston2/FtsoV2Interface.sol";
import { IAssetManager } from "flare-periphery/src/coston2/IAssetManager.sol";
import { Script } from "forge-std/Script.sol";

import { ProofPayEscrow } from "../src/ProofPayEscrow.sol";

/// @notice Resolves current official Coston2 dependencies and deploys ProofPayEscrow.
/// @dev The orchestration script supplies only public intent values through the environment.
contract DeployProofPay is Script {
    uint256 internal constant COSTON2_CHAIN_ID = 114;
    uint8 internal constant FXRP_DECIMALS = 6;
    uint64 internal constant MAXIMUM_PRICE_AGE = 30 seconds;
    bytes21 internal constant XRP_USD_FEED_ID = 0x015852502f55534400000000000000000000000000;
    address internal constant RECORDED_DEPLOYER = 0x3c47ddC46848A7a225d3491DA5c211e2E7A51F42;

    error WrongDeploymentChain(uint256 expectedChainId, uint256 actualChainId);
    error WrongDeployer(address expectedDeployer, address actualDeployer);
    error InvalidResolvedAddress(string dependency, address resolvedAddress);
    error InvalidResolvedCode(string dependency, address resolvedAddress);
    error InvalidFxrpDecimals(uint8 expectedDecimals, uint8 actualDecimals);
    error InvalidFeedId(bytes21 feedId);
    error UnsupportedFtsoFee(uint256 fee);
    error InvalidFeed(uint256 value, int8 decimals, uint64 timestamp, uint256 currentTimestamp);
    error DeploymentFeedTooOld(uint64 timestamp, uint256 currentTimestamp, uint64 maximumAge);
    error InvalidMaximumFee(uint256 expectedMaximumFee);
    error InsufficientDeployerBalance(uint256 balance, uint256 expectedMaximumFee);

    function run() external returns (ProofPayEscrow escrow) {
        if (block.chainid != COSTON2_CHAIN_ID) {
            revert WrongDeploymentChain(COSTON2_CHAIN_ID, block.chainid);
        }

        address deployer = vm.envAddress("PROOFPAY_DEPLOYER_ADDRESS");
        if (deployer != RECORDED_DEPLOYER) {
            revert WrongDeployer(RECORDED_DEPLOYER, deployer);
        }

        uint256 expectedMaximumFee = vm.envUint("PROOFPAY_EXPECTED_MAX_FEE_WEI");
        if (expectedMaximumFee == 0) revert InvalidMaximumFee(expectedMaximumFee);
        if (deployer.balance < expectedMaximumFee) {
            revert InsufficientDeployerBalance(deployer.balance, expectedMaximumFee);
        }

        IAssetManager assetManager = ContractRegistry.getAssetManagerFXRP();
        _requireResolvedContract("AssetManagerFXRP", address(assetManager));

        IERC20Metadata fxrp = IERC20Metadata(address(assetManager.fAsset()));
        _requireResolvedContract("FXRP", address(fxrp));
        uint8 actualDecimals = fxrp.decimals();
        if (actualDecimals != FXRP_DECIMALS) {
            revert InvalidFxrpDecimals(FXRP_DECIMALS, actualDecimals);
        }

        FtsoV2Interface ftsoV2 = ContractRegistry.getFtsoV2();
        _requireResolvedContract("FtsoV2", address(ftsoV2));
        if (
            XRP_USD_FEED_ID == bytes21(0)
                || XRP_USD_FEED_ID != 0x015852502f55534400000000000000000000000000
        ) {
            revert InvalidFeedId(XRP_USD_FEED_ID);
        }

        uint256 fee = ftsoV2.calculateFeeById(XRP_USD_FEED_ID);
        if (fee != 0) revert UnsupportedFtsoFee(fee);

        (uint256 value, int8 decimals, uint64 timestamp) =
            ftsoV2.getFeedById{ value: 0 }(XRP_USD_FEED_ID);
        if (
            value == 0 || decimals < 0 || decimals > 18 || timestamp == 0
                || timestamp > block.timestamp
        ) {
            revert InvalidFeed(value, decimals, timestamp, block.timestamp);
        }
        if (block.timestamp - timestamp >= MAXIMUM_PRICE_AGE) {
            revert DeploymentFeedTooOld(timestamp, block.timestamp, MAXIMUM_PRICE_AGE);
        }

        vm.startBroadcast(deployer);
        escrow = new ProofPayEscrow(fxrp, ftsoV2, XRP_USD_FEED_ID, MAXIMUM_PRICE_AGE);
        vm.stopBroadcast();
    }

    function _requireResolvedContract(string memory dependency, address resolvedAddress)
        private
        view
    {
        if (resolvedAddress == address(0)) {
            revert InvalidResolvedAddress(dependency, resolvedAddress);
        }
        if (resolvedAddress.code.length == 0) {
            revert InvalidResolvedCode(dependency, resolvedAddress);
        }
    }
}

/// @notice Produces a live $100 funding quote entirely inside one non-persistent eth_call.
/// @dev The constructor returns ABI-encoded quote data as simulated runtime bytecode.
contract ProofPayFundingQuoteSimulation {
    uint256 internal constant TEST_USD_TARGET = 100_000_000;
    address internal constant TEST_CLIENT = 0xB9CC4f51Bb837DC56998474961250287f40FA680;

    constructor(ProofPayEscrow escrow) {
        uint256 invoiceId = escrow.createInvoice(
            TEST_CLIENT,
            TEST_USD_TARGET,
            uint64(block.timestamp + 1 hours),
            keccak256("ProofPay Phase 4A non-persistent $100 quote")
        );
        (uint256 requiredFxrp, uint256 price, int8 priceDecimals, uint64 priceTimestamp) =
            escrow.quoteFunding(invoiceId);
        bytes memory result = abi.encode(requiredFxrp, price, priceDecimals, priceTimestamp);

        assembly ("memory-safe") {
            return(add(result, 0x20), mload(result))
        }
    }
}
