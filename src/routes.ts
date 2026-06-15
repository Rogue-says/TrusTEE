import express, { Request, Response } from 'express';
import { getAgentAddress } from './teeClient.js';
import { releaseEscrow, getAllEscrows, setDailyLimit, getDailyLimit, getDailySpent, getSpendingStats, getHistory } from './agent.js';
import * as byreal from './byreal.js';
import * as byrealClient from './byrealClient.js';
import { createPublicClient, http } from 'viem';
import { mantleSepoliaTestnet } from 'viem/chains';
const mantleSepolia = mantleSepoliaTestnet;

const router = express.Router();

function getPublicClient() {
  return createPublicClient({ chain: mantleSepolia, transport: http(process.env.MANTLE_RPC_URL!) });
}

router.get('/status', async (req: Request, res: Response) => {
  const address = await getAgentAddress();
  const balance = await getPublicClient().getBalance({ address: address as `0x${string}` });
  const byrealStatus = await byreal.getByrealStatus();
  res.json({
    status: 'running',
    agentAddress: address,
    balanceMNT: Number(balance) / 1e18,
    dailyLimit: await getDailyLimit(),
    dailySpent: await getDailySpent(),
    uptime: process.uptime(),
    byreal: {
      available: byrealStatus.available,
      solBalance: byrealStatus.solBalance,
      positions: byrealStatus.positions?.length || 0,
      yieldMode: byrealStatus.yieldMode
    }
  });
});

router.get('/wallet', async (req: Request, res: Response) => {
  const address = await getAgentAddress();
  res.json({ address });
});

router.get('/escrows', async (req: Request, res: Response) => {
  const escrows = await getAllEscrows();
  res.json({ escrows });
});

router.post('/delivery-proof', async (req: Request, res: Response) => {
  const { escrowId, signature, deliveryHash } = req.body;
  if (!escrowId || !signature) return res.status(400).json({ error: 'Missing escrowId or signature' });
  const result = await releaseEscrow(Number(escrowId), signature, deliveryHash || '');
  if (result.success) res.json({ success: true, txHash: result.txHash });
  else res.status(400).json({ success: false, error: result.error });
});

router.post('/set-limit', async (req: Request, res: Response) => {
  const { limit } = req.body;
  if (typeof limit !== 'number' || limit <= 0) return res.status(400).json({ error: 'Invalid limit' });
  const newLimit = await setDailyLimit(limit);
  res.json({ success: true, limit: newLimit });
});

router.get('/spending-stats', async (req: Request, res: Response) => {
  const stats = await getSpendingStats();
  res.json(stats);
});

router.get('/history', async (req: Request, res: Response) => {
  const history = await getHistory();
  res.json({ history });
});

router.get('/attestation', (req: Request, res: Response) => {
  res.json({ message: 'Attestation available via Phala Cloud dashboard' });
});

router.get('/byreal/status', async (req: Request, res: Response) => {
  const status = await byreal.getByrealStatus();
  res.json(status);
});

router.post('/byreal/yield', async (req: Request, res: Response) => {
  const { enabled } = req.body;
  byreal.setYieldMode(enabled);
  res.json({ success: true, yieldMode: enabled });
});

router.get('/byreal/pools', async (req: Request, res: Response) => {
  const pools = await byrealClient.getPools(req.query.search as string);
  res.json(pools);
});

router.get('/', async (req: Request, res: Response) => {
  const address = await getAgentAddress();
  const balance = await getPublicClient().getBalance({ address: address as `0x${string}` });
  const escrows = await getAllEscrows();
  const history = await getHistory();
  const dailyLimit = await getDailyLimit();
  const dailySpent = await getDailySpent();
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

export default router;
