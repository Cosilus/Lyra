// Order construction, signing and submission. Ported from Lyra-iWallet's
// App.jsx (resolvePolymarketMaker, signPolymarketOrderERC1271,
// executePredictionTicket, walkOrderBookLevels). See that file's
// comments for the full derivation/verification history of the tricky
// parts (ERC-1271 nested-signature wrapper in particular). Only the
// BUY side is implemented, matching this bot's job (enter a directional
// bet, never hold/cash out early).
import { ethers } from "ethers";
import {
  CLOB_API_BASE,
  ERC20_ABI,
  POLYMARKET_BYTES32_ZERO,
  POLYMARKET_CONTRACTS,
  POLYMARKET_DEPOSIT_WALLET_DOMAIN_NAME,
  POLYMARKET_DEPOSIT_WALLET_DOMAIN_VERSION,
  POLYMARKET_ORDER_DOMAIN_NAME,
  POLYMARKET_ORDER_DOMAIN_VERSION,
  POLYMARKET_ORDER_SIDE_BUY,
  POLYMARKET_ORDER_TYPES,
  POLYMARKET_PUSD_COLLATERAL,
  POLYMARKET_SIGNATURE_TYPE_EOA,
  POLYMARKET_SIGNATURE_TYPE_GNOSIS_SAFE,
  POLYMARKET_SIGNATURE_TYPE_POLY_1271,
  USDCE,
} from "./polymarketConfig.js";
import { buildPolyHmacSignature } from "./clobAuth.js";
import { fetchJson } from "./net.js";

// Figures out who the actual order "maker" (fund source) is for this
// wallet: a Polymarket 2026 deposit wallet (mandatory migration) if one
// is deployed for this owner, else a legacy Gnosis Safe, else the plain
// EOA acting as its own maker.
export async function resolvePolymarketMaker(wallet, exchangeAddress) {
  const signerAddress = await wallet.getAddress();
  const provider = wallet.provider;

  const factory = new ethers.Contract(POLYMARKET_CONTRACTS.depositWalletFactory, [
    "function predictWalletAddress(address,bytes32) view returns (address)",
    "function implementation() view returns (address)",
  ], provider);
  const currentImplementation = await factory.implementation();
  const ownerAsId = ethers.zeroPadValue(signerAddress, 32);
  const depositWalletAddress = await factory.predictWalletAddress(currentImplementation, ownerAsId);
  const depositCode = await provider.getCode(depositWalletAddress);
  if (depositCode && depositCode !== "0x") {
    return { maker: depositWalletAddress, signatureType: POLYMARKET_SIGNATURE_TYPE_POLY_1271 };
  }

  const exchange = new ethers.Contract(exchangeAddress, ["function getSafeWalletAddress(address) view returns (address)"], provider);
  const safeAddress = await exchange.getSafeWalletAddress(signerAddress);
  const code = await provider.getCode(safeAddress);
  if (code && code !== "0x") {
    return { maker: safeAddress, signatureType: POLYMARKET_SIGNATURE_TYPE_GNOSIS_SAFE };
  }
  return { maker: signerAddress, signatureType: POLYMARKET_SIGNATURE_TYPE_EOA };
}

// ERC-1271 nested-signature wrapper for a POLY_1271 (deposit wallet)
// maker. See App.jsx's signPolymarketOrderERC1271 for the full field-
// by-field derivation against Polymarket's own rs-clob-client-v2.
export function signPolymarketOrderERC1271(wallet, exchangeAddress, order, depositWalletAddress) {
  const ORDER_TYPE_STRING = "Order(uint256 salt,address maker,address signer,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint8 side,uint8 signatureType,uint256 timestamp,bytes32 metadata,bytes32 builder)";
  const SOLADY_TYPE_STRING =
    "TypedDataSign(Order contents,string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)" +
    ORDER_TYPE_STRING;

  const contentsHash = ethers.TypedDataEncoder.hashStruct("Order", { Order: POLYMARKET_ORDER_TYPES.Order }, order);
  const appDomainSep = ethers.TypedDataEncoder.hashDomain({
    name: POLYMARKET_ORDER_DOMAIN_NAME,
    version: POLYMARKET_ORDER_DOMAIN_VERSION,
    chainId: 137,
    verifyingContract: exchangeAddress,
  });

  const typedDataSignStructHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "bytes32", "bytes32", "bytes32", "uint256", "address", "bytes32"],
      [
        ethers.keccak256(ethers.toUtf8Bytes(SOLADY_TYPE_STRING)),
        contentsHash,
        ethers.keccak256(ethers.toUtf8Bytes(POLYMARKET_DEPOSIT_WALLET_DOMAIN_NAME)),
        ethers.keccak256(ethers.toUtf8Bytes(POLYMARKET_DEPOSIT_WALLET_DOMAIN_VERSION)),
        137,
        depositWalletAddress,
        POLYMARKET_BYTES32_ZERO,
      ]
    )
  );
  const digest = ethers.keccak256(ethers.concat(["0x1901", appDomainSep, typedDataSignStructHash]));

  // Raw digest signature (not signTypedData/personal_sign): only valid
  // because `wallet` here is always a local ethers.Wallet holding the
  // raw key directly, matching signer.sign_hash() in the Rust reference.
  const innerSig = wallet.signingKey.sign(digest).serialized;

  const contentsTypeHex = ethers.hexlify(ethers.toUtf8Bytes(ORDER_TYPE_STRING));
  const lenHex = ORDER_TYPE_STRING.length.toString(16).padStart(4, "0");

  return innerSig + appDomainSep.slice(2) + contentsHash.slice(2) + contentsTypeHex.slice(2) + lenHex;
}

function truncateToDecimals(num, decimals) {
  const factor = 10 ** decimals;
  return Math.floor(num * factor) / factor;
}

// Walks one side of the live order book from the best price outward,
// accumulating accumulate(level) until it covers `target`. FOK
// semantics: if the whole book can't cover the target, return null
// rather than guessing a worse fill.
function walkOrderBookLevels(levels, target, accumulate) {
  if (!levels?.length) return null;
  let total = 0;
  for (let i = levels.length - 1; i >= 0; i--) {
    total += accumulate(levels[i]);
    if (total >= target) return Number(levels[i].price);
  }
  return null;
}

export async function getOrderBook(tokenId) {
  const res = await fetchJson(`${CLOB_API_BASE}/book?token_id=${tokenId}`);
  if (!res.ok) throw new Error(`Couldn't read Polymarket's order book (HTTP ${res.status}).`);
  return res.data;
}

// The exact price a FOK market BUY needs to guarantee `targetUsd` fills
// immediately (mirrors calculate_price in Polymarket's own order_builder.rs).
export function getMarketablePriceFromBook(book, targetUsd) {
  const price = walkOrderBookLevels(book.asks, targetUsd, l => Number(l.size) * Number(l.price));
  if (price == null) {
    throw new Error("Not enough liquidity in this market to fill the full stake right now.");
  }
  return price;
}

function buildMarketBuyAmounts(stakeAmount, price) {
  const rawMakerAmt = truncateToDecimals(stakeAmount, 2);
  const rawTakerAmt = truncateToDecimals(rawMakerAmt / price, 4);
  return { rawMakerAmt, rawTakerAmt };
}

async function submitClobOrder(creds, signedOrder, orderType) {
  const requestPath = "/order";
  const orderPayload = {
    deferExec: false,
    postOnly: false,
    order: {
      salt: Number(signedOrder.salt),
      maker: signedOrder.maker,
      signer: signedOrder.signer,
      tokenId: signedOrder.tokenId,
      makerAmount: signedOrder.makerAmount,
      takerAmount: signedOrder.takerAmount,
      side: signedOrder.side === POLYMARKET_ORDER_SIDE_BUY ? "BUY" : "SELL",
      signatureType: signedOrder.signatureType,
      timestamp: signedOrder.timestamp,
      expiration: "0",
      metadata: signedOrder.metadata,
      builder: signedOrder.builder,
      signature: signedOrder.signature,
    },
    owner: creds.key,
    orderType,
  };
  const body = JSON.stringify(orderPayload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = buildPolyHmacSignature(creds.secret, timestamp, "POST", requestPath, body);

  const res = await fetchJson(`${CLOB_API_BASE}${requestPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      POLY_ADDRESS: creds.address,
      POLY_SIGNATURE: signature,
      POLY_TIMESTAMP: String(timestamp),
      POLY_API_KEY: creds.key,
      POLY_PASSPHRASE: creds.passphrase,
    },
    body,
  });
  if (!res.ok || res.data?.error) {
    throw new Error(res.data?.error || res.data?.errorMsg || `Polymarket rejected the order (HTTP ${res.status}).`);
  }
  return res.data;
}

// Places an immediate FOK market BUY of `stakeUsd` on one outcome token.
// Returns the fill result. Throws (never places a partial/guessed order)
// if allowance is missing for a deposit-wallet maker (that one-time
// approval has to be set on polymarket.com itself, see comment below)
// or if the book can't cover the full stake.
export async function placeMarketBuy({ wallet, creds, tokenId, negRisk, stakeUsd }) {
  const exchangeAddress = negRisk ? POLYMARKET_CONTRACTS.negRiskExchange : POLYMARKET_CONTRACTS.ctfExchange;
  const signerAddress = await wallet.getAddress();
  const { maker, signatureType } = await resolvePolymarketMaker(wallet, exchangeAddress);

  const book = await getOrderBook(tokenId);
  const price = getMarketablePriceFromBook(book, stakeUsd);

  const collateral = signatureType === POLYMARKET_SIGNATURE_TYPE_POLY_1271 ? POLYMARKET_PUSD_COLLATERAL : USDCE;
  const { rawMakerAmt, rawTakerAmt } = buildMarketBuyAmounts(stakeUsd, price);
  const makerAmount = ethers.parseUnits(rawMakerAmt.toFixed(6), collateral.decimals);
  const takerAmount = ethers.parseUnits(rawTakerAmt.toFixed(6), collateral.decimals);

  const collateralContract = new ethers.Contract(collateral.address, ERC20_ABI, wallet);
  const currentAllowance = await collateralContract.allowance(maker, exchangeAddress);
  if (currentAllowance < makerAmount) {
    if (signatureType === POLYMARKET_SIGNATURE_TYPE_POLY_1271) {
      throw new Error(
        `This Polymarket account hasn't approved ${collateral.symbol} spending to the exchange yet. ` +
        `The bot can't set that up for a deposit wallet (its execute() is relayer-only). Place one small ` +
        `manual trade on polymarket.com first, that sets the approval, then rerun the bot.`
      );
    }
    if (maker.toLowerCase() === signerAddress.toLowerCase()) {
      const tx = await collateralContract.approve(exchangeAddress, ethers.MaxUint256);
      await tx.wait();
    } else {
      throw new Error("This wallet trades through a legacy Polymarket Safe that hasn't approved the exchange yet. Approve it once on polymarket.com, then rerun the bot.");
    }
  }

  const orderSigner = signatureType === POLYMARKET_SIGNATURE_TYPE_POLY_1271 ? maker : signerAddress;
  const order = {
    salt: Math.round(Math.random() * Date.now()).toString(),
    maker,
    signer: orderSigner,
    tokenId,
    makerAmount: makerAmount.toString(),
    takerAmount: takerAmount.toString(),
    side: POLYMARKET_ORDER_SIDE_BUY,
    signatureType,
    timestamp: Date.now().toString(),
    metadata: POLYMARKET_BYTES32_ZERO,
    builder: POLYMARKET_BYTES32_ZERO,
  };

  let signature;
  if (signatureType === POLYMARKET_SIGNATURE_TYPE_POLY_1271) {
    signature = signPolymarketOrderERC1271(wallet, exchangeAddress, order, maker);
  } else {
    const domain = {
      name: POLYMARKET_ORDER_DOMAIN_NAME,
      version: POLYMARKET_ORDER_DOMAIN_VERSION,
      chainId: 137,
      verifyingContract: exchangeAddress,
    };
    signature = await wallet.signTypedData(domain, POLYMARKET_ORDER_TYPES, order);
  }

  const signedOrder = { ...order, signature };
  const result = await submitClobOrder(creds, signedOrder, "FOK");
  return { result, price, stakeUsd };
}
