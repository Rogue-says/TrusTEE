TrusTEE


⚠️ NOT PRODUCTION READY
This is a hackathon/prototype build. Known issues include unauthenticated admin endpoints, in-memory-only spend tracking (resets on restart), hardcoded mock chart data, testnet-only contracts, and an unprotected Solana wallet key. Do not deploy with real funds. See Known Limitations before using.

##

Autonomous escrow agent running in a Trusted Execution Environment (TEE) on Phala Cloud. Deployed on Mantle Sepolia testnet. Verifies signed delivery proofs, checks seller reputation, enforces daily spending limits, and autonomously deploys idle SOL to Byreal CLMM pools on Solana for yield.

Private key is derived inside the TEE enclave and never leaves it. Anyone can verify the running code via remote attestation.

##
Architecture

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


Features


TEE wallet — Key derived via @phala/dstack-sdk, attestable, never exported
Escrow management — Reads up to 100 escrows from contract by polling IDs 0–99
Delivery verification — Validates seller signature + optional delivery hash
Reputation gate — Queries on-chain reputation registry; rejects sellers below threshold
Daily spend cap — In-memory counter, resets at midnight, blocks over-limit releases
Dashboard — Real-time status, 7-day spending chart, escrow table, dark mode
Byreal yield — Deploys idle SOL to CLMM pools on configurable interval
Skill-compatible — Other AI agents can install TrusTEE via npx skills add



Known Limitations

Read before deploying. These are real gaps in the current version:

IssueImpactStatusSpending stats days 1–6 are hardcoded mock dataDashboard chart is misleadingNot fixedgetAllEscrows polls 100 RPC calls on every requestSlow + misses escrows with ID > 99Not fixedDaily spend counter is in-memory onlyServer restart resets the counterNot fixedNo auth on /set-limit and /byreal/yieldAnyone can disable limits or enable yieldNot fixedSolana wallet key stored in plaintext at ~/.config/byreal/keys/Not TEE-protected, unlike Mantle walletBy design (byreal-cli limitation)Testnet onlymantleSepoliaTestnet hardcoded in agent.ts and teeClient.tsNot fixed


Tech Stack

LayerTechnologyRuntimeNode.js 20 + TypeScriptFrameworkExpress + EJSBlockchain (Mantle)viemDeFi (Solana)Byreal Agent Skills (byreal-cli)TEE@phala/dstack-sdk + Phala CloudChartsChart.js (CDN)Dev toolingtsxDeploymentDocker + Phala Cloud


Prerequisites


Node.js 20+
npm 9+
Docker (for Phala Cloud deploy)
A deployed escrow contract on Mantle Sepolia
A deployed reputation registry contract on Mantle Sepolia


No Phala account needed for local dev — use DEV_MODE=true.


Local Development

1. Clone and install

bashgit clone <repo-url>
cd trustee
npm install

2. Configure environment

bashcp .env.example .env

Edit .env:

env# Required
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


Warning: AGENT_SALT is the seed for your TEE wallet. Changing it in production generates a new wallet address and abandons any funds in the old one. Back it up.



3. Run

bashnpm run dev

Dashboard at http://localhost:3000.

In DEV_MODE=true, a random wallet is generated each restart. It holds no real funds. You can still test all UI and API flows.


Build

bashnpm run build
# Outputs to ./dist/ and copies views
npm start


Docker (local)

bashnpm run build
docker build -t trustee:latest .
docker run -p 3000:3000 \
  -e MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz \
  -e ESCROW_CONTRACT_ADDRESS=0x... \
  -e REPUTATION_REGISTRY_ADDRESS=0x... \
  -e AGENT_SALT=your-salt \
  -e DEV_MODE=true \
  trustee:latest


Deployment (Phala Cloud TEE)

This is where the TEE security guarantees activate. DEV_MODE must be unset or false.

1. Build and package

bashnpm run build
zip -r TrusTEE.zip dist/ src/views/ package.json package-lock.json Dockerfile app-compose.json

2. Deploy to Phala Cloud


Log in at cloud.phala.network
Create new deployment → upload TrusTEE.zip
Set all environment variables in the console:


MANTLE_RPC_URL
ESCROW_CONTRACT_ADDRESS
REPUTATION_REGISTRY_ADDRESS
AGENT_SALT
MIN_REPUTATION
PORT
DAILY_LIMIT
YIELD_THRESHOLD_SOL
YIELD_CHECK_INTERVAL

Do not set DEV_MODE. Leave it unset so the DstackClient TEE path runs.


Deploy. You get a URL like https://trustee-xxxx.phala.cloud.


3. Get agent wallet address

bashcurl https://trustee-xxxx.phala.cloud/wallet

Fund this address with MNT on Mantle Sepolia before it can release any escrows.

4. Verify attestation

The running code is attestable. Check the Phala Cloud dashboard for the attestation report. Users can independently verify the code hash matches what you deployed.


Environment Variables Reference

VariableRequiredDefaultDescriptionMANTLE_RPC_URLYes—Mantle Sepolia RPC endpointESCROW_CONTRACT_ADDRESSYes—Deployed escrow contract addressREPUTATION_REGISTRY_ADDRESSYes—On-chain reputation registry addressAGENT_SALTYes (prod)'tee-escrow/v1'Salt for TEE key derivation. Keep secret.MIN_REPUTATIONNo70Min reputation score to allow payment releasePORTNo3000HTTP portDAILY_LIMITNo100Daily spending cap in MNTYIELD_THRESHOLD_SOLNo0.5Min idle SOL before yield deployment triggersYIELD_CHECK_INTERVALNo3600000Yield loop interval in ms (default: 1 hour)DEV_MODENounsetSet to true to skip TEE SDK and use random wallet


API Endpoints

EndpointMethodAuthDescription/GETNoneDashboard UI/statusGETNoneAgent status, balances, uptime/walletGETNoneAgent wallet address/escrowsGETNoneList all escrows (polls IDs 0–99)/delivery-proofPOSTNoneSubmit delivery proof, release funds/set-limitPOSTNone*Update daily spending limit/spending-statsGETNone7-day spending data for chart/historyGETNoneOn-chain escrow event timeline/attestationGETNoneTEE attestation info/byreal/statusGETNoneSolana wallet, positions, yield mode/byreal/poolsGETNoneList Byreal CLMM pools/byreal/yieldPOSTNone*Enable/disable autonomous yield mode

*No authentication currently. Do not expose these endpoints publicly without adding an API key.

POST /delivery-proof

bashcurl -X POST https://trustee-xxxx.phala.cloud/delivery-proof \
  -H "Content-Type: application/json" \
  -d '{
    "escrowId": 1,
    "signature": "0x...",
    "deliveryHash": "0x..."
  }'

The signature must be produced by the seller's wallet over the message:

Release escrow {id} with delivery {deliveryHash}

POST /set-limit

bashcurl -X POST https://trustee-xxxx.phala.cloud/set-limit \
  -H "Content-Type: application/json" \
  -d '{ "limit": 50 }'

POST /byreal/yield

bashcurl -X POST https://trustee-xxxx.phala.cloud/byreal/yield \
  -H "Content-Type: application/json" \
  -d '{ "enabled": true }'


Byreal Yield Integration

Byreal is installed globally inside the Docker image (npm install -g @byreal-io/byreal-cli). TrusTEE wraps it via subprocess in byrealClient.ts.

How it works:


Every YIELD_CHECK_INTERVAL ms, agent checks idle SOL balance
If balance ≥ YIELD_THRESHOLD_SOL, deploys 80% to a Byreal CLMM pool
Pool is auto-selected (first USDC pool returned by byreal-cli pools list)
Positions are visible on the dashboard under the Byreal section


Note on security: The Solana wallet managed by byreal-cli is stored at ~/.config/byreal/keys/ inside the container. It is not TEE-protected. The Mantle wallet is TEE-protected. These are separate security domains.

Enable yield mode:

bashcurl -X POST /byreal/yield -d '{ "enabled": true }'


AI Agent Skill

Other AI agents (OpenClaw, etc.) can install TrusTEE as a skill:

bashnpx skills add your-github/trustee

After install, natural language commands like these are available to the agent:


"List my escrows"
"Release escrow 5 after delivery confirmation"
"Check Byreal pool APRs"
"Enable yield mode"


Skill manifest is at skills/trustee/SKILL.md.


Project Structure

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


How the TEE Works


Docker image encrypted at rest by Phala Cloud
Decrypted only inside the CPU secure enclave (Intel SGX / AMD SEV)
DstackClient.getKey(salt) derives wallet key inside enclave — never written to disk or network
Remote attestation lets anyone verify the running code matches the deployed image



License

MIT
