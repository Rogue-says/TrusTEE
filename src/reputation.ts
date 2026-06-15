import { createPublicClient, http } from 'viem';
import { mantleSepoliaTestnet } from 'viem/chains';
const mantleSepolia = mantleSepoliaTestnet;

const REPUTATION_REGISTRY = process.env.REPUTATION_REGISTRY_ADDRESS as `0x${string}`;
const MIN_REPUTATION = parseInt(process.env.MIN_REPUTATION || '70', 10);

const publicClient = createPublicClient({
  chain: mantleSepolia,
  transport: http(process.env.MANTLE_RPC_URL!)
});

const reputationAbi = [{
  inputs: [{ name: 'user', type: 'address' }],
  name: 'getScore',
  outputs: [{ name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function'
}] as const;

export async function getSellerReputation(sellerAddress: `0x${string}`): Promise<{ score: number; meetsThreshold: boolean }> {
  try {
    const score = await publicClient.readContract({
      address: REPUTATION_REGISTRY,
      abi: reputationAbi,
      functionName: 'getScore',
      args: [sellerAddress]
    }) as bigint;
    const numericScore = Number(score);
    return { score: numericScore, meetsThreshold: numericScore >= MIN_REPUTATION };
  } catch (error) {
    console.error('Failed to fetch reputation:', error);
    return { score: 0, meetsThreshold: false };
  }
}
