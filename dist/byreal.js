"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isYieldMode = isYieldMode;
exports.setYieldMode = setYieldMode;
exports.getByrealStatus = getByrealStatus;
exports.deployIdleFunds = deployIdleFunds;
exports.closeAllPositions = closeAllPositions;
exports.startYieldLoop = startYieldLoop;
const byreal = __importStar(require("./byrealClient.js"));
let activePositions = [];
let lastPoolCheck = 0;
let yieldMode = false;
function isYieldMode() {
    return yieldMode;
}
function setYieldMode(enabled) {
    yieldMode = enabled;
    console.log(`Yield mode: ${enabled ? 'ON' : 'OFF'}`);
}
async function getByrealStatus() {
    const available = await byreal.isByrealAvailable();
    if (!available)
        return { available: false, message: 'Byreal CLI not installed' };
    const overview = await byreal.getOverview();
    const address = await byreal.getWalletAddress();
    const balance = await byreal.getBalance();
    const positions = await byreal.listPositions();
    return {
        available: true,
        overview: overview?.data || null,
        walletAddress: address,
        solBalance: balance,
        positions: positions?.data?.positions || [],
        yieldMode
    };
}
async function deployIdleFunds(amountSol, poolAddress) {
    if (!yieldMode)
        return { success: false, error: 'Yield mode disabled' };
    if (!await byreal.isByrealAvailable())
        return { success: false, error: 'Byreal CLI not available' };
    console.log(`Deploying ${amountSol} SOL via Byreal...`);
    let pool = poolAddress;
    if (!pool) {
        const pools = await byreal.getPools('USDC');
        if (pools?.success && pools?.data?.pools?.length > 0) {
            pool = pools.data.pools[0].address;
        }
    }
    if (!pool)
        return { success: false, error: 'No pool found' };
    const result = await byreal.openPosition(pool, amountSol);
    console.log(`Position opened:`, JSON.stringify(result));
    return result;
}
async function closeAllPositions() {
    if (!await byreal.isByrealAvailable())
        return { success: false, error: 'Byreal CLI not available' };
    const positions = await byreal.listPositions();
    if (!positions?.success)
        return { success: false, error: 'Failed to list positions' };
    const posList = positions?.data?.positions || [];
    const results = [];
    for (const pos of posList) {
        console.log(`Closing position ${pos.positionMint}...`);
        const result = await byreal.closePosition(pos.positionMint);
        results.push(result);
    }
    return { success: true, closed: results.length };
}
async function startYieldLoop() {
    if (!await byreal.isByrealAvailable()) {
        console.log('Byreal CLI not available, yield loop disabled');
        return;
    }
    console.log('Starting Byreal yield deployment loop...');
    const loop = async () => {
        try {
            const balance = await byreal.getBalance();
            const threshold = parseFloat(process.env.YIELD_THRESHOLD_SOL || '0.5');
            if (balance >= threshold) {
                console.log(`Idle SOL balance: ${balance}, deploying...`);
                await deployIdleFunds(balance * 0.8);
            }
        }
        catch (e) {
            console.error('Yield loop error:', e);
        }
        const interval = parseInt(process.env.YIELD_CHECK_INTERVAL || '3600000');
        setTimeout(loop, interval);
    };
    loop();
}
