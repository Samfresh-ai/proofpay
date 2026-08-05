// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

contract MockFtsoV2 {
    error MockFeeReadFailed();
    error MockFeedReadFailed();
    error UnexpectedFeedId(bytes21 actual, bytes21 expected);

    bytes21 public immutable expectedFeedId;

    uint256 public value;
    int8 public decimals;
    uint64 public timestamp;
    uint256 public fee;
    bool public revertFeeRead;
    bool public revertFeedRead;

    uint256 public getFeedCalls;
    bytes21 public lastFeedId;
    uint256 public lastMsgValue;

    constructor(bytes21 expectedFeedId_) {
        expectedFeedId = expectedFeedId_;
    }

    function setObservation(uint256 value_, int8 decimals_, uint64 timestamp_) external {
        value = value_;
        decimals = decimals_;
        timestamp = timestamp_;
    }

    function setFee(uint256 fee_) external {
        fee = fee_;
    }

    function setReverts(bool feeRead, bool feedRead) external {
        revertFeeRead = feeRead;
        revertFeedRead = feedRead;
    }

    function calculateFeeById(bytes21 feedId) external view returns (uint256) {
        if (revertFeeRead) revert MockFeeReadFailed();
        if (feedId != expectedFeedId) revert UnexpectedFeedId(feedId, expectedFeedId);
        return fee;
    }

    function getFeedById(bytes21 feedId) external payable returns (uint256, int8, uint64) {
        if (revertFeedRead) revert MockFeedReadFailed();
        if (feedId != expectedFeedId) revert UnexpectedFeedId(feedId, expectedFeedId);

        getFeedCalls += 1;
        lastFeedId = feedId;
        lastMsgValue = msg.value;
        return (value, decimals, timestamp);
    }
}
