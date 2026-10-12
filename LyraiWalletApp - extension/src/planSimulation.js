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
// Circle: Swap Kit's Adapter Contract (same address on every chain of a
// kind) and CCTP v2 (TokenMessengerV2, domains), for plans built ahead
const CIRCLE_ADAPTER = { mainnet: "0x7FB8c7260b63934d8da38aF902f87ae6e284a845", testnet: "0xBBD70b01a1CAbc96d5b7b129Ae1AAabdf50dd40b" };
const CCTP_TOKEN_MESSENGER = { mainnet: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d", testnet: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" };
const CCTP_DOMAIN = { ethereum: 0, base: 6, polygon: 7, hyperliquid: 19, arc: 26, plasma: 33 };
const IRIS = { mainnet: "https://iris-api.circle.com", testnet: "https://iris-api-sandbox.circle.com" };
// Arc's USDC is the native coin (18 decimals); its ERC-20 face has 6
const ARC_USDC = "0x3600000000000000000000000000000000000000";
// "cctp-forward" frame: Circle's relayer mints on the destination itself
const CCTP_FORWARD_HOOK = "0x" + [..."cctp-forward"].map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("").padEnd(48, "0") + "0000000000000000";
const CIRCLE_ADAPTER_I = new ethers.Interface(["function execute(((address target,bytes data,uint256 value,address tokenIn,uint256 amountToApprove,address tokenOut,uint256 minTokenOut)[] instructions,(address token,address beneficiary)[] tokens,uint256 execId,uint256 deadline,bytes metadata) params,(uint8 permitType,address token,uint256 amount,bytes permitCalldata)[] tokenInputs,bytes signature) payable"]);
const TOKEN_MESSENGER_I = new ethers.Interface(["function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold, bytes hookData)"]);

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

    } else if (step.kind === "swap" && (ctx.networkKey === "arc" || ctx.isTestnet || !ctx.network.kyberSlug)) {
      // Circle's Swap Kit: its service signs the route, the Adapter Contract runs it
      const kind = ctx.isTestnet ? "testnet" : "mainnet";
      const erc20Of = (sym) => (sym === ctx.nativeSymbol && ctx.networkKey === "arc" ? { address: ARC_USDC, decimals: 6 } : ctx.tokens[sym]);
      const tIn = erc20Of(step.asset), tOut = erc20Of(step.tokenOutSymbol);
      let amountIn = rawAmount(step);
      if (!amountIn || !tIn?.address || !tOut?.address || !ctx.circleChain) { skipped.push(i); carried = null; continue; }
      // the native coin's 18 decimals -> its ERC-20 face's 6
      if (step.asset === ctx.nativeSymbol && ctx.networkKey === "arc") amountIn = amountIn / 10n ** 12n;
      const res = await fetch("https://api.circle.com/v1/stablecoinKits/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenInAddress: tIn.address, tokenInChain: ctx.circleChain, tokenOutAddress: tOut.address, tokenOutChain: ctx.circleChain,
          fromAddress: ctx.from, toAddress: ctx.from, amount: amountIn.toString(),
          slippageBps: Math.round((step.ticket?.slippage ?? ctx.slippage) * 10000),
        }),
      });
      const q = await res.json();
      const p = q?.transaction?.executionParams;
      if (!res.ok || !p || !q.transaction.signature) throw new Error("The swap couldn't be prepared.");
      const instructions = p.instructions.map(x => [x.target, x.data, BigInt(x.value), x.tokenIn, BigInt(x.amountToApprove), x.tokenOut, BigInt(x.minTokenOut)]);
      const value = p.instructions.reduce((sum, x) => sum + BigInt(x.value), 0n);
      push({ to: tIn.address, data: ERC20.encodeFunctionData("approve", [CIRCLE_ADAPTER[kind], BigInt(q.amount)]) });
      push({
        to: CIRCLE_ADAPTER[kind],
        value,
        data: CIRCLE_ADAPTER_I.encodeFunctionData("execute", [
          [instructions, p.tokens.map(x => [x.token, x.beneficiary]), BigInt(p.execId), BigInt(p.deadline), p.metadata],
          [[0, tIn.address, BigInt(q.amount), "0x"]],
          q.transaction.signature,
        ]),
      });
      let min = BigInt(q.stopLimit || 0);
      if (step.tokenOutSymbol === ctx.nativeSymbol && ctx.networkKey === "arc") min = min * 10n ** 12n;
      carried = min > 0n ? { symbol: step.tokenOutSymbol, raw: min } : null;

    } else if (step.kind === "swap") {
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

    } else if (step.kind === "bridge" && (ctx.isTestnet || ctx.networkKey === "arc" || step.destinationChainKey === "arc" || !ctx.defi.lifi?.diamond)) {
      // Circle CCTP v2, "forward": burn here, Circle's relayer mints there (its fee
      // comes out of the bridged USDC), so no second signature on the destination
      const kind = ctx.isTestnet ? "testnet" : "mainnet";
      const destKey = CCTP_DOMAIN[step.destinationChainKey] !== undefined ? step.destinationChainKey : ctx.networkKeyOfLifi?.(step.destinationChainKey);
      const srcDomain = CCTP_DOMAIN[ctx.networkKey], dstDomain = CCTP_DOMAIN[destKey];
      const usdc = ctx.networkKey === "arc" ? ARC_USDC : ctx.tokens.USDC?.address;
      let amount = rawAmount(step);
      if (step.asset !== "USDC" || (step.tokenOutSymbol && step.tokenOutSymbol !== "USDC") || srcDomain === undefined || dstDomain === undefined || !usdc || !amount) { skipped.push(i); carried = null; continue; }
      if (ctx.networkKey === "arc") amount = amount / 10n ** 12n;
      const tiers = await (await fetch(`${IRIS[kind]}/v2/burn/USDC/fees/${srcDomain}/${dstDomain}?forward=true`)).json();
      const tier = Array.isArray(tiers) ? tiers.find(t => t.finalityThreshold === 1000) || tiers[0] : null;
      if (!tier) throw new Error("No bridge route right now.");
      const maxFee = (amount * BigInt(Math.ceil(Number(tier.minimumFee || 0) * 100))) / 1000000n + BigInt(tier.forwardFee?.high || 0);
      push({ to: usdc, data: ERC20.encodeFunctionData("approve", [CCTP_TOKEN_MESSENGER[kind], amount]) });
      push({
        to: CCTP_TOKEN_MESSENGER[kind],
        data: TOKEN_MESSENGER_I.encodeFunctionData("depositForBurnWithHook", [amount, dstDomain, ethers.zeroPadValue(ctx.from, 32), usdc, ethers.ZeroHash, maxFee, tier.finalityThreshold, CCTP_FORWARD_HOOK]),
      });
      carried = null;

    } else if (step.kind === "bridge") {
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
