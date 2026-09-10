# TrusTEE

An experimental Mantle escrow agent with an Express dashboard, a Solidity escrow contract, and optional Phala dstack key derivation. The agent checks a seller signature, committed delivery hash, reputation threshold and daily spending budget before requesting payment.

**Status: locally tested prototype, not a production payment service or security-audited system.** TEE key derivation does not prove that work was delivered correctly. The contract owner can change the authorized agent.

## Setup

Requires Node.js 22+ and npm.

```bash
git clone https://github.com/Rogue-says/TrusTEE.git
cd TrusTEE
npm ci
cp .env.example .env
npm run build
npm test
```

Configure `.env` before starting the server:

| Variable | Purpose |
| --- | --- |
| `MANTLE_RPC_URL` | Mantle Sepolia RPC endpoint (chain ID 5003) |
| `ESCROW_CONTRACT_ADDRESS` | Your deployed `TEEscrow` contract |
| `REPUTATION_REGISTRY_ADDRESS` | A registry implementing `getScore(address) returns (uint256)` |
| `MIN_REPUTATION` | Minimum accepted score; default 70 |
| `DAILY_LIMIT` | Positive daily MNT release budget; default 100 |
| `ADMIN_API_TOKEN` | Bearer token required by every POST endpoint |
| `DEV_MODE` | Set `true` for a local test wallet; otherwise use dstack |
| `DEV_PRIVATE_KEY` | Required persistent `0x`-prefixed test key in development mode |
| `AGENT_SALT` | Stable dstack key derivation path |
| `PORT` | HTTP port; default 3000 |

```bash
npm start
# Or run source directly:
npm run dev
```

Open `http://localhost:3000`. `/health` checks the HTTP service; it does not certify RPC, reputation or TEE availability. `/status` reads those runtime dependencies. Configure TLS at your reverse proxy before transmitting bearer tokens over a network.

The agent wallet must be funded for gas and explicitly authorized as `agent` in the escrow contract. A fresh development key is no longer generated on every restart. Outside development mode, dstack must be reachable in the deployment environment; see [Phala key management](https://docs.phala.com/phala-cloud/key-management/create-crypto-wallet).

No production registry is bundled, and the old example registry address was not verified. Missing or failing reputation lookup rejects payment.

## Contract

The contract source is `my-folder/Contract/TEEscrow.sol`. Compile it from the repository root:

```bash
npm run compile:contracts
```

Deploy `TEEscrow(agentAddress)` using your chosen testnet deployment tool, then set its address in `.env`. The root Hardhat configuration uses the pinned local Solidity compiler. The older `my-folder` project is retained for historical deployment context; the root package and tests are the maintained entrypoint.

Buyers call `create(seller, deliveryHash, deadline)` with native MNT. The agent alone can `release(id)` before expiry. Buyers can `refund(id)` after expiry. Contract ownership remains a trust assumption. Existing deployments are not modified by these source changes.

## Delivery proof protocol

The seller signs this exact UTF-8 message with a standard personal-message signature:

```text
TrusTEE release:5003:<lowercase escrow contract address>:<decimal escrow ID>:<lowercase bytes32 delivery hash>
```

The chain and contract address prevent replaying a proof against another deployment. `escrowId` must be a nonnegative safe integer, including zero; the hash must be a 32-byte hex string and the signature a 65-byte hex string.

```bash
curl -X POST http://localhost:3000/delivery-proof \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"escrowId":0,"signature":"0xREPLACE_WITH_SIGNATURE","deliveryHash":"0xREPLACE_WITH_32_BYTE_HASH"}'
```

Replace the signature/hash placeholders with valid values. Legacy signatures using `Release escrow ... with delivery ...` are intentionally rejected. Update external agents and the historical bundled skill's request examples to include this message format and bearer authentication.

A matching hash and signature prove control of the seller key and consistency with the commitment, not delivery quality. If the escrow stores a zero hash, hash matching is skipped; use a meaningful commitment for real workflows.

## API and dashboard

| Endpoint | Behavior |
| --- | --- |
| `GET /` | Dashboard with newest 100 escrows |
| `GET /health` | HTTP liveness |
| `GET /status`, `/wallet` | Agent information |
| `GET /escrows` | Named, JSON-safe escrow fields; amounts are decimal MNT strings |
| `GET /history` | Creation history within the latest 5,000 blocks and current settlement status |
| `GET /spending-stats` | Today's confirmed released amount, UTC |
| `POST /delivery-proof` | Authenticated, verified release request |
| `POST /set-limit` | Authenticated positive finite budget; process-local setting |
| `GET /byreal/status`, `/byreal/pools` | Optional Byreal CLI reads |
| `POST /byreal/yield` | Enabling automatic allocation returns 409; disabling remains supported |
| `GET /attestation` | Informational placeholder; not a cryptographically verified quote |

The dashboard asks for the admin token when a write action is performed and does not save it. GET endpoints are public and expose wallet/escrow information. Use one service instance per signing key.

## Repairs and limitations

- Restored root dependencies, reproducible lockfile, ESM TypeScript build, view copying and Docker source build. Generated `dist` output is no longer maintained in Git.
- Replaced shell interpolation with executable argument arrays in Byreal calls. User search text cannot become a shell command.
- Corrected the contract tuple ABI and dashboard field mapping; BigInts no longer break `/escrows` JSON serialization.
- Replaced 100 unconditional RPC calls with actual contract count, newest-first pagination and bounded concurrency.
- Serialized releases, checked receipts before reporting success, and derived daily spending from confirmed `Released` events in integer wei. The agent finds the UTC day boundary and requests logs in bounded ranges. RPC failures block release rather than assume zero spending.
- Removed fabricated historical spending totals. History block ranges no longer become negative on young chains.
- Disabled the automatic Byreal loop: it previously passed a SOL amount to an argument denominated in USD. This repository does not implement bridging Mantle escrow funds into Solana yield positions.

The release queue and pending-confirmation marker are process-local. Do not run multiple instances or restart with unresolved transactions without checking the chain and pending nonce. Budget changes through `/set-limit` revert to `.env` on restart. No durable queue, persistent policy store, cryptographic attestation endpoint, production observability or distributed signer coordination is implemented. Log scans can be costly on a busy chain; an indexed, reorg-aware ledger is future work.

## Tests and container

```bash
npm test
npm run build
docker build -t trustee .
docker run --rm --env-file .env -p 3000:3000 trustee
```

Tests cover CLI injection regression, POST authentication/input validation, actual contract tuple decoding, dashboard rendering, signature domain rejection and concurrent payment budgeting on a local EVM. The tests use a deliberately simple local reputation fixture; they do not validate a live registry or Phala deployment. The Docker command requires suitable dstack access unless using development mode.

No public-network payments, contract deployments or Phala deployment were executed during the repair. The retained compose manifest may reference an older published image; build and publish your own image before deploying this revision.

## Dependency audit

The retained Hardhat 2 / Solidity development toolchain still has published npm audit advisories, including transitive ZIP handling, serialization, temporary-file handling and HTTP client dependencies. Compatible updates were applied; a clean audit is **not** claimed. A Hardhat 3 migration and compiler/toolchain review remain necessary. Do not expose the local Hardhat node to untrusted networks.

MIT license; see [LICENSE](LICENSE).
