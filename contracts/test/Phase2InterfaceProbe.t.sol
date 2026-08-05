// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { Test } from "forge-std/Test.sol";
import { Phase2InterfaceProbe } from "../src/Phase2InterfaceProbe.sol";

contract Phase2InterfaceProbeTest is Test, Phase2InterfaceProbe {
    function testPhaseOneNetworkConstantsArePinned() external pure {
        bytes21 expectedFeedId = 0x015852502f55534400000000000000000000000000;

        assertEq(COSTON2_CHAIN_ID, 114);
        assertEq(COSTON2_CONTRACT_REGISTRY, 0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019);
        assertEq(bytes32(XRP_USD_FEED_ID), bytes32(expectedFeedId));
    }
}
