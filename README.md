# TrusTEE

Autonomous escrow agent running in a Trusted Execution Environment (TEE) on Phala Cloud. Holds funds on Mantle, verifies delivery proofs, checks ERC-8004 reputation, releases payments, and autonomously deploys idle funds to **Byreal CLMM pools on Solana** for yield.

## Features

- **TEE-secured wallet** — Key derived inside the enclave via `@phala/dstack-sdk`; never leaves the TEE. Attestable to users.
- **Escrow management** — Reads all escrows from the contract, displays status (pending/released/refunded)
- **Delivery verification** — Accepts signed delivery proofs from sellers, verifies signatures and delivery hashes
- **Reputation check** — Queries ERC-8004 reputation registry; rejects sellers below configurable threshold
- **Spending limit** — Daily cap on total released MNT (configurable via dashboard or API)
- **Dashboard** — Real-time status, wallet balance, escrow table, spending chart (Chart.js), spending limit control, dark mode
- **Event listening** — Listens for `EscrowCreated` events and logs new escrows
- **MetaMask connect** — Users connect their wallet to filter escrows by address
- **On-chain history** — Timeline of all escrow events with timestamps and transaction hashes
- **Byreal yield deployment** — Agent autonomously deploys idle SOL to Byreal CLMM pools for yield. Opens positions, claims fees, monitors APR.
- **Skill-compatible** — Other AI agents can install TrusTEE as a skill via `npx skills add`

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript |
| Framework | Express + EJS |
| Blockchain (Mantle) | viem |
| DeFi (Solana) | Byreal Agent Skills (`byreal-cli`) |
| TEE | @phala/dstack-sdk + Phala Cloud |
| Charts | Chart.js (CDN) |
| Dev tooling | tsx |
| Deployment | Docker + Phala Cloud |

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Install

```bash
git clone <repo-url>
cd trustee
npm install
```

### Configuration

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `MANTLE_RPC_URL` | Mantle Sepolia RPC endpoint |
| `ESCROW_CONTRACT_ADDRESS` | Deployed escrow contract address |
| `REPUTATION_REGISTRY_ADDRESS` | ERC-8004 registry address |
| `MIN_REPUTATION` | Minimum reputation score (default: 70) |
| `AGENT_SALT` | Salt for TEE key derivation (keep secret) |
| `PORT` | HTTP server port (default: 3000) |
| `DAILY_LIMIT` | Daily spending cap in MNT (default: 100) |
| `YIELD_THRESHOLD_SOL` | Min idle SOL to trigger yield deployment (default: 0.5) |
| `YIELD_CHECK_INTERVAL` | Yield loop interval in ms (default: 3600000 = 1hr) |
| `DEV_MODE` | `true` to run locally without TEE (random wallet) |

### Development

```bash
npm run dev
```

Dashboard at `http://localhost:3000`. Set `DEV_MODE=true` to skip the TEE SDK and use a local random wallet.

### Build

```bash
npm run build
npm start
```

## Deployment (Phala Cloud)

```bash
npm run build
# Upload TrusTEE.zip to Phala Cloud web dashboard
# Set your env vars in the Phala Cloud console
```

After deployment, you receive a public URL like `https://trustee-xxxx.phala.cloud`.

## Dashboard

The dashboard is served at your public URL. Includes:

- Agent status (wallet address, MNT balance, uptime)
- Spending chart (7-day bar chart via Chart.js)
- Spending limit control (set daily cap live)
- Escrows table (all escrows with status)
- History timeline (on-chain events with dates/tx hashes)
- Wallet connect (MetaMask) — filter to "My Escrows"
- Delivery proof form (release funds)
- Byreal yield section (Solana wallet, SOL balance, LP positions, TVL)
- API for Agents (curl examples)
- Dark/light mode toggle

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Dashboard UI |
| `/status` | GET | Agent status, balance, limits, Byreal status |
| `/wallet` | GET | Agent wallet address |
| `/escrows` | GET | List all escrows |
| `/delivery-proof` | POST | Submit delivery proof and release funds |
| `/set-limit` | POST | Update daily spending limit |
| `/spending-stats` | GET | Spending data for chart (last 7 days) |
| `/history` | GET | On-chain escrow event timeline |
| `/byreal/status` | GET | Byreal wallet, positions, yield mode |
| `/byreal/pools` | GET | List Byreal CLMM pools |
| `/byreal/yield` | POST | Enable/disable yield mode |
| `/attestation` | GET | TEE attestation info |

### POST /delivery-proof

```json
{
  "escrowId": 1,
  "signature": "0x...",
  "deliveryHash": "0x..." (optional)
}
```

## Byreal Integration

TrusTEE integrates **Byreal Agent Skills** for autonomous yield deployment on Solana:

1. **Read-only operations** — Query pool TVL, APR, and token info (no wallet needed)
2. **Yield mode** — When enabled, agent checks idle SOL balance every hour. If above threshold, deploys to a Byreal CLMM pool.
3. **Position management** — Open and close concentrated liquidity positions via `byreal-cli`
4. **Dashboard visibility** — See wallet address, SOL balance, active positions, and Byreal TVL

The `byreal-cli` is installed globally in the Docker image via `npm install -g @byreal-io/byreal-cli`.

## Skill for AI Agents

Other AI agents can install TrusTEE as a skill:

```bash
npx skills add your-github/trustee
```

After installation, the agent can use TrusTEE's capabilities via natural language:
- "List my escrows"
- "Release escrow 5 after delivery confirmation"
- "Check Byreal pool APRs"
- "Enable yield mode on idle funds"

## Project Structure

```
├── src/
│   ├── index.ts           # Express server entry point
│   ├── agent.ts           # Core escrow logic, release, spending limit
│   ├── teeClient.ts       # TEE wallet derivation (DstackClient)
│   ├── reputation.ts      # ERC-8004 reputation lookup
│   ├── byrealClient.ts    # Byreal CLI async wrapper (pools, swap, positions)
│   ├── byreal.ts          # Autonomous yield deployment loop
│   ├── routes.ts          # Express routes + dashboard render
│   └── views/
│       └── dashboard.ejs  # Dashboard template (Chart.js)
├── skills/
│   └── trustee/
│       └── SKILL.md       # Byreal-compatible skill manifest
├── Dockerfile
├── app-compose.json       # Phala Cloud deployment manifest
├── package.json
├── tsconfig.json
└── .env.example
```

## How the TEE Works

1. **Code encrypted at rest** — Phala encrypts your Docker image when stored
2. **Decrypted inside CPU** — Intel SGX/AMD SEV decrypts only inside a secure enclave
3. **Wallet key never leaves** — Derived via `DstackClient`, exists only in CPU registers during signing
4. **Remote attestation** — Anyone can verify the running code matches what you deployed

## License

MIT
