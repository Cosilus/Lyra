// The welcome screen shows what can be asked before anything is set up: three
// example sentences, as under Ask Lyra and with the same entrance, replaced by
// three others every 5 seconds. Only examples; nothing here is clickable.
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { StepIcon } from "./PlanCard.jsx";

const EXAMPLES = [
  { kind: "send", text: "Send 20 USDC to Papa" },
  { kind: "swap", text: "Swap 0.1 ETH to USDC" },
  { kind: "bridge", text: "Bridge 50 USDC to Base" },
  { kind: "stake", text: "Stake 100 USDC to earn yield" },
  { kind: "receive", text: "Top up $50 of USDC" },
  { kind: "multi", text: "Swap half my ETH, then send it to Marie" },
  { kind: "wallet", text: "Show my balance on every network" },
  { kind: "bridge", text: "I want 100 USDC on Ethereum, take my ETH" },
  { kind: "pay", text: "Pay a few cents for a news summary with x402" },
];
const PER_SET = 3;
const EVERY_MS = 5000;
const EASE = [0.22, 1, 0.36, 1];

export function WelcomeDemo() {
  const [set, setSet] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setSet(n => n + 1), EVERY_MS);
    return () => clearInterval(t);
  }, []);
  const start = (set * PER_SET) % EXAMPLES.length;
  const list = Array.from({ length: PER_SET }, (_, i) => EXAMPLES[(start + i) % EXAMPLES.length]);

  return (
    <div className="wd" aria-label="Examples of what you can ask Lyra">
      <div className="ask-try-title">You can ask things like :</div>
      <AnimatePresence mode="wait">
        <motion.div key={set} className="wd-list" exit={{ opacity: 0, x: 18 }} transition={{ duration: 0.3, ease: EASE }}>
          {list.map((s, i) => (
            <motion.div
              key={s.text}
              className="ask-try-item wd-item"
              initial={{ x: -28, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.08 + i * 0.12, ease: EASE }}
            >
              <span className="ask-try-icon"><StepIcon kind={s.kind} size={14} /></span>
              {s.text}
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
