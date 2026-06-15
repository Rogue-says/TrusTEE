# TrusTEE

Autonomous escrow agent running in a Trusted Execution Environment (TEE) on Phala Cloud. Holds funds on Mantle, verifies delivery proofs, checks ERC-8004 reputation, and releases payments.

## Features

- **TEE-secured wallet** — Key derived inside the enclave via `@phala/dstack-sdk`; never leaves the TEE
- **Escrow management** — Reads all escrows from the contract, displays status (pending/released/refunded)
- **Delivery verification** — Accepts signed delivery proofs from sellers, verifies signatures and delivery hashes
- **Reputation check** — Queries ERC-8004 reputation registry; rejects sellers below configurable threshold
- **Spending limit** — Daily cap on total released MNT (configurable via dashboard or API)
- **Dashboard** — Real-time status, wallet balance, escrow table, spending chart (Chart.js), spending limit control
- **Event listening** — Listens for `EscrowCreated` events and logs new escrows

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript |
| Framework | Express + EJS |
| Blockchain | viem (Mantle Sepolia) |
| TEE | @phala/dstack-sdk |
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

Copy the environment template and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|---|
| `MANTLE_RPC_URL` | Mantle Sepolia RPC endpoint |
| `ESCROW_CONTRACT_ADDRESS` | Deployed escrow contract address |
| `REPUTATION_REGISTRY_ADDRESS` | ERC-8004 registry address |
| `MIN_REPUTATION` | Minimum reputation score (default: 70) |
| `AGENT_SALT` | Salt for TEE key derivation (keep secret) |
| `PORT` | HTTP server port (default: 3000) |
| `DAILY_LIMIT` | Daily spending cap in MNT (default: 100) |
| `YIELD_THRESHOLD_SOL` | Minimum idle SOL to trigger yield deployment (default: 0.5) |
| `YIELD_CHECK_INTERVAL` | Yield loop interval in ms (default: 3600000 = 1hr) |
| `DEV_MODE` | Set to `true` to run locally without TEE (generates random wallet) |

### Development

```bash
npm run dev
```

The dashboard is available at `http://localhost:3000`.

### Build

```bash
npm run build
npm start
```

## Deployment (Phala Cloud)

```bash
npm run build
npx phala auth login
npx phala deploy -e .env
```

Phala Cloud builds the Docker image automatically and provisions a TEE. After deployment, you receive a public URL (e.g., `https://tee-escrow-xxxx.phala.cloud`).

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Dashboard UI |
| `/status` | GET | Agent status, balance, daily limit/spent |
| `/wallet` | GET | Agent wallet address |
| `/escrows` | GET | List all escrows |
| `/delivery-proof` | POST | Submit delivery proof and release funds |
| `/set-limit` | POST | Update daily spending limit |
| `/spending-stats` | GET | Spending data for chart (last 7 days) |
| `/attestation` | GET | Attestation info |

### POST /delivery-proof

```json
{
  "escrowId": 1,
  "signature": "0x...",
  "deliveryHash": "0x..." (optional)
}
```

### POST /set-limit

```json
{
  "limit": 150
}
```

## Project Structure

```
├── src/
│   ├── index.ts          # Express server entry point
│   ├── agent.ts          # Core escrow logic, release, spending limit
│   ├── teeClient.ts      # TEE wallet derivation (DstackClient)
│   ├── reputation.ts     # ERC-8004 reputation lookup
│   ├── routes.ts         # Express routes + dashboard render
│   └── views/
│       └── dashboard.ejs # Dashboard template (Chart.js)
├── Dockerfile
├── app-compose.json      # Phala Cloud deployment manifest
├── package.json
├── tsconfig.json
└── .env.example
```

## License

MIT
