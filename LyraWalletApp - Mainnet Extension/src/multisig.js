import Safe from "@safe-global/protocol-kit";
import { ethers } from "ethers";
import { getNetworkByKey, NETWORKS, API_BASE_URL } from "./config.js";

// Safe's official infra (the same deterministic contract addresses,
// plus a hosted Transaction Service that lets a Safe's other owners
// see a pending transaction from their own device) covers all four
// of Lyra's networks, Plasma included, contrary to what an earlier,
// non-exhaustive check assumed: live-confirmed real bytecode at
// Plasma's canonical proxy factory address, and a working Transaction
// Service under the short name "plasma" (see server/routes/safe.js).
// The one real caveat, worth knowing rather than a reason to exclude
// it: Plasma's zero-fee paymaster only covers a plain stablecoin
// transfer, not a Safe's contract-call execution, so a multisig
// transaction there pays real XPL gas like on any other chain.
//
// Decided by chain id, not by network key: the testnet build reuses the
// same keys ("ethereum" is Sepolia there), and Safe's Transaction
// Service only covers Sepolia and Base Sepolia among Lyra's testnets
// (checked against safe-config.safe.global on 03.10.2026: no Polygon
// Amoy, no Plasma testnet). Must match the map in server/routes/safe.js.
const SAFE_CHAIN_IDS = [1, 8453, 137, 9745, 11155111, 84532];
export const SAFE_SUPPORTED_NETWORK_KEYS = NETWORKS
  .filter(n => SAFE_CHAIN_IDS.includes(n.chainId))
  .map(n => n.key);

export function isSafeSupportedNetwork(networkKey) {
  return SAFE_SUPPORTED_NETWORK_KEYS.includes(networkKey);
}

// Talks to Safe's Transaction Service over REST instead of through
// @safe-global/api-kit (whose constructor refuses to run without an
// API key in the browser). Every call goes through Lyra's own backend
// (server/routes/safe.js), never straight to api.safe.global: the Safe
// API key has to stay server-side, since a VITE_ variable would ship
// inside this public bundle and anyone could burn the shared monthly
// quota with it. The backend maps the network key to Safe's short name
// (eth, base, pol, plasma) and only forwards the exact endpoints used
// below, with a per-client rate limit.
function txServiceBaseUrl(networkKey) {
  return `${API_BASE_URL}/api/safe/${networkKey}`;
}

async function txServiceRequest(networkKey, path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };

  const res = await fetch(`${txServiceBaseUrl(networkKey)}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Safe's Transaction Service rejected this (${res.status}): ${detail || res.statusText}`);
  }
  // A successful POST (propose/confirm) comes back 200/201 with an
  // EMPTY body, live-confirmed: calling res.json() unconditionally
  // threw "Unexpected end of JSON input" there, this only worked at
  // all for the GET endpoints, which do return a real body.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Standard Safe v1.3.0 execTransaction interface, generalized from
// the Polymarket-Safe interop already in App.jsx (same exact contract
// version, confirmed live there): that copy is hardcoded to Polygon
// and a threshold of 1 (only ever reading Polymarket's OWN deposit
// Safes). This one supports any of the three chains above and any
// threshold, for a Safe Lyra itself deploys and owns transactions on.
const SAFE_ABI = [
  "function nonce() view returns (uint256)",
  "function getTransactionHash(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) view returns (bytes32)",
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)",
];

// domain has no name/version for a Safe (GnosisSafe.sol's
// DOMAIN_SEPARATOR_TYPEHASH is keccak256("EIP712Domain(uint256
// chainId,address verifyingContract)")).
const SAFE_TX_TYPES = {
  SafeTx: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" },
    { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" },
    { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
};

async function buildTxParams(provider, safeAddress, { to, value, data = "0x", nonce }) {
  let resolvedNonce = nonce;
  if (resolvedNonce === undefined) {
    const safe = new ethers.Contract(safeAddress, SAFE_ABI, provider);
    resolvedNonce = await safe.nonce();
  }

  return {
    to,
    value,
    data,
    operation: 0, // Call, never DelegateCall
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: ethers.ZeroAddress,
    refundReceiver: ethers.ZeroAddress,
    nonce: resolvedNonce,
  };
}

// Safe processes queued transactions strictly in nonce order, so
// queuing more than one new pending transaction back to back (e.g.
// two "add this owner" proposals from a single chat message) can't
// just reread the on-chain nonce for each one, that only advances once
// something actually executes, every one of them would collide on the
// exact same nonce and become alternatives to each other instead of a
// real queue. This mirrors Safe's own logic for the same problem: the
// real next nonce is one past whichever is higher, the highest ALREADY
// PENDING transaction's nonce, or the Safe's on-chain nonce (nothing
// pending yet).
export async function getNextNonce({ networkKey, safeAddress }) {
  const pending = await fetchPendingTransactions({ networkKey, safeAddress });
  if (pending.length > 0) {
    const maxPendingNonce = pending.reduce((max, tx) => {
      const n = BigInt(tx.nonce);
      return n > max ? n : max;
    }, 0n);
    return maxPendingNonce + 1n;
  }
  const info = await getSafeInfo({ networkKey, safeAddress });
  return BigInt(info.nonce);
}

function hashTx(chainId, safeAddress, txParams) {
  const domain = { chainId, verifyingContract: safeAddress };
  return ethers.TypedDataEncoder.hash(domain, SAFE_TX_TYPES, txParams);
}

// Deploys a new Safe owned by `owners` (the caller's own address plus
// every co-owner they named), requiring `threshold` signatures to
// move funds. Only the address is handed to the Protocol Kit here
// (never the private key): getAddress()/createSafeDeploymentTransaction()
// are pure, deterministic computations, not signing, the actual
// deployment transaction is broadcast through Lyra's own already-
// proven ethers signer below, the same one every other transaction in
// this app goes through.
export async function deploySafe({ networkKey, signer, owners, threshold }) {
  const network = getNetworkByKey(networkKey);

  if (!isSafeSupportedNetwork(networkKey)) {
    throw new Error(`Multisig isn't available on ${network.name} yet.`);
  }
  if (!Array.isArray(owners) || owners.length < 2) {
    throw new Error("A multisig needs at least 2 owners (you plus at least one co-owner).");
  }
  if (!owners.every(o => ethers.isAddress(o))) {
    throw new Error("One of the owner addresses isn't valid.");
  }
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > owners.length) {
    throw new Error(`The signature threshold must be between 1 and ${owners.length}.`);
  }

  const ownerAddress = await signer.getAddress();

  const protocolKit = await Safe.init({
    provider: network.rpcUrl,
    signer: ownerAddress,
    predictedSafe: {
      safeAccountConfig: { owners, threshold },
    },
  });

  const safeAddress = await protocolKit.getAddress();
  const deploymentTx = await protocolKit.createSafeDeploymentTransaction();

  const tx = await signer.sendTransaction({
    to: deploymentTx.to,
    value: BigInt(deploymentTx.value || 0),
    data: deploymentTx.data,
  });
  await tx.wait();

  return {
    address: safeAddress,
    network: networkKey,
    owners,
    threshold,
    ownerAddress,
    createdAt: Date.now(),
  };
}

export async function getSafeBalance({ networkKey, safeAddress }) {
  const network = getNetworkByKey(networkKey);
  const provider = new ethers.JsonRpcProvider(network.rpcUrl, network.chainId);
  return provider.getBalance(safeAddress);
}

// Live owners/threshold straight from the Transaction Service (same
// endpoint fetchPendingTransactions already reads the nonce from),
// used before proposing an owner change so it's always built against
// the Safe's actual current state, never a possibly-stale locally
// saved copy.
export async function getSafeInfo({ networkKey, safeAddress }) {
  const info = await txServiceRequest(networkKey, `/v1/safes/${safeAddress}/`);
  return { owners: info.owners, threshold: Number(info.threshold), nonce: info.nonce };
}

// Builds, signs (this proposer's own signature), and stores ANY Safe
// transaction as pending. Nothing moves/changes yet, this only
// records the proposal and one signature toward the threshold,
// execution happens once enough owners have confirmed (confirmTransfer
// below) — a plain transfer and an owner-management call (see
// proposeAddOwner) both go through this exact same path, a transfer
// is just the { to: recipient, value, data: "0x" } case.
export async function proposeSafeTransaction({ networkKey, safeAddress, signer, to, value, data, nonce }) {
  const network = getNetworkByKey(networkKey);
  const txParams = await buildTxParams(signer.provider, safeAddress, { to, value, data, nonce });
  const safeTxHash = hashTx(network.chainId, safeAddress, txParams);
  const signature = await signer.signTypedData(
    { chainId: network.chainId, verifyingContract: safeAddress },
    SAFE_TX_TYPES,
    txParams
  );

  // contractTransactionHash/sender/signature are this exact endpoint's
  // real field names (live-confirmed against api.safe.global), not
  // safeTxHash/senderAddress/senderSignature, those are only api-kit's
  // own JS-facing parameter names, they get renamed before hitting
  // the wire.
  await txServiceRequest(networkKey, `/v2/safes/${safeAddress}/multisig-transactions/`, {
    method: "POST",
    body: {
      to: txParams.to,
      value: txParams.value.toString(),
      data: txParams.data,
      operation: txParams.operation,
      safeTxGas: txParams.safeTxGas.toString(),
      baseGas: txParams.baseGas.toString(),
      gasPrice: txParams.gasPrice.toString(),
      gasToken: txParams.gasToken,
      refundReceiver: txParams.refundReceiver,
      nonce: Number(txParams.nonce),
      contractTransactionHash: safeTxHash,
      sender: await signer.getAddress(),
      signature,
    },
  });

  return safeTxHash;
}

// Thin, explicit wrapper: a plain transfer is a Safe transaction with
// no calldata, aimed straight at the recipient.
export function proposeTransfer({ networkKey, safeAddress, signer, to, value }) {
  return proposeSafeTransaction({ networkKey, safeAddress, signer, to, value, data: "0x" });
}

// Adding an owner is itself a Safe transaction, same threshold rules
// apply: it only takes effect once enough existing owners confirm it,
// exactly like a transfer, never immediately just because someone
// proposed it. The call targets the Safe's OWN address (Safe's owner-
// management functions are self-calls, the same pattern used for
// changing the threshold or removing an owner), never an address the
// AI or the user supplies directly, so this can't be pointed at some
// other contract by mistake.
//
// newThreshold defaults to the CURRENT threshold, not a bump: adding
// a person is a distinct decision from requiring more signatures,
// asking for one shouldn't quietly demand the other too.
const SAFE_OWNER_MANAGER_ABI = [
  "function addOwnerWithThreshold(address owner, uint256 _threshold)",
];
const safeOwnerManagerInterface = new ethers.Interface(SAFE_OWNER_MANAGER_ABI);

export function proposeAddOwner({ networkKey, safeAddress, signer, newOwner, newThreshold, nonce }) {
  if (!ethers.isAddress(newOwner)) {
    throw new Error(`"${newOwner}" isn't a valid address.`);
  }
  const data = safeOwnerManagerInterface.encodeFunctionData("addOwnerWithThreshold", [
    newOwner,
    newThreshold,
  ]);
  return proposeSafeTransaction({ networkKey, safeAddress, signer, to: safeAddress, value: 0n, data, nonce });
}

export async function fetchPendingTransactions({ networkKey, safeAddress }) {
  // The list endpoint needs the Safe's current on-chain nonce to only
  // return transactions still eligible to execute (nonce__gte), same
  // as api-kit's own getPendingTransactions does internally.
  const info = await txServiceRequest(networkKey, `/v1/safes/${safeAddress}/`);
  const result = await txServiceRequest(
    networkKey,
    `/v2/safes/${safeAddress}/multisig-transactions/?executed=false&nonce__gte=${info.nonce}`
  );
  return result?.results || [];
}

// Safe requires the concatenated owner signatures sorted by the
// signer's own address, ascending, not the order they were collected
// in.
function combineSignatures(confirmations) {
  const sorted = [...confirmations].sort((a, b) =>
    a.owner.toLowerCase().localeCompare(b.owner.toLowerCase())
  );
  return "0x" + sorted.map(c => c.signature.replace(/^0x/, "")).join("");
}

async function executePendingTx(signer, safeAddress, pending) {
  const safe = new ethers.Contract(safeAddress, SAFE_ABI, signer);
  const signatures = combineSignatures(pending.confirmations);

  const tx = await safe.execTransaction(
    pending.to,
    BigInt(pending.value),
    pending.data || "0x",
    pending.operation,
    BigInt(pending.safeTxGas),
    BigInt(pending.baseGas),
    BigInt(pending.gasPrice),
    pending.gasToken,
    pending.refundReceiver,
    signatures
  );
  return tx.wait();
}

// Adds this owner's signature to an already-proposed transaction, and
// executes it immediately once that was the last signature needed
// (so the threshold-th person to approve doesn't need a separate
// "now execute" step). Returns { executed: false, pending } or
// { executed: true, receipt }.
export async function confirmTransfer({ networkKey, safeAddress, signer, safeTxHash }) {
  const network = getNetworkByKey(networkKey);

  const pending = await txServiceRequest(networkKey, `/v2/multisig-transactions/${safeTxHash}/`);
  const txParams = {
    to: pending.to,
    value: BigInt(pending.value),
    data: pending.data || "0x",
    operation: pending.operation,
    safeTxGas: BigInt(pending.safeTxGas),
    baseGas: BigInt(pending.baseGas),
    gasPrice: BigInt(pending.gasPrice),
    gasToken: pending.gasToken,
    refundReceiver: pending.refundReceiver,
    nonce: BigInt(pending.nonce),
  };

  const signature = await signer.signTypedData(
    { chainId: network.chainId, verifyingContract: safeAddress },
    SAFE_TX_TYPES,
    txParams
  );

  await txServiceRequest(networkKey, `/v1/multisig-transactions/${safeTxHash}/confirmations/`, {
    method: "POST",
    body: { signature },
  });

  const updated = await txServiceRequest(networkKey, `/v2/multisig-transactions/${safeTxHash}/`);
  const confirmationsCount = (updated.confirmations || []).length;

  if (confirmationsCount >= updated.confirmationsRequired) {
    const receipt = await executePendingTx(signer, safeAddress, updated);
    return { executed: true, receipt };
  }

  return { executed: false, pending: updated };
}
