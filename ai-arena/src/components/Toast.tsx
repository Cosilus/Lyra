import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AlertTriangle, Check } from 'lucide-react';

type Toast = { id: number; text: string; bad?: boolean };
const Ctx = createContext<(text: string, bad?: boolean) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, bad?: boolean) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, bad }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-20 right-4 z-50 flex flex-col gap-2 md:bottom-6" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex max-w-sm animate-rise items-start gap-2 rounded-lg border border-line bg-raised px-4 py-3 text-sm shadow-xl">
            {t.bad ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" /> : <Check size={16} className="mt-0.5 shrink-0 text-accent" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
