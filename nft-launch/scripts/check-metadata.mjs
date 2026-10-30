// Validate the exact JSON that tokenURI() builds, by parsing its abi.encodePacked argument list.
// Every dynamic expression is replaced by a JSON-safe placeholder, so a misplaced quote or a
// stray "," fails the parse here instead of on a marketplace.
// usage: node check-metadata.mjs path/to/Contract.sol
import fs from "node:fs";
import path from "node:path";

const solPath = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(solPath)) {
  console.error("usage: node check-metadata.mjs path/to/Contract.sol");
  process.exit(1);
}
const src = fs.readFileSync(solPath, "utf8");

const marker = "bytes memory json = abi.encodePacked(";
const start = src.indexOf(marker) + marker.length;
if (start < marker.length) {
  console.error("tokenURI() marker not found:", marker);
  process.exit(1);
}
let depth = 1;
let i = start;
for (; i < src.length && depth > 0; i++) {
  if (src[i] === "(") depth++;
  else if (src[i] === ")") depth--;
}
const body = src.slice(start, i - 1);

const args = [];
let cur = "";
let paren = 0;
let inLit = false;
for (const ch of body) {
  if (inLit) {
    cur += ch;
    if (ch === "'") inLit = false;
    continue;
  }
  if (ch === "'") {
    inLit = true;
    cur += ch;
    continue;
  }
  if (ch === "(") paren++;
  if (ch === ")") paren--;
  if (ch === "," && paren === 0) {
    args.push(cur.trim());
    cur = "";
    continue;
  }
  cur += ch;
}
if (cur.trim()) args.push(cur.trim());

let d = 0;
let json = "";
function evalArg(a) {
  let out = "";
  let code = "";
  const re = /'([^']*)'|([^']+)/g;
  let m;
  while ((m = re.exec(a))) {
    if (m[1] !== undefined) out += m[1].replace(/''/g, "'");
    else code += m[2];
  }
  if (code.trim()) return { dynamic: true };
  return { dynamic: false, text: out };
}
for (const a of args) {
  const r = evalArg(a);
  json += r.dynamic ? "@dyn" + d++ + "@" : r.text;
}

console.log("args:", args.length, "| dynamic slots:", d);

// If the image slot is a placeholder, swap that one slot for a real (tiny) base64 SVG so
// the decode check stays meaningful; the on-chain SVG is proven later by compare-art.mjs.
const TINY = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString("base64");
const imgSlot = json.match(/base64,@dyn(\d+)@/);
if (imgSlot) json = json.replace(`@dyn${imgSlot[1]}@`, TINY);

try {
  const parsed = JSON.parse(json);
  const imageOk = typeof parsed.image === "string" && parsed.image.startsWith("data:image/svg+xml;base64,");
  let svgOk = false;
  if (imageOk && !parsed.image.includes("@dyn")) {
    const svg = Buffer.from(parsed.image.split(",")[1], "base64").toString("utf8");
    svgOk = svg.startsWith("<svg") && svg.trimEnd().endsWith("</svg>");
  }
  console.log("JSON VALID ✅");
  console.log("  keys:", Object.keys(parsed).join(", "));
  console.log("  attributes:", (parsed.attributes || []).map((a) => `${a.trait_type}=${a.value}`).join(" | "));
  console.log("  image decodes to SVG:", svgOk, imgSlot ? "(placeholder slot substituted)" : "");
  if (!imageOk || !svgOk || !parsed.name || !parsed.description) {
    console.log("MISSING REQUIRED FIELD ❌");
    process.exit(1);
  }
} catch (e) {
  console.log("JSON INVALID ❌", e.message);
  console.log(json.slice(0, 400));
  process.exit(1);
}
