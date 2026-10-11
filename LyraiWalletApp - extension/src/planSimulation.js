// Turns a plan's steps into the exact transactions they would send (same
// contracts, same quotes as the real run), WITHOUT signing anything, so the
// server can simulate them as one block (POST /api/simulate/plan) and the plan
// card can show the result before confirming. Steps that can't be built ahead
// (Circle's kits on Arc, a Polymarket bet) are listed as skipped.
import { ethers } from "ethers";

const ERC20 = new ethers.Interface([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
const AAVE_POOL = new ethers.Interface([
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
  "function withdraw(address asset, uint256 amount, address to) returns (uint256)",
]);
const AAVE_V4_SPOKE = new ethers.Interface([
  "function supply(uint256 reserveId, uint256 amount, address onBehalfOf) returns (uint256, uint256)",
  "function withdraw(uint256 reserveId, uint256 amount, address onBehalfOf) returns (uint256, uint256)",
]);

// ctx: { from, network, networkKey, isTestnet, tokens, defi, nativeSymbol,
//        nativePseudo, slippage, kyberBase, kyberClientId, lifiQuoteUrl,
//        aaveV4Reserve(asset), suppliedV4(reserve) }
export async function buildPlanCalls(steps, ctx) {
  const calls = [];
  const skipped = [];
  // what the previous step guarantees (swap minimum out, raw units + symbol)
  let carried = null;

  const decimalsOf = (asset) => (asset === ctx.nativeSymbol ? 18 : ctx.tokens[asset]?.decimals ?? 18);
  const rawAmount = (step) => {
    if (step.amountIsEstimate && carried && carried.symbol === step.asset) return carried.raw;
    const n = Number(step.amount);
    if (!Number.isFinite(n) || n <= 0) return null;
    return ethers.parseUnits(n.toFixed(Math.min(decimalsOf(step.asset), 8)), decimalsOf(step.asset));
  };

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const push = (tx) => calls.push({ ...tx, value: tx.value ? tx.value.toString() : "0", step: i });

    if (step.kind === "send") {
      const amount = rawAmount(step);
      if (!amount || !ethers.isAddress(step.recipient || "")) { skipped.push(i); carried = null; continue; }
      if (step.asset === ctx.nativeSymbol) push({ to: step.recipient, value: amount });
      else {
        const token = ctx.tokens[step.asset];
        if (!token?.address) { skipped.push(i); continue; }
        push({ to: token.address, data: ERC20.encodeFunctionData("transfer", [step.recipient, amount]) });
      }
      carried = null;

    } else if (step.kind === "swap") {
      // Arc swaps and testnet go through Circle's Swap Kit: no calldata ahead
      if (ctx.networkKey === "arc" || ctx.isTestnet || !ctx.network.kyberSlug) { skipped.push(i); carried = null; continue; }
      const amountIn = rawAmount(step);
      const isNativeIn = step.asset === ctx.nativeSymbol;
      const isNativeOut = step.tokenOutSymbol === ctx.nativeSymbol;
      const tokenIn = isNativeIn ? ctx.nativePseudo : ctx.tokens[step.asset]?.address;
      const tokenOut = isNativeOut ? ctx.nativePseudo : ctx.tokens[step.tokenOutSymbol]?.address;
      if (!amountIn || !tokenIn || !tokenOut) { skipped.push(i); carried = null; continue; }
      const routeUrl = new URL(`${ctx.kyberBase(ctx.network.kyberSlug)}/routes`);
      routeUrl.searchParams.set("tokenIn", tokenIn);
      routeUrl.searchParams.set("tokenOut", tokenOut);
      routeUrl.searchParams.set("amountIn", amountIn.toString());
      const route = await (await fetch(routeUrl, { headers: { "X-Client-Id": ctx.kyberClientId } })).json();
      if (!route.data?.routeSummary) throw new Error("No swap route right now.");
      const slippage = step.ticket?.slippage ?? ctx.slippage;
      const built = await (await fetch(`${ctx.kyberBase(ctx.network.kyberSlug)}/route/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Id": ctx.kyberClientId },
        body: JSON.stringify({ routeSummary: route.data.routeSummary, sender: ctx.from, recipient: ctx.from, slippageTolerance: Math.round(slippage * 10000) }),
      })).json();
      if (!built.data?.data) throw new Error("The swap couldn't be prepared.");
      if (!isNativeIn) push({ to: tokenIn, data: ERC20.encodeFunctionData("approve", [built.data.routerAddress, amountIn]) });
      push({ to: built.data.routerAddress, data: built.data.data, value: isNativeIn ? amountIn : 0n });
      const out = BigInt(built.data.amountOut || route.data.routeSummary.amountOut || 0);
      carried = out > 0n ? { symbol: step.tokenOutSymbol, raw: (out * BigInt(Math.round((1 - slippage) * 10000))) / 10000n } : null;

    } else if (step.kind === "stake") {
      const amount = rawAmount(step);
      if (!amount) { skipped.push(i); carried = null; continue; }
      const v4 = ctx.aaveV4Reserve(step.asset);
      if (v4) {
        push({ to: v4.address, data: ERC20.encodeFunctionData("approve", [ctx.defi.aaveV4.spoke, amount]) });
        push({ to: ctx.defi.aaveV4.spoke, data: AAVE_V4_SPOKE.encodeFunctionData("supply", [v4.id, amount, ctx.from]) });
      } else {
        const token = ctx.tokens[step.asset];
        if (!token?.address || !ctx.defi.aave?.pool) { skipped.push(i); carried = null; continue; }
        push({ to: token.address, data: ERC20.encodeFunctionData("approve", [ctx.defi.aave.pool, amount]) });
        push({ to: ctx.defi.aave.pool, data: AAVE_POOL.encodeFunctionData("supply", [token.address, amount, ctx.from, 0]) });
      }
      carried = null;

    } else if (step.kind === "unstake") {
      const v4 = ctx.aaveV4Reserve(step.asset);
      const requested = Number(step.amount) > 0 ? rawAmount(step) : null;
      if (v4) {
        const amount = requested || await ctx.suppliedV4(v4);
        if (!amount) { skipped.push(i); carried = null; continue; }
        push({ to: ctx.defi.aaveV4.spoke, data: AAVE_V4_SPOKE.encodeFunctionData("withdraw", [v4.id, amount, ctx.from]) });
      } else {
        const token = ctx.tokens[step.asset];
        if (!token?.address || !ctx.defi.aave?.pool) { skipped.push(i); carried = null; continue; }
        push({ to: ctx.defi.aave.pool, data: AAVE_POOL.encodeFunctionData("withdraw", [token.address, requested || ethers.MaxUint256, ctx.from]) });
      }
      carried = null;

    } else if (step.kind === "bridge") {
      // Circle CCTP (Arc, testnet) has no calldata ahead; LI.FI does
      if (ctx.isTestnet || ctx.networkKey === "arc" || step.destinationChainKey === "arc" || !ctx.defi.lifi?.diamond) { skipped.push(i); carried = null; continue; }
      const amount = rawAmount(step);
      const isNative = step.asset === ctx.nativeSymbol;
      const fromToken = isNative ? ctx.nativePseudo : ctx.tokens[step.asset]?.address;
      if (!amount || !fromToken || !step.destinationChainKey) { skipped.push(i); carried = null; continue; }
      const url = new URL(ctx.lifiQuoteUrl);
      url.searchParams.set("fromChain", String(ctx.network.chainId));
      url.searchParams.set("toChain", step.destinationChainKey);
      url.searchParams.set("fromToken", fromToken);
      url.searchParams.set("toToken", step.tokenOutSymbol || step.asset);
      url.searchParams.set("fromAmount", amount.toString());
      url.searchParams.set("fromAddress", ctx.from);
      url.searchParams.set("slippage", String(step.ticket?.slippage ?? ctx.slippage));
      const quote = await (await fetch(url)).json();
      if (!quote.transactionRequest) throw new Error("No bridge route right now.");
      if (!isNative) push({ to: fromToken, data: ERC20.encodeFunctionData("approve", [quote.estimate?.approvalAddress || ctx.defi.lifi.diamond, amount]) });
      push({ to: quote.transactionRequest.to, data: quote.transactionRequest.data, value: quote.transactionRequest.value ? BigInt(quote.transactionRequest.value) : 0n });
      carried = null;

    } else {
      skipped.push(i);
      carried = null;
    }
  }
  return { calls, skipped };
}
