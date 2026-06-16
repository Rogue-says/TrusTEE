"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupWallet = setupWallet;
exports.getWalletAddress = getWalletAddress;
exports.getBalance = getBalance;
exports.getOverview = getOverview;
exports.getPools = getPools;
exports.getPoolInfo = getPoolInfo;
exports.listPositions = listPositions;
exports.openPosition = openPosition;
exports.closePosition = closePosition;
exports.claimFees = claimFees;
exports.swap = swap;
exports.isByrealAvailable = isByrealAvailable;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const os_1 = require("os");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const CONFIG_DIR = `${(0, os_1.homedir)()}/.config/byreal`;
const KEY_PATH = `${CONFIG_DIR}/keys/trustee-wallet.json`;
function ensureDir() {
    if (!(0, fs_1.existsSync)(`${CONFIG_DIR}/keys`)) {
        (0, fs_1.mkdirSync)(`${CONFIG_DIR}/keys`, { recursive: true });
    }
}
async function cli(args) {
    try {
        const { stdout } = await execAsync(`byreal-cli ${args} -o json`, {
            timeout: 30000
        });
        return JSON.parse(stdout);
    }
    catch (e) {
        if (e.stdout) {
            try {
                return JSON.parse(e.stdout);
            }
            catch { }
        }
        if (e.stderr) {
            try {
                return JSON.parse(e.stderr);
            }
            catch { }
        }
        return { success: false, error: e.message };
    }
}
async function setupWallet(privateKey) {
    ensureDir();
    if (!privateKey) {
        return cli('wallet generate');
    }
    (0, fs_1.writeFileSync)(KEY_PATH, privateKey, 'utf-8');
    return cli(`wallet import --keypair ${KEY_PATH}`);
}
async function getWalletAddress() {
    const result = await cli('wallet address');
    if (result?.success && result?.data?.address) {
        return result.data.address;
    }
    return null;
}
async function getBalance() {
    const result = await cli('wallet balance');
    if (result?.success && result?.data?.balances) {
        const sol = result.data.balances.find((b) => b.mint === 'SOL');
        return sol?.amount || 0;
    }
    return 0;
}
async function getOverview() {
    return cli('overview');
}
async function getPools(search) {
    const filter = search ? `--search "${search}"` : '';
    return cli(`pools list ${filter}`);
}
async function getPoolInfo(address) {
    return cli(`pools info --address ${address}`);
}
async function listPositions() {
    return cli('positions list');
}
async function openPosition(poolAddress, amountUsd) {
    return cli(`positions open --pool ${poolAddress} --amount-usd ${amountUsd}`);
}
async function closePosition(positionMint) {
    return cli(`positions close --position-mint ${positionMint}`);
}
async function claimFees() {
    return cli('positions claim');
}
async function swap(inputMint, outputMint, amount, dryRun = false) {
    const dry = dryRun ? '--dry-run' : '';
    return cli(`swap execute --input-mint ${inputMint} --output-mint ${outputMint} --amount ${amount} ${dry}`);
}
async function isByrealAvailable() {
    try {
        await execAsync('which byreal-cli', { timeout: 5000 });
        return true;
    }
    catch {
        return false;
    }
}
