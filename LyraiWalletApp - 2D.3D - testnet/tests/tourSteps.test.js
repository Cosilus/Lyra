import { describe, it, expect } from "vitest";
import { TOUR_STEPS } from "../src/three-d/Tour3D.jsx";

// Menu sizes in App.jsx (leftMenu3d / rightMenu3d). If a button is added or
// removed there, the tour must follow, or it would highlight the wrong one.
const LEFT_MENU_SIZE = 5;   // Contacts, Network, Chart, Help, Settings
const RIGHT_MENU_SIZE = 5;  // Send, Receive, Swap, Bridge, Stake

describe("3D tour", () => {
  it("starts and ends on a free-pose step", () => {
    expect(TOUR_STEPS[0].dock).toBeNull();
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].dock).toBeNull();
  });

  it("only uses known docks", () => {
    for (const s of TOUR_STEPS) expect([null, "left", "right", "top"]).toContain(s.dock);
  });

  it("has one step per left button, in order", () => {
    const left = TOUR_STEPS.filter(s => s.dock === "left");
    expect(left.map(s => s.index)).toEqual(Array.from({ length: LEFT_MENU_SIZE }, (_, i) => i));
    expect(left.map(s => s.title)).toEqual(["Contacts", "Network", "Chart", "Help", "Settings"]);
  });

  it("has one step per right button, in order", () => {
    const right = TOUR_STEPS.filter(s => s.dock === "right");
    expect(right.map(s => s.index)).toEqual(Array.from({ length: RIGHT_MENU_SIZE }, (_, i) => i));
  });

  it("has a step for the assets box", () => {
    expect(TOUR_STEPS.some(s => s.dock === "top")).toBe(true);
  });

  it("every step has a title and text", () => {
    for (const s of TOUR_STEPS) {
      expect(s.title.trim()).not.toBe("");
      expect(s.body.trim()).not.toBe("");
    }
  });
});
