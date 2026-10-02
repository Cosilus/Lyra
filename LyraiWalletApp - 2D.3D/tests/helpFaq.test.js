import { describe, it, expect } from "vitest";
import { HELP_FAQ } from "../src/three-d/helpFaq.js";

describe("Help FAQ content", () => {
  it("has the expected tabs, Message Lyra first", () => {
    expect(HELP_FAQ.map(g => g.id)).toEqual(["message", "basics", "send", "actions", "security", "ui"]);
    expect(HELP_FAQ[0].label).toBe("Message Lyra");
  });

  it("has unique tab ids and labels", () => {
    expect(new Set(HELP_FAQ.map(g => g.id)).size).toBe(HELP_FAQ.length);
    expect(new Set(HELP_FAQ.map(g => g.label)).size).toBe(HELP_FAQ.length);
  });

  it("every question has a non-empty answer and questions are unique", () => {
    const seen = new Set();
    for (const g of HELP_FAQ) {
      expect(g.items.length).toBeGreaterThan(0);
      for (const item of g.items) {
        expect(item.q.trim()).not.toBe("");
        expect(item.a.trim()).not.toBe("");
        expect(seen.has(item.q)).toBe(false);
        seen.add(item.q);
        if (item.chips) {
          expect(Array.isArray(item.chips)).toBe(true);
          item.chips.forEach(c => expect(typeof c).toBe("string"));
        }
      }
    }
  });

  it("keeps Message Lyra short enough to avoid an immediate scrollbar", () => {
    expect(HELP_FAQ[0].items.length).toBeLessThanOrEqual(5);
  });

  it("does not bring back the removed agents / predictions topics as tabs", () => {
    const labels = HELP_FAQ.map(g => g.label.toLowerCase()).join(" ");
    expect(labels).not.toMatch(/agent|prediction|payment/);
  });
});
