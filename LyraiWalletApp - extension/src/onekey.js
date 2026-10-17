// OneKey over USB (WebUSB), with OneKey's own hardware SDK. Loaded only when
// someone uses a OneKey, so the wallet doesn't carry it otherwise. The key
// never leaves the device: each signature waits for the person to confirm on
// the OneKey (the PIN and the passphrase, if any, are entered on the device).
import { ethers } from "ethers";
import { HardwareSigner } from "./hwSigner.js";

export const ONEKEY_DEFAULT_PATH = "m/44'/60'/0'/0/0";

let sdk = null;      // the SDK (HardwareCommonConnectSdk)
let core = null;     // its constants (UI_EVENT, UI_REQUEST, UI_RESPONSE)
let device = null;   // { connectId, deviceId }
let prompt = null;   // what to tell the person while the device waits

export function onekeySupported() {
  return typeof navigator !== "undefined" && !!navigator.usb;
}

async function load() {
  if (sdk) return;
  const [sdkMod, coreMod] = await Promise.all([
    import("@onekeyfe/hd-common-connect-sdk"),
    import("@onekeyfe/hd-core"),
  ]);
  core = coreMod;
  const s = sdkMod.default;
  await s.init({ env: "webusb", debug: false, fetchConfig: false, lazyLoad: true });
  s.on(core.UI_EVENT, (msg) => {
    const corr = msg?.payload?.responseCorrelation || {};
    if (msg.type === core.UI_REQUEST.REQUEST_PIN) {
      prompt?.("Enter your PIN on the OneKey");
      s.uiResponse({ type: core.UI_RESPONSE.RECEIVE_PIN, payload: "@@ONEKEY_INPUT_PIN_IN_DEVICE", ...corr });
    } else if (msg.type === core.UI_REQUEST.REQUEST_PASSPHRASE) {
      prompt?.("Enter your passphrase on the OneKey");
      s.uiResponse({ type: core.UI_RESPONSE.RECEIVE_PASSPHRASE, payload: { value: "", passphraseOnDevice: true, save: false }, ...corr });
    } else if (msg.type === core.UI_REQUEST.REQUEST_PASSPHRASE_ON_DEVICE) {
      prompt?.("Enter your passphrase on the OneKey");
    } else if (msg.type === core.UI_REQUEST.REQUEST_BUTTON) {
      prompt?.("Review and confirm on your OneKey");
    }
  });
  sdk = s;
}

function errorText(res) {
  const raw = String(res?.payload?.error || res?.payload?.code || res || "");
  console.error("[onekey]", raw);
  if (/cancel|reject|denied|user/i.test(raw)) return "Rejected on the OneKey.";
  if (/pin/i.test(raw)) return "The OneKey's PIN wasn't entered. Unlock it and try again.";
  if (/not ?found|disconnect|no device|unavailable/i.test(raw)) return "Your OneKey was disconnected. Plug it in and try again.";
  if (/firmware|upgrade|update/i.test(raw)) return "Your OneKey's firmware is too old for this. Update it with the OneKey app.";
  return raw ? `OneKey: ${raw}` : "The OneKey didn't answer.";
}

// Must run from a click the first time: the browser asks which USB device to use.
export async function connectOneKey() {
  if (!onekeySupported()) throw new Error("This browser can't reach a OneKey over USB (WebUSB). Use Chrome or Edge.");
  if (device) return device;
  const { ONEKEY_WEBUSB_FILTER } = await import("@onekeyfe/hd-shared");
  const allowed = (await navigator.usb.getDevices()).some(d => ONEKEY_WEBUSB_FILTER.some(f => f.vendorId === d.vendorId && f.productId === d.productId));
  if (!allowed) {
    try { await navigator.usb.requestDevice({ filters: ONEKEY_WEBUSB_FILTER }); }
    catch { throw new Error("No OneKey selected."); }
  }
  await load();
  const found = await sdk.searchDevices();
  if (!found.success || !found.payload?.length) throw new Error("No OneKey found. Plug it in, unlock it and try again.");
  const d = found.payload[0];
  let deviceId = d.deviceId || null;
  if (!deviceId) {
    const f = await sdk.getFeatures(d.connectId);
    deviceId = f.success ? f.payload?.device_id || "" : "";
  }
  device = { connectId: d.connectId, deviceId };
  return device;
}

export function forgetOneKey() { device = null; }

async function call(fn, params, onPrompt) {
  const d = await connectOneKey();
  prompt = onPrompt || null;
  try {
    const res = await sdk[fn](d.connectId, d.deviceId, params);
    if (!res.success) {
      if (/not ?found|disconnect/i.test(String(res.payload?.error))) device = null;
      throw new Error(errorText(res));
    }
    return res.payload;
  } finally {
    onPrompt?.(null);
    prompt = null;
  }
}

export async function onekeyAddress(path = ONEKEY_DEFAULT_PATH, onPrompt) {
  const out = await call("evmGetAddress", { path, showOnOneKey: false }, onPrompt);
  return ethers.getAddress(out.address);
}


// what the OneKey signs, for the shared hardware signer (hwSigner.js)
const ONEKEY_DEVICE = {
  signTransaction: (path, transaction, onPrompt) => call("evmSignTransaction", { path, transaction }, onPrompt),
  signMessage: async (path, messageHex, onPrompt) => (await call("evmSignMessage", { path, messageHex }, onPrompt)).signature,
  signTypedData: async (path, data, domainHash, messageHash, onPrompt) =>
    // the OneKey Classic and Mini sign the hashes
    (await call("evmSignTypedData", { path, data, metamaskV4Compat: true, domainHash, messageHash }, onPrompt)).signature,
};

export class OneKeySigner extends HardwareSigner {
  constructor(address, path = ONEKEY_DEFAULT_PATH, provider = null, onPrompt = null) {
    super(address, path, provider, ONEKEY_DEVICE, onPrompt);
  }
  connect(provider) { return new OneKeySigner(this.address, this.path, provider, this.onPrompt); }
}
