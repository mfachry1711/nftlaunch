# Prompt siap tempel — launching koleksi NFT baru (format v2)

Format v2 = free mint khusus .ai Agent ID, paid mint terbuka untuk semua wallet,
royalti 3% (ERC-2981) ke wallet owner, harga paid 0.0005 BNB (bisa diubah).

---

## Langkah kamu (dari nol, urut)

1. **Buat chat baru** di project/tempat kamu mau bikin NFT-nya.
2. **Kirim `nft-launch.zip` sebagai lampiran** lalu tempel **Prompt A**.
   (Kalau chatnya masih di project yang sama, ZIP tidak perlu — langsung Prompt B.)
3. AI akan meng-extract, membaca SKILL.md, memasang dependensi, lalu bertanya
   identitas koleksi. **Jawab Prompt B** (isi nama/symbol/artnya).
4. Tunggu **preview artwork** muncul. Kalau sudah cocok, balas: **"gas bro"**.
   Kalau belum, minta diganti — nama/symbol/art tidak bisa diubah setelah deploy.
5. Kalau diminta login: **scan QR** + pastikan **Developer Mode** menyala.
6. Terima laporannya (tx hash, hasil tes 8/8, saldo, dll).

Yang cuma bisa kamu: isi nama/symbol/art, scan QR, nyalakan Developer Mode,
punya saldo BNB + .ai Agent ID, dan bilang "gas bro".

---

## Prompt A — setup (baru sekali per project)

```
Aku lampirkan file nft-launch.zip.

Tolong:
1. Extract isinya ke folder .agents/skills/nft-launch/ di proyek ini.
2. Baca .agents/skills/nft-launch/SKILL.md dan ikuti isinya dari awal sampai akhir.
3. Kalau skill binance-agentic-wallet belum ada, install juga:
   npx skills add binance/binance-skills-hub --skill binance-agentic-wallet --agent '*' -y
4. Kalau dependensi kurang (solc@0.8.24, @openzeppelin/contracts@5.4.0, js-sha3, sharp)
   install sendiri. Kalau baw CLI belum ada, install juga
   (npm install -g --prefix "$HOME/.local" @binance/agentic-wallet).

Jangan menyentuh chain sebelum langkah preflight dan validasi compile lolos.
```

## Prompt B — spesifikasi koleksi (isi sendiri)

```
Buatkan dan deploy satu koleksi NFT ERC-721 di BNB Chain (fully on-chain: SVG + base64 JSON),
pakai .agents/skills/nft-launch/SKILL.md dari awal sampai akhir.

Spesifikasi (format v2):
- Nama / Symbol : [ISI]
- Artwork       : [ISI] — HARUS beda dari Agent Pass dan Neural Badge; jangan pakai template apa adanya
- Suplay 5.000, free 1.000, free 1 per wallet dan WAJIB pegang .ai Agent ID
- Paid mint 0.0005 BNB, maks 3 per wallet, TERBUKA untuk semua wallet (tanpa Agent ID), buka dari hari pertama
- Royalti 3% (ERC-2981) ke wallet owner untuk penjualan sekunder
- 5 rarity: Mythic 1% / Legendary 4% / Epic 15% / Rare 30% / Common 50%
- withdraw() hanya owner

Urutan kerja yang wajib:
1. Preflight: baw CONNECTED (kalau belum, kasih QR login), Developer Mode ON,
   saldo cukup (±0.00016 BNB), wallet punya .ai Agent ID. Gagal = berhenti dan lapor.
2. compile.mjs + check-metadata.mjs harus "JSON VALID" SEBELUM sentuh chain. Runtime <= 24.576 B.
3. Tampilkan preview art 5 rarity ke aku. TUNGGU jawabanku ("gas bro") sebelum deploy.
4. Deploy via CREATE2 0x4e59b44847b379578588920cA78FbF26c0B4956C dengan pola
   preview -> preview-gate.mjs -> execute. Dilarang execute tanpa lolos gate.
   Kalau requestId expired, preview ulang.
5. verify.mjs (receipt 0x1, runtime EXACT MATCH, konstanta sesuai spec) dan
   test-rules.mjs harus 8/8 ALL PASS + royaltyInfo terbaca 3% ke wallet owner.
6. Mint 1 free untuk wallet aku (preview dulu), lalu tampilkan tokenId, atribut,
   gambar tokenURI, statistik supply/free/paid, dan saldo kontrak.
7. Laporkan apa adanya: tx, block, gas, alamat, hasil tes, item yang belum
   (verifikasi source BscScan/Sourcify). Kalau gagal: berhenti, diagnosa, jangan deploy ulang.

Larangan: jangan cetak private key/seed/token, jangan execute tanpa preview lolos gate,
jangan klaim royalty/metadata/art bekerja tanpa cek on-chain.
```

---

## Soal royalti 3% — apa yang benar-benar terjadi

Royalti dipasang lewat **ERC-2981** (`_setDefaultRoyalty(owner, 300)` = 300/10.000):

- **Bayar**: kalau pembeli menjual lewat marketplace yang menghormati ERC-2981, 3% dari
  harga jual otomatis dikirim ke wallet owner.
- **Tidak bayar**: transfer biasa wallet-ke-wallet, atau marketplace yang mengabaikan
  ERC-2981. Kontrak tidak punya wewenang menagih di transfer yang tidak melaluinya.
- Kontrak tidak punya pasar jual-beli sendiri, jadi tidak ada mekanisme "komisi per
  penjualan di dalam kontrak" — royalti semata-mata laporan ke marketplace.

---

## Membawa skill ke proyek/akun baru

```bash
cp -r .agents/skills/nft-launch /path/to/proyek-baru/.agents/skills/
npm install --no-audit --no-fund solc@0.8.24 @openzeppelin/contracts@5.4.0 js-sha3 sharp
npm install -g --prefix "$HOME/.local" @binance/agentic-wallet   # sekali per mesin
export PATH="$HOME/.local/bin:$PATH"
```
