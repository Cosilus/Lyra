import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

// "Lyra is working": while a request runs, the head line shows the phase Lyra
// is in right now ("Checking your balance…") with the elapsed seconds, and the
// steps list underneath grows live, each step checked as it ends. A moment
// after the work is done the list folds into "Worked for 4s · 5 steps", and
// opening it shows the recap of every phase with its result.
// `run` = { id, t0, t1 (null while running), steps: [{ label, detail, state }] }
export function ActivityBlock({ run }) {
  const working = run.t1 == null;
  const [open, setOpen] = useState(false); // the recap is only shown on demand
  const [now, setNow] = useState(() => Date.now());
  // the live list stays a moment after the end, so the last steps can be read
  const [lingering, setLingering] = useState(false);
  useEffect(() => {
    if (working) { setLingering(true); return; }
    const t = setTimeout(() => setLingering(false), 1800);
    return () => clearTimeout(t);
  }, [working]);
  const showSteps = open || working || lingering;

  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [working]);

  const secs = Math.max(1, Math.round(((working ? now : run.t1) - run.t0) / 1000));
  const current = run.steps[run.steps.length - 1];
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
        <span className="act-title act-phase" key={title}>{title}</span>
        {working && <span className="act-time">{secs}s</span>}
        <ChevronDown size={14} className="act-chev" />
      </button>
      {showSteps && (
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
