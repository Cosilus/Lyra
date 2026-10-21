import type { Prediction, Round } from '../shared/types.ts';
import { config } from './config.ts';
import { newId, type Store } from './db.ts';
import { HttpError } from './errors.ts';

/**
 * Virtual points only. No money, no deposit, no withdrawal, nothing convertible.
 * The stake is deducted immediately; a win pays stake x (number of entrants when the prediction was placed).
 */
export function placePrediction(store: Store, input: { roundId: unknown; agentId: unknown; stake: unknown }): Prediction {
  const { db } = store;
  const round = db.rounds.find((r) => r.id === input.roundId);
  if (!round) throw new HttpError(404, 'Competition round not found.');
  if (round.status !== 'open') throw new HttpError(409, 'This round is already finished. Predictions are closed.');
  const entrant = round.entrants.find((e) => e.agentId === input.agentId);
  if (!entrant) throw new HttpError(400, 'That agent is not entered in this round.');
  const stake = input.stake;
  if (typeof stake !== 'number' || !Number.isInteger(stake)) throw new HttpError(400, 'Stake must be a whole number of points.');
  if (stake <= 0) throw new HttpError(400, 'Stake must be a positive number of points.');
  if (stake < config.minStake) throw new HttpError(400, `Minimum stake is ${config.minStake} points.`);
  if (stake > db.user.points) throw new HttpError(400, `You only have ${db.user.points} points available.`);
  if (db.predictions.some((p) => p.roundId === round.id)) throw new HttpError(409, 'You already placed a prediction on this round.');

  const agent = store.agent(entrant.agentId)!;
  const prediction: Prediction = {
    id: newId('pred'), roundId: round.id, competitionId: round.competitionId, agentId: agent.id, agentName: agent.name,
    stake, multiplier: round.entrants.length, status: 'pending', payout: 0, createdAt: new Date().toISOString(),
  };
  store.addPoints(-stake, `Prediction on ${agent.name} (round ${round.number})`);
  db.predictions.unshift(prediction);
  store.log(`You staked ${stake} points on ${agent.name}.`, '/predict');
  return prediction;
}

/**
 * Settles every pending prediction of a completed round exactly once.
 * Only predictions with status "pending" are touched, so calling this twice cannot pay twice.
 * Rank-1 ties: a prediction on a tied leader is refunded.
 */
export function settleRound(store: Store, round: Round): void {
  const top = round.results.filter((r) => r.rank === 1).map((r) => r.agentId);
  for (const p of store.db.predictions) {
    if (p.roundId !== round.id || p.status !== 'pending') continue;
    const at = new Date().toISOString();
    if (!top.includes(p.agentId)) {
      p.status = 'lost';
      p.payout = 0;
    } else if (top.length > 1) {
      p.status = 'refunded';
      p.payout = p.stake;
      store.addPoints(p.payout, `Refund: tie for first place (${p.agentName})`);
    } else {
      p.status = 'won';
      p.payout = p.stake * p.multiplier;
      store.addPoints(p.payout, `Prediction won on ${p.agentName} (x${p.multiplier})`);
    }
    p.settledAt = at;
    store.log(
      p.status === 'won' ? `Prediction won: +${p.payout - p.stake} points on ${p.agentName}.` : p.status === 'refunded' ? `Prediction refunded (tie) on ${p.agentName}.` : `Prediction lost: -${p.stake} points on ${p.agentName}.`,
      '/predict',
    );
  }
}
