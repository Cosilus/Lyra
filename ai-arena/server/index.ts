import { config } from './config.ts';
import { Store } from './db.ts';
import { createApp } from './app.ts';
import { anthropicAvailable } from './providers/anthropic.ts';

const store = new Store(config.dataFile);
createApp(store).listen(config.port, () => {
  console.log(`AI ARENA API on http://localhost:${config.port}`);
  console.log(anthropicAvailable() ? `Live model enabled: ${config.anthropicModel}` : 'No ANTHROPIC_API_KEY: Demo mode (simulated results only).');
});
