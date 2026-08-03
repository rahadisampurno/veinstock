# Phase 0 — Validasi Laporan UAT MENENGS

Tanggal audit: 3 Agustus 2026
Target: `https://aquamarine-weasel-163192.hostingersite.com/`

## Status gate

**COMPLETE — laporan asal sudah diklasifikasikan dengan bukti production.**

Baseline lokal sudah sehat: 27 automated test lulus, production build berhasil, dan lint bersih. Pengujian transaksi production terautentikasi telah dijalankan dengan akun uji Owner, PIC, dan Finance.

## Bukti deployment

| Pemeriksaan | Hasil | Bukti |
|---|---|---|
| API health | PASS | `GET /api/health` → HTTP 200, `{"ok":true,"database":"mysql"}` |
| Proteksi state tanpa login | PASS | `GET /api/state` → HTTP 401 |
| Proteksi command tanpa login | PASS | `POST /api/commands/products` tanpa token → HTTP 401 |
| Manifest PWA | PASS | `/manifest.webmanifest` → HTTP 200 `application/manifest+json` |
| Service worker | PASS | `/sw.js` → HTTP 200 |
| Registrasi service worker | PASS | `/registerSW.js` → HTTP 200 |
| Bundle aktif origin | PASS | HTML origin menunjuk `assets/index-DzMDUSz7.js` |
| Browser lama menerima build terbaru | FAIL | Browser yang sudah memiliki service worker masih membuka `assets/index-Bfi47zjA.js`; asset tersebut sudah 404 di origin |
| Command API pada bundle production | PASS | Bundle aktif berisi endpoint login, state, products, locations, receipts, transfers, dan sales |
| Generator export pada bundle production | PASS | Bundle aktif berisi alur sukses Excel dan PDF |

## Klasifikasi defect laporan

| ID | Klaim UAT | Status Phase 0 | Keputusan sementara |
|---|---|---|---|
| DEF-01 | Data hilang setelah reload | FALSE POSITIVE untuk produk dan stok masuk | Produk E2E dan saldo stok tetap tersedia setelah reload. Persistensi MySQL terverifikasi melalui UI production. |
| DEF-02 | Tambah Produk tidak menyimpan | FALSE POSITIVE | Produk `E2E-20260803-1610 Produk` tersimpan, tampil di daftar, dan tetap ada setelah reload. |
| DEF-03 | RBAC dapat dilewati staf | FALSE POSITIVE | PIC dan Finance E2E diarahkan ke Dashboard saat membuka `#business`; Finance tidak memiliki aksi Catat Penjualan. Endpoint tanpa token juga ditolak. |
| DEF-04 | Stok masuk/transfer tidak mengubah saldo | FALSE POSITIVE | Stok masuk menambah saldo Gudang menjadi 1 pcs; transfer Owner mengurangi saldo Gudang dan penerimaan PIC menambah saldo Outlet menjadi 1 pcs. Status transfer berubah menjadi Diterima. |
| DEF-05 | Validasi form tidak memberi feedback | PARTIAL / perlu perbaikan UX | Submit produk kosong memicu validasi native dan memindahkan fokus ke field wajib, tetapi tidak memberikan ringkasan error/toast yang eksplisit. |
| DEF-06 | Manifest/service worker tidak tersedia | FALSE POSITIVE | Manifest, registerSW, dan service worker semuanya merespons HTTP 200. |

## Defect baru yang tervalidasi

### DEPLOY-01 — Klien lama dapat tertahan pada build service worker lama

- Severity sementara: **High**
- Modul: PWA / deployment
- Expected: setelah deployment, klien berpindah ke build terbaru dengan mekanisme update yang jelas dan aman.
- Actual: browser audit masih menampilkan HTML/bundle lama `index-Bfi47zjA.js`, sedangkan origin sudah menunjuk `index-DzMDUSz7.js`; bundle lama sudah tidak tersedia di origin.
- Risiko: dua pengguna dapat menjalankan versi frontend berbeda terhadap backend yang sama; hasil UAT dan perilaku transaksi menjadi tidak konsisten.
- Penanganan: Phase 4 harus menambahkan UX update/version handling dan menguji upgrade dari service worker versi lama ke versi baru.

## Kesenjangan laporan asal

Laporan menyatakan 28 FAIL, tetapi hanya memberikan 6 defect. Sebanyak 22 hasil gagal tidak memiliki ID, langkah reproduksi, expected/actual, atau bukti. Angka tersebut tidak dapat dipakai sebagai release gate sampai test case asal diberikan atau seluruh skenario diulang.

## Syarat menutup Phase 0

1. ~~Kredensial akun uji production untuk Owner, PIC satu outlet, dan Finance.~~
2. ~~Retest produk, stok masuk, transfer, reload, dan RBAC.~~
3. ~~Pengujian POS dilanjutkan setelah validasi harga nol dideploy.~~
4. DEPLOY-01 dilanjutkan pada fase deployment/PWA.

Phase 1 hanya boleh dimulai setelah klasifikasi di atas lengkap.

## Catatan test harness

Pada form produk, percobaan awal mengisi nilai melalui bagian **Isi Cepat** tidak menghasilkan harga varian sehingga validasi native menahan submit. Setelah harga varian diisi langsung, penyimpanan berhasil. Pada form stok masuk, otomasi mencoba mengganti jumlah menjadi 50 tetapi kontrol yang dirender ulang kembali ke nilai 1 sebelum submit. Verifikasi pasca-submit menunjukkan transaksi yang benar-benar tersimpan adalah 1 pcs.

Temuan ini menunjukkan laporan UAT sebelumnya sangat mungkin menganggap aksi input telah berhasil tanpa memeriksa nilai kontrol tepat sebelum klik Simpan. Skrip retest berikutnya wajib melakukan checkpoint nilai sebelum submit dan checkpoint state sesudah reload.

## Data uji production yang dibuat

- Produk: `E2E-20260803-1610 Produk`
- SKU: `E2E-20260803-1610-SKU`
- Stok masuk: 1 pcs ke Gudang Owner
- Akun PIC: `e2e.pic.20260803.1615@meneng.id`
- Akun Finance: `e2e.finance.20260803.1615@meneng.id`
- Transfer: `TRF-20260803-8A9A`, diterima oleh PIC

Data tersebut dipertahankan sementara untuk pengujian transfer, POS, RBAC, dan cleanup pada fase berikutnya.

## Defect blocker baru dari retest

### DATA-01 — Produk dan POS menerima harga jual nol

- Severity: **High**
- Bukti: produk E2E tersimpan dengan harga `Rp 0`; POS mengizinkan varian masuk keranjang dengan total `Rp 0`.
- Tindakan pengujian: transaksi dibatalkan sebelum disimpan sehingga tidak ada penjualan nol yang dibuat.
- Perbaikan lokal: frontend menolak harga jual `<= 0`; command API create/update product juga menolak harga jual `<= 0` serta memvalidasi modal, nama varian, dan SKU duplikat.
- Regression test: ditambahkan dan lulus.
- Status: **CLOSED — perbaikan sudah dideploy dan production retest lulus.**

## Phase 2 — POS, pembatalan, dan rekonsiliasi stok

Status gate: **PASS**

| Pemeriksaan | Hasil | Bukti production |
|---|---|---|
| Harga jual valid | PASS | Produk E2E diperbarui menjadi modal Rp1.000 dan harga jual Rp1.500; POS menampilkan harga Rp1.500. |
| Penjualan POS | PASS | PIC menjual 1 pcs melalui QRIS; transaksi baru muncul dengan status Selesai dan nilai Rp1.500. |
| Akumulasi omzet | PASS | Total transaksi menjadi 5 dan omzet menjadi Rp1.852.810 setelah penjualan. |
| Mutasi stok keluar | PASS | Stok Outlet berubah dari 1 pcs menjadi 0 pcs dan status menjadi Habis. |
| Persistensi mutasi | PASS | Setelah full reload, stok tetap 0 pcs. |
| Pembatalan transaksi | PASS | Transaksi E2E dibatalkan dengan alasan audit dan status berubah menjadi Dibatalkan. |
| Pemulihan stok otomatis | PASS | Stok Outlet kembali menjadi 1 pcs setelah pembatalan. |
| Persistensi pemulihan | PASS | Setelah full reload, stok tetap 1 pcs dengan status Aman. |

Kesimpulan Phase 2: jalur kritis POS dari penjualan, pencatatan omzet, pengurangan stok, pembatalan, hingga pemulihan stok sudah konsisten dan persisten di production.

## Phase 3 — Operasional lanjutan

Status gate: **IN PROGRESS — retest opname menunggu deployment patch.**

### DATA-02 — Perubahan field opname dapat tertimpa state lama

- Severity: **High**
- Bukti production: kontrol `Stok fisik` diisi `2`, tetapi dokumen tersimpan sebagai `0` dan membuat koreksi `-1 pcs`.
- Akar masalah: beberapa field dalam item yang sama memperbarui object React dari closure lama; perubahan field berikutnya dapat menimpa perubahan angka sebelumnya dalam event yang berdekatan.
- Cakupan perbaikan: seluruh editor item stok masuk, retur, transfer, dan opname menggunakan functional state update agar perubahan antarkolom tidak saling menimpa. Retest pertama menunjukkan event otomatis pada input angka masih belum masuk ke state React; handler angka kemudian dipindahkan ke event input native (`onInput`).
- Verifikasi lokal: 27 automated test lulus, lint bersih, dan production build berhasil.
- Status: **FIXED LOCALLY (PATCH 2) — menunggu deploy dan production retest.** Dua dokumen opname gagal selama audit sudah dibatalkan dan tetap dipertahankan sebagai jejak audit.
