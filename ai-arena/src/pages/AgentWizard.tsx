import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { AVATAR_COLORS, AVATAR_ICONS, buildSystemPrompt, MAX_INSTRUCTIONS, PERSONALITIES, PERSONALITY_DISCLAIMER, SPECIALTIES, strategiesFor, STRATEGIES } from '../../shared/catalog.ts';
import { validateAgentInput } from '../../shared/validate.ts';
import type { AgentDetail } from '../../shared/api.ts';
import type { AgentConfig, AppConfig, AvatarSpec } from '../../shared/types.ts';
import { Avatar, Badge, Button, ErrorBox, ICONS, Notice, PageHeader, Spinner } from '../components/ui.tsx';
import { useToast } from '../components/Toast.tsx';
import { api, useApi } from '../lib/api.ts';

const STEPS = ['Identity', 'Personality', 'Specialty', 'Strategy', 'Model', 'Review'];
const EXAMPLES = ['PlasmaWolf', 'AlphaDegen', 'NeuralMind', 'LogicPrime'];

interface Form { name: string; description: string; avatar: AvatarSpec; config: AgentConfig; note: string }
const blank: Form = {
  name: '', description: '', avatar: { icon: 'bot', color: AVATAR_COLORS[0] }, note: '',
  config: { personality: 'balanced', specialty: 'general', strategy: 'balanced_performance', instructions: '', provider: 'demo' },
};

export default function AgentWizard() {
  const { id } = useParams();
  const editing = !!id;
  const nav = useNavigate();
  const toast = useToast();
  const cfg = useApi<AppConfig>('/api/config');
  const existing = useApi<AgentDetail>(editing ? `/api/agents/${id}` : null);
  const [form, setForm] = useState<Form>(blank);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const a = existing.data;
    if (a) setForm({ name: a.name, description: a.description, avatar: a.avatar, config: a.config, note: '' });
  }, [existing.data]);

  if (cfg.loading || (editing && existing.loading && !existing.data)) return <Spinner />;
  if (cfg.error || !cfg.data) return <ErrorBox message={cfg.error ?? 'Could not load settings.'} onRetry={cfg.reload} />;
  if (editing && existing.error) return <ErrorBox message={existing.error} />;
  const appCfg = cfg.data;

  const setC = (patch: Partial<AgentConfig>) => setForm((f) => ({ ...f, config: { ...f.config, ...patch } }));
  const strategies = strategiesFor(form.config.specialty);

  const check = (s: number): string | null => {
    if (s === 0) { const n = form.name.trim(); if (n.length < 2 || n.length > 24) return 'Give your agent a name of 2 to 24 characters.'; }
    if (s === 3 && !strategies.some((x) => x.id === form.config.strategy)) return 'Choose a strategy.';
    if (s === 4 && form.config.provider === 'anthropic' && !appCfg.providers.find((p) => p.id === 'anthropic')?.available) return 'The live model is not configured on the server.';
    return null;
  };
  const go = (to: number) => {
    if (to > step) { const e = check(step); if (e) return setError(e); }
    setError(null); setStep(to);
  };
  const submit = async () => {
    const v = validateAgentInput(form);
    if (!v.ok) { setError(v.error); return; }
    setSaving(true); setError(null);
    try {
      const saved = editing ? await api('PUT', `/api/agents/${id}`, { ...form }) : await api('POST', '/api/agents', form);
      toast(editing ? 'Agent updated.' : `${saved.name} is ready for the Arena.`);
      nav(`/agents/${saved.id}`);
    } catch (e: any) { setError(e.message); setSaving(false); }
  };

  const personality = PERSONALITIES.find((p) => p.id === form.config.personality)!;
  const specialty = SPECIALTIES.find((p) => p.id === form.config.specialty)!;
  const strategy = STRATEGIES.find((p) => p.id === form.config.strategy);
  const provider = appCfg.providers.find((p) => p.id === form.config.provider)!;

  const Choice = ({ selected, onClick, title, text, disabled }: { selected: boolean; onClick: () => void; title: string; text: string; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={onClick} aria-pressed={selected} className={`rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-accent/40'}`}>
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{title}</span>{selected && <Check size={16} className="text-accent" />}</div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{text}</p>
    </button>
  );

  return (
    <>
      <PageHeader title={editing ? `Improve ${existing.data?.name ?? 'Agent'}` : 'Create an Agent'} subtitle={editing ? 'Changing personality, specialty, strategy, model or instructions creates a new version, so you can compare results version by version.' : 'Six short steps. You can go back at any time.'} />
      <ol className="mb-8 flex gap-1.5 overflow-x-auto pb-1" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="min-w-0 flex-1">
            <button onClick={() => go(i)} className={`w-full border-t-2 pt-2 text-left text-[11px] uppercase tracking-wider transition ${i === step ? 'border-accent text-accent' : i < step ? 'border-accent/40 text-ink' : 'border-line text-muted'}`}><span className="hidden sm:inline">{i + 1}. </span>{s}</button>
          </li>
        ))}
      </ol>

      <div className="grid gap-8 lg:grid-cols-3">
        <section className="card p-5 md:p-7 lg:col-span-2">
          {step === 0 && (
            <div className="space-y-5">
              <div><label className="label" htmlFor="name">Name</label><input id="name" className="input mt-2" value={form.name} maxLength={24} placeholder="PlasmaWolf" onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">Ideas: {EXAMPLES.map((x) => <button key={x} type="button" className="text-accent hover:underline" onClick={() => setForm({ ...form, name: x })}>{x}</button>)}</div></div>
              <div><label className="label" htmlFor="desc">Short description</label><input id="desc" className="input mt-2" value={form.description} maxLength={140} placeholder="Cold-blooded problem solver" onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div><div className="label">Avatar</div>
                <div className="mt-2 flex flex-wrap gap-2">{AVATAR_ICONS.map((ic) => { const I = ICONS[ic]; const on = form.avatar.icon === ic; return (
                  <button key={ic} type="button" aria-label={ic} aria-pressed={on} onClick={() => setForm({ ...form, avatar: { ...form.avatar, icon: ic } })} className={`grid h-11 w-11 place-items-center rounded-lg border transition ${on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-ink'}`}><I size={20} /></button>); })}</div>
                <div className="mt-3 flex gap-2">{AVATAR_COLORS.map((c) => (
                  <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={form.avatar.color === c} onClick={() => setForm({ ...form, avatar: { ...form.avatar, color: c } })} className={`h-7 w-7 rounded-full border-2 ${form.avatar.color === c ? 'border-ink' : 'border-transparent'}`} style={{ background: c }} />))}</div></div>
            </div>
          )}

          {step === 1 && (
            <div>
              <Notice>{PERSONALITY_DISCLAIMER}</Notice>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">{PERSONALITIES.map((p) => <Choice key={p.id} selected={form.config.personality === p.id} onClick={() => setC({ personality: p.id })} title={p.label} text={p.summary} />)}</div>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-3 sm:grid-cols-2">{SPECIALTIES.map((s) => (
              <Choice key={s.id} selected={form.config.specialty === s.id} title={s.label} text={s.summary}
                onClick={() => setC({ specialty: s.id, strategy: strategiesFor(s.id).some((x) => x.id === form.config.strategy) ? form.config.strategy : strategiesFor(s.id)[0].id })} />))}
              <p className="text-xs text-muted sm:col-span-2">Each competition accepts certain specialties only. Brain Battle and Strategy Arena accept Mathematics & Logic, Strategy and General Intelligence. Research Arena accepts Research & Analysis, Crypto & Web3 and General Intelligence.</p></div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <p className="text-xs text-muted">Strategies relevant to <b className="text-ink">{specialty.label}</b>:</p>
              <div className="grid gap-3 sm:grid-cols-2">{strategies.map((s) => <Choice key={s.id} selected={form.config.strategy === s.id} onClick={() => setC({ strategy: s.id })} title={s.label} text={s.summary} />)}</div>
              <div><label className="label" htmlFor="ins">Extra instructions (optional)</label>
                <textarea id="ins" className="input mt-2 min-h-24" maxLength={MAX_INSTRUCTIONS} value={form.config.instructions} placeholder="Example: Always double-check percentage calculations." onChange={(e) => setC({ instructions: e.target.value })} />
                <div className="mt-1 text-right text-[11px] text-muted">{form.config.instructions.length}/{MAX_INSTRUCTIONS}</div></div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              {appCfg.providers.map((p) => <Choice key={p.id} disabled={!p.available} selected={form.config.provider === p.id} onClick={() => setC({ provider: p.id })} title={`${p.label}${p.available ? '' : ' (not configured)'}`} text={`${p.model}. ${p.note}`} />)}
              <Notice>API keys are never entered in the browser. A live model is called by the server, which reads its key from a private <code>.env</code> file.</Notice>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              <div className="flex items-center gap-4"><Avatar avatar={form.avatar} size={56} /><div><div className="text-xl font-semibold">{form.name || 'Unnamed'}</div><div className="text-sm text-muted">{form.description || 'No description'}</div></div></div>
              <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line text-sm sm:grid-cols-2">
                {[['Personality', personality.label], ['Specialty', specialty.label], ['Strategy', strategy?.label ?? '—'], ['Model actually used', provider.model]].map(([k, v]) => <div key={k} className="bg-surface p-3.5"><dt className="label">{k}</dt><dd className="mt-1">{v}</dd></div>)}
              </dl>
              {form.config.provider === 'demo' && <Notice tone="warn">Demo engine: results will be simulated and labelled as such. No AI model is called.</Notice>}
              {editing && <div><label className="label" htmlFor="note">What did you change? (saved in version history)</label><input id="note" className="input mt-2" maxLength={140} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="More careful with percentages" /></div>}
              <details className="rounded-lg border border-line p-4 text-xs text-muted"><summary className="cursor-pointer text-sm text-ink">Instructions this agent will run with</summary><pre className="mt-3 whitespace-pre-wrap leading-relaxed">{buildSystemPrompt(form.name || 'Agent', form.config)}</pre></details>
            </div>
          )}

          {error && <div className="mt-5"><ErrorBox message={error} /></div>}
          <div className="mt-7 flex justify-between gap-3">
            <Button disabled={step === 0} onClick={() => go(step - 1)}><ArrowLeft size={15} />Back</Button>
            {step < STEPS.length - 1 ? <Button variant="primary" onClick={() => go(step + 1)}>Next<ArrowRight size={15} /></Button> : <Button variant="primary" loading={saving} onClick={submit}>{editing ? 'Save new version' : 'Create agent'}</Button>}
          </div>
        </section>

        <aside className="hidden lg:block">
          <div className="card sticky top-6 p-5">
            <div className="label mb-4">Preview</div>
            <div className="flex items-center gap-3"><Avatar avatar={form.avatar} size={44} /><div className="min-w-0"><div className="truncate font-semibold">{form.name || 'Your agent'}</div><div className="text-xs text-muted">{specialty.label}</div></div></div>
            <div className="mt-4 flex flex-wrap gap-1.5"><Badge tone="accent">{personality.label}</Badge>{strategy && <Badge>{strategy.label}</Badge>}<Badge>{provider.id === 'demo' ? 'Demo engine' : provider.model}</Badge></div>
            <p className="mt-4 text-xs leading-relaxed text-muted">{personality.summary}</p>
          </div>
        </aside>
      </div>
    </>
  );
}
