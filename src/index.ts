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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/', router);

app.listen(PORT, async () => {
  console.log(`\u{1F310} Dashboard: http://localhost:${PORT}`);
  const addr = await getAgentAddress();
  console.log(`\u{1F916} Agent wallet: ${addr}`);
  await startEventListener();
  await byreal.startYieldLoop();
  console.log('\u2705 Agent ready');
});
