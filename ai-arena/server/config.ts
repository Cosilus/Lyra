// Central configuration. Secrets only ever come from environment variables on the server.
try {
  process.loadEnvFile('.env');
} catch {
  /* no .env file: Demo mode */
}

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 3001),
  dataFile: process.env.DATA_FILE ?? 'data/db.json',
  anthropicKey: process.env.ANTHROPIC_API_KEY?.trim() || '',
  anthropicModel: process.env.ANTHROPIC_MODEL?.trim() || 'claude-haiku-5-5',
  modelTimeoutMs: num(process.env.MODEL_TIMEOUT_MS, 30000),
  /** Hard ceiling for a whole round, whatever the number of agents. */
  roundDeadlineMs: num(process.env.ROUND_DEADLINE_MS, 60000),
  startingPoints: 1000,
  minStake: 10,
  /** Probability a *user* demo agent solves a task in the simulator. Identical for every user agent. */
  demoSkill: 0.6,
};
