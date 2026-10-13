import { useEffect, useMemo, useRef, useState } from "react";
import { MousePointer2, Mic, Globe, Check, Square } from "lucide-react";
import { motion } from "framer-motion";
import { drawIdeas } from "./askLyraIdeas.js";
import { LYRA_LANGUAGES, speechLangFor } from "./lyraLanguages.js";
import { useVoiceInput } from "./useVoiceInput.js";
import { LyraStar, StepIcon, withTokenLogos } from "./PlanCard.jsx";
import { parseAskLyra } from "./askLyraParse.js";
import { fixTranscript } from "./voiceFix.js";
import "./ask-lyra.css";

// "Ask Lyra": the message box, right under the balance. While the user types,
// the steps the sentence describes appear underneath, one box per step, so the
// plan is visible before anything is sent. Sending goes through the same
// handleIntent as before.

// an address (whole, or still being typed) shown short, like everywhere else
const shortHex = (t) => (typeof t === "string" && /^0x[0-9a-fA-F]{12,}$/.test(t) ? `${t.slice(0, 6)}…${t.slice(-4)}` : t);

const STEP_LABELS = { swap: "Swap", send: "Send", stake: "Stake", unstake: "Withdraw", bridge: "Bridge" };

// While Lyra listens: bars that move with the voice (newest on the right,
// like a recorder) and how long it has been listening. Drawn straight to the
// DOM each frame from the hook's level, without re-rendering React.
const WAVE_BARS = 32;
function VoiceWave({ levelRef, startedAt }) {
  const barsRef = useRef(null);
  const timeRef = useRef(null);
  useEffect(() => {
    const heights = new Array(WAVE_BARS).fill(0.06);
    let raf = 0, last = 0;
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 70) return; // a new bar about 14 times a second
      last = now;
      heights.shift();
      heights.push(Math.max(0.06, Math.min(1, levelRef.current * (0.75 + Math.random() * 0.5))));
      const bars = barsRef.current?.children;
      if (bars) for (let i = 0; i < bars.length; i++) bars[i].style.transform = `scaleY(${heights[i]})`;
      if (timeRef.current) {
        const sec = Math.floor((Date.now() - startedAt) / 1000);
        timeRef.current.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [levelRef, startedAt]);
  return (
    <div className="ask-wave" aria-hidden="true">
      <span className="ask-wave-dot" />
      <span className="ask-wave-time" ref={timeRef}>0:00</span>
      <span className="ask-wave-bars" ref={barsRef}>
        {Array.from({ length: WAVE_BARS }, (_, i) => <i key={i} />)}
      </span>
    </div>
  );
}

function StepPreview({ step, index, previous, via }) {
  const label = STEP_LABELS[step.kind] || "Send";
  const chained = index > 0;
  const subtitle =
    step.amount === "the rest" ? "The rest of your " + (step.asset || previous?.asset || "funds")
    : chained && previous?.kind === "swap" && !step.asset ? "From the swap"
    : null;

  const QUANT = { half: "Half your", all: "All your", max: "All your", quarter: "A quarter of your", third: "A third of your" };
  const amountText =
    step.amount === "the rest" ? "The rest"
    : QUANT[step.amount] ? `${QUANT[step.amount]} ${step.asset || "funds"}`
    : step.amount ? [step.amount, step.asset].filter(Boolean).join(" ")
    : step.asset || null;
  const target =
    step.kind === "swap" ? step.toAsset
    : step.kind === "send" ? shortHex(step.recipient)
    : step.kind === "bridge" ? step.network
    : step.kind === "stake" ? "Staking"
    : step.kind === "unstake" ? "Wallet"
    : null;

  return (
    <div className="ask-step" style={{ "--i": index }}>
      <span className="ask-step-icon"><StepIcon kind={step.kind} /></span>
      <div className="ask-step-body">
        <div className="ask-step-label">
          {chained && <span className="ask-step-chain">↳</span>}
          {label}
          {via && <span className="step-via"> · {via}</span>}
          {subtitle && <span className="ask-step-sub"> · {subtitle}</span>}
        </div>
        <div className="ask-step-line">
          {amountText ? <span className="ask-step-value">{withTokenLogos(amountText)}</span> : <span className="ask-skel" />}
          <span className="ask-step-arrow">→</span>
          {target ? (
            <span className="ask-step-value">{withTokenLogos(target)}</span>
          ) : <span className="ask-skel ask-skel--short" />}
        </div>
      </div>
    </div>
  );
}

export function AskLyra({ value, onChange, onSubmit, busy = false, tokenSymbols, contacts, networks, suggestions = [], protocolLabel, language = "auto", onLanguageChange }) {
  const [focused, setFocused] = useState(false);
  // three ideas from the deck, drawn again each time the box gets focus
  const [ideas, setIdeas] = useState({ id: 0, list: [] });
  const inputRef = useRef(null);
  const blurTimer = useRef(null);
  const [langOpen, setLangOpen] = useState(false);
  const currentLang = LYRA_LANGUAGES.find(l => l.code === language) || LYRA_LANGUAGES[0];
  // talk instead of typing: the words fill the box live, then are sent
  // the text in the box came from the microphone (then maybe edited a little)
  const spokenRef = useRef(false);
  // what was heard is matched to the wallet as it is now: this network's
  // tickers ("XL" -> XPL) and the saved contacts ("Bryan" -> Brian)
  const voice = useVoiceInput({
    lang: speechLangFor(language),
    onText: text => { spokenRef.current = true; onChange(text); },
    onDone: text => { if (!busy) { spokenRef.current = false; onSubmit(text, { voice: true }); } },
    fix: text => fixTranscript(text, { symbols: tokenSymbols || [], contacts: contacts || [] }),
  });

  const { steps } = useMemo(
    () => parseAskLyra(value, { tokenSymbols, contacts, networks }),
    [value, tokenSymbols, contacts, networks]
  );

  function submit() {
    // while listening, send = stop and send what was said
    if (voice.listening) { voice.stop(true); return; }
    const text = value.trim();
    if (!text || busy) return;
    inputRef.current?.blur();
    onSubmit(text, { voice: spokenRef.current });
    spokenRef.current = false;
  }

  function pick(text) {
    onChange(text);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) { el.focus(); el.setSelectionRange(text.length, text.length); }
    });
  }

  const showTry = focused && !value.trim() && ideas.list.length > 0;
  const showSteps = value.trim() && steps.length > 0;

  return (
    <div className={`ask-lyra${focused ? " is-focused" : ""}${busy ? " is-busy" : ""}${voice.listening ? " is-listening" : ""}`}>
      {/* thin pearl line between the balance above and Lyra below */}
      <div className="ask-divider" aria-hidden="true" />

      <div className="ask-box">
        <div className="ask-field">
          {!value && !voice.listening && (
            <div className="ask-placeholder" aria-hidden="true">
              <LyraStar />
              <span>Ask Lyra</span>
            </div>
          )}
        <textarea
          ref={inputRef}
          className="ask-input"
          rows={2}
          value={value}
          aria-label="Ask Lyra"
          onChange={e => { if (!e.target.value) spokenRef.current = false; onChange(e.target.value); }}
          onFocus={() => {
            clearTimeout(blurTimer.current);
            setIdeas(d => ({ id: d.id + 1, list: drawIdeas(suggestions, 3) }));
            setFocused(true);
          }}
          onBlur={() => { blurTimer.current = setTimeout(() => setFocused(false), 150); }}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
        />
        </div>
        <div className="ask-foot">
          {/* the language Lyra answers in and listens to */}
          {voice.listening ? <VoiceWave levelRef={voice.levelRef} startedAt={voice.startedAt} /> : (
          <div className="ask-lang">
            <button
              type="button"
              className="ask-lang-chip"
              onMouseDown={e => e.preventDefault()}
              onClick={() => setLangOpen(o => !o)}
              aria-haspopup="listbox"
              aria-expanded={langOpen}
              aria-label={`Lyra's language: ${currentLang.label}`}
              title="Lyra's language"
            >
              <Globe size={13} strokeWidth={1.9} />
              <span>{currentLang.short}</span>
            </button>
            {langOpen && (
              <>
                <div className="ask-lang-backdrop" onClick={() => setLangOpen(false)} />
                <motion.ul
                  className="ask-lang-menu"
                  role="listbox"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  {LYRA_LANGUAGES.map(l => (
                    <li key={l.code}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={l.code === language}
                        className={l.code === language ? "is-on" : ""}
                        onClick={() => { onLanguageChange?.(l.code); setLangOpen(false); }}
                      >
                        <span>{l.label}</span>
                        {l.code === language && <Check size={13} strokeWidth={2.4} />}
                      </button>
                    </li>
                  ))}
                </motion.ul>
              </>
            )}
          </div>
          )}
          {!voice.listening && <span className="ask-hint">{voice.voiceNote}</span>}
          {voice.supported && (
            <button
              type="button"
              className={`ask-mic${voice.listening ? " is-on" : ""}`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => (voice.listening ? voice.stop(false) : voice.start())}
              disabled={busy}
              aria-pressed={voice.listening}
              aria-label={voice.listening ? "Stop listening" : "Talk to Lyra"}
              data-tip={voice.listening ? "Stop listening" : "Talk to Lyra"}
            >
              {voice.listening ? <Square size={13} fill="currentColor" strokeWidth={0} /> : <Mic size={16} strokeWidth={2} />}
            </button>
          )}
          {/* the same pearl send button as the old message bar */}
          <button
            type="button"
            className="send ask-send"
            onClick={submit}
            disabled={(!value.trim() && !voice.listening) || busy}
            aria-label="Send to Lyra"
            title="Send to Lyra"
          >
            <MousePointer2 size={15} fill="currentColor" strokeWidth={0} style={{ transform: "rotate(135deg)" }} />
          </button>
        </div>
      </div>

      {showTry && (
        <div className="ask-try" key={ideas.id}>
          <div className="ask-try-title">You can try something like this :</div>
          {ideas.list.map((s, i) => (
            <motion.button
              key={s.text}
              type="button"
              className="ask-try-item"
              initial={{ x: -28, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.08 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(s.text)}
            >
              <span className="ask-try-icon"><StepIcon kind={s.kind} size={14} /></span>
              {s.text}
            </motion.button>
          ))}
        </div>
      )}

      {showSteps && (
        <div className="ask-steps">
          <div className="ask-section-title">
            <LyraStar className="is-moving ask-star" />
            {steps.length > 1 ? `Understanding… ${steps.length} steps` : "Understanding…"}
          </div>
          {steps.map((s, i) => <StepPreview key={i} step={s} index={i} previous={steps[i - 1]} via={protocolLabel?.(s.kind, { asset: s.asset || steps[i - 1]?.toAsset || steps[i - 1]?.asset, network: s.network })} />)}
        </div>
      )}
    </div>
  );
}
