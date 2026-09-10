import { createPublicClient, http, recoverMessageAddress, parseEther, formatEther } from 'viem';
import { mantleSepoliaTestnet } from 'viem/chains';
const mantleSepolia = mantleSepoliaTestnet;
import { getTeeWallet } from './teeClient.js';
import { getSellerReputation } from './reputation.js';

function getEscrowAddress(): `0x${string}` {
  return process.env.ESCROW_CONTRACT_ADDRESS as `0x${string}`;
}

function getPublicClient() {
  return createPublicClient({
    chain: mantleSepolia,
    transport: http(process.env.MANTLE_RPC_URL!)
  });
}

const escrowAbi = [
  { inputs: [{ name: 'id', type: 'uint256' }], name: 'release', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  { inputs: [], name: 'getEscrowCount', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  { inputs: [{ name: 'id', type: 'uint256' }], name: 'getEscrow', outputs: [{ type: 'tuple', components: [
    { name: 'buyer', type: 'address' }, { name: 'seller', type: 'address' }, { name: 'amount', type: 'uint256' },
    { name: 'released', type: 'bool' }, { name: 'refunded', type: 'bool' }, { name: 'deadline', type: 'uint256' },
    { name: 'deliveryHash', type: 'bytes32' }
  ] }], stateMutability: 'view', type: 'function' },
  { anonymous: false, inputs: [{ indexed: true, name: 'id', type: 'uint256' },
    { indexed: true, name: 'seller', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }],
    name: 'Released', type: 'event' },
  { anonymous: false, inputs: [
    { indexed: true, name: 'id', type: 'uint256' }, { indexed: true, name: 'buyer', type: 'address' },
    { indexed: true, name: 'seller', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' },
    { indexed: false, name: 'deadline', type: 'uint256' }, { indexed: false, name: 'deliveryHash', type: 'bytes32' }
  ], name: 'EscrowCreated', type: 'event' }
] as const;

let dailyLimit: number | null = null;

function getDailyLimitValue(): number {
  if (dailyLimit === null) {
    dailyLimit = Number(process.env.DAILY_LIMIT || '100');
    if (!Number.isFinite(dailyLimit) || dailyLimit <= 0) throw new Error('Invalid DAILY_LIMIT');
  }
  return dailyLimit;
}

export async function setDailyLimit(limitMNT: number) {
  if (!Number.isFinite(limitMNT) || limitMNT <= 0) throw new Error('Invalid daily limit');
  dailyLimit = limitMNT;
  console.log(`Daily spending limit updated to ${dailyLimit} MNT`);
  return dailyLimit;
}

export async function getDailyLimit(): Promise<number> {
  return getDailyLimitValue();
}

export async function getDailySpent(): Promise<number> {
  return Number(formatEther(await dailySpentWei()));
}

export async function getEscrowDetails(id: number) {
  try {
    const escrow = await getPublicClient().readContract({
      address: getEscrowAddress(),
      abi: escrowAbi,
      functionName: 'getEscrow',
      args: [BigInt(id)]
    });
    return [escrow.buyer, escrow.seller, escrow.amount, escrow.released, escrow.refunded, escrow.deadline, escrow.deliveryHash] as const;
  } catch { return null; }
}

export async function getAllEscrows(): Promise<any[]> {
  const count = await getPublicClient().readContract({ address: getEscrowAddress(), abi: escrowAbi, functionName: 'getEscrowCount' });
  const end = Number(count);
  if (!Number.isSafeInteger(end)) throw new Error('Escrow count exceeds supported range');
  const result: any[] = [];
  // Bound RPC concurrency and show the newest 100 escrows.
  for (let start = Math.max(0, end - 100); start < end; start += 10) {
    const ids = Array.from({ length: Math.min(10, end - start) }, (_, i) => start + i);
    const rows = await Promise.all(ids.map(getEscrowDetails));
    rows.forEach((e, i) => { if (e) result.push({ id: ids[i], buyer: e[0], seller: e[1],
      amount: formatEther(e[2]), released: e[3], refunded: e[4], deadline: Number(e[5]), deliveryHash: e[6] }); });
  }
  return result.reverse();
}

let queue: Promise<unknown> = Promise.resolve();
let pendingHash: `0x${string}` | null = null;
export function releaseEscrow(id: number, signature: string, deliveryHash: string) {
  const next = queue.then(() => releaseSerialized(id, signature, deliveryHash));
  queue = next.catch(() => undefined);
  return next;
}

async function releaseSerialized(id: number, signature: string, deliveryHash: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!Number.isSafeInteger(id) || id < 0 || !/^0x[0-9a-fA-F]{64}$/.test(deliveryHash)) return { success: false, error: 'Invalid proof input' };
  if (pendingHash) {
    try { await getPublicClient().getTransactionReceipt({ hash: pendingHash }); pendingHash = null; }
    catch { return { success: false, error: 'A previous payment is awaiting confirmation' }; }
  }
  console.log(`Processing release for escrow ${id}...`);
  const escrow = await getEscrowDetails(id);
  if (!escrow) return { success: false, error: 'Escrow not found' };
  const [buyer, seller, amount, released, refunded, deadline, storedDeliveryHash] = escrow as any;
  if (released) return { success: false, error: 'Already released' };
  if (refunded) return { success: false, error: 'Already refunded' };
  if (Date.now() / 1000 > Number(deadline)) return { success: false, error: 'Deadline passed' };

  const message = `TrusTEE release:${mantleSepolia.id}:${getEscrowAddress().toLowerCase()}:${id}:${deliveryHash.toLowerCase()}`;
  let recovered: `0x${string}`;
  try { recovered = await recoverMessageAddress({ message, signature: signature as `0x${string}` }); }
  catch { return { success: false, error: 'Invalid signature' }; }
  if (recovered.toLowerCase() !== (seller as string).toLowerCase()) return { success: false, error: 'Signature mismatch' };

  if (storedDeliveryHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && storedDeliveryHash.toLowerCase() !== deliveryHash.toLowerCase())
    return { success: false, error: 'Delivery hash mismatch' };

  const { score, meetsThreshold } = await getSellerReputation(seller as `0x${string}`);
  if (!meetsThreshold) return { success: false, error: `Reputation too low: ${score}` };

  const spent = await dailySpentWei();
  const limit = getDailyLimitValue();
  if (spent + amount > parseEther(String(limit)))
    return { success: false, error: `Daily spending limit exceeded (limit: ${limit} MNT)` };

  try {
    const { walletClient } = await getTeeWallet();
    const hash = await walletClient.writeContract({
      address: getEscrowAddress(),
      abi: escrowAbi,
      functionName: 'release',
      args: [BigInt(id)]
    });
    pendingHash = hash;
    const receipt = await getPublicClient().waitForTransactionReceipt({ hash });
    pendingHash = null;
    if (receipt.status !== 'success') return { success: false, error: 'Release transaction reverted' };
    console.log(`\u2705 Released escrow ${id}, tx: ${hash}`);
    return { success: true, txHash: hash };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

let cachedDay: { date: string; block: bigint } | null = null;
async function dailySpentWei(): Promise<bigint> {
  const client = getPublicClient();
  const latest = await client.getBlock();
  const dayStart = latest.timestamp / 86400n * 86400n;
  const date = dayStart.toString();
  if (cachedDay?.date !== date) {
    let lo = 0n, hi = latest.number;
    while (lo < hi) {
      const mid = (lo + hi) / 2n;
      const block = await client.getBlock({ blockNumber: mid });
      if (block.timestamp < dayStart) lo = mid + 1n; else hi = mid;
    }
    cachedDay = { date, block: lo };
  }
  let total = 0n;
  for (let from = cachedDay!.block; from <= latest.number; from += 2000n) {
    const logs = await client.getContractEvents({ address: getEscrowAddress(), abi: escrowAbi, eventName: 'Released',
      fromBlock: from, toBlock: from + 1999n < latest.number ? from + 1999n : latest.number });
    for (const log of logs) total += log.args.amount ?? 0n;
  }
  return total;
}

export async function getSpendingStats(): Promise<{ labels: string[]; totals: number[] }> {
  return { labels: ['Today (UTC)'], totals: [await getDailySpent()] };
}

export async function getHistory(): Promise<any[]> {
  try {
    const fromBlock = await getPublicClient().getBlockNumber();
    const logs = await getPublicClient().getContractEvents({
      address: getEscrowAddress(),
      abi: escrowAbi,
      eventName: 'EscrowCreated',
      fromBlock: fromBlock > 5000n ? fromBlock - 5000n : 0n,
      toBlock: 'latest'
    });
    const history = await Promise.all(logs.reverse().map(async (log) => {
      const { id, buyer, seller, amount, deadline, deliveryHash } = log.args as any;
      const block = await getPublicClient().getBlock({ blockHash: log.blockHash! });
      const escrow = await getEscrowDetails(Number(id));
      let status = 'Pending';
      if (escrow) {
        const e = escrow as any;
        if (e[3]) status = 'Released';
        else if (e[4]) status = 'Refunded';
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
  } catch (err) {
    console.error('Failed to fetch history:', err);
    return [];
  }
}

export async function startEventListener() {
  const address = getEscrowAddress();
  console.log(`\u{1F442} Listening for escrow events on ${address}...`);
  getPublicClient().watchContractEvent({
    address,
    abi: escrowAbi,
    eventName: 'EscrowCreated',
    onLogs: (logs) => {
      for (const log of logs) {
        const { id, buyer, seller, amount } = log.args as any;
        console.log(`\u{1F4E6} New escrow #${id}: ${buyer} \u2192 ${seller}, ${amount} wei`);
      }
    }
  });
}

