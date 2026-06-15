import { exec } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);
const CONFIG_DIR = `${homedir()}/.config/byreal`;
const KEY_PATH = `${CONFIG_DIR}/keys/trustee-wallet.json`;

function ensureDir() {
  if (!existsSync(`${CONFIG_DIR}/keys`)) {
    mkdirSync(`${CONFIG_DIR}/keys`, { recursive: true });
  }
}

async function cli(args: string): Promise<any> {
  try {
    const { stdout } = await execAsync(`byreal-cli ${args} -o json`, {
      timeout: 30000
    });
    return JSON.parse(stdout);
  } catch (e: any) {
    if (e.stdout) {
      try { return JSON.parse(e.stdout); } catch {}
    }
    if (e.stderr) {
      try { return JSON.parse(e.stderr); } catch {}
    }
    return { success: false, error: e.message };
  }
}

export async function setupWallet(privateKey?: string) {
  ensureDir();
  if (!privateKey) {
    return cli('wallet generate');
  }
  writeFileSync(KEY_PATH, privateKey, 'utf-8');
  return cli(`wallet import --keypair ${KEY_PATH}`);
}

export async function getWalletAddress(): Promise<string | null> {
  const result = await cli('wallet address');
  if (result?.success && result?.data?.address) {
    return result.data.address;
  }
  return null;
}

export async function getBalance(): Promise<number> {
  const result = await cli('wallet balance');
  if (result?.success && result?.data?.balances) {
    const sol = result.data.balances.find((b: any) => b.mint === 'SOL');
    return sol?.amount || 0;
  }
  return 0;
}

export async function getOverview() {
  return cli('overview');
}

export async function getPools(search?: string) {
  const filter = search ? `--search "${search}"` : '';
  return cli(`pools list ${filter}`);
}

export async function getPoolInfo(address: string) {
  return cli(`pools info --address ${address}`);
}

export async function listPositions() {
  return cli('positions list');
}

export async function openPosition(poolAddress: string, amountUsd: number) {
  return cli(`positions open --pool ${poolAddress} --amount-usd ${amountUsd}`);
}

export async function closePosition(positionMint: string) {
  return cli(`positions close --position-mint ${positionMint}`);
}

export async function claimFees() {
  return cli('positions claim');
}

export async function swap(inputMint: string, outputMint: string, amount: number, dryRun = false) {
  const dry = dryRun ? '--dry-run' : '';
  return cli(`swap execute --input-mint ${inputMint} --output-mint ${outputMint} --amount ${amount} ${dry}`);
}

export async function isByrealAvailable(): Promise<boolean> {
  try {
    await execAsync('which byreal-cli', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
