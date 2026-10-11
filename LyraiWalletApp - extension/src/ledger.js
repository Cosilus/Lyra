// Ledger over USB (WebHID), with Ledger's Device Management Kit. Loaded only
// when someone actually uses a Ledger, so the wallet doesn't carry it otherwise.
// Everything here waits for the person on the device: each call resolves once
// they approved on the Ledger, or rejects with a readable message.

let kit = null;       // { dmk, DeviceActionStatus, SignerEthBuilder }
let session = null;   // { sessionId, signer }

export const LEDGER_DEFAULT_PATH = "44'/60'/0'/0/0";

async function loadKit() {
  if (kit) return kit;
  const [dmkMod, hidMod, ethMod] = await Promise.all([
    import("@ledgerhq/device-management-kit"),
    import("@ledgerhq/device-transport-kit-web-hid"),
    import("@ledgerhq/device-signer-kit-ethereum"),
  ]);
  const dmk = new dmkMod.DeviceManagementKitBuilder().addTransport(hidMod.webHidTransportFactory).build();
  kit = { dmk, DeviceActionStatus: dmkMod.DeviceActionStatus, SignerEthBuilder: ethMod.SignerEthBuilder };
  return kit;
}

export function ledgerSupported() {
  return typeof navigator !== "undefined" && !!navigator.hid;
}

// Must run from a click: the browser asks which USB device to use.
export async function connectLedger() {
  if (!ledgerSupported()) throw new Error("This browser can't reach a Ledger over USB (WebHID). Use Chrome or Edge.");
  if (session) return session;
  const { dmk, SignerEthBuilder } = await loadKit();
  const device = await new Promise((resolve, reject) => {
    const sub = dmk.startDiscovering({}).subscribe({
      next: (d) => { sub.unsubscribe(); resolve(d); },
      error: (e) => reject(e),
    });
    setTimeout(() => { sub.unsubscribe(); reject(new Error("No Ledger selected.")); }, 60000);
  });
  const sessionId = await dmk.connect({ device });
  // No clear-signing lookups at Ledger's servers (they need a Ledger-issued
  // token and failed with "Unexpected device exchange error"): the device
  // signs blind, and Lyra's own simulation shows what the plan does.
  const silentContext = {
    getContexts: async () => [],
    getFieldContext: async () => ({ type: "error", error: new Error("no context") }),
    getTypedDataFilters: async () => ({ type: "error", error: new Error("no context") }),
    report: async () => {},
  };
  session = { sessionId, signer: new SignerEthBuilder({ dmk, sessionId }).withContextModule(silentContext).build() };
  return session;
}

export async function disconnectLedger() {
  if (!session || !kit) return;
  try { await kit.dmk.disconnect({ sessionId: session.sessionId }); } catch { /* already gone */ }
  session = null;
}

const INTERACTION_TEXT = {
  "unlock-device": "Unlock your Ledger",
  "confirm-open-app": "Open the Ethereum app on your Ledger",
  "sign-transaction": "Review and approve on your Ledger",
  "sign-delegation-authorization": "Approve the smart account upgrade (Simple7702Account) on your Ledger",
  "verify-address": "Check the address on your Ledger",
  "web3-checks-opt-in": "Answer the question on your Ledger",
};

// A device action as a promise; onPrompt(text) says what the Ledger is waiting for.
function run(action, onPrompt, stage = "") {
  const { DeviceActionStatus } = kit;
  return new Promise((resolve, reject) => {
    const sub = action.observable.subscribe({
      next: (state) => {
        if (state.status === DeviceActionStatus.Pending) {
          const need = state.intermediateValue?.requiredUserInteraction;
          if (need && need !== "none") onPrompt?.(INTERACTION_TEXT[need] || "Continue on your Ledger");
        } else if (state.status === DeviceActionStatus.Completed) {
          sub.unsubscribe();
          onPrompt?.(null);
          resolve(state.output);
        } else if (state.status === DeviceActionStatus.Error) {
          sub.unsubscribe();
          onPrompt?.(null);
          reject(new Error((stage ? stage + ": " : "") + ledgerErrorText(state.error)));
        } else if (state.status === DeviceActionStatus.Stopped) {
          sub.unsubscribe();
          onPrompt?.(null);
          reject(new Error("Cancelled on the Ledger."));
        }
      },
      error: (e) => { onPrompt?.(null); reject(new Error(ledgerErrorText(e))); },
    });
  });
}

// Everything the kit says about an error, unwrapped (its own message is often generic)
function errorDetail(e, depth = 0) {
  if (!e || depth > 4) return "";
  const own = [e._tag, e.errorCode, e.statusCode, e.message].filter(Boolean).map(String).join(" ");
  return [own, errorDetail(e.originalError || e.cause, depth + 1)].filter(Boolean).join(" | ");
}

function ledgerErrorText(e) {
  console.error("[ledger]", e);
  const raw = errorDetail(e) || String(e || "");
  if (/6985|denied|reject|refus/i.test(raw)) return "Rejected on the Ledger.";
  if (/locked|5515/i.test(raw)) return "Your Ledger is locked. Unlock it and try again.";
  if (/6a80|blind|data/i.test(raw)) return "Your Ledger refused the data. In the Ethereum app on the Ledger: Settings → turn on Blind signing.";
  // the app answers this when "Smart accounts" is off or the delegate isn't on its whitelist
  if (/6986|6980|not allowed|7702|delegation|6a84/i.test(raw)) return "Your Ledger refused the smart account upgrade. In the Ethereum app on the Ledger: Settings → turn on \"Smart accounts\" (\"Smart account upgrade\" on Stax and Flex), then try again.";
  if (/disconnect|not found|no device/i.test(raw)) return "Your Ledger was disconnected. Plug it in and try again.";
  if (/6d00|6e00|ins not supported|cla not supported/i.test(raw)) return "Your Ledger's Ethereum app is too old for this. Update it in Ledger Live (My Ledger).";
  return raw ? `Ledger: ${raw}` : "The Ledger didn't answer.";
}

export async function ledgerAddress(path = LEDGER_DEFAULT_PATH, onPrompt) {
  const { signer } = await connectLedger();
  const out = await run(signer.getAddress(path, { checkOnDevice: false }), onPrompt);
  return out.address;
}

// EIP-7702 authorization for `contract` (the batch executor), signed on the device
export async function ledgerSignDelegation({ path = LEDGER_DEFAULT_PATH, chainId, contract, nonce }, onPrompt) {
  const { signer } = await connectLedger();
  return run(signer.signDelegationAuthorization(path, Number(chainId), contract, Number(nonce)), onPrompt, "One-time setup (delegation)");
}

// A full transaction (unsigned serialized bytes) -> { r, s, v }
export async function ledgerSignTransaction({ path = LEDGER_DEFAULT_PATH, unsignedSerialized }, onPrompt) {
  const { signer } = await connectLedger();
  const bytes = Uint8Array.from(unsignedSerialized.slice(2).match(/../g).map(h => parseInt(h, 16)));
  return run(signer.signTransaction(path, bytes), onPrompt, "Plan signature");
}
