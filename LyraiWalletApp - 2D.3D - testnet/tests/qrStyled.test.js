import { describe, it, expect } from "vitest";
import { qrStyledDataUrl } from "../src/qrStyled.js";

const svgOf = (text) => decodeURIComponent(qrStyledDataUrl(text).split(",")[1]);

describe("qrStyledDataUrl", () => {
  const address = "0x08cc14295C471b63415E5Eb22375D1E7CE44ba55";

  it("returns an SVG data URL", () => {
    expect(qrStyledDataUrl(address).startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    const svg = svgOf(address);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("is deterministic and depends on the text", () => {
    expect(qrStyledDataUrl(address)).toBe(qrStyledDataUrl(address));
    expect(qrStyledDataUrl(address)).not.toBe(qrStyledDataUrl(address.replace("0x08", "0x09")));
  });

  it("draws the three corner eyes and the logo badge", () => {
    const svg = svgOf(address);
    // each eye = outer ring + inner hole + centre dot (3 rects)
    expect(svg.match(/<rect x="\d+" y="\d+" width="7" height="7"/g)).toHaveLength(3);
    // pearl tile, badge ring, badge and the sparkle path
    expect(svg).toContain('fill="#FBF8FF"');
    expect(svg).toContain('fill="#fff"');
    expect(svg).toContain("linearGradient");
  });

  it("leaves the centre clear for the logo (no data path through it)", () => {
    const svg = svgOf(address);
    const viewBox = svg.match(/viewBox="0 0 (\d+) \d+"/);
    expect(Number(viewBox[1])).toBeGreaterThan(20);
  });

  it("works for the payment-link QR too", () => {
    expect(() => qrStyledDataUrl("https://pay.lyra.wallet/r/AB12CD34")).not.toThrow();
  });
});
