import test from "node:test";
import assert from "node:assert/strict";
import { forbiddenSignature } from "../src/signTranslator.js";

const userOp = {
  domain: { name: "ERC4337", version: "1", chainId: 9745, verifyingContract: "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108" },
  primaryType: "PackedUserOperation",
  types: { PackedUserOperation: [{ name: "sender", type: "address" }] },
  message: { sender: "0x0000000000000000000000000000000000000001" },
};

test("an ERC-4337 operation asked by a site is refused", () => {
  assert.ok(forbiddenSignature("eth_signTypedData_v4", ["0x0000000000000000000000000000000000000001", JSON.stringify(userOp)]));
  const disguised = { ...userOp, primaryType: "Login", types: { Login: [{ name: "a", type: "uint256" }] } };
  assert.ok(forbiddenSignature("eth_signTypedData_v4", ["0x0000000000000000000000000000000000000001", disguised]), "EntryPoint domain alone");
  assert.ok(forbiddenSignature("eth_sign", ["0x01", "0x" + "ab".repeat(32)]));
});

test("ordinary signatures still go through", () => {
  const permit = { domain: { name: "USD Coin", version: "2", chainId: 1, verifyingContract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" }, primaryType: "Permit", types: { Permit: [] }, message: {} };
  assert.equal(forbiddenSignature("eth_signTypedData_v4", ["0x0000000000000000000000000000000000000001", permit]), null);
  assert.equal(forbiddenSignature("personal_sign", ["0x68656c6c6f", "0x0000000000000000000000000000000000000001"]), null);
});
