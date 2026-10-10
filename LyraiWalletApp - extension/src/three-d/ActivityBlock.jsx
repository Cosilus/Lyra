import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

// "Lyra is working": ONE line. While a request runs it shows what Lyra is
// doing right now, with its detail ("Checking your balance… 10.9 USDC
// available") and the elapsed seconds, and changes in place as she moves on.
// Each step stays at least STEP_MS on screen, so fast steps can still be read.
// Nothing stacks. When done it reads "Worked for 4s · 5 steps", and opening it
// shows the recap of every phase with its result.
const STEP_MS = 650;
// `run` = { id, t0, t1 (null while running), steps: [{ label, detail, state }] }
export function ActivityBlock({ run }) {
  const working = run.t1 == null;
  const [open, setOpen] = useState(false); // the recap is only shown on demand
  const [now, setNow] = useState(() => Date.now());
  // which step the head line shows: it catches up with the latest one, one
  // step at a time
  const [shown, setShown] = useState(0);
  const last = run.steps.length - 1;
  useEffect(() => {
    if (!working || shown >= last) return;
    const t = setTimeout(() => setShown(i => Math.min(i + 1, last)), STEP_MS);
    return () => clearTimeout(t);
  }, [working, shown, last]);

  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [working]);

  const secs = Math.max(1, Math.round(((working ? now : run.t1) - run.t0) / 1000));
  const current = run.steps[Math.min(shown, last)];
  const title = working
    ? `${current ? current.label : "Lyra is working"}…`
    : `Worked for ${secs}s · ${run.steps.length} ${run.steps.length === 1 ? "step" : "steps"}`;

  return (
    <div className={`activity${open ? " open" : ""}${working ? " working" : ""}`}>
      <button type="button" className="act-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <svg className="act-spark" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 1.5c.6 4.9 2.6 7.4 7.5 8.1v.8c-4.9.7-6.9 3.2-7.5 8.1-.6-4.9-2.6-7.4-7.5-8.1v-.8c4.9-.7 6.9-3.2 7.5-8.1z" />
        </svg>
        {/* key = the phase text, so a new phase fades in over the old one */}
        <span className="act-title act-phase" key={`${shown}-${title}`}>
          {title}
          {working && current?.detail ? <small className="act-detail">{current.detail}</small> : null}
        </span>
        {working && <span className="act-time">{secs}s</span>}
        <ChevronDown size={14} className="act-chev" />
      </button>
      {open && (
        <ul className="act-steps">
          {run.steps.map((st, i) => (
            <li key={i} className={working && i === run.steps.length - 1 ? "run" : "done"}>
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
