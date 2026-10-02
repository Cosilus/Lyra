import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

// "Lyra is working…": the real steps of one request, added one by one
// while it runs, then folded into "Worked for 4s · 5 steps".
// `run` = { id, t0, t1 (null while running), steps: [{ label, detail, state: "run" | "done" }] }
export function ActivityBlock({ run }) {
  const working = run.t1 == null;
  const [manual, setManual] = useState(null); // null = follow the run (open while working)
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [working]);

  const open = manual ?? working;
  const secs = Math.max(1, Math.round(((working ? now : run.t1) - run.t0) / 1000));
  const title = working
    ? "Lyra is working…"
    : `Worked for ${secs}s · ${run.steps.length} ${run.steps.length === 1 ? "step" : "steps"}`;

  return (
    <div className={`activity${open ? " open" : ""}${working ? " working" : ""}`}>
      <button type="button" className="act-head" onClick={() => setManual(!open)} aria-expanded={open}>
        <svg className="act-spark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 1.5c.6 4.9 2.6 7.4 7.5 8.1v.8c-4.9.7-6.9 3.2-7.5 8.1-.6-4.9-2.6-7.4-7.5-8.1v-.8c4.9-.7 6.9-3.2 7.5-8.1z" />
        </svg>
        <span className="act-title">{title}</span>
        {working && <span className="act-time">{secs}s</span>}
        <ChevronDown size={14} className="act-chev" />
      </button>
      {open && (
        <ul className="act-steps">
          {run.steps.map((st, i) => (
            <li key={i} className={st.state}>
              <span className="act-ic" aria-hidden="true" />
              <span>{st.label}</span>
              {st.detail ? <small>{st.detail}</small> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
