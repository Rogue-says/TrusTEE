import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import solc from 'solc';
import { JsonRpcProvider, ContractFactory, HDNodeWallet, parseEther } from 'ethers';
import express from 'express';
import ejs from 'ejs';
import { getPools } from '../src/byrealClient.js';
import router from '../src/routes.js';
import { getAllEscrows, releaseEscrow, setDailyLimit, getDailySpent } from '../src/agent.js';

function compile(name: string, source: string) {
  const input = { language: 'Solidity', sources: { 'Test.sol': { content: source } },
    settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } };
  const result = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (result.errors || []).filter((e: any) => e.severity === 'error');
  assert.deepEqual(errors, []);
  return result.contracts['Test.sol'][name];
}

test('search text remains a literal argument, never shell code', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'trustee-cli-'));
  const marker = path.join(directory, 'injected');
  const executable = path.join(directory, 'byreal-cli');
  writeFileSync(executable, '#!/usr/bin/env node\nconsole.log(JSON.stringify({args:process.argv.slice(2)}));\n', { mode: 0o700 });
  const old = process.env.PATH;
  process.env.PATH = `${directory}:${old}`;
  try {
    const search = `"; touch ${marker}; echo "`;
    const result = await getPools(search);
    assert.deepEqual(result.args, ['pools', 'list', '--search', search, '-o', 'json']);
    assert.equal(existsSync(marker), false);
  } finally { process.env.PATH = old; rmSync(directory, { recursive: true }); }
});

test('POST routes require authentication and reject malformed proof and budget', async () => {
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as any).port}`;
  process.env.ADMIN_API_TOKEN = 'regression-test-token';
  async function post(route: string, data: any, authorized = true) {
    return fetch(url + route, { method: 'POST', headers: { 'Content-Type': 'application/json',
      ...(authorized ? { Authorization: 'Bearer regression-test-token' } : {}) }, body: JSON.stringify(data) });
  }
  try {
    assert.equal((await post('/set-limit', { limit: 1 }, false)).status, 401);
    assert.equal((await post('/set-limit', { limit: null })).status, 400);
    assert.equal((await post('/delivery-proof', { escrowId: -1, signature: 'bad' })).status, 400);
    assert.equal((await post('/byreal/yield', { enabled: 'false' })).status, 400);
    assert.equal((await post('/byreal/yield', { enabled: true })).status, 409);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('real EVM: serializes releases, decodes tuples, counts confirmed spending and renders escrows', async () => {
  const node = spawn(process.execPath, ['node_modules/hardhat/internal/cli/cli.js', 'node', '--port', '19545'], { stdio: 'ignore' });
  const provider = new JsonRpcProvider('http://127.0.0.1:19545', 5003, { staticNetwork: true });
  provider.pollingInterval = 50;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { await provider.getBlockNumber(); ready = true; break; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    assert.ok(ready, 'local EVM started');
    const mnemonic = 'test test test test test test test test test test test junk';
    const agentWallet = HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/1");
    const seller = HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/2");
    const deployer = await provider.getSigner(0), buyer = await provider.getSigner(3);
    const artifact = compile('TEEscrow', readFileSync('my-folder/Contract/TEEscrow.sol', 'utf8'));
    const escrow = await new ContractFactory(artifact.abi, artifact.evm.bytecode.object, deployer).deploy(agentWallet.address);
    await escrow.waitForDeployment();
    const registryArtifact = compile('Registry', 'pragma solidity ^0.8.20; contract Registry {function getScore(address) external pure returns(uint256){return 100;}}');
    const registry = await new ContractFactory(registryArtifact.abi, registryArtifact.evm.bytecode.object, deployer).deploy();
    await registry.waitForDeployment();
    process.env.DEV_MODE = 'true'; process.env.DEV_PRIVATE_KEY = agentWallet.privateKey;
    process.env.MANTLE_RPC_URL = 'http://127.0.0.1:19545';
    process.env.ESCROW_CONTRACT_ADDRESS = await escrow.getAddress();
    process.env.REPUTATION_REGISTRY_ADDRESS = await registry.getAddress();
    const hash = '0x' + 'ab'.repeat(32);
    const deadline = (await provider.getBlock('latest'))!.timestamp + 86400;
    for (let i = 0; i < 2; i++) await (await (escrow.connect(buyer) as any).create(seller.address, hash, deadline, {value: parseEther('0.6')})).wait();
    await setDailyLimit(1);
    const rows = await getAllEscrows();
    assert.equal(rows.length, 2); assert.equal(rows[0].amount, '0.6');
    assert.doesNotThrow(() => JSON.stringify(rows));
    const html = await ejs.renderFile('src/views/dashboard.ejs', { agentAddress: agentWallet.address, balanceMNT: 1,
      escrows: rows, history: [], dailyLimit: 1, dailySpent: 0, minReputation: 70, byreal: { available: false } });
    assert.ok(html.includes('0.6000'));
    const wrongDomain = await seller.signMessage(`Release escrow 0 with delivery ${hash}`);
    assert.equal((await releaseEscrow(0, wrongDomain, hash)).success, false);
    const signatures = await Promise.all([0,1].map(id => seller.signMessage(`TrusTEE release:5003:${process.env.ESCROW_CONTRACT_ADDRESS!.toLowerCase()}:${id}:${hash}`)));
    const results = await Promise.all([0,1].map(id => releaseEscrow(id, signatures[id], hash)));
    assert.equal(results.filter(r => r.success).length, 1);
    assert.ok(results.some(r => r.error?.includes('limit exceeded')));
    assert.equal(await getDailySpent(), 0.6);
  } finally { provider.destroy(); node.kill(); await new Promise<void>(resolve => node.once('exit', () => resolve())); }
});
