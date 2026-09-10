import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import router from './routes.js';
import { startEventListener } from './agent.js';
import { getAgentAddress } from './teeClient.js';
import * as byreal from './byreal.js';

dotenv.config();

if (!process.env.MANTLE_RPC_URL) {
  console.error('MANTLE_RPC_URL is required');
  process.exit(1);
}
if (!process.env.ESCROW_CONTRACT_ADDRESS) {
  console.error('ESCROW_CONTRACT_ADDRESS is required');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', fileURLToPath(new URL('./views', import.meta.url)));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/', router);
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error.message);
  res.status(500).json({ error: 'Request failed; check server logs' });
});

const server = app.listen(PORT, async () => {
  console.log(`\u{1F310} Dashboard: http://localhost:${PORT}`);
  try {
  const addr = await getAgentAddress();
  console.log(`\u{1F916} Agent wallet: ${addr}`);
  await startEventListener();
  await byreal.startYieldLoop();
  console.log('\u2705 Agent ready');
  } catch (error) { console.error('Agent startup failed:', error); process.exitCode = 1; server.close(); }
});

