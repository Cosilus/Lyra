import { ethers } from "ethers";
import { ACTIVE_NETWORK } from "../../src/config.js";

// Reads from the same network the frontend is actually connected to
// (mainnet or testnet, via ACTIVE_NETWORK) — this used to be hardcoded
// to the testnet RPC, which meant the AI's GET_BALANCE intent could
// answer with a different balance than the one shown in the UI.
const provider = new ethers.JsonRpcProvider(ACTIVE_NETWORK.rpcUrl);

export async function getBalance(address) {
  if (!address) {
    throw new Error("Adresse wallet manquante.");
  }

  if (!ethers.isAddress(address)) {
    throw new Error("Adresse wallet invalide.");
  }

  const balance = await provider.getBalance(address);

  return {
    address,
    balanceWei: balance.toString(),
    balanceXPL: ethers.formatEther(balance)
  };
}

export function getAddress(address) {
  if (!address) {
    throw new Error("Aucun wallet connecté.");
  }

  if (!ethers.isAddress(address)) {
    throw new Error("Adresse wallet invalide.");
  }

  return {
    address
  };
}