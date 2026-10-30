// Compile a Solidity contract (viaIR + optimizer) into a JSON artifact next to it.
// usage: node compile.mjs path/to/Contract.sol
import fs from "node:fs";
import path from "node:path";
import { req, findInNodeModules, INSTALL_HINT } from "./deps.mjs";

const solPath = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(solPath)) {
  console.error("usage: node compile.mjs path/to/Contract.sol");
  process.exit(1);
}
const dir = path.dirname(solPath);
const fileName = path.basename(solPath);
const source = fs.readFileSync(solPath, "utf8");

let solc;
try {
  solc = req("solc", dir);
} catch (e) {
  console.error(String(e.message || e));
  console.error("fix:", INSTALL_HINT);
  process.exit(1);
}

const input = {
  language: "Solidity",
  sources: { [fileName]: { content: source } },
  settings: {
    // viaIR is required: a large render() otherwise fails with "Stack too deep"
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};

function findImports(p) {
  const contents = findInNodeModules(p, dir, process.cwd());
  return contents ? { contents } : { error: "not found: " + p };
}

const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = (out.errors || []).filter((e) => e.severity === "error");
for (const w of (out.errors || []).filter((e) => e.severity === "warning")) {
  console.log("WARN:", w.formattedMessage.split("\n")[0]);
}
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}

const names = Object.keys(out.contracts[fileName]);
const name = names.length === 1 ? names[0] : names.find((n) => fileName.startsWith(n)) || names[0];
const c = out.contracts[fileName][name];
const artifact = {
  contractName: name,
  solcVersion: solc.version(),
  abi: c.abi,
  bytecode: "0x" + c.evm.bytecode.object,
  deployedBytecode: "0x" + c.evm.deployedBytecode.object,
};
const outPath = path.join(dir, name + ".json");
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
console.log("compiled", name, "with", artifact.solcVersion, "->", outPath);
console.log("creation bytecode:", (artifact.bytecode.length - 2) / 2, "bytes");
console.log("runtime bytecode:", (artifact.deployedBytecode.length - 2) / 2, "bytes (limit 24576)");
if ((artifact.deployedBytecode.length - 2) / 2 > 24576) {
  console.error("RUNTIME TOO BIG ❌");
  process.exit(1);
}
