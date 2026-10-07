import test from "node:test";
import assert from "node:assert/strict";
import { parseNetworkCommand } from "../src/networkCommand.js";

test("network switch commands", () => {
  assert.equal(parseNetworkCommand("switch to base"), "base");
  assert.equal(parseNetworkCommand("Switch to Base"), "base");
  assert.equal(parseNetworkCommand("passe sur sepolia"), "ethereum");
  assert.equal(parseNetworkCommand("use polygon"), "polygon");
  assert.equal(parseNetworkCommand("go to plasma"), "plasma");
  assert.equal(parseNetworkCommand("change network to hyperliquid"), "hyperliquid");
});

test("real requests are left to the AI", () => {
  assert.equal(parseNetworkCommand("bridge 10 usdc to base"), null);
  assert.equal(parseNetworkCommand("swap eth to usdc on base"), null);
  assert.equal(parseNetworkCommand("what is base?"), null);
  assert.equal(parseNetworkCommand("switch from base to arc"), null);
  assert.equal(parseNetworkCommand("switch to 3d"), null);
});
