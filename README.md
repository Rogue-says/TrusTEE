# TrusTEE

> ⚠️ **NOT PRODUCTION READY**
> This is a hackathon/prototype build. Known issues include unauthenticated admin endpoints, in-memory-only spend tracking (resets on restart), hardcoded mock chart data, testnet-only contracts, and an unprotected Solana wallet key. Do not deploy with real funds. See [Known Limitations](#known-limitations) before using.

Autonomous escrow agent running in a Trusted Execution Environment (TEE) on Phala Cloud. Deployed on **Mantle Sepolia** testnet. Verifies signed delivery proofs, checks seller reputation, enforces daily spending limits, and autonomously deploys idle SOL to **Byreal CLMM pools on Solana** for yield.

Private key is derived inside the TEE enclave and never leaves it. Anyone can verify the running code via remote attestation.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│              Phala Cloud (TEE)               │
│                                              │
│   ┌──────────┐    ┌────────────────────┐     │
│   │ Express  │───▶│  agent.ts          │     │
│   │ + EJS    │    │  - escrow logic    │     │
│   │ dashboard│    │  - sig verify      │     │
│   └──────────┘    │  - spend limit     │     │
│                   └────────┬───────────┘     │
│                            │                 │
│   ┌────────────────────────▼───────────┐     │
│   │         teeClient.ts               │     │
│   │  DstackClient → wallet key         │     │
│   │  (key never leaves enclave)        │     │
│   └────────────────────────────────────┘     │
│                                              │
│   ┌────────────────────────────────────┐     │
│   │  byreal.ts + byrealClient.ts       │     │
│   │  Autonomous yield loop (Solana)    │     │
│   │  byreal-cli subprocess wrapper     │     │
│   └────────────────────────────────────┘     │
└──────────────────────────────────────────────┘
         │                        │
    Mantle Sepolia             Solana
    (escrow contract)      (Byreal CLMM pools)
```

---

## Features

- **TEE wallet** — Key derived via `@phala/dstack-sdk`, attestable, never exported
- **Escrow management** — Reads up to 100 escrows from contract by polling IDs 0–99
- **Delivery verification** — Validates seller signature + optional delivery hash
- **Reputation gate** — Queries on-chain reputation registry; rejects sellers below threshold
- **Daily spend cap** — In-memory counter, resets at midnight, blocks over-limit releases
- **Dashboard** — Real-time status, 7-day spending chart, escrow table, dark mode
- **Byreal yield** — Deploys idle SOL to CLMM pools on configurable interval
- **Skill-compatible** — Other AI agents can install TrusTEE via `npx skills add`

---

## Known Limitations

Read before deploying. These are real gaps in the current version:

| Issue | Impact | Status |
|---|---|---|
| Spending stats days 1–6 are hardcoded mock data | Dashboard chart is misleading | Not fixed |
| `getAllEscrows` polls 100 RPC calls on every request | Slow + misses escrows with ID > 99 | Not fixed |
| Daily spend counter is in-memory only | Server restart resets the counter | Not fixed |
| No auth on `/set-limit` and `/byreal/yield` | Anyone can disable limits or enable yield | Not fixed |
| Solana wallet key stored in plaintext at `~/.config/byreal/keys/` | Not TEE-protected, unlike Mantle wallet | By design (byreal-cli limitation) |
| Testnet only | `mantleSepoliaTestnet` hardcoded in `agent.ts` and `teeClient.ts` | Not fixed |

---

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

---

## Prerequisites

- Node.js 20+
- npm 9+
- Docker (for Phala Cloud deploy)
- A deployed escrow contract on Mantle Sepolia
- A deployed reputation registry contract on Mantle Sepolia

No Phala account needed for local dev — use `DEV_MODE=true`.

---

## Local Development

### 1. Clone and install

```bash
git clone https://github.com/Rogue-says/TrusTEE.git
cd trustee
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Required
MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz
ESCROW_CONTRACT_ADDRESS=0xYourEscrowContract
REPUTATION_REGISTRY_ADDRESS=0xYourReputationRegistry

# TEE key derivation salt — treat like a private key
AGENT_SALT=your-secret-salt-here

# Optional overrides (defaults shown)
MIN_REPUTATION=70
PORT=3000
DAILY_LIMIT=100
YIELD_THRESHOLD_SOL=0.5
YIELD_CHECK_INTERVAL=3600000

# Skip TEE SDK for local dev — uses a random throwaway wallet
DEV_MODE=true
```

> **Warning:** `AGENT_SALT` is the seed for your TEE wallet. Changing it in production generates a new wallet address and abandons any funds in the old one. Back it up.

### 3. Run

```bash
npm run dev
```

Dashboard at `http://localhost:3000`.

In `DEV_MODE=true`, a random wallet is generated each restart. It holds no real funds. You can still test all UI and API flows.

---

## Build

```bash
npm run build
# Outputs to ./dist/ and copies views
npm start
```

---

## Docker (local)

```bash
npm run build
docker build -t trustee:latest .
docker run -p 3000:3000 \
  -e MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz \
  -e ESCROW_CONTRACT_ADDRESS=0x... \
  -e REPUTATION_REGISTRY_ADDRESS=0x... \
  -e AGENT_SALT=your-salt \
  -e DEV_MODE=true \
  trustee:latest
```

---

## Deployment (Phala Cloud TEE)

This is where the TEE security guarantees activate. `DEV_MODE` must be **unset or false**.

### 1. Build and package

```bash
npm run build
zip -r TrusTEE.zip dist/ src/views/ package.json package-lock.json Dockerfile app-compose.json
```

### 2. Deploy to Phala Cloud

1. Log in at [cloud.phala.network](https://cloud.phala.network)
2. Create new deployment → upload `TrusTEE.zip`
3. Set all environment variables in the console:

```
MANTLE_RPC_URL
ESCROW_CONTRACT_ADDRESS
REPUTATION_REGISTRY_ADDRESS
AGENT_SALT
MIN_REPUTATION
PORT
DAILY_LIMIT
YIELD_THRESHOLD_SOL
YIELD_CHECK_INTERVAL
```

Do **not** set `DEV_MODE`. Leave it unset so the `DstackClient` TEE path runs.

4. Deploy. You get a URL like `https://trustee-xxxx.phala.cloud`.

### 3. Get agent wallet address

```bash
curl https://trustee-xxxx.phala.cloud/wallet
```

Fund this address with MNT on Mantle Sepolia before it can release any escrows.

### 4. Verify attestation

The running code is attestable. Check the Phala Cloud dashboard for the attestation report. Users can independently verify the code hash matches what you deployed.

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `MANTLE_RPC_URL` | Yes | — | Mantle Sepolia RPC endpoint |
| `ESCROW_CONTRACT_ADDRESS` | Yes | — | Deployed escrow contract address |
| `REPUTATION_REGISTRY_ADDRESS` | Yes | — | On-chain reputation registry address |
| `AGENT_SALT` | Yes (prod) | `'tee-escrow/v1'` | Salt for TEE key derivation. Keep secret. |
| `MIN_REPUTATION` | No | `70` | Min reputation score to allow payment release |
| `PORT` | No | `3000` | HTTP port |
| `DAILY_LIMIT` | No | `100` | Daily spending cap in MNT |
| `YIELD_THRESHOLD_SOL` | No | `0.5` | Min idle SOL before yield deployment triggers |
| `YIELD_CHECK_INTERVAL` | No | `3600000` | Yield loop interval in ms (default: 1 hour) |
| `DEV_MODE` | No | unset | Set to `true` to skip TEE SDK and use random wallet |

---

## API Endpoints

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/` | GET | None | Dashboard UI |
| `/status` | GET | None | Agent status, balances, uptime |
| `/wallet` | GET | None | Agent wallet address |
| `/escrows` | GET | None | List all escrows (polls IDs 0–99) |
| `/delivery-proof` | POST | None | Submit delivery proof, release funds |
| `/set-limit` | POST | None* | Update daily spending limit |
| `/spending-stats` | GET | None | 7-day spending data for chart |
| `/history` | GET | None | On-chain escrow event timeline |
| `/attestation` | GET | None | TEE attestation info |
| `/byreal/status` | GET | None | Solana wallet, positions, yield mode |
| `/byreal/pools` | GET | None | List Byreal CLMM pools |
| `/byreal/yield` | POST | None* | Enable/disable autonomous yield mode |

*No authentication currently. Do not expose these endpoints publicly without adding an API key.

### POST /delivery-proof

```bash
curl -X POST https://trustee-xxxx.phala.cloud/delivery-proof \
  -H "Content-Type: application/json" \
  -d '{
    "escrowId": 1,
    "signature": "0x...",
    "deliveryHash": "0x..."
  }'
```

The signature must be produced by the **seller's wallet** over the message:
```
Release escrow {id} with delivery {deliveryHash}
```

### POST /set-limit

```bash
curl -X POST https://trustee-xxxx.phala.cloud/set-limit \
  -H "Content-Type: application/json" \
  -d '{ "limit": 50 }'
```

### POST /byreal/yield

```bash
curl -X POST https://trustee-xxxx.phala.cloud/byreal/yield \
  -H "Content-Type: application/json" \
  -d '{ "enabled": true }'
```

---

## Byreal Yield Integration

Byreal is installed globally inside the Docker image (`npm install -g @byreal-io/byreal-cli`). TrusTEE wraps it via subprocess in `byrealClient.ts`.

**How it works:**
1. Every `YIELD_CHECK_INTERVAL` ms, agent checks idle SOL balance
2. If balance ≥ `YIELD_THRESHOLD_SOL`, deploys 80% to a Byreal CLMM pool
3. Pool is auto-selected (first USDC pool returned by `byreal-cli pools list`)
4. Positions are visible on the dashboard under the Byreal section

**Note on security:** The Solana wallet managed by `byreal-cli` is stored at `~/.config/byreal/keys/` inside the container. It is **not** TEE-protected. The Mantle wallet is TEE-protected. These are separate security domains.

**Enable yield mode:**
```bash
curl -X POST /byreal/yield -d '{ "enabled": true }'
```

---

## AI Agent Skill

Other AI agents (OpenClaw, etc.) can install TrusTEE as a skill:

```bash
npx skills add your-github/trustee
```

After install, natural language commands like these are available to the agent:
- "List my escrows"
- "Release escrow 5 after delivery confirmation"
- "Check Byreal pool APRs"
- "Enable yield mode"

Skill manifest is at `skills/trustee/SKILL.md`.

---

## Project Structure

```
├── src/
│   ├── index.ts           # Express server entry, startup sequence
│   ├── agent.ts           # Escrow logic, release, spend limit, history
│   ├── teeClient.ts       # TEE wallet derivation (DstackClient)
│   ├── reputation.ts      # On-chain reputation lookup
│   ├── byrealClient.ts    # byreal-cli subprocess wrapper
│   ├── byreal.ts          # Autonomous yield deployment loop
│   ├── routes.ts          # Express routes + dashboard render
│   └── views/
│       └── dashboard.ejs  # Dashboard template (Chart.js)
├── skills/
│   └── trustee/
│       └── SKILL.md       # AI agent skill manifest
├── Dockerfile
├── app-compose.json       # Phala Cloud deployment manifest
├── package.json
├── tsconfig.json
└── .env.example
```

---

## How the TEE Works

1. Docker image encrypted at rest by Phala Cloud
2. Decrypted only inside the CPU secure enclave (Intel SGX / AMD SEV)
3. `DstackClient.getKey(salt)` derives wallet key inside enclave — never written to disk or network
4. Remote attestation lets anyone verify the running code matches the deployed image

---

## License

MIT
