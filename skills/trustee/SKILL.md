---
name: trustee
description: "TrusTEE — TEE-secured escrow agent on Mantle with autonomous Byreal yield deployment. Create escrows, verify delivery proofs, check ERC-8004 reputation, release payments, and deploy idle funds to Byreal CLMM pools for yield."
metadata:
  openclaw:
    homepage: https://github.com/byreal-git/trustee
    install:
      - kind: node
        package: "@byreal-io/byreal-cli"
        global: true
---

# TrusTEE

Autonomous escrow agent running in a TEE on Phala Cloud. Holds funds on Mantle, verifies delivery proofs, checks ERC-8004 reputation, releases payments, and autonomously deploys idle funds to Byreal CLMM pools on Solana for yield.

## Capabilities

### Escrow Management
- List all escrows with status (pending/released/refunded)
- View escrow details: buyer, seller, amount, deadline, delivery hash
- Check agent wallet address and MNT balance

### Delivery Verification
- Submit delivery proof with signature verification
- Verify seller reputation via ERC-8004
- Enforce daily spending limits
- Release funds to seller automatically

### Byreal Yield Deployment
- Deploy idle SOL to Byreal CLMM pools
- Open/close concentrated liquidity positions
- Claim trading fees
- Monitor pool APR and TVL
- Autonomous yield management with configurable thresholds

### API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/status` | GET | Agent status, balance, limits, Byreal status |
| `/escrows` | GET | List all escrows |
| `/delivery-proof` | POST | Submit delivery proof and release |
| `/history` | GET | On-chain escrow event history |
| `/byreal/status` | GET | Byreal wallet, positions, pool overview |
| `/byreal/pools` | GET | List Byreal CLMM pools |
| `/byreal/yield` | POST | Enable/disable yield mode |

## Autonomous Actions

The agent performs these actions without human intervention:

1. **Event listening** — Listens for `EscrowCreated` events on the Mantle contract
2. **Yield deployment** — Periodically checks idle SOL balance and deploys to Byreal CLMM pools when above threshold
3. **Spending limit enforcement** — Tracks daily released amounts and blocks over-limit releases

## Setup

```bash
# Install TrusTEE as a skill
npx skills add byreal-git/trustee

# Or run independently
git clone https://github.com/byreal-git/trustee
cd trustee
npm install
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `MANTLE_RPC_URL` | Mantle Sepolia RPC |
| `ESCROW_CONTRACT_ADDRESS` | Deployed escrow contract |
| `REPUTATION_REGISTRY_ADDRESS` | ERC-8004 registry |
| `AGENT_SALT` | TEE key derivation salt |
| `DAILY_LIMIT` | Daily spending cap in MNT |
| `YIELD_THRESHOLD_SOL` | Min SOL idle for yield deployment |
| `YIELD_CHECK_INTERVAL` | Yield loop interval in ms |
