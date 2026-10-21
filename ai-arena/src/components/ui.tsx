import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Atom, Bot, Brain, Compass, Cpu, Crown, Eye, Flame, FlaskConical, Info, Loader2, Rocket, Shield, Sparkles, Zap, AlertTriangle, type LucideIcon } from 'lucide-react';
import type { AvatarSpec } from '../../shared/types.ts';

export const ICONS: Record<string, LucideIcon> = { bot: Bot, cpu: Cpu, brain: Brain, zap: Zap, flame: Flame, shield: Shield, compass: Compass, atom: Atom, crown: Crown, rocket: Rocket, eye: Eye, sparkles: Sparkles };

export function Avatar({ avatar, size = 40 }: { avatar: AvatarSpec; size?: number }) {
  const Icon = ICONS[avatar.icon] ?? Bot;
  return (
    <div className="grid shrink-0 place-items-center rounded-xl border" style={{ width: size, height: size, color: avatar.color, borderColor: `${avatar.color}40`, background: `${avatar.color}14` }}>
      <Icon size={size * 0.5} />
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger'; to?: string; loading?: boolean; small?: boolean };
export function Button({ variant = 'ghost', to, loading, small, className = '', children, disabled, ...rest }: BtnProps) {
  const base = `inline-flex items-center justify-center gap-2 rounded-lg font-medium transition duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${small ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'}`;
  const look = {
    primary: 'bg-accent text-bg hover:brightness-110',
    ghost: 'border border-line bg-surface text-ink hover:border-accent/50 hover:bg-raised',
    danger: 'border border-bad/40 text-bad hover:bg-bad/10',
  }[variant];
  const inner = <>{loading && <Loader2 size={15} className="animate-spin" />}{children}</>;
  if (to && !disabled) return <Link to={to} className={`${base} ${look} ${className}`}>{inner}</Link>;
  return <button className={`${base} ${look} ${className}`} disabled={disabled || loading} {...rest}>{inner}</button>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warn' | 'bad' }) {
  const t = { neutral: 'border-line text-muted', accent: 'border-accent/30 bg-accent-soft text-accent', warn: 'border-warn/30 bg-warn/10 text-warn', bad: 'border-bad/30 bg-bad/10 text-bad' }[tone];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${t}`}>{children}</span>;
}

export const EngineBadge = ({ kind }: { kind: 'simulated' | 'live' | 'mixed' }) =>
  kind === 'live' ? <Badge tone="accent">Live model</Badge> : <Badge tone="warn"><FlaskConical size={11} />{kind === 'mixed' ? 'Mixed' : 'Simulated'}</Badge>;

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-4 md:p-5">
      <div className="label">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums md:text-3xl">{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}

export const Spinner = ({ label = 'Loading…' }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted"><Loader2 size={18} className="animate-spin text-accent" />{label}</div>
);

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-wrap items-center gap-3 border-bad/30 p-4 text-sm" role="alert">
      <AlertTriangle size={18} className="text-bad" /><span className="flex-1">{message}</span>
      {onRetry && <Button small onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <div className="text-base font-medium">{title}</div>
      <p className="mt-1.5 max-w-md text-sm text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <div className={`flex gap-2.5 rounded-lg border px-3.5 py-3 text-xs leading-relaxed ${tone === 'warn' ? 'border-warn/30 bg-warn/5 text-warn' : 'border-line bg-surface text-muted'}`}>
      <Info size={15} className="mt-0.5 shrink-0" /><div>{children}</div>
    </div>
  );
}

export function Bar({ value, max, tone = 'accent' }: { value: number; max: number; tone?: 'accent' | 'warn' | 'bad' }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const c = { accent: 'bg-accent', warn: 'bg-warn', bad: 'bg-bad' }[tone];
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${c} transition-all duration-500`} style={{ width: `${w}%` }} /></div>;
}

/** Minimal dependency-free line chart of values (0..max) over time. */
export function LineChart({ points, max = 100 }: { points: { label: string; value: number }[]; max?: number }) {
  if (points.length === 0) return null;
  const W = 600, H = 160, P = 24;
  const x = (i: number) => (points.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (points.length - 1));
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Score over time">
      {[0, 50, 100].map((g) => (
        <g key={g}><line x1={P} x2={W - P} y1={y((g / 100) * max)} y2={y((g / 100) * max)} stroke="#23272d" strokeDasharray="3 4" />
          <text x={4} y={y((g / 100) * max) + 3} fontSize="9" fill="#8a9099">{g}</text></g>
      ))}
      {points.length > 1 && <path d={d} fill="none" stroke="#3df5a0" strokeWidth="2" strokeLinejoin="round" />}
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r="4" fill="#0a0b0d" stroke="#3df5a0" strokeWidth="2"><title>{`${p.label}: ${p.value}`}</title></circle>
      ))}
    </svg>
  );
}

export function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="card w-full max-w-md animate-rise p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-3 text-sm text-muted">{children}</div>
      </div>
    </div>
  );
}
