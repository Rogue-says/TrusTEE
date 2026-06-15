import * as byreal from './byrealClient.js';

let activePositions: any[] = [];
let lastPoolCheck = 0;
let yieldMode = false;

export function isYieldMode(): boolean {
  return yieldMode;
}

export function setYieldMode(enabled: boolean) {
  yieldMode = enabled;
  console.log(`Yield mode: ${enabled ? 'ON' : 'OFF'}`);
}

export async function getByrealStatus() {
  const available = await byreal.isByrealAvailable();
  if (!available) return { available: false, message: 'Byreal CLI not installed' };

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

export async function deployIdleFunds(amountSol: number, poolAddress?: string) {
  if (!yieldMode) return { success: false, error: 'Yield mode disabled' };
  if (!await byreal.isByrealAvailable()) return { success: false, error: 'Byreal CLI not available' };

  console.log(`Deploying ${amountSol} SOL via Byreal...`);

  let pool = poolAddress;
  if (!pool) {
    const pools = await byreal.getPools('USDC');
    if (pools?.success && pools?.data?.pools?.length > 0) {
      pool = pools.data.pools[0].address;
    }
  }

  if (!pool) return { success: false, error: 'No pool found' };

  const result = await byreal.openPosition(pool, amountSol);
  console.log(`Position opened:`, JSON.stringify(result));
  return result;
}

export async function closeAllPositions() {
  if (!await byreal.isByrealAvailable()) return { success: false, error: 'Byreal CLI not available' };

  const positions = await byreal.listPositions();
  if (!positions?.success) return { success: false, error: 'Failed to list positions' };

  const posList = positions?.data?.positions || [];
  const results = [];
  for (const pos of posList) {
    console.log(`Closing position ${pos.positionMint}...`);
    const result = await byreal.closePosition(pos.positionMint);
    results.push(result);
  }
  return { success: true, closed: results.length };
}

export async function startYieldLoop() {
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
    } catch (e) {
      console.error('Yield loop error:', e);
    }

    const interval = parseInt(process.env.YIELD_CHECK_INTERVAL || '3600000');
    setTimeout(loop, interval);
  };

  loop();
}
