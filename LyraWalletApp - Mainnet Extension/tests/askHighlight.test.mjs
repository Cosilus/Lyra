import test from "node:test";
import assert from "node:assert/strict";
import { highlightRanges, highlightSegments } from "../src/askHighlight.js";

const ctx = {
  tokenSymbols: ["XPL", "USDT0", "ETH"],
  contacts: [{ name: "Papa" }, { name: "Papa Jean" }],
  networks: [{ name: "Plasma" }, { name: "Base" }],
};
const marked = (text) => highlightSegments(text, highlightRanges(text, ctx)).filter(s => s.kind).map(s => `${s.kind}:${s.text}`);

test("amounts, tokens, contacts and 'the rest' are recognised", () => {
  assert.deepEqual(
    marked("Swap half my XPL to USDT0, send 10 to Papa and stake the rest"),
    ["value:half my XPL", "value:USDT0", "value:10", "contact:Papa", "value:the rest"]
  );
});

test("the longest contact name wins and networks are tinted", () => {
  assert.deepEqual(marked("send 5 USDT0 to Papa Jean on Base"), ["value:5", "value:USDT0", "contact:Papa Jean", "value:Base"]);
});

test("addresses and dollar amounts", () => {
  assert.deepEqual(marked("send $10 of XPL to 0x8f2C41b7E0aA93d5"), ["value:$10", "value:XPL", "value:0x8f2C41b7E0aA93d5"]);
});

test("segments rebuild the exact text", () => {
  const t = "Swap all my ETH to XPL, then stake it";
  assert.equal(highlightSegments(t, highlightRanges(t, ctx)).map(s => s.text).join(""), t);
  assert.deepEqual(highlightRanges("", ctx), []);
});

test("words inside other words are left alone", () => {
  assert.deepEqual(marked("Papageno sent pinkETHereum"), []);
});
