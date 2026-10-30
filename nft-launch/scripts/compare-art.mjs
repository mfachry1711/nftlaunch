// Prove the local JS mirror of render() matches the artwork the chain actually serves.
// The mirror module must export: render(seed: bigint, id: number|bigint): string
// usage: node compare-art.mjs <contractAddress> <path/to/mirror.mjs> [tokenCount]
import path from "node:path";
import fs from "node:fs";
import { req } from "./deps.mjs";

const [C, mirrorPath, countArg] = process.argv.slice(2);
if (!C || !mirrorPath || !fs.existsSync(path.resolve(mirrorPath))) {
  console.error("usage: node compare-art.mjs <contractAddress> <path/to/mirror.mjs> [tokenCount]");
  process.exit(1);
}
const { keccak_256 } = req("js-sha3", path.dirname(path.resolve(mirrorPath)));

const { render } = await import(path.resolve(mirrorPath));
if (typeof render !== "function") {
  console.error("mirror must export render(seed, id)");
  process.exit(1);
}
const N = Number(countArg || 3);
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
const word = (n) => BigInt(n).toString(16).padStart(64, "0");
const decodeStr = (hex) => {
  const b = Buffer.from(hex.slice(2), "hex");
  const len = parseInt(b.slice(32, 64).toString("hex"), 16);
  return b.slice(64, 64 + len).toString("utf8");
};
const ethCall = (d) => call("eth_call", [{ to: C, data: d }, "latest"]);

const supply = Number(BigInt((await ethCall("0x" + sel("totalSupply()"))) || "0x0"));
if (!supply) {
  console.log("no tokens minted yet — nothing to compare");
  process.exit(0);
}
let all = true;
for (let id = 1; id <= Math.min(N, supply); id++) {
  const seedHex = await ethCall("0x" + sel("seedOf(uint256)") + word(id));
  if (!seedHex || BigInt(seedHex) === 0n) continue;
  const seed = BigInt(seedHex);
  const onchain = decodeStr(await ethCall("0x" + sel("render(uint256,uint256)") + word(seed) + word(id)));
  const local = render(seed, id);
  const ok = onchain === local;
  all = all && ok;
  console.log(`#${id} mirror == on-chain: ${ok} (${onchain.length} chars)`);
}
console.log(all ? "ART MIRROR MATCHES CHAIN ✅" : "ART MIRROR DIFFERS ❌");
process.exit(all ? 0 : 1);