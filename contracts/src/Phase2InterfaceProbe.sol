// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { FtsoV2Interface } from "flare-periphery/src/coston2/FtsoV2Interface.sol";
import { IAssetManager } from "flare-periphery/src/coston2/IAssetManager.sol";
import { IFlareContractRegistry } from "flare-periphery/src/coston2/IFlareContractRegistry.sol";

/// @notice Non-deployable Phase 2 probe for the exact interfaces ProofPay will use later.
/// @dev This contract has no external entry points and contains no escrow business logic.
abstract contract Phase2InterfaceProbe is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant COSTON2_CHAIN_ID = 114;
    address internal constant COSTON2_CONTRACT_REGISTRY =
        0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019;
    bytes21 internal constant XRP_USD_FEED_ID = 0x015852502f55534400000000000000000000000000;

    function _probeRegistryResolution()
        internal
        view
        returns (IERC20 fxrp, FtsoV2Interface ftsoV2)
    {
        IFlareContractRegistry registry = IFlareContractRegistry(COSTON2_CONTRACT_REGISTRY);
        IAssetManager assetManager =
            IAssetManager(registry.getContractAddressByName("AssetManagerFXRP"));
        fxrp = assetManager.fAsset();
        ftsoV2 = FtsoV2Interface(registry.getContractAddressByName("FtsoV2"));
    }

    function _probeXrpUsdRead(FtsoV2Interface ftsoV2)
        internal
        returns (uint256 value, int8 decimals, uint64 timestamp)
    {
        return ftsoV2.getFeedById(XRP_USD_FEED_ID);
    }

    function _probeFxrpSafeTransfer(IERC20 fxrp, address recipient, uint256 amount)
        internal
        nonReentrant
    {
        fxrp.safeTransfer(recipient, amount);
    }
}
