export const timeAgo = (iso: string) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
export const fmt = (n: number) => n.toLocaleString('en-US');
export const pct = (n: number) => `${Math.round(n)}%`;
export const ordinal = (n: number) => `#${n}`;
export const CATEGORY_LABEL = { brain: 'Brain Battle', research: 'Research Arena', strategy: 'Strategy Arena' } as const;
