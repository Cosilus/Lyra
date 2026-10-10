import { useEffect, useRef, useState } from "react";
import { IS_CARD } from "./cardBridge.js";

// Voice input for "Ask Lyra": Chrome's speech recognition fills the box while
// the user speaks, then the sentence is sent as if it had been typed. Nothing
// is signed from voice alone: a plan still needs the user's confirmation.
//
// The side panel can't show Chrome's microphone prompt, so the first time the
// microphone is refused there, mic.html opens in a tab to ask for it once for
// the extension.

const Recognition = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export function useVoiceInput({ lang, onText, onDone }) {
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");
  const recRef = useRef(null);
  const textRef = useRef("");
  const cbRef = useRef({ onText, onDone });
  cbRef.current = { onText, onDone };

  useEffect(() => () => recRef.current?.abort(), []);

  function start() {
    if (!Recognition || recRef.current) return;
    const rec = new Recognition();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    textRef.current = "";
    let failed = false;

    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      textRef.current = text;
      cbRef.current.onText(text);
    };
    rec.onerror = (e) => {
      failed = true;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        if (!IS_CARD && typeof chrome !== "undefined" && chrome.tabs?.create) {
          chrome.tabs.create({ url: chrome.runtime.getURL("mic.html") });
          setVoiceNote("Allow the microphone in the tab that opened, then try again");
        } else {
          setVoiceNote("Allow the microphone for this site to talk to Lyra");
        }
      } else if (e.error === "no-speech") {
        setVoiceNote("I didn't hear anything, try again");
      } else if (e.error === "network") {
        setVoiceNote("Voice needs an internet connection");
      } else if (e.error !== "aborted") {
        setVoiceNote("Voice didn't work, you can type instead");
      }
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      const text = textRef.current.trim();
      if (!failed && text) cbRef.current.onDone(text);
    };

    try {
      rec.start();
      recRef.current = rec;
      setVoiceNote("");
      setListening(true);
    } catch {
      setVoiceNote("Voice didn't work, you can type instead");
    }
  }

  function stop() { recRef.current?.stop(); }

  return { supported: !!Recognition, listening, voiceNote, start, stop, toggle: () => (recRef.current ? stop() : start()) };
}
