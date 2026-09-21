// "Late-window confirmation" strategy.
//
// The market resolves on whether BTC's price at window-close is above or
// below its price at window-open. Blindly guessing direction from
// momentum has no demonstrated edge and just bleeds to spread/fees over
// many bets. Instead, this waits until near the very end of the
// 5-minute window: if BTC has already moved meaningfully from the
// window's open price, the outcome is close to locked in (only a sharp
// reversal in the last few seconds changes it), and Polymarket's own
// odds for that side may not have fully caught up yet. That gap is the
// edge being targeted. It is real but small and NOT guaranteed: a
// reversal in the closing seconds, thin book liquidity, or the market
// already having caught up (price near 0.97+) all erase it, which is
// exactly what the entry-window/threshold/price-band config guards
// against.
//
// Returns { side: "Up" | "Down", confidence } or null if there's nothing
// worth doing this round (too early in the window, move too small, or
// no edge left in the book price).
export function decideEntry({
  now,
  windowStart,
  windowEnd,
  openPrice,
  currentPrice,
  upOutcomePrice,
  downOutcomePrice,
  entryWindowFraction,
  minMoveThreshold,
  maxEntryPrice,
  minEntryPrice,
}) {
  const totalWindow = windowEnd - windowStart;
  const elapsed = now - windowStart;
  if (totalWindow <= 0 || elapsed / totalWindow < entryWindowFraction) {
    return null; // too early in the window, direction not decided enough yet
  }

  const move = (currentPrice - openPrice) / openPrice;
  if (Math.abs(move) < minMoveThreshold) {
    return null; // move too small to call, this round is noise
  }

  const side = move > 0 ? "Up" : "Down";
  const sidePrice = side === "Up" ? upOutcomePrice : downOutcomePrice;
  if (sidePrice == null) return null;

  if (sidePrice > maxEntryPrice) {
    return null; // market already caught up, no edge left
  }
  if (sidePrice < minEntryPrice) {
    return null; // book disagrees hard with our read, likely stale/bad data
  }

  return { side, entryPrice: sidePrice, movePct: move * 100 };
}
