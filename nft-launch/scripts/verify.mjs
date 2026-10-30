// On-chain verification: receipt, exact runtime code match, identity and spec constants.
// usage: node verify.mjs <txHash|-> <contractAddress> <artifact.json> [ownerWallet]
import fs from "node:fs";
import path from "node:path";
import { req } from "./deps.mjs";

const { keccak_256 } = req("js-sha3", path.dirname(path.resolve(process.argv[4] || ".")));

const [TX, C, artifactPath, WALLET] = process.argv.slice(2);
if (!C || !artifactPath || !fs.existsSync(path.resolve(artifactPath))) {
  console.error("usage: node verify.mjs <txHash|-> <contractAddress> <artifact.json> [ownerWallet]");
  process.exit(1);
}
const ART = JSON.parse(fs.readFileSync(path.resolve(artifactPath), "utf8"));
const RPCS = ["https://bsc-rpc.publicnode.com", "https://1rpc.io/bnb", "https://bsc-dataseed.binance.org"];

const call = async (m, p) => {
  for (const u of RPCS) {
    try {
      const r = await fetch(u, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }),
      });
      const t = await r.text();
      if (!t.trim().startsWith("{")) continue;
      const j = JSON.parse(t);
      if (j.result !== undefined && !j.error) return j.result;
    } catch {}
  }
  return null;
};
const sel = (s) => keccak_256(s).slice(0, 8);
const ethCall = (data) => call("eth_call", [{ to: C, data }, "latest"]);
const decodeStr = (hex) => {
  const b = Buffer.from(hex.slice(2), "hex");
  const len = parseInt(b.slice(32, 64).toString("hex"), 16);
  return b.slice(64, 64 + len).toString("utf8");
};
const addr = (hex) => "0x" + hex.slice(-40);
let failed = false;

if (TX && TX !== "-") {
  const rc = await call("eth_getTransactionReceipt", [TX]);
  if (!rc) {
    console.log("receipt not found yet:", TX);
    process.exit(2);
  }
  console.log(
    "receipt status:",
    rc.status,
    "| block:",
    parseInt(rc.blockNumber, 16),
    "| gasUsed:",
    parseInt(rc.gasUsed, 16),
    "| fee:",
    (parseInt(rc.gasUsed, 16) * parseInt(rc.effectiveGasPrice, 16)) / 1e18,
    "BNB"
  );
  if (rc.status !== "0x1") {
    console.log("TX REVERTED ❌");
    process.exit(1);
  }
}

const code = await call("eth_getCode", [C, "latest"]);
if (!code || code === "0x") {
  console.log("NO CODE AT ADDRESS ❌", C);
  process.exit(1);
}
const match = code.toLowerCase() === ART.deployedBytecode.toLowerCase();
console.log("code length:", (code.length - 2) / 2, "| expected:", (ART.deployedBytecode.length - 2) / 2, "| EXACT MATCH:", match);
if (!match) failed = true;

const read = async (sig) => {
  const r = await ethCall("0x" + sel(sig));
  if (!r || r === "0x") return null;
  return r;
};
const str = async (sig) => {
  const r = await read(sig);
  return r ? decodeStr(r) : null;
};
const num = async (sig) => {
  const r = await read(sig);
  return r ? BigInt(r).toString() : null;
};

const name = await str("name()");
const symbol = await str("symbol()");
const ownerHex = await read("owner()");
const owner = ownerHex ? addr(ownerHex) : null;
const supply = await num("totalSupply()");
console.log(`name=${name} symbol=${symbol} owner=${owner || "?"} totalSupply=${supply}`);
if (WALLET && owner && owner.toLowerCase() !== WALLET.toLowerCase()) {
  console.log("OWNER IS NOT THE EXPECTED WALLET ❌");
  failed = true;
}
for (const k of ["MAX_SUPPLY", "FREE_SUPPLY", "MAX_PAID_PER_WALLET"]) {
  const v = await num(k + "()");
  if (v !== null) console.log(k + "=" + v);
}
const price = await num("PRICE()");
if (price !== null) console.log("PRICE=" + price, "wei =", Number(price) / 1e18, "BNB");

console.log(failed ? "VERIFY FAILED ❌" : "VERIFY OK ✅ (check constants match the agreed spec)");
process.exit(failed ? 1 : 0);
