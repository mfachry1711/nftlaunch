---
name: nft-launch
description: |
  Use when the user wants to create, build, launch, deploy or mint an NFT / NFT collection on
  BNB Chain: ERC-721 contract with fully on-chain SVG artwork and base64 tokenURI metadata,
  .ai Agent ID gated free mint with an open paid mint, 3% ERC-2981 royalty on secondary sales,
  rarity distribution,
  CREATE2 deployment through the Arachnid proxy using the binance-agentic-wallet (baw)
  contract-call preview/execute flow, metadata JSON validation, on-chain rule tests,
  artwork preview before spending gas, source verification (BscScan/Sourcify), withdrawing
  paid-mint proceeds, or reproducing an earlier NFT launch in a new account or chat.
metadata:
  author: codebuff
  version: '1.0.0'
  requiredCliVersion: '1.12.0'
  openclaw:
    requires:
      bins:
        - baw
    install:
      - kind: node
        package: '@binance/agentic-wallet'
        bins: [baw]
---

# NFT launch on BNB Chain (on-chain art + baw deployment)

This skill packages a launch that already succeeded twice on BNB Chain mainnet
(`AgentPass` v2 `0xcc00afe7dab6770ff28452a43be052d40d83b7a5`, `NeuralBadge`
`0xb8b6557e075bfbdb0063d761c99081fb10686197`). Follow it top to bottom and the first
attempt should deploy clean.

## 0. Preconditions (check these before writing code)

1. **Wallet CLI**: `baw` must be on PATH. If missing:
   `npm install -g --prefix "$HOME/.local" @binance/agentic-wallet` and
   `export PATH="$HOME/.local/bin:$PATH"`.
2. **Session**: `baw wallet status --json` → `"CONNECTED"`. If not, run `baw auth signin --json`,
   render `urlForWeb` as a QR image (`npx qrcode -o artifacts/qr.png -w 480 "<url>"`), show the
   QR **image plus pairing code** to the user, then `baw auth verify --qrCodeId <id> --json`
   (blocking, ~5 min).
3. **Developer Mode** must be ON in the user's Binance App or preview/execute fails.
4. **Balance**: deployment costs ≈ 2.8M gas × current gas price (0.05 gwei on BSC ≈ **0.00015 BNB**).
   Check with `eth_getBalance`; refuse to deploy if the wallet cannot cover it.
5. **.ai Agent ID**: the mint gate reads
   `IERC721(0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F).balanceOf(msg.sender)`.
   The user's wallet must own one to mint their own pass (check via the binance-agentic-wallet
   skill, Agent ID claim status).
6. **Never** put a private key, seed or platform token anywhere. All signing happens in the app
   through `baw`. Never print secrets.

## 1. Ask for the collection identity (irreversible)

`name` and `symbol` cannot change after deploy. Ask once, with concrete options (name + symbol +
art direction as one bundle), then take the minting rules as: supply, free quota, free-per-wallet,
paid price, total per wallet, rarity count/distribution, royalty %, and the gate format.
Confirm nothing else twice — the user's word ("gas bro") is the go-ahead.

### Default rule format (v2) — unless the user says otherwise

| rule | value |
|---|---|
| supply | 5,000 |
| free | 1,000, **1 per wallet, requires a .ai Agent ID** |
| paid | **open to every wallet, no Agent ID**, max 3 per wallet, from launch day |
| price | 0.0005 BNB suggested (0.0001 is dust — bots treat it as free); confirm with the user |
| royalty | **3% ERC-2981 to the owner's wallet** (300 / 10,000 bps) |
| rarity | 5 levels: 1% / 4% / 15% / 30% / 50% |

Why this shape: the free quota is the giveaway, so it stays gated; the paid mint is revenue, so
opening it turns snipers into paying customers. Royalty only pays where the marketplace honours
ERC-2981 — peer-to-peer transfers and marketplaces that ignore it pay nothing. Say that out loud
so nobody expects a fee on every transfer.

## 2. Build the contract

Copy `references/contract-template.sol` into the workspace (e.g. `<collection>/<Contract>.sol`)
and edit, in this order:

1. `contract CollectionPass is ERC721, Ownable, ERC2981` → new contract name; `ERC721("<Name>", "<SYM>")` → name/symbol.
2. Header `@notice` comment (copy the numbers from the agreed rules).
3. Constants: `MAX_SUPPLY`, `FREE_SUPPLY`, `PRICE`, `MAX_PAID_PER_WALLET`.
4. Royalty: `_setDefaultRoyalty(initialOwner, ROYALTY_BPS)` with `ROYALTY_BPS = 300` for 3%;
   keep the `supportsInterface` override (`override(ERC721, ERC2981)`) — without it ERC-2981 is
   silently unadvertised.
5. Gate: `mintFree()` keeps the `AGENT_ID.balanceOf(msg.sender) == 0` check; `mint(qty)` must NOT
   have it when the paid mint is open. Deleting or keeping one line decides the whole policy.
6. `tierOf()` thresholds for the requested distribution (template: 1/4/15/30/50 of `seed % 100`).
7. `_card()` colours, `_coreName/_coreColor` (or `_avatar*`), and the whole `render()` SVG —
   **this is what makes the collection look different.** Keep `viewBox="0 0 300 190"` and
   `font-family="monospace"` (on-chain SVG has no external fonts). Grep the file for `<` before
   compiling: leftover `<NAME>` / `<SYM>` placeholders must be gone.
8. `tokenURI()` name + description string.

Two hard-won rules from real launches:

- **JSON packing**: every literal in the `tokenURI` `abi.encodePacked` must stitch into valid
  JSON. A literal ending `",` followed by one starting `"` is correct; a stray `",` inside an
  expression produced invalid JSON on AgentPass v1 (marketplaces could not parse it). Always run
  `scripts/check-metadata.mjs` — it parses the exact concatenation.
- **Stack too deep**: a big `render()` does not compile on the normal pipeline. `scripts/compile.mjs`
  already sets `viaIR: true`; keep it. Runtime must stay under **24,576 bytes** (template ≈ 12.2 KB).

## 3. Compile + validate before any chain interaction

```bash
npm install --no-audit --no-fund solc@0.8.24 @openzeppelin/contracts@5.4.0 js-sha3 sharp
node .agents/skills/nft-launch/scripts/compile.mjs <collection>/<Contract>.sol
node .agents/skills/nft-launch/scripts/check-metadata.mjs <collection>/<Contract>.sol
node .agents/skills/nft-launch/scripts/preview-art.mjs      # optional, if you wrote a JS mirror of render()
```

Compile prints creation/runtime byte sizes; `check-metadata` must print `JSON VALID ✅`. Do not
touch the chain until both pass.

**Art preview**: write a JS mirror of `render()` (same helper math, same literals), rasterise with
`sharp` + a bundled TTF (`@expo-google-fonts/roboto-mono`, `FONTCONFIG_FILE` pointing at a small
`fonts.xml` — VMs often have no system fonts), and show the user the 5 rarity variants. After
deploy, prove the mirror equals the chain with `scripts/compare-art.mjs`.

## 4. Deploy through the CREATE2 proxy

`baw` cannot deploy (`to is required`), so deploy via Arachnid's deterministic deployer:

```bash
node .agents/skills/nft-launch/scripts/deploy-build.mjs <collection>/<Contract>.json 0xOWNER
# -> <collection>/deploy-data.txt (salt||initcode+args) and predicted.txt (predicted address)
```

Predicted address must have empty `eth_getCode`, then:

```bash
p=$(baw contract-call preview --binanceChainId 56 --from $WALLET \
    --to 0x4e59b44847b379578588920cA78FbF26c0B4956C --value 0 \
    --inputData "$(cat <collection>/deploy-data.txt)" --json)
id=$(printf '%s' "$p" | node .agents/skills/nft-launch/scripts/preview-gate.mjs)
[ "${id%% *}" = "$id" ] || { echo "gating blocked deploy: $id"; exit 1; }
baw contract-call execute --requestId "$id" --json
```

`preview-gate.mjs` prints the `requestId` only when the simulation is `000000000`, there is no
`simulationErrorDetail`, `risks` is empty and `requireConfirmation` is false; anything else prints
`DIRTY ...` / `FAIL ...` and execution must stop. **Always preview → gate → execute, never execute
straight away.** requestId expires in ~28 minutes — if `execute` reports an expired request,
re-run preview and execute immediately.

## 5. Verify (mandatory, not optional)

```bash
node .agents/skills/nft-launch/scripts/verify.mjs <txHash> <predictedAddr> <artifact.json> <wallet>
node .agents/skills/nft-launch/scripts/test-rules.mjs <contractAddr> <wallet>
```

Expect: receipt `status 0x1`, **runtime bytecode exact match**, `name/symbol/owner` correct,
constants equal the agreed spec, then **8/8 ALL PASS**. `test-rules.mjs` no longer assumes the
rules: it reads `PRICE()` off the contract and probes `mint(1)` from a wallet with no Agent ID,
so it reports `paid gate = OPEN` or `requires .ai Agent ID` itself and tests against what the
contract actually does (plus a report line for `royaltyInfo`, "tidak ada" on pre-royalty
collections). Cross-check that reported royalty % against the agreed spec.

If anything fails, do not deploy again or "fix" it with a workaround — diagnose first.

## 6. After launch

- **Bots**: minter bots pre-compute the CREATE2 address and race the first blocks (40+ free mints
  landed within seconds on both launches). A partially-consumed free quota is normal.
- **Mint for the user**: `baw contract-call preview ... --to <contract> --inputData 0x<selector>`
  with `mintFree()` = `0x8ab53447`, `mint(uint256)` = `0xa0712d68` + 64-hex qty, `withdraw()` =
  `0x3ccfd60b`. Gate and execute exactly like deploy; report the tokenId from `Transfer` logs.
- **Withdraw proceeds**: `withdraw()` sends the whole contract balance to `owner()`. Preview first,
  show the user the amount, execute on their word. Verify contract balance → 0 afterwards.
- **Royalty is passive**: ERC-2981 makes the 3% visible to marketplaces; it never moves BNB by
  itself. Tell the user: honoured on royalty-aware marketplaces, not on plain wallet-to-wallet
  transfers, and there is no way to charge it from inside the contract for a sale it never sees.
- **Metadata check from chain**: fetch `tokenURI(id)`, strip `data:application/json;base64,`, and
  `JSON.parse` it before claiming it works.
- **Verify source** on BscScan/Sourcify once the contract exists, using the compiled artifact
  (solc 0.8.24, optimizer runs 200, viaIR) and the `constructor(address)` argument.

## 7. State to report every time

Contract address, tx hash + block, gas used and fee, runtime-code match, name/symbol/owner,
constants vs spec, `check-metadata` result, `test-rules` result, supply/free/paid counters,
contract balance, wallet balance, and the open items (source verification, mint for user).

## Known pitfalls

- The cloud sandbox is recreated often: `cloud_sandbox_create` before any workspace tool, and
  expect to re-run `npm install` for the CLI if `$HOME/.local/bin/baw` is gone.
- Global npm installs may be denied — always use `--prefix "$HOME/.local"` and re-export PATH.
- Public BSC RPCs rate-limit; keep a fallback list (`bsc-rpc.publicnode.com`, `1rpc.io/bnb`,
  `bsc-dataseed.binance.org`) and retry rather than trusting one call.
- Shell quoting kills inline `node -e` scripts with nested quotes — write a script file instead.
- `receipt.contractAddress` is `null` for CREATE2-through-proxy deploys; check `eth_getCode`
  at the predicted address instead.
- Never claim art/metadata works from a local render alone: compare against `render()`/`tokenURI()`
  on-chain after deploy.
