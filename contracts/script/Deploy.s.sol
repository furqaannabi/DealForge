// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/DealForge.sol";

contract DeployDealForge is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        DealForge dealForge = new DealForge(msg.sender);
        console.log("DealForge deployed at:", address(dealForge));

        vm.stopBroadcast();
    }
}
