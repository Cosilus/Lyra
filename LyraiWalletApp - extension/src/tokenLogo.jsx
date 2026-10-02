import { useState } from "react";

// Logos of the tokens the wallet can hold, bundled in public/tokens (no network request, works offline).
// Keyed by the token symbol the wallet uses; "USDC.e"-style suffixes are ignored.
const FILES = {
  XPL: "xpl.svg",
  ETH: "eth.svg",
  WETH: "eth.svg",
  POL: "pol.svg",
  MATIC: "pol.svg",
  HYPE: "hype.svg",
  USDC: "usdc.svg",
  USDT: "usdt.svg",
  USDT0: "usdt0.svg",
  EURC: "eurc.svg",
};

export function tokenLogoUrl(symbol) {
  const key = String(symbol || "").toUpperCase().split(".")[0];
  const file = FILES[key];
  return file ? `${import.meta.env.BASE_URL}tokens/${file}` : null;
}

// The token's logo, or `fallback` when there is none (or it fails to load).
export function TokenLogo({ symbol, size = 20, fallback = null, className = "" }) {
  const [failed, setFailed] = useState(false);
  const url = tokenLogoUrl(symbol);
  if (!url || failed) return fallback;
  return (
    <img
      className={`token-logo ${className}`.trim()}
      src={url}
      alt={symbol}
      width={size}
      height={size}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
