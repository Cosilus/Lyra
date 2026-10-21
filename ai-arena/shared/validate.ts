import { MAX_INSTRUCTIONS, strategiesFor } from './catalog.ts';
import type { AgentConfig, AvatarSpec, PersonalityId, ProviderId, SpecialtyId, StrategyId } from './types.ts';
import { AVATAR_COLORS, AVATAR_ICONS, PERSONALITIES, SPECIALTIES } from './catalog.ts';

export interface AgentInput {
  name: string;
  description: string;
  avatar: AvatarSpec;
  config: AgentConfig;
}

/** Validates untrusted agent input (used by the server; the form in the browser uses it too). */
export function validateAgentInput(body: any): { ok: true; value: AgentInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Missing agent data.' };
  const name = String(body.name ?? '').trim();
  if (name.length < 2 || name.length > 24) return { ok: false, error: 'Name must be between 2 and 24 characters.' };
  if (!/^[\p{L}\p{N} _.-]+$/u.test(name)) return { ok: false, error: 'Name may only contain letters, numbers, spaces, "-", "_" and ".".' };
  const description = String(body.description ?? '').trim();
  if (description.length > 140) return { ok: false, error: 'Description must be 140 characters or fewer.' };
  const c = body.config ?? {};
  const personality = c.personality as PersonalityId;
  const specialty = c.specialty as SpecialtyId;
  const strategy = c.strategy as StrategyId;
  const provider = c.provider as ProviderId;
  const instructions = String(c.instructions ?? '').trim();
  if (!PERSONALITIES.some((p) => p.id === personality)) return { ok: false, error: 'Choose a personality.' };
  if (!SPECIALTIES.some((s) => s.id === specialty)) return { ok: false, error: 'Choose a specialty.' };
  if (!strategiesFor(specialty).some((s) => s.id === strategy)) return { ok: false, error: 'This strategy does not fit the selected specialty.' };
  if (provider !== 'demo' && provider !== 'anthropic') return { ok: false, error: 'Choose a model.' };
  if (instructions.length > MAX_INSTRUCTIONS) return { ok: false, error: `Instructions must be ${MAX_INSTRUCTIONS} characters or fewer.` };
  const av = body.avatar ?? {};
  const avatar: AvatarSpec = {
    icon: AVATAR_ICONS.includes(av.icon) ? av.icon : AVATAR_ICONS[0],
    color: AVATAR_COLORS.includes(av.color) ? av.color : AVATAR_COLORS[0],
  };
  return { ok: true, value: { name, description, avatar, config: { personality, specialty, strategy, provider, instructions } } };
}
