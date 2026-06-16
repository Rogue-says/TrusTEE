"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSellerReputation = getSellerReputation;
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const mantleSepolia = chains_1.mantleSepoliaTestnet;
function getReputationRegistry() {
    return process.env.REPUTATION_REGISTRY_ADDRESS;
}
function getMinReputation() {
    return parseInt(process.env.MIN_REPUTATION || '70', 10);
}
function getPublicClient() {
    return (0, viem_1.createPublicClient)({
        chain: mantleSepolia,
        transport: (0, viem_1.http)(process.env.MANTLE_RPC_URL)
    });
}
const reputationAbi = [{
        inputs: [{ name: 'user', type: 'address' }],
        name: 'getScore',
        outputs: [{ name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function'
    }];
async function getSellerReputation(sellerAddress) {
    try {
        const score = await getPublicClient().readContract({
            address: getReputationRegistry(),
            abi: reputationAbi,
            functionName: 'getScore',
            args: [sellerAddress]
        });
        const numericScore = Number(score);
        return { score: numericScore, meetsThreshold: numericScore >= getMinReputation() };
    }
    catch (error) {
        console.error('Failed to fetch reputation:', error);
        return { score: 0, meetsThreshold: false };
    }
}
