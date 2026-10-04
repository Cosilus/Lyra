// The wallet page's side of the website connection (extension build only).
// In the plain web app chrome.runtime doesn't exist and everything here is a
// no-op, so App.jsx can call it unconditionally.
//
// The background service worker (extension/background.js) answers websites;
// this file tells it the wallet's public state, and lets the approval window
// read and answer the requests that wait for the user.

export const isExtension = () =>
  typeof chrome !== "undefined" && !!chrome.runtime?.id && !!chrome.storage?.local;

// Lyra opens itself in a small window (index.html?dapp=1) when a website asks
// for something that needs the user's consent.
export const isApprovalWindow = () =>
  isExtension() && new URLSearchParams(window.location.search).get("dapp") === "1";

const toHexChainId = (chainId) => "0x" + Number(chainId).toString(16);

// Public data only: the address, the active network and its RPC url (used by
// the background to answer read-only calls like balances or eth_call).
export function syncWalletState({ address, network, rpcUrl, networks }) {
  if (!isExtension()) return;
  chrome.storage.local.set({
    lyraWalletState: {
      address: address || null,
      chainId: toHexChainId(network.chainId),
      rpcUrl,
      networks: networks.map(n => ({ chainId: toHexChainId(n.chainId), key: n.key, name: n.name })),
    },
  });
}

// ------------------------------------------------------------------
// Unlocked session, shared by every Lyra page (side panel, approval
// window), the way MetaMask keeps the wallet unlocked for the browser
// session instead of asking for the password on every website request.
//
// chrome.storage.session lives in memory only (never written to disk,
// gone when the browser closes) and, at its default access level, can't
// be read by content scripts, so websites never get near it. It's cleared
// as soon as any Lyra page locks, and the background clears it after the
// auto-lock delay with no activity in any Lyra page.
const SESSION_KEY = "lyraUnlockedSession";
const TOUCH_EVERY_MS = 20 * 1000;
let lastTouch = 0;

export function saveUnlockedSession({ address, privateKey, localSecret, autoLockMinutes }) {
  if (!isExtension()) return;
  lastTouch = Date.now();
  chrome.storage.session.set({ [SESSION_KEY]: { address, privateKey, localSecret, autoLockMinutes, lastActive: lastTouch } });
}

export function clearUnlockedSession() {
  if (!isExtension()) return;
  chrome.storage.session.remove(SESSION_KEY);
}

// The unlocked session for this address, unless it has already expired.
export async function loadUnlockedSession(address) {
  if (!isExtension() || !address) return null;
  const { [SESSION_KEY]: s } = await chrome.storage.session.get(SESSION_KEY);
  if (!s || s.address?.toLowerCase() !== address.toLowerCase()) return null;
  if (s.autoLockMinutes > 0 && Date.now() - s.lastActive > s.autoLockMinutes * 60 * 1000) {
    clearUnlockedSession();
    return null;
  }
  return s;
}

// User activity in a Lyra page keeps the session alive (throttled).
export function touchUnlockedSession() {
  if (!isExtension() || Date.now() - lastTouch < TOUCH_EVERY_MS) return;
  lastTouch = Date.now();
  chrome.storage.session.get(SESSION_KEY).then(({ [SESSION_KEY]: s }) => {
    if (s) chrome.storage.session.set({ [SESSION_KEY]: { ...s, lastActive: lastTouch } });
  });
}

// onLocked: another Lyra page (or the background's auto-lock) ended the
// session. onActivity: someone is using Lyra in another page.
export function watchUnlockedSession({ onLocked, onActivity }) {
  if (!isExtension()) return () => {};
  const listener = (changes, area) => {
    if (area !== "session" || !changes[SESSION_KEY]) return;
    const { oldValue, newValue } = changes[SESSION_KEY];
    if (oldValue && !newValue) onLocked?.();
    else if (newValue) onActivity?.();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export async function fetchPendingRequests() {
  if (!isExtension()) return [];
  try {
    return (await chrome.runtime.sendMessage({ type: "lyra-dapp-pending" })) || [];
  } catch {
    return [];
  }
}

export async function resolveRequest(id, { result, error }) {
  return chrome.runtime.sendMessage({ type: "lyra-dapp-resolve", id, result, error });
}

export async function listConnectedSites() {
  if (!isExtension()) return {};
  return (await chrome.runtime.sendMessage({ type: "lyra-dapp-sites" })) || {};
}

export async function disconnectSite(origin) {
  return chrome.runtime.sendMessage({ type: "lyra-dapp-disconnect", origin });
}
