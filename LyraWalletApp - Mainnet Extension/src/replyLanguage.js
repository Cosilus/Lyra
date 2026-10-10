// Lyra's answers in the language the user chose. Answers written by Lyra's
// server already come in that language; the wallet's own messages (errors,
// "Switched to Base", "I need a bit more information...") are English, so
// they are translated by the server (/api/translate). When the server itself
// can't be reached, the two connection messages come from the table below.

const ENGLISH_WORDS = new Set("the you your is are to of and for with this that it can will would do want how much what which here there please couldn't isn't try again".split(" "));
const NON_LATIN = /[Ѐ-ӿ؀-ۿऀ-ॿ぀-ヿ㐀-鿿가-힯]/;

// true when a text reads as English (worth translating)
export function looksEnglishText(text) {
  const t = String(text || "");
  if (NON_LATIN.test(t)) return false;
  const words = t.toLowerCase().match(/[a-z']+/g) || [];
  if (words.length < 3) return false;
  const hits = words.filter((w) => ENGLISH_WORDS.has(w)).length;
  return hits >= 2 && hits / words.length > 0.1;
}

// the language code to use for "auto": the browser's, when it is one of ours
export function autoLanguage() {
  const code = String((typeof navigator !== "undefined" && navigator.language) || "en").slice(0, 2).toLowerCase();
  return code;
}

// The connection errors, shown when the server can't translate them.
const OFFLINE = {
  fr: ["Le serveur de Lyra ne répond pas. Vérifie ta connexion, puis réessaie.", "La connexion a été perdue avant la fin. Réessaie."],
  es: ["El servidor de Lyra no responde. Comprueba tu conexión e inténtalo de nuevo.", "Se perdió la conexión antes de terminar. Inténtalo de nuevo."],
  pt: ["O servidor da Lyra não está respondendo. Verifique sua conexão e tente novamente.", "A conexão caiu antes de terminar. Tente novamente."],
  de: ["Lyras Server antwortet nicht. Prüfe deine Verbindung und versuche es erneut.", "Die Verbindung brach vor dem Ende ab. Versuche es erneut."],
  it: ["Il server di Lyra non risponde. Controlla la connessione e riprova.", "La connessione si è interrotta prima della fine. Riprova."],
  ru: ["Сервер Lyra не отвечает. Проверьте подключение и попробуйте снова.", "Соединение прервалось. Попробуйте снова."],
  tr: ["Lyra sunucusu yanıt vermiyor. Bağlantını kontrol edip tekrar dene.", "Bağlantı tamamlanmadan koptu. Tekrar dene."],
  zh: ["Lyra 服务器没有响应。请检查网络连接后重试。", "连接在完成前中断了。请重试。"],
  ja: ["Lyraのサーバーが応答していません。接続を確認して、もう一度お試しください。", "完了前に接続が切れました。もう一度お試しください。"],
  ko: ["Lyra 서버가 응답하지 않습니다. 연결을 확인한 후 다시 시도하세요.", "완료되기 전에 연결이 끊어졌습니다. 다시 시도하세요."],
  vi: ["Máy chủ Lyra không phản hồi. Hãy kiểm tra kết nối rồi thử lại.", "Kết nối bị mất trước khi hoàn tất. Hãy thử lại."],
  id: ["Server Lyra tidak merespons. Periksa koneksimu, lalu coba lagi.", "Koneksi terputus sebelum selesai. Coba lagi."],
  ar: ["خادم Lyra لا يستجيب. تحقق من اتصالك ثم حاول مرة أخرى.", "انقطع الاتصال قبل الانتهاء. حاول مرة أخرى."],
  hi: ["Lyra का सर्वर जवाब नहीं दे रहा। अपना कनेक्शन जांचें और फिर से कोशिश करें।", "पूरा होने से पहले कनेक्शन टूट गया। फिर से कोशिश करें।"],
};

// A known connection error in that language, or null.
export function offlineText(text, code) {
  const table = OFFLINE[code];
  if (!table) return null;
  if (/server isn't answering/i.test(text)) return table[0];
  if (/Lost connection before this could finish/i.test(text)) return table[1];
  return null;
}
