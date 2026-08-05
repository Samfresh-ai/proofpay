// SPDX-License-Identifier: MIT
pragma solidity 0.8.25;

import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract MockFXRP is IERC20Metadata {
    error InsufficientBalance(address account, uint256 available, uint256 required);
    error InsufficientAllowance(
        address owner, address spender, uint256 available, uint256 required
    );
    error InvalidShortfall(uint256 shortfall, uint256 amount);

    string public constant name = "Mock FXRP";
    string public constant symbol = "FXRP";

    uint8 private immutable tokenDecimals;

    uint256 public totalSupply;
    mapping(address account => uint256 balance) public balanceOf;
    mapping(address owner => mapping(address spender => uint256 amount)) public allowance;

    uint256 public incomingShortfall;
    uint256 public outgoingShortfall;

    address public callbackTarget;
    bytes public callbackData;
    bool public callbackOnTransfer;
    bool public callbackOnTransferFrom;
    uint256 public callbackAttempts;
    bool public callbackSucceeded;
    bytes4 public callbackRevertSelector;

    constructor(uint8 decimals_) {
        tokenDecimals = decimals_;
    }

    function decimals() external view returns (uint8) {
        return tokenDecimals;
    }

    function mint(address account, uint256 amount) external {
        totalSupply += amount;
        balanceOf[account] += amount;
        emit Transfer(address(0), account, amount);
    }

    function setIncomingShortfall(uint256 shortfall) external {
        incomingShortfall = shortfall;
    }

    function setOutgoingShortfall(uint256 shortfall) external {
        outgoingShortfall = shortfall;
    }

    function setCallback(address target, bytes calldata data, bool onTransfer, bool onTransferFrom)
        external
    {
        callbackTarget = target;
        callbackData = data;
        callbackOnTransfer = onTransfer;
        callbackOnTransferFrom = onTransferFrom;
        callbackAttempts = 0;
        callbackSucceeded = false;
        callbackRevertSelector = bytes4(0);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        uint256 debit = _amountAfterShortfall(amount, outgoingShortfall);
        _move(msg.sender, to, debit);
        if (callbackOnTransfer) _attemptCallback();
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        if (currentAllowance < amount) {
            revert InsufficientAllowance(from, msg.sender, currentAllowance, amount);
        }
        if (currentAllowance != type(uint256).max) {
            allowance[from][msg.sender] = currentAllowance - amount;
            emit Approval(from, msg.sender, currentAllowance - amount);
        }

        uint256 fromBalance = balanceOf[from];
        if (fromBalance < amount) revert InsufficientBalance(from, fromBalance, amount);

        uint256 received = _amountAfterShortfall(amount, incomingShortfall);
        balanceOf[from] = fromBalance - amount;
        balanceOf[to] += received;
        totalSupply -= amount - received;
        emit Transfer(from, to, received);

        if (callbackOnTransferFrom) _attemptCallback();
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        uint256 fromBalance = balanceOf[from];
        if (fromBalance < amount) revert InsufficientBalance(from, fromBalance, amount);
        balanceOf[from] = fromBalance - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _amountAfterShortfall(uint256 amount, uint256 shortfall)
        internal
        pure
        returns (uint256)
    {
        if (shortfall > amount) revert InvalidShortfall(shortfall, amount);
        return amount - shortfall;
    }

    function _attemptCallback() internal {
        callbackOnTransfer = false;
        callbackOnTransferFrom = false;
        callbackAttempts += 1;

        (bool success, bytes memory returnData) = callbackTarget.call(callbackData);
        callbackSucceeded = success;
        if (!success && returnData.length >= 4) {
            bytes4 selector;
            assembly ("memory-safe") {
                selector := mload(add(returnData, 0x20))
            }
            callbackRevertSelector = selector;
        }
    }
}
