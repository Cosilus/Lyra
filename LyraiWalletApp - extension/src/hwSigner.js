// An ethers signer whose key stays on a hardware wallet (OneKey, Trezor).
// `device` signs: { signTransaction(path, tx), signMessage(path, hexNo0x),
// signTypedData(path, payload, domainHash, messageHash) }, each resolving with
// what the device returned. Everything that sends a transaction with a normal
// signer works with it (sends, swaps, bridges, stakes, one step after the other).
import { ethers } from "ethers";

const hex = (v) => "0x" + BigInt(v ?? 0).toString(16);
const with0x = (h) => (String(h).startsWith("0x") ? String(h) : "0x" + h);
const yParity = (v) => { const n = Number(v); return n <= 1 ? n : n >= 35 ? (n - 35) % 2 : n - 27; };

export class HardwareSigner extends ethers.AbstractSigner {
  constructor(address, path, provider, device, onPrompt = null) {
    super(provider);
    this.address = address;
    this.path = path;
    this.device = device;
    this.onPrompt = onPrompt;
  }
  async getAddress() { return this.address; }
  connect(provider) { return new HardwareSigner(this.address, this.path, provider, this.device, this.onPrompt); }

  async signTransaction(request) {
    const tx = ethers.copyRequest(request);
    const { to, from } = await ethers.resolveProperties({
      to: tx.to ? ethers.resolveAddress(tx.to, this) : undefined,
      from: tx.from ? ethers.resolveAddress(tx.from, this) : undefined,
    });
    if (to != null) tx.to = to;
    if (from != null) {
      if (ethers.getAddress(from) !== ethers.getAddress(this.address)) throw new Error("This transaction isn't from the hardware wallet's address.");
      delete tx.from;
    }
    const btx = ethers.Transaction.from(tx);
    const base = { to: btx.to || "", value: hex(btx.value), gasLimit: hex(btx.gasLimit), nonce: hex(btx.nonce), data: btx.data || "0x", chainId: Number(btx.chainId) };
    const unsigned = btx.type === 2
      ? { ...base, maxFeePerGas: hex(btx.maxFeePerGas), maxPriorityFeePerGas: hex(btx.maxPriorityFeePerGas) }
      : { ...base, gasPrice: hex(btx.gasPrice) };
    const sig = await this.device.signTransaction(this.path, unsigned, this.onPrompt);
    btx.signature = ethers.Signature.from({ r: with0x(sig.r), s: with0x(sig.s), yParity: yParity(sig.v) });
    return btx.serialized;
  }

  async signMessage(message) {
    const bytes = typeof message === "string" ? ethers.toUtf8Bytes(message) : message;
    return with0x(await this.device.signMessage(this.path, ethers.hexlify(bytes).slice(2), this.onPrompt));
  }

  async signTypedData(domain, types, value) {
    const payload = ethers.TypedDataEncoder.getPayload(domain, types, value);
    return with0x(await this.device.signTypedData(
      this.path,
      payload,
      ethers.TypedDataEncoder.hashDomain(domain),
      ethers.TypedDataEncoder.from(types).hash(value),
      this.onPrompt,
    ));
  }
}
