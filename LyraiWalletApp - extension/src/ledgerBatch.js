// One signature for a whole plan with a Ledger (EIP-7702). The Ledger address
// delegates once to eth-infinitism's Simple7702Account, the only delegate the
// Ledger Ethereum app accepts (its whitelist, same address on every chain
// where it is deployed: Plasma, Arc Testnet, ...). After that, a plan is one
// ordinary transaction from the address to itself calling executeBatch(calls):
// every step runs in order inside it, all or nothing.
import { ethers } from "ethers";
import { ledgerSignDelegation, ledgerSignTransaction } from "./ledger.js";

export const BATCH_DELEGATOR = "0x4Cd241E8d1510e30b2076397afc7508Ae59C66c9";
const DELEGATOR = new ethers.Interface(["function executeBatch((address target, uint256 value, bytes data)[] calls)"]);

const sig = (s) => ethers.Signature.from({ r: s.r, s: s.s, v: Number(s.v) < 27 ? Number(s.v) + 27 : Number(s.v) });

export async function batchSupported(provider) {
  try { return (await provider.getCode(BATCH_DELEGATOR)) !== "0x"; } catch { return false; }
}

export async function isDelegated(provider, address) {
  const code = await provider.getCode(address);
  return code.toLowerCase() === ("0xef0100" + BATCH_DELEGATOR.slice(2)).toLowerCase();
}

export function encodeBatch(calls) {
  return DELEGATOR.encodeFunctionData("executeBatch", [calls.map(c => [c.to, BigInt(c.value || 0), c.data || "0x"])]);
}

// One-time: the Ledger signs the delegation, the Lyra address (`relayer`)
// sends it and pays the fee. Sent to the relayer itself: the authorization
// applies to the Ledger address whatever the transaction's target.
export async function activateBatching({ provider, ledgerAddress, path, relayer, onPrompt }) {
  const { chainId } = await provider.getNetwork();
  const nonce = await provider.getTransactionCount(ledgerAddress, "pending");
  const signed = await ledgerSignDelegation({ path, chainId, contract: BATCH_DELEGATOR, nonce }, onPrompt);
  const tx = await relayer.sendTransaction({
    type: 4,
    to: await relayer.getAddress(),
    value: 0n,
    data: "0x",
    authorizationList: [{ address: BATCH_DELEGATOR, nonce, chainId, signature: sig(signed) }],
  });
  await tx.wait();
  if (!(await isDelegated(provider, ledgerAddress))) throw new Error("The one-signature setup didn't take. Try again.");
  return tx;
}

// The plan as one transaction, signed on the Ledger, then broadcast
export async function sendLedgerBatch({ provider, ledgerAddress, path, calls, onPrompt }) {
  const data = encodeBatch(calls);
  const { chainId } = await provider.getNetwork();
  const [nonce, fee, gas] = await Promise.all([
    provider.getTransactionCount(ledgerAddress, "pending"),
    provider.getFeeData(),
    provider.estimateGas({ from: ledgerAddress, to: ledgerAddress, data }),
  ]);
  const tx = ethers.Transaction.from({
    type: 2,
    chainId,
    nonce,
    to: ledgerAddress,
    data,
    value: 0n,
    gasLimit: (gas * 12n) / 10n,
    maxFeePerGas: fee.maxFeePerGas ?? fee.gasPrice,
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? 0n,
  });
  const signed = await ledgerSignTransaction({ path, unsignedSerialized: tx.unsignedSerialized }, onPrompt);
  tx.signature = sig(signed);
  return provider.broadcastTransaction(tx.serialized);
}

// The same one-transaction plan, signed with the wallet's own key. Everything
// that takes time (routes, quotes, nonce, fees, gas) is read ahead, while the
// plan is on screen; confirming only signs and broadcasts. The first plan on a
// network also carries the delegation (signed by that same key, no setup step).
export async function prepareOwnBatch({ provider, address, calls }) {
  const data = encodeBatch(calls);
  const [{ chainId }, nonce, fee, delegated] = await Promise.all([
    provider.getNetwork(),
    provider.getTransactionCount(address, "pending"),
    provider.getFeeData(),
    isDelegated(provider, address),
  ]);
  // before the delegation the address has no code: gas is estimated with it, at signing
  const gas = delegated ? await provider.estimateGas({ from: address, to: address, data }) : null;
  return { address, data, chainId, nonce, fee, delegated, gas, at: Date.now() };
}

export async function sendOwnBatch({ wallet, prepared }) {
  const { address, data, chainId, nonce, fee, delegated } = prepared;
  // sender and authority are the same address: the authorization takes the next nonce
  const authorizationList = delegated ? undefined
    : [await wallet.authorize({ address: BATCH_DELEGATOR, nonce: nonce + 1, chainId })];
  const gas = prepared.gas ?? await wallet.provider.estimateGas({ from: address, to: address, data, authorizationList });
  const maxFee = fee.maxFeePerGas ?? fee.gasPrice;
  return wallet.sendTransaction({
    type: delegated ? 2 : 4,
    chainId,
    nonce,
    to: address,
    data,
    value: 0n,
    gasLimit: (gas * 13n) / 10n,
    // room for the base fee moving since it was read; only what is used is paid
    maxFeePerGas: (maxFee * 3n) / 2n,
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? 0n,
    ...(authorizationList ? { authorizationList } : {}),
  });
}
