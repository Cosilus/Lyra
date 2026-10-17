// Runs in the extension's background service worker (bundled to
// dist/trezorBackground.js and loaded by public/background.js): Trezor's
// Connect SDK for MV3 extensions only works there. The wallet page asks it
// through chrome.runtime messages (src/trezor.js). Only the four Ethereum
// calls the wallet needs are answered, and only for this extension's pages.
import TrezorConnect from "@trezor/connect-webextension";
import { TREZOR_MANIFEST } from "./trezorManifest.js";

const ALLOWED = new Set(["ethereumGetAddress", "ethereumSignTransaction", "ethereumSignMessage", "ethereumSignTypedData"]);
let ready = null;
const init = () => (ready ||= TrezorConnect.init({ manifest: TREZOR_MANIFEST, lazyLoad: true }).catch((e) => { ready = null; throw e; }));

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "lyra-trezor") return undefined;
  if (sender.id !== chrome.runtime.id || !ALLOWED.has(msg.method)) {
    sendResponse({ success: false, payload: { error: "Not allowed." } });
    return undefined;
  }
  (async () => {
    try {
      await init();
      sendResponse(await TrezorConnect[msg.method](msg.params || {}));
    } catch (e) {
      sendResponse({ success: false, payload: { error: e?.message || String(e) } });
    }
  })();
  return true; // the answer comes later
});
