import test from "node:test";
import assert from "node:assert/strict";
import { fixTranscript } from "../src/voiceFix.js";

const ctx = { symbols: ["XPL", "USDT0", "USDC", "EURC"], contacts: [{ name: "Brian" }, { name: "Max" }, { name: "Jean Dupont" }] };

test("misheard tickers come back to the network's symbols", () => {
  assert.equal(fixTranscript("envoie un XL à Bryan", ctx), "envoie 1 XPL à Brian");
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

test("amounts said as words become digits, a lost 'to' between tickers comes back", () => {
  assert.equal(fixTranscript("swap un XPL USB", ctx), "swap 1 XPL to USDT0");
  assert.equal(fixTranscript("swap un XPL en USB", ctx), "swap 1 XPL en USDT0");
  assert.equal(fixTranscript("envoie deux XPL à Brian", ctx), "envoie 2 XPL à Brian");
  assert.equal(fixTranscript("send twenty five USDT zero to max", ctx), "send 25 USDT0 to max");
  assert.equal(fixTranscript("envoie zéro virgule cinq XPL à Brian", ctx), "envoie 0.5 XPL à Brian");
  assert.equal(fixTranscript("envoie vingt et un XPL", ctx), "envoie 21 XPL");
  assert.equal(fixTranscript("stake mille deux cents USDT0", ctx), "stake 1200 USDT0");
  assert.equal(fixTranscript("send 1,5 XPL to Max", ctx), "send 1.5 XPL to Max");
  assert.equal(fixTranscript("envoie un message à Brian", ctx), "envoie un message à Brian");
});
