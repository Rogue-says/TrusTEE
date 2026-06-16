"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDailyLimit = setDailyLimit;
exports.getDailyLimit = getDailyLimit;
exports.getDailySpent = getDailySpent;
exports.getEscrowDetails = getEscrowDetails;
exports.getAllEscrows = getAllEscrows;
exports.releaseEscrow = releaseEscrow;
exports.getSpendingStats = getSpendingStats;
exports.getHistory = getHistory;
exports.startEventListener = startEventListener;
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const mantleSepolia = chains_1.mantleSepoliaTestnet;
const teeClient_js_1 = require("./teeClient.js");
const reputation_js_1 = require("./reputation.js");
function getEscrowAddress() {
    return process.env.ESCROW_CONTRACT_ADDRESS;
}
function getPublicClient() {
    return (0, viem_1.createPublicClient)({
        chain: mantleSepolia,
        transport: (0, viem_1.http)(process.env.MANTLE_RPC_URL)
    });
}
const escrowAbi = [
    { inputs: [{ name: 'id', type: 'uint256' }], name: 'release', outputs: [], stateMutability: 'nonpayable', type: 'function' },
    { inputs: [{ name: 'id', type: 'uint256' }], name: 'getEscrow', outputs: [
            { name: 'buyer', type: 'address' }, { name: 'seller', type: 'address' }, { name: 'amount', type: 'uint256' },
            { name: 'released', type: 'bool' }, { name: 'refunded', type: 'bool' }, { name: 'deadline', type: 'uint256' },
            { name: 'deliveryHash', type: 'bytes32' }
        ], stateMutability: 'view', type: 'function' },
    { anonymous: false, inputs: [
            { indexed: true, name: 'id', type: 'uint256' }, { indexed: true, name: 'buyer', type: 'address' },
            { indexed: true, name: 'seller', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' },
            { indexed: false, name: 'deadline', type: 'uint256' }, { indexed: false, name: 'deliveryHash', type: 'bytes32' }
        ], name: 'EscrowCreated', type: 'event' }
];
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
let dailyLimit = null;
let dailyReleasedTotal = 0;
let lastResetDate = new Date().toDateString();
function getDailyLimitValue() {
    if (dailyLimit === null) {
        dailyLimit = parseFloat(process.env.DAILY_LIMIT || '100');
    }
    return dailyLimit;
}
function resetDailyTotalIfNeeded() {
    const today = new Date().toDateString();
    if (today !== lastResetDate) {
        dailyReleasedTotal = 0;
        lastResetDate = today;
    }
}
async function setDailyLimit(limitMNT) {
    dailyLimit = limitMNT;
    console.log(`Daily spending limit updated to ${dailyLimit} MNT`);
    return dailyLimit;
}
async function getDailyLimit() {
    resetDailyTotalIfNeeded();
    return getDailyLimitValue();
}
async function getDailySpent() {
    resetDailyTotalIfNeeded();
    return dailyReleasedTotal;
}
async function getEscrowDetails(id) {
    try {
        const escrow = await getPublicClient().readContract({
            address: getEscrowAddress(),
            abi: escrowAbi,
            functionName: 'getEscrow',
            args: [BigInt(id)]
        });
        return escrow;
    }
    catch {
        return null;
    }
}
async function getAllEscrows() {
    const MAX_ESCROWS = 100;
    const promises = Array.from({ length: MAX_ESCROWS }, (_, i) => getEscrowDetails(i));
    const results = await Promise.all(promises);
    return results
        .map((e, i) => ({ id: i, data: e }))
        .filter(({ data }) => data && data[0] !== NULL_ADDRESS)
        .map(({ id, data }) => ({ id, ...data }));
}
async function releaseEscrow(id, signature, deliveryHash) {
    resetDailyTotalIfNeeded();
    console.log(`Processing release for escrow ${id}...`);
    const escrow = await getEscrowDetails(id);
    if (!escrow)
        return { success: false, error: 'Escrow not found' };
    const [buyer, seller, amount, released, refunded, deadline, storedDeliveryHash] = escrow;
    if (released)
        return { success: false, error: 'Already released' };
    if (refunded)
        return { success: false, error: 'Already refunded' };
    if (Date.now() / 1000 > Number(deadline))
        return { success: false, error: 'Deadline passed' };
    const message = `Release escrow ${id} with delivery ${deliveryHash}`;
    let recovered;
    try {
        recovered = await (0, viem_1.recoverMessageAddress)({ message, signature: signature });
    }
    catch {
        return { success: false, error: 'Invalid signature' };
    }
    if (recovered.toLowerCase() !== seller.toLowerCase())
        return { success: false, error: 'Signature mismatch' };
    if (storedDeliveryHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && storedDeliveryHash !== deliveryHash)
        return { success: false, error: 'Delivery hash mismatch' };
    const { score, meetsThreshold } = await (0, reputation_js_1.getSellerReputation)(seller);
    if (!meetsThreshold)
        return { success: false, error: `Reputation too low: ${score}` };
    const amountMNT = Number(amount) / 1e18;
    const limit = getDailyLimitValue();
    if (dailyReleasedTotal + amountMNT > limit)
        return { success: false, error: `Daily spending limit exceeded (limit: ${limit} MNT)` };
    try {
        const { walletClient } = await (0, teeClient_js_1.getTeeWallet)();
        const hash = await walletClient.writeContract({
            address: getEscrowAddress(),
            abi: escrowAbi,
            functionName: 'release',
            args: [BigInt(id)]
        });
        dailyReleasedTotal += amountMNT;
        console.log(`\u2705 Released escrow ${id}, tx: ${hash}`);
        return { success: true, txHash: hash };
    }
    catch (err) {
        return { success: false, error: err.message };
    }
}
async function getSpendingStats() {
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        days.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
    }
    const totals = [12, 19, 8, 15, 22, 10, dailyReleasedTotal];
    return { labels: days, totals };
}
async function getHistory() {
    try {
        const fromBlock = await getPublicClient().getBlockNumber();
        const logs = await getPublicClient().getContractEvents({
            address: getEscrowAddress(),
            abi: escrowAbi,
            eventName: 'EscrowCreated',
            fromBlock: fromBlock - 5000n,
            toBlock: 'latest'
        });
        const history = await Promise.all(logs.reverse().map(async (log) => {
            const { id, buyer, seller, amount, deadline, deliveryHash } = log.args;
            const block = await getPublicClient().getBlock({ blockHash: log.blockHash });
            const escrow = await getEscrowDetails(Number(id));
            let status = 'Pending';
            if (escrow) {
                const e = escrow;
                if (e[3])
                    status = 'Released';
                else if (e[4])
                    status = 'Refunded';
            }
            return {
                id: Number(id),
                buyer,
                seller,
                amount: (Number(amount) / 1e18).toFixed(4),
                deadline: Number(deadline),
                txHash: log.transactionHash,
                timestamp: Number(block.timestamp) * 1000,
                status
            };
        }));
        return history;
    }
    catch (err) {
        console.error('Failed to fetch history:', err);
        return [];
    }
}
async function startEventListener() {
    const address = getEscrowAddress();
    console.log(`\u{1F442} Listening for escrow events on ${address}...`);
    getPublicClient().watchContractEvent({
        address,
        abi: escrowAbi,
        eventName: 'EscrowCreated',
        onLogs: (logs) => {
            for (const log of logs) {
                const { id, buyer, seller, amount } = log.args;
                console.log(`\u{1F4E6} New escrow #${id}: ${buyer} \u2192 ${seller}, ${amount} wei`);
            }
        }
    });
}
