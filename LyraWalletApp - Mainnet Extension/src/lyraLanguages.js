// The languages Lyra understands, answers in and listens to (voice input).
// The most used languages in crypto. "auto" answers in the language the user
// writes in, and listens in the browser's language.

export const LYRA_LANGUAGES = [
  { code: "auto", short: "Auto", label: "Auto (my language)", speech: null },
  { code: "en", short: "EN", label: "English", speech: "en-US" },
  { code: "zh", short: "中文", label: "中文 (简体)", speech: "zh-CN" },
  { code: "es", short: "ES", label: "Español", speech: "es-ES" },
  { code: "pt", short: "PT", label: "Português (Brasil)", speech: "pt-BR" },
  { code: "fr", short: "FR", label: "Français", speech: "fr-FR" },
  { code: "ru", short: "RU", label: "Русский", speech: "ru-RU" },
  { code: "tr", short: "TR", label: "Türkçe", speech: "tr-TR" },
  { code: "ko", short: "KO", label: "한국어", speech: "ko-KR" },
  { code: "ja", short: "JA", label: "日本語", speech: "ja-JP" },
  { code: "vi", short: "VI", label: "Tiếng Việt", speech: "vi-VN" },
  { code: "id", short: "ID", label: "Bahasa Indonesia", speech: "id-ID" },
  { code: "de", short: "DE", label: "Deutsch", speech: "de-DE" },
  { code: "ar", short: "AR", label: "العربية", speech: "ar-SA" },
  { code: "hi", short: "HI", label: "हिन्दी", speech: "hi-IN" },
];

const KEY = "lyra_language_v1";

export function loadLyraLanguage() {
  try {
    const code = localStorage.getItem(KEY);
    if (LYRA_LANGUAGES.some(l => l.code === code)) return code;
  } catch { /* storage off */ }
  return "auto";
}

export function saveLyraLanguage(code) {
  try { localStorage.setItem(KEY, code); } catch { /* storage off */ }
}

// BCP 47 tag for the speech recognizer.
export function speechLangFor(code) {
  const lang = LYRA_LANGUAGES.find(l => l.code === code);
  return lang?.speech || navigator.language || "en-US";
}
