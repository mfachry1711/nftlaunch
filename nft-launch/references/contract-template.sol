// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// ---------------------------------------------------------------------------
// NFT collection template — proven on BNB Chain (solc 0.8.24 + OZ 5.4.0,
// compiled with viaIR, runtime ~12.5 KB of the 24,576 byte limit).
//
// DEFAULT RULES BUILT IN (agreed format v2):
//   - 5,000 supply, 1,000 free (1 per wallet) — free mint REQUIRES a .ai Agent ID
//   - paid mint is OPEN TO EVERY WALLET (no Agent ID needed), max 3 per wallet
//   - 3% royalty (ERC-2981) paid to the collection owner on secondary sales
//   - five rarity levels: Mythic 1% / Legendary 4% / Epic 15% / Rare 30% / Common 50%
//
// EDIT BEFORE DEPLOYING (everything below is permanent once deployed):
//   0. every `<NAME>` / `<SYM>` / `<...>` placeholder below — grep for '<' first
//   1. contract name            -> contract CollectionPass is ERC721, Ownable, ERC2981
//   2. collection name + symbol -> ERC721("<Name>", "<SYM>")
//   3. the @notice comment      -> match the agreed rules
//   4. constants                -> MAX_SUPPLY / FREE_SUPPLY / PRICE / MAX_PAID_PER_WALLET
//   5. royalty                  -> _setDefaultRoyalty(owner, 300) = 3% (300 / 10,000)
//   6. tierOf() thresholds      -> match the agreed rarity distribution
//   7. _card() colours + _core* -> and the whole render(): THIS IS THE ARTWORK
//      (the SVG here is NeuralBadge's layout — do NOT deploy it unchanged, a second
//       collection must look different or it is a copycat)
//   8. tokenURI() name/description
//
// Rules that already bit us once:
//   - tokenURI() literals must stitch into VALID JSON; run check-metadata.mjs.
//   - A large render() needs viaIR; compile.mjs sets it. Do not remove.
//   - Keep render() `public pure` so off-chain tooling can eth_call it.
//   - No external fonts/assets: SVG must stand alone as a data: URI.
//
// Royalty honesty: ERC-2981 only PUBLISHES the 3% — marketplaces that honour it will
// pay it, wallets transferring peer-to-peer or marketplaces that ignore it will not.
// The contract cannot force payment on a transfer it does not mediate.
// ---------------------------------------------------------------------------

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract CollectionPass is ERC721, Ownable, ERC2981 { // EDIT: contract name must be a valid identifier
    using Strings for uint256;

    // .ai Agent ID registry — only this gates the FREE mint; paid mint is open.
    IERC721 public constant AGENT_ID = IERC721(0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F);

    uint256 public constant MAX_SUPPLY = 5000;
    uint256 public constant FREE_SUPPLY = 1000;
    uint256 public constant PRICE = 0.0005 ether; // EDIT: 0.0001 = debu (bot tak terbendung); 0.0005–0.001 disarankan
    uint256 public constant MAX_PAID_PER_WALLET = 3;
    uint96 public constant ROYALTY_BPS = 300; // 3% royalty, 300/10000

    uint256 public totalSupply;
    uint256 public freeMinted;
    mapping(address => bool) public freeClaimed;
    mapping(address => uint256) public paidMinted;
    mapping(uint256 => uint256) public seedOf;

    error NoAgentId();
    error FreeAlreadyClaimed();
    error FreeSoldOut();
    error SoldOut();
    error WalletLimit();
    error WrongPayment();
    error BadQuantity();

    constructor(address initialOwner) ERC721("<Name>", "<SYM>") Ownable(initialOwner) {
        // 3% royalty to the owner on every secondary sale the marketplace honours
        _setDefaultRoyalty(initialOwner, ROYALTY_BPS);
    }

    // ERC-165: report ERC-721 AND ERC-2981 support
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // ---------------- mint ----------------

    /// @notice Free mint: 1 per wallet, requires holding a .ai Agent ID, while the free quota lasts.
    function mintFree() external {
        if (AGENT_ID.balanceOf(msg.sender) == 0) revert NoAgentId();
        if (freeClaimed[msg.sender]) revert FreeAlreadyClaimed();
        if (freeMinted >= FREE_SUPPLY) revert FreeSoldOut();
        if (totalSupply >= MAX_SUPPLY) revert SoldOut();
        freeClaimed[msg.sender] = true;
        freeMinted++;
        _mintOne(msg.sender);
    }

    /// @notice Paid mint: OPEN TO ANY WALLET (Agent ID not required), qty * PRICE, max 3 per wallet.
    function mint(uint256 qty) external payable {
        if (qty == 0) revert BadQuantity();
        if (paidMinted[msg.sender] + qty > MAX_PAID_PER_WALLET) revert WalletLimit();
        if (totalSupply + qty > MAX_SUPPLY) revert SoldOut();
        if (msg.value != qty * PRICE) revert WrongPayment();
        paidMinted[msg.sender] += qty;
        for (uint256 i; i < qty; ++i) _mintOne(msg.sender);
    }

    function _mintOne(address to) internal {
        if (totalSupply >= MAX_SUPPLY) revert SoldOut();
        uint256 id = ++totalSupply;
        seedOf[id] = uint256(keccak256(abi.encodePacked(block.prevrandao, blockhash(block.number - 1), to, id)));
        _safeMint(to, id);
    }

    /// @notice Sends the whole contract balance (paid mint proceeds) to the owner.
    function withdraw() external onlyOwner {
        (bool ok, ) = owner().call{value: address(this).balance}("");
        require(ok);
    }

    // ---------------- rarity ----------------

    /// @notice 0..4 (Common..Mythic). Distribution over seed % 100: 1 / 4 / 15 / 30 / 50 %.
    function tierOf(uint256 seed) public pure returns (uint8) {
        uint256 r = seed % 100;
        if (r < 1) return 4;  // Mythic 1%
        if (r < 5) return 3;  // Legendary 4%
        if (r < 20) return 2; // Epic 15%
        if (r < 50) return 1; // Rare 30%
        return 0;             // Common 50%
    }

    function _tierName(uint8 t) internal pure returns (string memory) {
        string[5] memory n = ["Common", "Rare", "Epic", "Legendary", "Mythic"];
        return n[t];
    }

    function _card(uint8 t) internal pure returns (string memory bg, string memory accent) {
        if (t == 4) return ("#17060f", "#ff4d88"); // Mythic
        if (t == 3) return ("#171005", "#ffd166"); // Legendary
        if (t == 2) return ("#100a1e", "#b388ff"); // Epic
        if (t == 1) return ("#061420", "#4dd0e1"); // Rare
        return ("#0b0f13", "#a8b0b8");             // Common
    }

    function _coreName(uint256 s) internal pure returns (string memory) {
        string[4] memory n = ["Quartz", "Ember", "Volt", "Cobalt"];
        return n[(s >> 16) % 4];
    }

    function _coreColor(uint256 s) internal pure returns (string memory) {
        string[4] memory c = ["#7df9ff", "#ff8a3d", "#facc15", "#818cf8"];
        return c[(s >> 16) % 4];
    }

    /// @dev 6x6 silkscreen matrix, one bit every 3 seed bits.
    function _matrix(uint256 s, string memory accent) internal pure returns (bytes memory b) {
        for (uint256 r = 0; r < 6; ++r) {
            for (uint256 col = 0; col < 6; ++col) {
                if (((s >> ((r * 6 + col) * 3)) & 1) == 1) {
                    b = abi.encodePacked(
                        b,
                        '<rect x="', (16 + col * 5).toString(),
                        '" y="', (142 + r * 5).toString(),
                        '" width="5" height="5" fill="', accent, '"/>'
                    );
                }
            }
        }
    }

    // ---------------- artwork ----------------

    function render(uint256 seed, uint256 id) public pure returns (string memory) {
        uint8 t = tierOf(seed);
        (string memory bg, string memory ac) = _card(t);
        string memory core = _coreColor(seed);
        bytes memory a = abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 190" font-family="monospace">',
            '<rect width="300" height="190" rx="14" fill="', bg, '"/>',
            '<text x="16" y="25" font-size="15" font-weight="bold" fill="#d4af37"><NAME></text>',
            '<text x="284" y="24" font-size="9" text-anchor="end" fill="#6b7280"><SYM> // BNB CHAIN</text>',
            '<rect x="16" y="32" width="268" height="1" fill="#d4af37" fill-opacity="0.55"/>'
        );
        // EDIT: replace this whole artwork with the new collection's design
        a = abi.encodePacked(
            a,
            '<g stroke="#d4af37" stroke-opacity="0.35" stroke-width="1.2" fill="none">',
            '<path d="M90 76 H118 V60 H158"/><path d="M90 96 H132 V104 H158"/>',
            '<path d="M90 112 H104 V132 H150 V140 H284"/><path d="M32 84 H16 V44 H6"/>',
            '</g>',
            '<circle cx="118" cy="60" r="3" fill="#d4af37" fill-opacity="0.6"/>',
            '<circle cx="132" cy="104" r="3" fill="#d4af37" fill-opacity="0.6"/>',
            '<circle cx="104" cy="132" r="3" fill="#d4af37" fill-opacity="0.6"/>',
            '<circle cx="150" cy="140" r="3" fill="#d4af37" fill-opacity="0.6"/>'
        );
        a = abi.encodePacked(
            a,
            '<rect x="32" y="64" width="52" height="52" rx="3" fill="#05070a" stroke="#d4af37" stroke-width="2"/>',
            '<path d="M42 74 L34 66 M74 74 L82 66 M42 106 L34 114 M74 106 L82 114" stroke="#d4af37" stroke-width="1" stroke-opacity="0.7"/>',
            '<rect x="42" y="74" width="32" height="32" rx="2" fill="', core, '"/>',
            '<rect x="49" y="81" width="18" height="18" fill="#05070a"/>',
            '<path d="M58 81 V87 M58 99 V105 M49 90 H55 M67 90 H61" stroke="', core, '" stroke-width="1.5"/>',
            '<rect x="55" y="87" width="6" height="6" fill="', core, '"/>',
            '<rect x="26" y="72" width="6" height="4" fill="#d4af37"/><rect x="26" y="84" width="6" height="4" fill="#d4af37"/>',
            '<rect x="26" y="96" width="6" height="4" fill="#d4af37"/><rect x="26" y="108" width="6" height="4" fill="#d4af37"/>',
            '<rect x="84" y="72" width="6" height="4" fill="#d4af37"/><rect x="84" y="84" width="6" height="4" fill="#d4af37"/>',
            '<rect x="84" y="96" width="6" height="4" fill="#d4af37"/><rect x="84" y="108" width="6" height="4" fill="#d4af37"/>'
        );
        a = abi.encodePacked(
            a,
            '<rect x="158" y="46" width="126" height="72" rx="6" fill="#000000" fill-opacity="0.3" stroke="', ac,
            '" stroke-width="1.5" stroke-dasharray="5 3"/>',
            '<text x="170" y="64" font-size="9" fill="#9aa5b1">SERIAL</text>',
            '<text x="170" y="88" font-size="20" font-weight="bold" fill="#ffffff">#', _pad(id), '</text>',
            '<text x="170" y="108" font-size="12" font-weight="bold" fill="', ac, '">L', uint256(t + 1).toString(), ' ', _upper(t), '</text>',
            '<rect x="252" y="54" width="22" height="22" rx="3" fill="', core, '" fill-opacity="0.9"/>'
        );
        a = abi.encodePacked(
            a,
            '<text x="16" y="158" font-size="11" font-weight="bold" fill="#d4af37">FREE FOR AGENT ID</text>',
            '<text x="16" y="172" font-size="9" fill="#6b7280">CORE: ', _coreName(seed), ' // <MAX> SUPPLY // ROYALTY 3%</text>',
            _matrix(seed, ac),
            '</svg>'
        );
        return string(a);
    }

    function _upper(uint8 t) internal pure returns (string memory) {
        if (t == 4) return "MYTHIC";
        if (t == 3) return "LEGENDARY";
        if (t == 2) return "EPIC";
        if (t == 1) return "RARE";
        return "COMMON";
    }

    function _pad(uint256 id) internal pure returns (string memory) {
        if (id < 10) return string(abi.encodePacked("000", id.toString()));
        if (id < 100) return string(abi.encodePacked("00", id.toString()));
        if (id < 1000) return string(abi.encodePacked("0", id.toString()));
        return id.toString();
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        uint256 s = seedOf[id];
        uint8 t = tierOf(s);
        bytes memory json = abi.encodePacked(
            '{"name":"<Name> #', id.toString(),
            '","description":"<description, one line, valid JSON>",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(render(s, id))),
            '","attributes":[{"trait_type":"Rarity","value":"', _tierName(t),
            '"},{"trait_type":"Level","value":"L', uint256(t + 1).toString(),
            '"},{"trait_type":"Core","value":"', _coreName(s), '"}]}'
        );
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(json)));
    }
}
