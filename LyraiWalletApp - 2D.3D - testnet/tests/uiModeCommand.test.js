import { describe, it, expect } from "vitest";
import { parseUiModeCommand } from "../src/uiModeCommand.js";

describe("parseUiModeCommand", () => {
  it.each([
    ["switch to 3D", "3d"],
    ["Switch to 2D", "2d"],
    ["go back to 2d please", "2d"],
    ["passe en 3D", "3d"],
    ["active la 3D", "3d"],
    ["retour en 2D", "2d"],
    ["use 3-D", "3d"],
  ])("%s -> %s", (text, expected) => {
    expect(parseUiModeCommand(text)).toBe(expected);
  });

  it.each([
    "send 10 USDT to Alex",
    "what is 3d printing",           // mentions 3D but no switch verb
    "I like the 3D look",
    "switch to Base",
    "",
  ])("ignores %j", (text) => {
    expect(parseUiModeCommand(text)).toBeNull();
  });

  it("does not hijack a long, real request that mentions 3D", () => {
    const long = "please switch to 3D and then also explain in detail how staking works on Aave and what the risks are";
    expect(parseUiModeCommand(long)).toBeNull();
  });
});
