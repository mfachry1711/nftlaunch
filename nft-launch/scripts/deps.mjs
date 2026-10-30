// Dependency loader for the skill scripts: deps may sit in the skill's own folder,
// in the workspace root, or in the collection folder. Try each, then give the
// install command instead of a bare MODULE_NOT_FOUND.
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const INSTALL = "npm install --no-audit --no-fund solc@0.8.24 @openzeppelin/contracts@5.4.0 js-sha3 sharp";

export function req(name, ...extraBases) {
  const bases = [import.meta.dirname, process.cwd(), ...extraBases].filter(Boolean);
  for (const b of bases) {
    try {
      return createRequire(path.join(b, "_probe.js"))(name);
    } catch {}
  }
  // last resort: deps often live in a per-collection folder, not in the workspace root
  for (const root of discoverNodeModules()) {
    try {
      return createRequire(path.join(root, "_probe.js"))(name);
    } catch {}
  }
  throw new Error(`module '${name}' not found in: ${bases.join(", ")}\nfix: ${INSTALL}`);
}

function discoverNodeModules(depth = 2) {
  const found = [];
  const walk = (dir, d) => {
    if (d < 0) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = path.join(dir, e.name);
      if (e.name === "node_modules") {
        found.push(full);
      } else if (!e.name.startsWith(".") && e.name !== "artifacts") {
        walk(full, d - 1);
      }
    }
  };
  walk(process.cwd(), depth);
  return found;
}

export function findInNodeModules(specifier, ...bases) {
  for (const start of [...new Set(bases.filter(Boolean))]) {
    let dir = start;
    for (;;) {
      const f = path.join(dir, "node_modules", specifier);
      try {
        return fs.readFileSync(f, "utf8");
      } catch {}
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  // deps may sit in a sibling collection folder (per-project node_modules)
  for (const root of discoverNodeModules()) {
    try {
      return fs.readFileSync(path.join(root, specifier), "utf8");
    } catch {}
  }
  return null;
}

export const INSTALL_HINT = INSTALL;
