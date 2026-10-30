// Build the CREATE2 deployment payload (salt || creationCode ++ abi-encoded owner)
// and predict the resulting address from the Arachnid deterministic deployer.
// usage: node deploy-build.mjs path/to/Contract.json 0xOwnerAddress [0xFORCE2PROXY]
import fs from "node:fs";
import path from "node:path";
import { req } from "./deps.mjs";

const artifactPath = path.resolve(process.argv[2] || "");
const owner = process.argv[3];
const { keccak_256 } = req("js-sha3", path.dirname(artifactPath || process.cwd()));
const FACTORY = (process.argv[4] || "0x4e59b44847b379578588920cA78FbF26c0B4956C").toLowerCase().replace(/^0x/, "");
if (!process.argv[2] || !fs.existsSync(artifactPath) || !/^0x[0-9a-fA-F]{40}$/.test(owner || "")) {
  console.error("usage: node deploy-build.mjs path/to/Contract.json 0xOwnerAddress [0xFORCE2PROXY]");
  process.exit(1);
}

const art = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const SALT = "0".repeat(64);
const ownerArg = owner.slice(2).toLowerCase().padStart(64, "0");
const initcode = art.bytecode.slice(2) + ownerArg;
const data = "0x" + SALT + initcode;

const codeHash = keccak_256(Buffer.from(initcode, "hex"));
const digest = keccak_256(Buffer.from("ff" + FACTORY + SALT + codeHash, "hex"));
const predicted = "0x" + digest.slice(24);

const dir = path.dirname(artifactPath);
fs.writeFileSync(path.join(dir, "deploy-data.txt"), data);
fs.writeFileSync(path.join(dir, "predicted.txt"), predicted + "\n");

console.log("initcode+args:", initcode.length / 2, "bytes");
console.log("inputData:", (data.length - 2) / 2, "bytes");
console.log("factory: 0x" + FACTORY);
console.log("predicted address:", predicted);
console.log("expected runtime:", (art.deployedBytecode.length - 2) / 2, "bytes");
