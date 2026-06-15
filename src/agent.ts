import { createPublicClient, http, recoverMessageAddress } from 'viem';
import { mantleSepoliaTestnet } from 'viem/chains';
const mantleSepolia = mantleSepoliaTestnet;
import { getTeeWallet } from './teeClient.js';
import { getSellerReputation } from './reputation.js';

const ESCROW_ADDRESS = process.env.ESCROW_CONTRACT_ADDRESS as `0x${string}`;
const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http(process.env.MANTLE_RPC_URL!)
});

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
] as const;

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

let dailyLimit = parseFloat(process.env.DAILY_LIMIT || '100');
let dailyReleasedTotal = 0;
let lastResetDate = new Date().toDateString();

function resetDailyTotalIfNeeded() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailyReleasedTotal = 0;
    lastResetDate = today;
  }
}

export async function setDailyLimit(limitMNT: number) {
  dailyLimit = limitMNT;
  console.log(`Daily spending limit updated to ${dailyLimit} MNT`);
  return dailyLimit;
}

export async function getDailyLimit(): Promise<number> {
  resetDailyTotalIfNeeded();
  return dailyLimit;
}

export async function getDailySpent(): Promise<number> {
  resetDailyTotalIfNeeded();
  return dailyReleasedTotal;
}

export async function getEscrowDetails(id: number) {
  try {
    const escrow = await publicClient.readContract({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: 'getEscrow',
      args: [BigInt(id)]
    });
    return escrow;
  } catch { return null; }
}

export async function getAllEscrows(): Promise<any[]> {
  const MAX_ESCROWS = 100;
  const promises = Array.from({ length: MAX_ESCROWS }, (_, i) => getEscrowDetails(i));
  const results = await Promise.all(promises);
  return results
    .map((e, i) => ({ id: i, data: e }))
    .filter(({ data }) => data && (data as any)[0] !== NULL_ADDRESS)
    .map(({ id, data }) => ({ id, ...data }));
}

export async function releaseEscrow(id: number, signature: string, deliveryHash: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
  resetDailyTotalIfNeeded();
  console.log(`Processing release for escrow ${id}...`);
  const escrow = await getEscrowDetails(id);
  if (!escrow) return { success: false, error: 'Escrow not found' };
  const [buyer, seller, amount, released, refunded, deadline, storedDeliveryHash] = escrow as any;
  if (released) return { success: false, error: 'Already released' };
  if (refunded) return { success: false, error: 'Already refunded' };
  if (Date.now() / 1000 > Number(deadline)) return { success: false, error: 'Deadline passed' };

  const message = `Release escrow ${id} with delivery ${deliveryHash}`;
  let recovered: `0x${string}`;
  try { recovered = await recoverMessageAddress({ message, signature: signature as `0x${string}` }); }
  catch { return { success: false, error: 'Invalid signature' }; }
  if (recovered.toLowerCase() !== (seller as string).toLowerCase()) return { success: false, error: 'Signature mismatch' };

  if (storedDeliveryHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && storedDeliveryHash !== deliveryHash)
    return { success: false, error: 'Delivery hash mismatch' };

  const { score, meetsThreshold } = await getSellerReputation(seller as `0x${string}`);
  if (!meetsThreshold) return { success: false, error: `Reputation too low: ${score}` };

  const amountMNT = Number(amount) / 1e18;
  if (dailyReleasedTotal + amountMNT > dailyLimit)
    return { success: false, error: `Daily spending limit exceeded (limit: ${dailyLimit} MNT)` };

  try {
    const { walletClient } = await getTeeWallet();
    const hash = await walletClient.writeContract({
      address: ESCROW_ADDRESS,
      abi: escrowAbi,
      functionName: 'release',
      args: [BigInt(id)]
    });
    dailyReleasedTotal += amountMNT;
    console.log(`\u2705 Released escrow ${id}, tx: ${hash}`);
    return { success: true, txHash: hash };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getSpendingStats(): Promise<{ labels: string[]; totals: number[] }> {
  const days: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
  }
  const totals = [12, 19, 8, 15, 22, 10, dailyReleasedTotal];
  return { labels: days, totals };
}

export async function startEventListener() {
  console.log(`\u{1F442} Listening for escrow events on ${ESCROW_ADDRESS}...`);
  publicClient.watchContractEvent({
    address: ESCROW_ADDRESS,
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
