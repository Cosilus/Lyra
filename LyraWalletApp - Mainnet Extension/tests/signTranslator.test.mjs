// npm test
import test from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import { translateRequest } from "../src/signTranslator.js";

const ME = "0x1111111111111111111111111111111111111111";
const SPENDER = "0x2222222222222222222222222222222222222222";
const USDC = "0x3333333333333333333333333333333333333333";
const ctx = {
  address: ME,
  chainId: 11155111,
  nativeSymbol: "ETH",
  tokenInfo: async (a) => (a.toLowerCase() === USDC.toLowerCase() ? { symbol: "USDC", decimals: 6 } : null),
};
const erc20 = new ethers.Interface([
  "function approve(address,uint256)",
  "function transfer(address,uint256)",
  "function setApprovalForAll(address,bool)",
]);

test("Sign-In with Ethereum is a low-risk login", async () => {
  const msg = `app.example.org wants you to sign in with your Ethereum account:\n${ME}\n\nSign in\n\nURI: https://app.example.org\nVersion: 1\nChain ID: 1\nNonce: abc`;
  const r = await translateRequest("personal_sign", [ethers.hexlify(ethers.toUtf8Bytes(msg)), ME], ctx, "https://app.example.org");
  assert.equal(r.risk, "low");
  assert.match(r.title, /Sign in to app\.example\.org/);
});

test("SIWE sent by another domain is flagged as phishing", async () => {
  const msg = `app.example.org wants you to sign in with your Ethereum account:\n${ME}\n\nURI: https://app.example.org`;
  const r = await translateRequest("personal_sign", [msg, ME], ctx, "https://evil.example.net");
  assert.equal(r.risk, "high");
  assert.match(r.warnings.join(" "), /phishing/);
});

test("plain text message", async () => {
  const r = await translateRequest("personal_sign", [ethers.hexlify(ethers.toUtf8Bytes("Hello Lyra")), ME], ctx);
  assert.equal(r.risk, "low");
  assert.equal(r.details[0].value, "Hello Lyra");
});

test("unreadable binary message is high risk", async () => {
  const r = await translateRequest("personal_sign", ["0x" + "ff".repeat(32), ME], ctx);
  assert.equal(r.risk, "high");
});

test("unlimited EIP-2612 permit", async () => {
  const typed = {
    domain: { name: "USD Coin", version: "2", chainId: 11155111, verifyingContract: USDC },
    primaryType: "Permit",
    types: {},
    message: { owner: ME, spender: SPENDER, value: ethers.MaxUint256.toString(), nonce: 0, deadline: 1900000000 },
  };
  const r = await translateRequest("eth_signTypedData_v4", [ME, JSON.stringify(typed)], ctx);
  assert.equal(r.risk, "high");
  assert.match(r.summary, /unlimited amount of USDC/);
  assert.match(r.warnings.join(" "), /unlimited/);
});

test("typed data for another chain is flagged", async () => {
  const typed = { domain: { name: "X", chainId: 1 }, primaryType: "Mail", message: { contents: "hi" } };
  const r = await translateRequest("eth_signTypedData_v4", [ME, typed], ctx);
  assert.match(r.warnings.join(" "), /another network/);
});

test("native transfer", async () => {
  const r = await translateRequest("eth_sendTransaction", [{ from: ME, to: SPENDER, value: "0x2386f26fc10000" }], ctx);
  assert.equal(r.title, "Send 0.01 ETH");
});

test("ERC-20 approve with a limited amount", async () => {
  const data = erc20.encodeFunctionData("approve", [SPENDER, 25_000_000n]);
  const r = await translateRequest("eth_sendTransaction", [{ from: ME, to: USDC, data }], ctx);
  assert.equal(r.risk, "medium");
  assert.match(r.summary, /25 USDC/);
});

test("ERC-20 unlimited approve is high risk", async () => {
  const data = erc20.encodeFunctionData("approve", [SPENDER, ethers.MaxUint256]);
  const r = await translateRequest("eth_sendTransaction", [{ from: ME, to: USDC, data }], ctx);
  assert.equal(r.risk, "high");
});

test("ERC-20 transfer", async () => {
  const data = erc20.encodeFunctionData("transfer", [SPENDER, 1_500_000n]);
  const r = await translateRequest("eth_sendTransaction", [{ from: ME, to: USDC, data }], ctx);
  assert.equal(r.title, "Send 1.5 USDC");
});

test("setApprovalForAll is high risk, revoking is low", async () => {
  const on = await translateRequest("eth_sendTransaction", [{ from: ME, to: USDC, data: erc20.encodeFunctionData("setApprovalForAll", [SPENDER, true]) }], ctx);
  const off = await translateRequest("eth_sendTransaction", [{ from: ME, to: USDC, data: erc20.encodeFunctionData("setApprovalForAll", [SPENDER, false]) }], ctx);
  assert.equal(on.risk, "high");
  assert.equal(off.risk, "low");
});

test("unknown contract call is not hidden", async () => {
  const r = await translateRequest("eth_sendTransaction", [{ from: ME, to: SPENDER, data: "0xdeadbeef00" }], ctx);
  assert.match(r.summary, /0xdeadbeef/);
  assert.ok(r.warnings.length > 0);
});
