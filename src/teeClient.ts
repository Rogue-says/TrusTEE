import { DstackClient } from '@phala/dstack-sdk';
import { toViemAccountSecure } from '@phala/dstack-sdk/viem';
import { createWalletClient, http, type Account } from 'viem';
import { mantleSepoliaTestnet } from 'viem/chains';
const mantleSepolia = mantleSepoliaTestnet;

let cachedAccount: Account | null = null;

export async function getTeeWallet() {
  if (cachedAccount) {
    const walletClient = createWalletClient({
      account: cachedAccount,
      chain: mantleSepolia,
      transport: http(process.env.MANTLE_RPC_URL!)
    });
    return { account: cachedAccount, walletClient };
  }
  const client = new DstackClient();
  const salt = process.env.AGENT_SALT || 'tee-escrow/v1';
  const key = await client.getKey(salt);
  const account = toViemAccountSecure(key);
  cachedAccount = account;
  const walletClient = createWalletClient({
    account,
    chain: mantleSepolia,
    transport: http(process.env.MANTLE_RPC_URL!)
  });
  console.log(`\u{1F511} TEE wallet derived: ${account.address}`);
  return { account, walletClient };
}

export async function getAgentAddress(): Promise<string> {
  const { account } = await getTeeWallet();
  return account.address;
}
