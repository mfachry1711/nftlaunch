// Read-only rule tests for a contract with mintFree()/mint(uint256)/withdraw() and the .ai gate.
// The script DETECTS the contract's rules instead of assuming them:
//   - price  : reads PRICE() when the contract exposes it, else assumes 0.0001 BNB
//   - gate   : eth_calls mint(1) from a wallet with NO Agent ID — OK means paid mint is open,
//              revert NoAgentId() means the paid mint is gated too.
// usage: node test-rules.mjs <contractAddress> <walletWithAgentId>
import { req } from "./deps.mjs";

const { keccak_256 } = req("js-sha3");

const [C, WALLET] = process.argv.slice(2);
if (!C || !WALLET) {
  console.error("usage: node test-rules.mjs <contractAddress> <walletWithAgentId>");
  process.exit(1);
}
const NO_AGENT = "0x000000000000000000000000000000000000dEaD";
const RPCS = ["https://bsc-rpc.publicnode.com", "https://1rpc.io/bnb", "https://bsc-dataseed.binance.org"];

const sel = (sig) => keccak_256(sig).slice(0, 8);
const word = (n) => n.toString(16).padStart(64, "0");

async function ethCall(obj) {
  for (const u of RPCS) {
    try {
      const r = await fetch(u, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [obj, "latest"] }),
      });
      const j = JSON.parse(await r.text());
      if (j.error) return { revert: j.error.data || j.error.message };
      if (j.result !== undefined) return { ok: j.result };
    } catch {}
  }
  return { fail: "all rpc down" };
}

const errName = (data) => {
  if (!data || data === "0x" || data.length < 10) return data === "0x" ? "(empty revert)" : String(data);
  const hex = data.slice(2, 10);
  for (const e of [
    "NoAgentId()",
    "FreeAlreadyClaimed()",
    "FreeSoldOut()",
    "SoldOut()",
    "WalletLimit()",
    "WrongPayment()",
    "BadQuantity()",
    "OwnableUnauthorizedAccount(address)",
  ]) {
    if (sel(e) === hex) return e;
  }
  return "0x" + hex;
};

const MINT_FREE = "0x" + sel("mintFree()");
const MINT = "0x" + sel("mint(uint256)");
const bnb = (n) => "0x" + BigInt(Math.round(n * 1e18)).toString(16);

// --- detect price and gate from the live contract -------------------------
const priceCall = await ethCall({ from: WALLET, to: C, data: "0x" + sel("PRICE()") });
let PRICE = 0.0001;
if (priceCall.ok && priceCall.ok !== "0x" && priceCall.ok.length > 2) {
  PRICE = Number(BigInt(priceCall.ok)) / 1e18;
}
console.log(`detected PRICE = ${PRICE} BNB`);

const probe = await ethCall({ from: NO_AGENT, to: C, value: bnb(PRICE), data: MINT + word(1) });
const paidOpen = probe.ok !== undefined;
console.log(`detected paid gate = ${paidOpen ? "OPEN (any wallet)" : "requires .ai Agent ID"}\n`);

const results = [];
async function t(label, obj, expect) {
  const r = await ethCall(obj);
  const got = r.ok !== undefined ? "OK" : r.revert !== undefined ? "revert " + errName(r.revert) : JSON.stringify(r);
  results.push([label, got, expect, got.startsWith("OK") === expect.startsWith("OK") ? "PASS" : "FAIL"]);
}

await t("mintFree() dari wallet dengan Agent ID", { from: WALLET, to: C, data: MINT_FREE }, "OK");
await t(`mint(3) bayar ${Number((PRICE * 3).toFixed(8))} BNB`, { from: WALLET, to: C, value: bnb(PRICE * 3), data: MINT + word(3) }, "OK");
await t(`mint(1) bayar ${Number((PRICE / 10).toFixed(8))} (salah bayar)`, { from: WALLET, to: C, value: bnb(PRICE / 10), data: MINT + word(1) }, "revert WrongPayment()");
await t("mint(4) bayar penuh (lewat batas 3)", { from: WALLET, to: C, value: bnb(PRICE * 4), data: MINT + word(4) }, "revert WalletLimit()");
await t("mint(0)", { from: WALLET, to: C, value: "0x0", data: MINT + word(0) }, "revert BadQuantity()");
await t("mintFree() dari wallet tanpa Agent ID", { from: NO_AGENT, to: C, data: MINT_FREE }, "revert NoAgentId()");
await t(
  paidOpen ? "mint(1) dari wallet tanpa Agent ID (paid terbuka)" : "mint(1) dari wallet tanpa Agent ID",
  { from: NO_AGENT, to: C, value: bnb(PRICE), data: MINT + word(1) },
  paidOpen ? "OK" : "revert NoAgentId()"
);
await t("withdraw() dari non-owner", { from: NO_AGENT, to: C, data: "0x" + sel("withdraw()") }, "revert OwnableUnauthorizedAccount(address)");

// --- ERC-2981 royalty (report only: older collections have none) ----------
const SALE = 10n ** 22n; // 10,000 ether so the math stays exact
const w = (b) => b.toString(16).padStart(64, "0");
const roy = await ethCall({
  from: NO_AGENT,
  to: C,
  data: "0x" + sel("royaltyInfo(uint256,uint256)") + w(1n) + w(SALE),
});
if (roy.ok && roy.ok.length >= 130) {
  const receiver = "0x" + roy.ok.slice(26, 66);
  const amount = BigInt("0x" + roy.ok.slice(66, 130));
  const bps = Number((amount * 10000n) / SALE);
  console.log(`ERC-2981 royalty: ${(bps / 100).toFixed(2)}% (${bps} bps) -> ${receiver}`);
} else {
  console.log("ERC-2981 royalty: tidak ada / tidak aktif (contract lama)");
}

for (const [label, got, expect, verdict] of results) {
  console.log(`${verdict === "PASS" ? "✅" : "❌"} ${label}\n     got: ${got} | expect: ${expect}`);
}
console.log(results.every((r) => r[3] === "PASS") ? "\nALL PASS" : "\nSOME FAILED");
process.exit(results.every((r) => r[3] === "PASS") ? 0 : 1);
