// Trezor, with Trezor's own Connect SDK. The person approves everything in
// Trezor's window (Trezor Suite on the web, or the Suite desktop app when it
// is open) and on the device; the key never leaves the Trezor.
//
// In the extension, Trezor's SDK only runs in the background service worker
// (trezorWorker.js, built to trezorBackground.js): this page asks it through
// chrome.runtime messages. The web app calls Trezor Connect for the web directly.
import { ethers } from "ethers";
import { HardwareSigner } from "./hwSigner.js";
import { IS_APP } from "./platform.js";
import { TREZOR_MANIFEST } from "./trezorManifest.js";

export const TREZOR_DEFAULT_PATH = "m/44'/60'/0'/0/0";

const IN_EXTENSION = !IS_APP && typeof chrome !== "undefined" && !!chrome.runtime?.id;

export function trezorSupported() {
  return IN_EXTENSION || typeof window !== "undefined";
}

let web = null;
async function webConnect() {
  if (web) return web;
  const TrezorConnect = (await import("@trezor/connect-web")).default;
  await TrezorConnect.init({ manifest: TREZOR_MANIFEST, lazyLoad: true });
  web = TrezorConnect;
  return web;
}

function errorText(res) {
  const raw = String(res?.payload?.error || res?.payload?.code || res || "");
  console.error("[trezor]", raw);
  if (/cancel|reject|denied|closed|Permissions not granted/i.test(raw)) return "Rejected on the Trezor.";
  if (/not ?found|disconnect|no device|Device not/i.test(raw)) return "Your Trezor wasn't found. Plug it in, unlock it and try again.";
  if (/firmware|update/i.test(raw)) return "Your Trezor's firmware is too old for this. Update it with Trezor Suite.";
  return raw ? `Trezor: ${raw}` : "The Trezor didn't answer.";
}

async function call(method, params, onPrompt) {
  onPrompt?.("Continue in the Trezor window and on your Trezor");
  try {
    const res = IN_EXTENSION
      ? await chrome.runtime.sendMessage({ type: "lyra-trezor", method, params })
      : await (await webConnect())[method](params);
    if (!res?.success) throw new Error(errorText(res));
    return res.payload;
  } finally {
    onPrompt?.(null);
  }
}

export async function trezorAddress(path = TREZOR_DEFAULT_PATH, onPrompt) {
  const out = await call("ethereumGetAddress", { path, showOnTrezor: false }, onPrompt);
  return ethers.getAddress(out.address);
}

const TREZOR_DEVICE = {
  signTransaction: (path, transaction, onPrompt) => call("ethereumSignTransaction", { path, transaction }, onPrompt),
  signMessage: async (path, messageHex, onPrompt) => (await call("ethereumSignMessage", { path, message: messageHex, hex: true }, onPrompt)).signature,
  // the full data for the Model T / Safe series, the two hashes for the Model One
  signTypedData: async (path, data, domainHash, messageHash, onPrompt) =>
    (await call("ethereumSignTypedData", { path, data, metamask_v4_compat: true, domain_separator_hash: domainHash, message_hash: messageHash }, onPrompt)).signature,
};

export class TrezorSigner extends HardwareSigner {
  constructor(address, path = TREZOR_DEFAULT_PATH, provider = null, onPrompt = null) {
    super(address, path, provider, TREZOR_DEVICE, onPrompt);
  }
  connect(provider) { return new TrezorSigner(this.address, this.path, provider, this.onPrompt); }
}
