"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTeeWallet = getTeeWallet;
exports.getAgentAddress = getAgentAddress;
const dstack_sdk_1 = require("@phala/dstack-sdk");
const viem_1 = require("@phala/dstack-sdk/viem");
const viem_2 = require("viem");
const accounts_1 = require("viem/accounts");
const chains_1 = require("viem/chains");
const mantleSepolia = chains_1.mantleSepoliaTestnet;
let cachedAccount = null;
async function getTeeWallet() {
    if (cachedAccount) {
        const walletClient = (0, viem_2.createWalletClient)({
            account: cachedAccount,
            chain: mantleSepolia,
            transport: (0, viem_2.http)(process.env.MANTLE_RPC_URL)
        });
        return { account: cachedAccount, walletClient };
    }
    let account;
    if (process.env.DEV_MODE === 'true') {
        const pk = (0, accounts_1.generatePrivateKey)();
        account = (0, accounts_1.privateKeyToAccount)(pk);
        console.log(`\u{1F511} Dev wallet: ${account.address} (DEV_MODE)`);
    }
    else {
        const client = new dstack_sdk_1.DstackClient();
        const salt = process.env.AGENT_SALT || 'tee-escrow/v1';
        const key = await client.getKey(salt);
        account = (0, viem_1.toViemAccountSecure)(key);
        console.log(`\u{1F511} TEE wallet derived: ${account.address}`);
    }
    cachedAccount = account;
    const walletClient = (0, viem_2.createWalletClient)({
        account,
        chain: mantleSepolia,
        transport: (0, viem_2.http)(process.env.MANTLE_RPC_URL)
    });
    return { account, walletClient };
}
async function getAgentAddress() {
    const { account } = await getTeeWallet();
    return account.address;
}
