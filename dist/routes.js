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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const teeClient_js_1 = require("./teeClient.js");
const agent_js_1 = require("./agent.js");
const byreal = __importStar(require("./byreal.js"));
const byrealClient = __importStar(require("./byrealClient.js"));
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const mantleSepolia = chains_1.mantleSepoliaTestnet;
const router = express_1.default.Router();
function getPublicClient() {
    return (0, viem_1.createPublicClient)({ chain: mantleSepolia, transport: (0, viem_1.http)(process.env.MANTLE_RPC_URL) });
}
router.get('/status', async (req, res) => {
    const address = await (0, teeClient_js_1.getAgentAddress)();
    const balance = await getPublicClient().getBalance({ address: address });
    const byrealStatus = await byreal.getByrealStatus();
    res.json({
        status: 'running',
        agentAddress: address,
        balanceMNT: Number(balance) / 1e18,
        dailyLimit: await (0, agent_js_1.getDailyLimit)(),
        dailySpent: await (0, agent_js_1.getDailySpent)(),
        uptime: process.uptime(),
        byreal: {
            available: byrealStatus.available,
            solBalance: byrealStatus.solBalance,
            positions: byrealStatus.positions?.length || 0,
            yieldMode: byrealStatus.yieldMode
        }
    });
});
router.get('/wallet', async (req, res) => {
    const address = await (0, teeClient_js_1.getAgentAddress)();
    res.json({ address });
});
router.get('/escrows', async (req, res) => {
    const escrows = await (0, agent_js_1.getAllEscrows)();
    res.json({ escrows });
});
router.post('/delivery-proof', async (req, res) => {
    const { escrowId, signature, deliveryHash } = req.body;
    if (!escrowId || !signature)
        return res.status(400).json({ error: 'Missing escrowId or signature' });
    const result = await (0, agent_js_1.releaseEscrow)(Number(escrowId), signature, deliveryHash || '');
    if (result.success)
        res.json({ success: true, txHash: result.txHash });
    else
        res.status(400).json({ success: false, error: result.error });
});
router.post('/set-limit', async (req, res) => {
    const { limit } = req.body;
    if (typeof limit !== 'number' || limit <= 0)
        return res.status(400).json({ error: 'Invalid limit' });
    const newLimit = await (0, agent_js_1.setDailyLimit)(limit);
    res.json({ success: true, limit: newLimit });
});
router.get('/spending-stats', async (req, res) => {
    const stats = await (0, agent_js_1.getSpendingStats)();
    res.json(stats);
});
router.get('/history', async (req, res) => {
    const history = await (0, agent_js_1.getHistory)();
    res.json({ history });
});
router.get('/attestation', (req, res) => {
    res.json({ message: 'Attestation available via Phala Cloud dashboard' });
});
router.get('/byreal/status', async (req, res) => {
    const status = await byreal.getByrealStatus();
    res.json(status);
});
router.post('/byreal/yield', async (req, res) => {
    const { enabled } = req.body;
    byreal.setYieldMode(enabled);
    res.json({ success: true, yieldMode: enabled });
});
router.get('/byreal/pools', async (req, res) => {
    const pools = await byrealClient.getPools(req.query.search);
    res.json(pools);
});
router.get('/', async (req, res) => {
    const address = await (0, teeClient_js_1.getAgentAddress)();
    const balance = await getPublicClient().getBalance({ address: address });
    const escrows = await (0, agent_js_1.getAllEscrows)();
    const history = await (0, agent_js_1.getHistory)();
    const dailyLimit = await (0, agent_js_1.getDailyLimit)();
    const dailySpent = await (0, agent_js_1.getDailySpent)();
    const byrealStatus = await byreal.getByrealStatus();
    res.render('dashboard', {
        agentAddress: address,
        balanceMNT: Number(balance) / 1e18,
        escrows,
        history,
        dailyLimit,
        dailySpent,
        minReputation: process.env.MIN_REPUTATION || '70',
        byreal: byrealStatus
    });
});
exports.default = router;
