import test from "node:test";
import assert from "node:assert/strict";
import { fixTranscript } from "../src/voiceFix.js";

const ctx = { symbols: ["XPL", "USDT0", "USDC", "EURC"], contacts: [{ name: "Brian" }, { name: "Max" }, { name: "Jean Dupont" }] };

test("misheard tickers come back to the network's symbols", () => {
  assert.equal(fixTranscript("envoie un XL à Bryan", ctx), "envoie un XPL à Brian");
  assert.equal(fixTranscript("send 1 PL to Bryan", ctx), "send 1 XPL to Brian");
  assert.equal(fixTranscript("send 1 XP to brian", ctx), "send 1 XPL to brian");
  assert.equal(fixTranscript("send 5 x p l to max", ctx), "send 5 XPL to max");
  assert.equal(fixTranscript("envoie 100 USDT zero à Bryan", ctx), "envoie 100 USDT0 à Brian");
  assert.equal(fixTranscript("swap 10 USD C to EUR C", ctx), "swap 10 USDC to EURC");
});

test("common words and other names are left alone", () => {
  assert.equal(fixTranscript("et envoie la moitié de mes XPL à Max", ctx), "et envoie la moitié de mes XPL à Max");
  assert.equal(fixTranscript("send it to me", ctx), "send it to me");
  assert.equal(fixTranscript("send 2 USDC to Robert", ctx), "send 2 USDC to Robert");
});
