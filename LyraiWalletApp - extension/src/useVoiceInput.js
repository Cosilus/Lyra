import { useEffect, useRef, useState } from "react";
import { IS_CARD } from "./cardBridge.js";

// Voice input for "Ask Lyra": the browser's speech recognition fills the box
// while the user speaks. Stop leaves the words in the box to check or edit;
// the send button sends them (and stops listening). Never cut off because the
// user paused to think. Nothing is signed from
// voice alone: a plan still needs the user's confirmation.
//
// - Listening goes on across pauses: the browser ends a recognition session
//   after a silence, so a new one starts at once and the words are kept, until
//   the user stops it (or after MAX_MS).
// - `fix` puts back what the wallet knows (tickers, contact names) in what was
//   heard, see voiceFix.js.
// - `levelRef` holds how loud the voice is right now (0 to 1), for the
//   recording animation. With a mouse (computer), it's the real microphone
//   level; on a phone a second microphone stream can make the recognition
//   fail, so there it follows the recognition's own "speech heard" events.
//
// The side panel can't show Chrome's microphone prompt, so the first time the
// microphone is refused there, mic.html opens in a tab to ask for it once for
// the extension.

const Recognition = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const MAX_MS = 120000;
const FINE_POINTER = typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

// One session's words. Some phones repeat every result with the earlier words
// in front ("send", "send 1", "send 1 XPL"): a result that starts with the
// previous one replaces it.
function sessionText(results) {
  const list = [];
  for (let i = 0; i < results.length; i++) {
    const t = results[i][0].transcript.trim();
    if (!t) continue;
    const last = list[list.length - 1];
    if (last && t.toLowerCase().startsWith(last.toLowerCase())) list[list.length - 1] = t;
    else list.push(t);
  }
  return list.join(" ");
}

export function useVoiceInput({ lang, onText, onDone, fix = (t) => t }) {
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const levelRef = useRef(0);
  const run = useRef(null); // the current listening: { rec, kept, session, stopped, send, failed, started, audio }
  const cbRef = useRef({ onText, onDone, fix });
  cbRef.current = { onText, onDone, fix };

  useEffect(() => () => { if (run.current) { run.current.stopped = true; run.current.send = false; run.current.rec?.abort(); stopAudio(run.current); } }, []);

  function textOf(r) {
    return cbRef.current.fix([r.kept, r.session].filter(Boolean).join(" ").trim());
  }

  function stopAudio(r) {
    if (!r?.audio) return;
    cancelAnimationFrame(r.audio.raf);
    r.audio.stream.getTracks().forEach(t => t.stop());
    r.audio.ctx.close().catch(() => {});
    r.audio = null;
  }

  // the real microphone level, on a computer
  async function startAudio(r) {
    if (!FINE_POINTER || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (r.stopped) { stream.getTracks().forEach(t => t.stop()); return; }
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      r.audio = { stream, ctx, raf: 0 };
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
        const rms = Math.sqrt(sum / buf.length);
        levelRef.current = levelRef.current * 0.6 + Math.min(1, rms * 5) * 0.4;
        if (r.audio) r.audio.raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // no level: the animation follows the recognition events instead
    }
  }

  function finish(r) {
    if (run.current !== r) return;
    run.current = null;
    stopAudio(r);
    levelRef.current = 0;
    setListening(false);
    const text = textOf(r);
    if (text) cbRef.current.onText(text);
    if (r.send && !r.failed && text) cbRef.current.onDone(text);
  }

  function session(r) {
    const rec = new Recognition();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    r.rec = rec;
    r.session = "";

    rec.onresult = (e) => {
      r.session = sessionText(e.results);
      if (!r.audio) levelRef.current = Math.min(1, levelRef.current + 0.5); // words arriving: a bump
      cbRef.current.onText(textOf(r));
    };
    rec.onspeechstart = () => { r.speaking = true; };
    rec.onspeechend = () => { r.speaking = false; };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return; // a silence: the next session goes on
      r.failed = true;
      r.stopped = true;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        if (!IS_CARD && typeof chrome !== "undefined" && chrome.tabs?.create) {
          chrome.tabs.create({ url: chrome.runtime.getURL("mic.html") });
          setVoiceNote("Allow the microphone in the tab that opened, then try again");
        } else {
          setVoiceNote("Allow the microphone for this site to talk to Lyra");
        }
      } else if (e.error === "network") {
        setVoiceNote("Voice needs an internet connection");
      } else if (e.error === "audio-capture") {
        setVoiceNote("No microphone found");
      } else {
        setVoiceNote("Voice didn't work, you can type instead");
      }
    };
    rec.onend = () => {
      r.kept = [r.kept, r.session].filter(Boolean).join(" ").trim();
      r.session = "";
      // the browser ended it after a silence: listen again, the words stay
      if (!r.stopped && Date.now() - r.started < MAX_MS) {
        try { session(r); return; } catch { /* can't restart: stop here */ }
      }
      finish(r);
    };
    rec.start();
  }

  function start() {
    if (!Recognition || run.current) return;
    const r = { kept: "", session: "", stopped: false, send: true, failed: false, started: Date.now(), speaking: false, audio: null };
    run.current = r;
    try {
      session(r);
      setVoiceNote("");
      setStartedAt(r.started);
      setListening(true);
      startAudio(r);
      // on a phone: the bars breathe while speech is heard, and settle in silences
      if (!FINE_POINTER) {
        const decay = () => {
          if (run.current !== r) return;
          const target = r.speaking ? 0.35 + Math.random() * 0.45 : 0.04;
          levelRef.current = levelRef.current * 0.82 + target * 0.18;
          requestAnimationFrame(decay);
        };
        requestAnimationFrame(decay);
      }
    } catch {
      run.current = null;
      setVoiceNote("Voice didn't work, you can type instead");
    }
  }

  // stop listening; `send` false keeps the words in the box without sending them
  function stop(send = true) {
    const r = run.current;
    if (!r) return;
    r.stopped = true;
    r.send = send;
    try { r.rec?.stop(); } catch { finish(r); }
  }

  return {
    supported: !!Recognition,
    listening,
    voiceNote,
    startedAt,
    levelRef,
    start,
    stop,
    toggle: () => (run.current ? stop(false) : start()),
  };
}
