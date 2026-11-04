// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {DatasetToken} from "./DatasetToken.sol";

/// @notice Sells licenses, splits fees.
contract DataVault {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    mapping(address => uint256) public licensePrice;
    mapping(address => mapping(address => bool)) public licensed;

    event LicensePriceSet(address indexed dataset, uint256 price);
    event Licensed(address indexed dataset, address indexed buyer, uint256 amount);

    error NotEngineer();
    error NotForSale();

    constructor(IERC20 usdc_) {
        usdc = usdc_;
    }

    function setLicensePrice(address dataset, uint256 price) external {
        if (msg.sender != DatasetToken(dataset).engineer()) revert NotEngineer();
        licensePrice[dataset] = price;
        emit LicensePriceSet(dataset, price);
    }

    function license(address dataset) external {
        uint256 price = licensePrice[dataset];
        if (price == 0) revert NotForSale();
        usdc.safeTransferFrom(msg.sender, dataset, price);
        DatasetToken(dataset).distribute(price);
        licensed[dataset][msg.sender] = true;
        emit Licensed(dataset, msg.sender, price);
    }

    function isLicensed(address dataset, address who) external view returns (bool) {
        return licensed[dataset][who];
    }
}
